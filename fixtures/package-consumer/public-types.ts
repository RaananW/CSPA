import {
  mountApplicationModule, defineEffect,
  type AdmissionPolicy, type MountCanvasOptions, type CanvasController, type RuntimeOptions,
  type LocalApplicationModule, type LayerDefinition, type SurfaceProps, type BoxProps,
  type PresenceProps, type Transform, type Affine, type Point, type Layout, type Appearance,
  type EnrollmentOptions, type EnrollmentErrorCode, type AnimationPlayback, type CSSAnimationSource,
  type Ripple, type ApplicationEffect, type ParameterRange, type EffectDescriptor,
  type EffectTime, type EffectHandle, type EffectResult, type MotionKeyframe, type MotionTiming,
  type MotionDescriptor, type MotionHandle, type TransitionHandle, type TransitionResult, type CoordinatedMotion,
} from "@underglass/react";
import { workerCompositorProgram } from "@underglass/react/build";
import { mountWorkerCanvasApp, WorkerSurface,
  type WorkerMountOptions, type WorkerSurfaceProps, type WorkerProgram, type WorkerAnimation, type WorkerStats,
} from "@underglass/react/experimental-worker";
import { startWorkerCompositor } from "@underglass/react/experimental-worker/thread";

// Internal implementations are deliberately not package entry points.
// @ts-expect-error Internal implementation files are not public subpaths.
import type { CanvasRuntime } from "@underglass/react/dist/library/runtime.js";
export type PublicTypes = [
  AdmissionPolicy, MountCanvasOptions, CanvasController, RuntimeOptions, LocalApplicationModule, LayerDefinition,
  SurfaceProps, BoxProps, PresenceProps, Transform, Affine, Point, Layout, Appearance,
  EnrollmentOptions, EnrollmentErrorCode, AnimationPlayback, CSSAnimationSource, Ripple,
  ApplicationEffect, ParameterRange, EffectDescriptor, EffectTime, EffectHandle, EffectResult,
  MotionKeyframe, MotionTiming, MotionDescriptor, MotionHandle, TransitionHandle, TransitionResult, CoordinatedMotion,
  WorkerMountOptions, WorkerSurfaceProps, WorkerProgram, WorkerAnimation, WorkerStats,
];
export const publicFunctions = [mountApplicationModule, defineEffect, workerCompositorProgram,
  mountWorkerCanvasApp, WorkerSurface, startWorkerCompositor];
export const automatic: AdmissionPolicy = "automatic";
// @ts-expect-error Automatic admission is a closed, explicit policy.
export const invalidPolicy: AdmissionPolicy = "always";
