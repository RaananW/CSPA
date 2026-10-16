/**
 * Canonical matrix math for layer transforms. One matrix built here drives GPU sampling (its inverse maps output
 * pixels back into the layer), the browser's native hit geometry and, in ordinary DOM, the CSS `transform`, so all
 * three use the same matrix. Used by the runtime, the animation, motion and timeline modules and the build-time CSS
 * compiler.
 *
 * An untilted transform is a 2D affine matrix in the CSS/`DOMMatrix` order `[a, b, c, d, e, f]`, mapping a
 * layer-local point to `(a*x + c*y + e, b*x + d*y + f)`, in CSS pixels with y pointing down. A tilted transform
 * (`tiltX`/`tiltY`) is a projective 4x4 matrix in `DOMMatrix` column-major order (`m11, m12, m13, m14, m21, ...`),
 * composed as CSS composes `translate() perspective() rotate() rotateX() rotateY() scale()` about the pivot.
 */

/**
 * A layer's numeric transform. `x`/`y` translate in CSS pixels, `rotation` is in degrees
 * (clockwise on screen), `scaleX`/`scaleY` scale around the transform origin (see `TransformOrigin`) and `opacity` is
 * 0..1. An omitted channel means its identity value (0, 1 or 1), not "keep the previous one".
 */
export interface Transform {
  x?: number;
  y?: number;
  scaleX?: number;
  scaleY?: number;
  rotation?: number;
  opacity?: number;
  /** Tilt about the layer's horizontal axis through the pivot, in degrees (top edge away from the viewer when positive, as CSS `rotateX`), at most ±60. */
  tiltX?: number;
  /** Tilt about the layer's vertical axis through the pivot, in degrees (right edge away from the viewer when positive, as CSS `rotateY`), at most ±60. */
  tiltY?: number;
  /** Viewer distance for a tilt, in CSS px from the pivot (default 1600, at least 100). Ignored without a tilt. */
  perspective?: number;
}
/** The largest tilt on either axis, in degrees. */
export const TILT_MAX = 60;
/** Viewer distance used when a tilted transform names none. */
export const DEFAULT_PERSPECTIVE = 1600;
/** A projective 4x4 matrix in `DOMMatrix` column-major order. */
export type Projective = readonly number[];
/** Whether a transform tilts the layer out of the screen plane. */
export function tilted(transform: Transform = {}): boolean {
  return (transform.tiltX ?? 0) !== 0 || (transform.tiltY ?? 0) !== 0;
}
/**
 * Static pivot for a layer's rotation and scale, like CSS `transform-origin`.
 * `{ x, y }` are fractions of the layer's layout size: `{ x: .5, y: .5 }` is
 * `"center"`. The default is `"top-left"`.
 */
export type TransformOrigin = "top-left" | "center" | { x: number; y: number };

/** A 2D affine matrix as the six CSS `matrix(a, b, c, d, e, f)` coefficients. */
export type Affine = readonly [number, number, number, number, number, number];
/** A point in CSS pixels; which space (layer-local or canvas) depends on the caller. */
export interface Point { x: number; y: number }

/** Resolves a TransformOrigin to a pivot in the layer's local CSS pixels. */
export function pivot(origin: TransformOrigin | undefined, size: { width: number; height: number }): Point {
  const fraction = origin === undefined || origin === "top-left" ? { x: 0, y: 0 }
    : origin === "center" ? { x: .5, y: .5 } : origin;
  if (!fraction || typeof fraction !== "object" || !Number.isFinite(fraction.x) || !Number.isFinite(fraction.y)) {
    throw new Error("Transform origin requires \"top-left\", \"center\" or finite { x, y } fractions");
  }
  return { x: fraction.x * size.width, y: fraction.y * size.height };
}

/**
 * Layer-to-canvas matrix: `origin` is the layer's laid-out position and `around`
 * the resolved pivot, so rotation and scale apply around `origin + around`.
 */
export function affine(transform: Transform = {}, origin: Point = { x: 0, y: 0 }, around: Point = { x: 0, y: 0 }): Affine {
  const { x = 0, y = 0, scaleX = 1, scaleY = 1, rotation = 0, opacity = 1 } = transform;
  if (![x, y, scaleX, scaleY, rotation, opacity, origin.x, origin.y, around.x, around.y].every(Number.isFinite)
    || Math.abs(scaleX * scaleY) < 1e-8 || opacity < 0 || opacity > 1) {
    throw new Error("Transform requires finite invertible scales and opacity in [0,1]");
  }
  // Reduce whole turns before converting to radians so large authored angles keep precision.
  const angle = (rotation % 360) * Math.PI / 180;
  // Linear part is rotate(angle) * scale(scaleX, scaleY), as in CSS `rotate() scale()`.
  const a = Math.cos(angle) * scaleX, b = Math.sin(angle) * scaleX;
  const c = -Math.sin(angle) * scaleY, d = Math.cos(angle) * scaleY;
  // Translation composes translate(origin + (x, y) + around) * linear * translate(-around),
  // so the pivot `around` stays fixed while rotation and scale apply about it.
  const matrix: Affine = [a, b, c, d,
    origin.x + x + around.x - (a * around.x + c * around.y),
    origin.y + y + around.y - (b * around.x + d * around.y)];
  // Called only for its validation: throws if the matrix cannot be inverted for sampling.
  inverse(matrix);
  return matrix;
}
/**
 * Inverse of an affine matrix. Throws when a coefficient or the determinant is non-finite or
 * the matrix is (near) singular, since GPU sampling and hit geometry both need the inverse.
 */
