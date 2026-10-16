/**
 * The Objects part of the Strata rendering model (`docs/ui-library/rendering-model.md`, part 2B, version 2): the
 * geometry of objects under the scene's camera, as pure functions for the reference implementation (`shade.ts`).
 *
 * Two families of object:
 * - **Solids** (`key`, `slab`, `bezel`, `well`, `rail`, `mark`): a tapered rounded box (or, for a bezel, a ring of one)
 *   between the base height `z0` and the cap height `z1`. Both the base outline and the cap are screen-locked: every
 *   point at height `z` is pre-scaled towards the vanishing point by `(D − z) / D`, so the cap projects exactly onto
 *   the captured pixels under it and the sides project into the band between the cap and the base outline. The model
 *   therefore works in screen space: a point inside the footprint is on the cap (`d ≤ −taper`) or on a side.
 * - **Domes** (`knob`, `puck`): the upper half of an ellipsoid standing on `z0`, ray-cast from the camera. Domes are
 *   not screen-locked; they carry no captured content, only their own colour.
 */
import type { SceneObject, ScenePrimitive, StrataScene } from "./scene.ts";
import { environmentSample } from "./stage.ts";

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const smoothstep = (edge0: number, edge1: number, x: number) => { const t = clamp((x - edge0) / (edge1 - edge0), 0, 1); return t * t * (3 - 2 * t); };
type Vec3 = [number, number, number];
const normalize = (v: Vec3): Vec3 => { const length = Math.hypot(...v); return length < 1e-12 ? [0, 0, 1] : [v[0] / length, v[1] / length, v[2] / length]; };

/** Signed distance from `(x, y)` to a rounded box centred on the origin: negative inside. */
function box(x: number, y: number, halfWidth: number, halfHeight: number, radius: number): number {
  const qx = Math.abs(x) - halfWidth + radius, qy = Math.abs(y) - halfHeight + radius;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - radius;
}

export const solidObjects = ["key", "slab", "bezel", "well", "rail", "mark"] as const;
export const domeObjects = ["knob", "puck"] as const;

/** An object with the values that do not depend on the point (part 2B.2). */
export interface ResolvedObject {
  object: SceneObject;
  dome: boolean;
  cx: number;
  cy: number;
  halfWidth: number;
  halfHeight: number;
  radius: number;
  taper: number;
  /** The height it stands on, and the cap's height (below `z0` for a well); for a dome, the apex. */
  z0: number;
  z1: number;
}

/** The scene's camera: distance and vanishing point (layer-local), with their defaults. */
export function cameraOf(scene: StrataScene): { distance: number; vanish: [number, number] } {
  return { distance: scene.camera?.distance ?? 1600, vanish: scene.camera?.vanish ?? [scene.extent.width / 2, scene.extent.height / 2] };
}

/** 2B.2: an object's derived geometry. Hover raises the cap by a quarter of the height; a pressed key or mark sinks it by `travel`. */
export function resolveObject(object: SceneObject): ResolvedObject {
  const [x, y, width, height] = object.rect;
  const halfWidth = width / 2, halfHeight = height / 2, inradius = Math.min(halfWidth, halfHeight);
  const dome = (domeObjects as readonly string[]).includes(object.object);
  const pressed = object.state?.pressed ? 1 : 0;
  const travel = object.object === "key" || object.object === "mark" ? Math.min(object.travel ?? 0, object.height) * pressed : 0;
  const z0 = object.base ?? 0;
  const rise = object.state?.hover && !object.state.disabled ? object.height / 4 : 0;
  const z1 = object.object === "well" ? z0 - object.height : z0 + object.height + rise - travel;
  return { object, dome, cx: x + halfWidth, cy: y + halfHeight, halfWidth, halfHeight,
    radius: dome ? inradius : clamp(object.radius ?? 0, 0, inradius), taper: dome ? 0 : Math.max(object.taper ?? 0, 0), z0, z1 };
}

/**
 * 2B.3: signed distance to an object's footprint, negative inside. A bezel is the ring of width `width` just inside
 * its rounded box; a dome's footprint is its rect's inscribed pill.
 */
