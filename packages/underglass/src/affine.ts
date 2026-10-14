/**
 * Canonical 2D affine math for layer transforms. One matrix built here drives GPU sampling
 * (its inverse maps output pixels back into the layer), the browser's native hit geometry and,
 * in ordinary DOM, the CSS `transform`, so all three use the same matrix. Used by the runtime, the
 * animation, motion and timeline modules and the build-time CSS compiler.
 *
 * Matrices use the CSS/`DOMMatrix` 2D order `[a, b, c, d, e, f]`, mapping a layer-local point
 * to `(a*x + c*y + e, b*x + d*y + f)`, in CSS pixels with y pointing down.
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

/** Applies `matrix` to a point. */
export function point([a, b, c, d, e, f]: Affine, { x, y }: Point): Point {
  return { x: a * x + c * y + e, y: b * x + d * y + f };
}

/** Serializes a matrix as a CSS `matrix(...)` value for ordinary DOM presentation. */
export function cssMatrix(matrix: Affine): string { return `matrix(${matrix.join(",")})`; }
