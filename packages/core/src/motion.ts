/**
 * Types and compiler for typed motion (`MotionDescriptor`): keyframes of numeric channels
 * (`x`, `y`, `rotation`, `scaleX`, `scaleY`, `opacity`) instead of CSS strings. `compileMotion`
 * validates a descriptor and lowers it to the transform strings `timeline.ts` understands. The
 * runtime exposes this through its motion and transition APIs; the handle types are the public
 * return values.
 */
import { affine, type Transform } from "./affine.ts";
import type { AnimationPlayback } from "./animation.js";
import { compileTimeline, type TimelineFrame, type TimelineTiming } from "./timeline.ts";

/** One motion keyframe at `offset` 0..1. Omitted channels take their identity value (0, 1 or 1). */
export interface MotionKeyframe extends Transform {
  offset: number;
  easing?: string;
}
/** Timing for a motion; see `TimelineTiming`. */
export type MotionTiming = TimelineTiming;
/** A typed animation: keyframes plus timing. Unknown properties are rejected by `compileMotion`. */
export interface MotionDescriptor {
  keyframes: readonly MotionKeyframe[];
  timing: MotionTiming;
}
/**
 * Handle for a layer's managed motion. It has the usual playback controls; `own()` hands the
 * animation to the GPU (or returns the current ownership), `dispose()` cancels the managed
 * animation, and `nativeAnimation` is the underlying Web Animations object for interoperability.
 */
export interface MotionHandle extends AnimationPlayback {
  own(): AnimationPlayback;
  dispose(): Promise<void>;
  readonly nativeAnimation: Animation;
}
/** How a transition ended: `completed` when it ran to its end, `cancelled` otherwise, with a reason. */
export type TransitionResult = { status: "completed" | "cancelled"; reason: string };
/** Handle for a transition. `finished` resolves with the outcome; `cancel` stops it early. */
export interface TransitionHandle {
  readonly finished: Promise<TransitionResult>;
  cancel(): void;
}
/** A motion for the layer `id`, used when several layers transition together. */
export interface CoordinatedMotion {
  id: string;
  motion: MotionDescriptor;
}

/**
 * Validates a motion descriptor and returns its timeline frames, normalized timing and compiled
 * `timeline`. Throws on unknown properties, non-finite channels or values the transform maths
 * rejects.
 */
export function compileMotion(descriptor: MotionDescriptor) {
  if (Object.keys(descriptor).some(key => !["keyframes", "timing"].includes(key))
    || Object.keys(descriptor.timing).some(key => !["duration", "delay", "iterations", "direction", "easing", "fill"].includes(key))) {
    throw new Error("Unsupported typed motion descriptor/timing property");
  }
  const frames: TimelineFrame[] = descriptor.keyframes.map(frame => {
    if (Object.keys(frame).some(key => !["offset", "easing", "x", "y", "rotation", "scaleX", "scaleY", "opacity"].includes(key))) {
      throw new Error("Unsupported typed motion keyframe property");
    }
    const { x = 0, y = 0, rotation = 0, scaleX = 1, scaleY = 1, opacity = 1 } = frame;
    if (![x, y, rotation, scaleX, scaleY, opacity].every(value => typeof value === "number" && Number.isFinite(value))) {
      throw new Error("Typed motion channels require finite numbers");
    }
    // Called only for its validation: throws if the channels cannot form an invertible transform.
    affine({ x, y, rotation, scaleX, scaleY, opacity });
    return { offset: frame.offset, easing: frame.easing, opacity,
      transform: `translate(${x}px, ${y}px) rotate(${rotation}deg) scale(${scaleX}, ${scaleY})` };
  });
  const timing = { ...descriptor.timing };
  const timeline = compileTimeline(frames, timing);
  return { frames, timing: { ...timing, delay: timeline.delay, iterations: timeline.iterations,
    direction: timeline.direction, fill: "both" as const, easing: timing.easing ?? "linear" }, timeline };
}