export function objectDistance(shape: ResolvedObject, x: number, y: number): number {
  const d = box(x - shape.cx, y - shape.cy, shape.halfWidth, shape.halfHeight, shape.radius);
  if (shape.object.object !== "bezel") return d;
  const width = shape.object.width ?? 0;
  return Math.abs(d + width / 2) - width / 2;
}

/** The unit outward direction of the footprint's distance field, by central differences of half a pixel. */
export function objectOutward(shape: ResolvedObject, x: number, y: number): [number, number] {
  const e = 0.5;
  const gx = objectDistance(shape, x + e, y) - objectDistance(shape, x - e, y), gy = objectDistance(shape, x, y + e) - objectDistance(shape, x, y - e);
  const length = Math.hypot(gx, gy);
  return length < 1e-9 ? [0, 0] : [gx / length, gy / length];
}

/**
 * 2B.4: the normal of a solid's side at a point of the band (`−taper < d ≤ 0`). The base point `B` and the cap point
 * `T` across the band, screen-locked at `z0` and `z1`, span the side with the edge's direction.
 */
export function sideNormal(scene: StrataScene, shape: ResolvedObject, x: number, y: number): Vec3 {
  const { distance: D, vanish: [vx, vy] } = cameraOf(scene);
  const d = objectDistance(shape, x, y), [gx, gy] = objectOutward(shape, x, y);
  const bx = x - d * gx, by = y - d * gy;
  const tx = bx - shape.taper * gx, ty = by - shape.taper * gy;
  const l0 = (D - shape.z0) / D, l1 = (D - shape.z1) / D;
  const dx = (vx + (tx - vx) * l1) - (vx + (bx - vx) * l0), dy = (vy + (ty - vy) * l1) - (vy + (by - vy) * l0);
  const h = shape.z1 - shape.z0;
  return normalize([h * gx, h * gy, -(gx * dx + gy * dy)]);
}

/** A ray-cast dome at a point: its coverage, the surface normal and height where it is hit. */
export interface DomeHit {
  coverage: number;
  normal: Vec3;
  z: number;
}

/**
 * 2B.5: the ray from the camera through the screen point `(x, y)` meets height `z` at `(x, y) − u·z`, with
 * `u = ((x, y) − V) / D`. On the dome (semi-axes `hw`, `hh` and `z1 − z0`, centred on `(cx, cy, z0)`) that is a
 * quadratic in `z`; the higher root is the visible hit, valid above `z0`. Coverage anti-aliases the silhouette over
 * one pixel, from the smallest normalised radius the ray reaches.
 */
export function domeHit(scene: StrataScene, shape: ResolvedObject, x: number, y: number): DomeHit {
  const { distance: D, vanish: [vx, vy] } = cameraOf(scene);
  const ux = (x - vx) / D, uy = (y - vy) / D;
  const ex = x - shape.cx, ey = y - shape.cy;
  const sx = 1 / (shape.halfWidth * shape.halfWidth), sy = 1 / (shape.halfHeight * shape.halfHeight);
  const hz = Math.max(shape.z1 - shape.z0, 1e-3), sz = 1 / (hz * hz);
  // (ex − ux·z)²·sx + (ey − uy·z)²·sy + (z − z0)²·sz = 1
  const a = ux * ux * sx + uy * uy * sy + sz;
  const b = -2 * (ex * ux * sx + ey * uy * sy) - 2 * shape.z0 * sz;
  const c = ex * ex * sx + ey * ey * sy + shape.z0 * shape.z0 * sz - 1;
  const least = c - (b * b) / (4 * a);
  const silhouette = (Math.sqrt(Math.max(least + 1, 0)) - 1) * Math.min(shape.halfWidth, shape.halfHeight);
  const discriminant = b * b - 4 * a * c;
  const z = discriminant >= 0 ? (-b + Math.sqrt(discriminant)) / (2 * a) : shape.z0 - 1;
  if (z < shape.z0) return { coverage: 0, normal: [0, 0, 1], z: shape.z0 };
  const hx = ex - ux * z, hy = ey - uy * z;
  return { coverage: 1 - smoothstep(-0.5, 0.5, silhouette), normal: normalize([hx * sx, hy * sy, (z - shape.z0) * sz]), z };
}

