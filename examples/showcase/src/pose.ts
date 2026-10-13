import type { MotionDescriptor, MotionKeyframe, Transform } from "canvas-spa-phase-one";

/** Stage size shared by every studio example (the output canvas frame). */
export const STAGE = { width: 1040, height: 700 } as const;

export interface Rect { x: number; y: number; width: number; height: number }
/** A layer pose described around its centre: offset of the centre, rotation (deg), uniform scale. */
export interface Pose { dx: number; dy: number; rotation: number; scale: number; opacity?: number }
export const rest: Pose = { dx: 0, dy: 0, rotation: 0, scale: 1, opacity: 1 };

const radians = (degrees: number) => degrees * Math.PI / 180;

/**
 * CanvasSPA transforms pivot around the layer's top-left corner. Convert a
 * centre-pivoted pose into that transform: T = c + d - R*S*c.
 */
export function toTransform(rect: Rect, pose: Pose): Transform {
  const cx = rect.width / 2, cy = rect.height / 2, angle = radians(pose.rotation);
  const rx = Math.cos(angle) * pose.scale * cx - Math.sin(angle) * pose.scale * cy;
  const ry = Math.sin(angle) * pose.scale * cx + Math.cos(angle) * pose.scale * cy;
  return { x: round(cx + pose.dx - rx), y: round(cy + pose.dy - ry), rotation: round(pose.rotation),
    scaleX: round(pose.scale), scaleY: round(pose.scale), opacity: round(pose.opacity ?? 1) };
}

/** Inverse of toTransform for the current sampled layer transform. */
export function fromTransform(rect: Rect, transform: Transform | undefined): Pose {
  const { x = 0, y = 0, rotation = 0, scaleX = 1, opacity = 1 } = transform ?? {};
  const cx = rect.width / 2, cy = rect.height / 2, angle = radians(rotation);
  const rx = Math.cos(angle) * scaleX * cx - Math.sin(angle) * scaleX * cy;
  const ry = Math.sin(angle) * scaleX * cx + Math.cos(angle) * scaleX * cy;
  const normalized = ((rotation % 360) + 540) % 360 - 180;
  return { dx: x + rx - cx, dy: y + ry - cy, rotation: normalized, scale: scaleX, opacity };
}

/** Moves a pose back inside the stage so no rotated corner leaves the output frame. */
export function keepInside(rect: Rect, pose: Pose, margin = 18): Pose {
  const angle = radians(pose.rotation);
  const halfWidth = pose.scale * (Math.abs(Math.cos(angle)) * rect.width / 2 + Math.abs(Math.sin(angle)) * rect.height / 2);
  const halfHeight = pose.scale * (Math.abs(Math.sin(angle)) * rect.width / 2 + Math.abs(Math.cos(angle)) * rect.height / 2);
  const clamp = (centre: number, half: number, size: number) =>
    half * 2 > size - margin * 2 ? size / 2 : Math.min(size - margin - half, Math.max(margin + half, centre));
  const cx = rect.x + rect.width / 2 + pose.dx, cy = rect.y + rect.height / 2 + pose.dy;
  return { ...pose, dx: clamp(cx, halfWidth, STAGE.width) - rect.x - rect.width / 2,
    dy: clamp(cy, halfHeight, STAGE.height) - rect.y - rect.height / 2 };
}

/** Pose that moves the rect's centre to an absolute stage point. */
export function at(rect: Rect, x: number, y: number, rotation = 0, scale = 1, opacity = 1): Pose {
  return { dx: x - rect.x - rect.width / 2, dy: y - rect.y - rect.height / 2, rotation, scale, opacity };
}

const smooth = (t: number) => t * t * (3 - 2 * t);
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
function blend(a: Pose, b: Pose, t: number): Pose {
  return { dx: mix(a.dx, b.dx, t), dy: mix(a.dy, b.dy, t), rotation: mix(a.rotation, b.rotation, t),
    scale: mix(a.scale, b.scale, t), opacity: mix(a.opacity ?? 1, b.opacity ?? 1, t) };
}

/**
 * Builds a declarative transition from centre-pivoted waypoints. Keyframes
 * interpolate x/y/rotation linearly, so the path is sampled densely (<= 32
 * frames) to keep the pivot at the card centre while it spins or scales.
 * `rotate: false` keeps every frame axis-aligned.
 */
export function path(rect: Rect, waypoints: readonly { at: number; pose: Pose }[], duration: number, samples = 20, rotate = true): MotionDescriptor {
  const keyframes: MotionKeyframe[] = [];
  for (let index = 0; index <= samples; index++) {
    const t = index / samples;
    let segment = 1;
    while (segment < waypoints.length - 1 && waypoints[segment]!.at < t) segment++;
    const from = waypoints[segment - 1]!, to = waypoints[segment]!;
    const local = to.at === from.at ? 1 : (t - from.at) / (to.at - from.at);
    const pose = blend(from.pose, to.pose, smooth(Math.min(1, Math.max(0, local))));
    keyframes.push({ offset: t, ...toTransform(rect, keepInside(rect, rotate ? pose : { ...pose, rotation: 0 })) });
  }
  return { keyframes, timing: { duration, easing: "linear" } };
}

function round(value: number) { return Math.round(value * 1000) / 1000; }
