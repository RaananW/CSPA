import {
  mountApplicationModule, defineEffect,
  type MountCanvasOptions, type CanvasController, type RuntimeOptions,
  type LocalApplicationModule, type LayerDefinition, type SurfaceProps, type BoxProps,
  type PresenceProps, type Transform, type Affine, type Point, type Layout, type Appearance,
  type EnrollmentOptions, type EnrollmentErrorCode, type AnimationPlayback, type CSSAnimationSource,
  type Ripple, type ApplicationEffect, type ParameterRange, type EffectDescriptor,
  type EffectTime, type EffectHandle, type EffectResult, type MotionKeyframe, type MotionTiming,
  type MotionDescriptor, type MotionHandle, type TransitionHandle, type TransitionResult, type CoordinatedMotion,
} from "canvas-spa-phase-one";

// Internal implementations are deliberately not package entry points.
// @ts-expect-error Only the root export is public.
import type { CanvasRuntime } from "canvas-spa-phase-one/dist/library/runtime.js";
export type PublicTypes = [
  MountCanvasOptions, CanvasController, RuntimeOptions, LocalApplicationModule, LayerDefinition,
  SurfaceProps, BoxProps, PresenceProps, Transform, Affine, Point, Layout, Appearance,
  EnrollmentOptions, EnrollmentErrorCode, AnimationPlayback, CSSAnimationSource, Ripple,
  ApplicationEffect, ParameterRange, EffectDescriptor, EffectTime, EffectHandle, EffectResult,
  MotionKeyframe, MotionTiming, MotionDescriptor, MotionHandle, TransitionHandle, TransitionResult, CoordinatedMotion,
];
export const publicFunctions = [mountApplicationModule, defineEffect];
