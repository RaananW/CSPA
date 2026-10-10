import { affine, type Transform } from "./affine.ts";
import type { AnimationPlayback } from "./animation";
import { compileTimeline, type TimelineFrame, type TimelineTiming } from "./timeline.ts";

export interface MotionKeyframe extends Transform {
  offset: number;
  easing?: string;
}
export type MotionTiming = TimelineTiming;
export interface MotionDescriptor {
  keyframes: readonly MotionKeyframe[];
  timing: MotionTiming;
}
export interface MotionHandle extends AnimationPlayback {
  own(): AnimationPlayback;
  dispose(): Promise<void>;
  readonly nativeAnimation: Animation;
}
export type TransitionResult = { status: "completed" | "cancelled"; reason: string };
export interface TransitionHandle {
  readonly finished: Promise<TransitionResult>;
  cancel(): void;
}
export interface CoordinatedMotion {
  id: string;
  motion: MotionDescriptor;
}

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
    affine({ x, y, rotation, scaleX, scaleY, opacity });
    return { offset: frame.offset, easing: frame.easing, opacity,
      transform: `translate(${x}px, ${y}px) rotate(${rotation}deg) scale(${scaleX}, ${scaleY})` };
  });
  const timing = { ...descriptor.timing };
  const timeline = compileTimeline(frames, timing);
  return { frames, timing: { ...timing, delay: timeline.delay, iterations: timeline.iterations,
    direction: timeline.direction, fill: "both" as const, easing: timing.easing ?? "linear" }, timeline };
}
