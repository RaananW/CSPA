/**
 * Pose helpers for the showcase motion: the card deck and notification stack describe where a layer
 * should be as a centre-based `Pose`, and these functions turn poses into the public `Transform` and
 * `MotionDescriptor` types that `transition`, `transitionGroup` and `Presence` take. All units are
 * stage CSS pixels, degrees and plain scale factors.
 */
import type { MotionDescriptor, MotionKeyframe, Transform } from "@underglass/react";

/** Stage size shared by every studio example (the output canvas frame). */
export const STAGE = { width: 1040, height: 700 } as const;

/** A layer's untransformed layout box on the stage, in CSS pixels (the `Surface` layout x/y/size). */
export interface Rect { x: number; y: number; width: number; height: number }
/** A layer pose described around its centre: offset of the centre, rotation (deg), uniform scale. */
export interface Pose { dx: number; dy: number; rotation: number; scale: number; opacity?: number }
/** The identity pose: the layer exactly at its layout box. */
export const rest: Pose = { dx: 0, dy: 0, rotation: 0, scale: 1, opacity: 1 };

const radians = (degrees: number) => degrees * Math.PI / 180;

/** Transform for a layer declared with `origin="center"`, which pivots rotation and scale itself. */
export function toTransform(pose: Pose): Transform {
  // With a centre origin the transform's translation is exactly the centre's offset, so `dx`/`dy`
  // map straight to `x`/`y` and only the uniform scale needs splitting into two axes.
  return { x: round(pose.dx), y: round(pose.dy), rotation: round(pose.rotation),
    scaleX: round(pose.scale), scaleY: round(pose.scale), opacity: round(pose.opacity ?? 1) };
}

/** Inverse of toTransform for the current sampled layer transform. */
export function fromTransform(transform: Transform | undefined): Pose {
  const { x = 0, y = 0, rotation = 0, scaleX = 1, opacity = 1 } = transform ?? {};
  // Wrap to [-180, 180) so motion that starts from this pose does not unwind earlier full turns.
  const normalized = ((rotation % 360) + 540) % 360 - 180;
  return { dx: x, dy: y, rotation: normalized, scale: scaleX, opacity };
}

/** Moves a pose back inside the stage so no rotated corner leaves the output frame. */
export function keepInside(rect: Rect, pose: Pose, margin = 18): Pose {
  const angle = radians(pose.rotation);
  // Half extents of the rotated, scaled box's axis-aligned bounds.
  const halfWidth = pose.scale * (Math.abs(Math.cos(angle)) * rect.width / 2 + Math.abs(Math.sin(angle)) * rect.height / 2);
  const halfHeight = pose.scale * (Math.abs(Math.sin(angle)) * rect.width / 2 + Math.abs(Math.cos(angle)) * rect.height / 2);
  // Clamp the centre `margin` px inside the stage; bounds too big to fit are centred instead.
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

/** Smoothstep easing: zero velocity at both ends of each waypoint segment. */
const smooth = (t: number) => t * t * (3 - 2 * t);
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
/** Linear interpolation of every pose channel; rotation is not wrapped, so turns accumulate. */
function blend(a: Pose, b: Pose, t: number): Pose {
  return { dx: mix(a.dx, b.dx, t), dy: mix(a.dy, b.dy, t), rotation: mix(a.rotation, b.rotation, t),
    scale: mix(a.scale, b.scale, t), opacity: mix(a.opacity ?? 1, b.opacity ?? 1, t) };
}

/**
 * Builds a declarative transition from centre-pivoted waypoints (the layer uses
 * `origin="center"`). The path is sampled (<= 32 frames) to ease between
 * waypoints and keep every frame inside the stage.
 * `rotate: false` keeps every frame axis-aligned.
 */
export function path(rect: Rect, waypoints: readonly { at: number; pose: Pose }[], duration: number, samples = 20, rotate = true): MotionDescriptor {
  const keyframes: MotionKeyframe[] = [];
  // `samples + 1` keyframes at even offsets; a transition timeline accepts 2..32 keyframes, so
  // callers pass at most 31. Waypoint `at` values are 0..1 offsets in ascending order.
  for (let index = 0; index <= samples; index++) {
    const t = index / samples;
    // Find the waypoint segment containing `t`, then ease within it.
    let segment = 1;
    while (segment < waypoints.length - 1 && waypoints[segment]!.at < t) segment++;
    const from = waypoints[segment - 1]!, to = waypoints[segment]!;
    const local = to.at === from.at ? 1 : (t - from.at) / (to.at - from.at);
    const pose = blend(from.pose, to.pose, smooth(Math.min(1, Math.max(0, local))));
    keyframes.push({ offset: t, ...toTransform(keepInside(rect, rotate ? pose : { ...pose, rotation: 0 })) });
  }
  // The easing is already baked into the sampled keyframes, so the timeline itself runs linearly.
  return { keyframes, timing: { duration, easing: "linear" } };
}

/** Rounds to three decimal places. */
function round(value: number) { return Math.round(value * 1000) / 1000; }