export function inverse([a, b, c, d, e, f]: Affine): Affine {
  const determinant = a * d - b * c;
  if (![a, b, c, d, e, f, determinant].every(Number.isFinite) || Math.abs(determinant) < 1e-8) throw new Error("Invalid affine inverse: finite invertible coefficients required");
  const result: Affine = [d / determinant, -b / determinant, -c / determinant, a / determinant,
    (c * f - d * e) / determinant, (b * e - a * f) / determinant];
  // Dividing by a tiny but accepted determinant can still overflow; recheck the result.
  const inverseDeterminant = result[0] * result[3] - result[1] * result[2];
  if (!result.every(Number.isFinite) || !Number.isFinite(inverseDeterminant) || inverseDeterminant === 0) {
    throw new Error("Invalid affine inverse: finite invertible coefficients required");
  }
  return result;
}

/** Column-major 4x4 product `a · b`. */
function multiply(a: readonly number[], b: readonly number[]): number[] {
  const result = new Array<number>(16).fill(0);
  for (let column = 0; column < 4; column++) for (let row = 0; row < 4; row++) {
    let sum = 0;
    for (let k = 0; k < 4; k++) sum += a[k * 4 + row]! * b[column * 4 + k]!;
    result[column * 4 + row] = sum;
  }
  return result;
}
const identity = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
/**
 * The layer-to-canvas matrix: the 2D `affine` result for an untilted transform, otherwise the projective
 * `translate(origin + (x, y) + around) perspective(D) rotate(rotation) rotateX(tiltX) rotateY(tiltY)
 * scale(scaleX, scaleY) translate(-around)`, which keeps the pivot fixed and views the tilt from `perspective`
 * px in front of it. Throws on an invalid transform, a tilt beyond `TILT_MAX` or a viewer closer than 100 px.
 */
export function canonical(transform: Transform = {}, origin: Point = { x: 0, y: 0 }, around: Point = { x: 0, y: 0 }): Affine | Projective {
  const planar = affine(transform, origin, around);
  if (!tilted(transform)) return planar;
  const { x = 0, y = 0, scaleX = 1, scaleY = 1, rotation = 0, tiltX = 0, tiltY = 0, perspective = DEFAULT_PERSPECTIVE } = transform;
  if (![tiltX, tiltY, perspective].every(Number.isFinite) || Math.abs(tiltX) > TILT_MAX || Math.abs(tiltY) > TILT_MAX || perspective < 100) {
    throw new Error(`Tilt requires finite angles within ±${TILT_MAX} degrees and a perspective of at least 100 px`);
  }
  const radians = (degrees: number) => ((degrees % 360) * Math.PI) / 180;
  const translate = (tx: number, ty: number) => { const m = identity(); m[12] = tx; m[13] = ty; return m; };
  const depth = identity(); depth[11] = -1 / perspective;
  const spin = identity(), r = radians(rotation); spin[0] = Math.cos(r); spin[1] = Math.sin(r); spin[4] = -Math.sin(r); spin[5] = Math.cos(r);
  const pitch = identity(), p = radians(tiltX); pitch[5] = Math.cos(p); pitch[6] = Math.sin(p); pitch[9] = -Math.sin(p); pitch[10] = Math.cos(p);
  const yaw = identity(), q = radians(tiltY); yaw[0] = Math.cos(q); yaw[2] = -Math.sin(q); yaw[8] = Math.sin(q); yaw[10] = Math.cos(q);
  const scale = identity(); scale[0] = scaleX; scale[5] = scaleY;
  return [translate(origin.x + x + around.x, origin.y + y + around.y), depth, spin, pitch, yaw, scale, translate(-around.x, -around.y)]
    .reduce((product, factor) => multiply(product, factor));
}
/**
 * Maps a layer-local point through a canonical matrix to canvas space (with the perspective divide), or throws when
 * the point lies at or behind the viewer.
 */
export function project(matrix: Affine | Projective, { x, y }: Point): Point {
  if (matrix.length === 6) return point(matrix as Affine, { x, y });
  const m = matrix;
  const w = m[3]! * x + m[7]! * y + m[15]!;
  if (!(w > 1e-6)) throw new Error("Tilted layer point lies behind the viewer");
  return { x: (m[0]! * x + m[4]! * y + m[12]!) / w, y: (m[1]! * x + m[5]! * y + m[13]!) / w };
}

/** Applies `matrix` to a point. */
export function point([a, b, c, d, e, f]: Affine, { x, y }: Point): Point {
  return { x: a * x + c * y + e, y: b * x + d * y + f };
}

/** Serializes a matrix as a CSS `matrix(...)` or `matrix3d(...)` value for ordinary DOM presentation. */
export function cssMatrix(matrix: Affine | Projective): string { return matrix.length === 6 ? `matrix(${matrix.join(",")})` : `matrix3d(${matrix.join(",")})`; }