/** The farthest any base corner of a rect lies from the vanishing point. */
function reach(scene: StrataScene, [x, y, width, height]: readonly [number, number, number, number]): number {
  const { vanish: [vx, vy] } = cameraOf(scene);
  return Math.max(...[[x, y], [x + width, y], [x, y + height], [x + width, y + height]].map(([px, py]) => Math.hypot(px! - vx, py! - vy)));
}

/**
 * 2B.6, hit safety: whether an object is drawn as an object. A solid needs its taper to cover the perspective drift
 * at its farthest corner, `taper · (D − max(z0, z1)) ≥ |z1 − z0| · r`, or its sides would face away from the viewer.
 * A dome needs its whole projection inside `bounds`: the eight corners of its bounding box, projected, must be.
 * The resting geometry is checked, so a state change never moves an object across the rule.
 */
export function objectDrawable(scene: StrataScene, object: SceneObject): boolean {
  const { distance: D, vanish: [vx, vy] } = cameraOf(scene);
  // The highest geometry (hovered) is checked, so hover never changes how an object is drawn.
  const shape = resolveObject({ ...object, state: { hover: true } });
  if (!shape.dome) {
    const rise = Math.abs(shape.z1 - shape.z0);
    return rise === 0 || shape.taper * (D - Math.max(shape.z0, shape.z1)) >= rise * reach(scene, object.rect);
  }
  if (D - shape.z1 <= 0) return false;
  const [bx, by, bw, bh] = object.bounds ?? object.rect;
  for (const z of [shape.z0, shape.z1]) for (const px of [shape.cx - shape.halfWidth, shape.cx + shape.halfWidth]) for (const py of [shape.cy - shape.halfHeight, shape.cy + shape.halfHeight]) {
    const scale = D / (D - z), sx = vx + (px - vx) * scale, sy = vy + (py - vy) * scale;
    if (sx < bx - 1e-6 || sy < by - 1e-6 || sx > bx + bw + 1e-6 || sy > by + bh + 1e-6) return false;
  }
  return true;
}

/**
 * 2B.6: the Relief equivalent of an object that is not drawable: a raised key, slab, rail or mark; a well; a knob
 * for a dome (which keeps its colour). A bezel has none: the field's own well remains.
 */
export function reliefEquivalent(object: SceneObject): ScenePrimitive | undefined {
  const common = { rect: object.rect, height: object.height, material: object.material, ...(object.state ? { state: object.state } : {}) };
  switch (object.object) {
    case "bezel": return undefined;
    case "well": return { face: "well", radius: object.radius, ...common };
    case "knob": case "puck": return { face: "knob", ...common };
    case "mark": return { face: "mark", radius: object.radius, ...common };
    default: return { face: "raised", radius: object.radius, finish: object.finish, ...common };
  }
}

/**
 * 2B.7: the studio environment, a brightness for the reflected direction: a dark floor rising to a bright ceiling.
 * `environmentTerm` is relative to a flat face, like the bevel's Lambert term, so a cap facing the viewer gets none.
 * A version 3 scene may reflect an environment map instead (2C.4), sampled the same way relative to straight up.
 */
export function studio(z: number): number {
  return 0.18 + (0.92 - 0.18) * smoothstep(-0.35, 0.65, z);
}
export function environmentTerm(scene: StrataScene, normal: Vec3, roughness: number, metallic: number): number {
  const strength = scene.environment?.strength ?? 0.6;
  const environment = scene.environment;
  if (environment?.source === "map") {
    const r: [number, number, number] = [2 * normal[2] * normal[0], 2 * normal[2] * normal[1], 2 * normal[2] * normal[2] - 1];
    return strength * (environmentSample(environment, r) - environmentSample(environment, [0, 0, 1])) * (0.04 + 0.96 * metallic) * (1 - roughness);
  }
  const reflected = 2 * normal[2] * normal[2] - 1;
  return strength * (studio(reflected) - studio(1)) * (0.04 + 0.96 * metallic) * (1 - roughness);
}
