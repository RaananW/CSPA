/**
 * Type-level check of the published API. It is compiled by `tsc` in the installed-package consumer; the
 * build fails if a public type or function is missing or an internal file becomes importable.
 */
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
// The framework-neutral runtime that framework adapters build on.
import { CanvasRuntime, compileStyle, createCanvasHosts, type CompiledStyle, type CanvasController as CoreController } from "@underglass/core";
import { workerCompositorProgram as coreWorkerProgram } from "@underglass/core/build";

// Internal implementations are deliberately not package entry points.
// @ts-expect-error Internal implementation files are not public subpaths.
import type { CanvasRuntime as ReactInternalRuntime } from "@underglass/react/dist/library/react.js";
// @ts-expect-error Internal implementation files are not public subpaths.
import type { SurfaceRendererOptions } from "@underglass/core/dist/library/renderer.js";
// `@underglass/react` re-exports the core controller type rather than declaring its own.
export const sameController = (controller: CanvasController): CoreController => controller;
// Every compiled style value is a string a framework can bind directly.
export const styleValues: (string | undefined)[] = Object.values(compileStyle({ width: 1 }) satisfies CompiledStyle);
// Naming each exported type in a tuple makes the compiler fail if any of them stops being exported.
export type PublicTypes = [
  AdmissionPolicy, MountCanvasOptions, CanvasController, RuntimeOptions, LocalApplicationModule, LayerDefinition,
  SurfaceProps, BoxProps, PresenceProps, Transform, Affine, Point, Layout, Appearance,
  EnrollmentOptions, EnrollmentErrorCode, AnimationPlayback, CSSAnimationSource, Ripple,
  ApplicationEffect, ParameterRange, EffectDescriptor, EffectTime, EffectHandle, EffectResult,
  MotionKeyframe, MotionTiming, MotionDescriptor, MotionHandle, TransitionHandle, TransitionResult, CoordinatedMotion,
  WorkerMountOptions, WorkerSurfaceProps, WorkerProgram, WorkerAnimation, WorkerStats,
];
// Referenced values keep the runtime exports of every public entry point imported.
export const publicFunctions = [mountApplicationModule, defineEffect, workerCompositorProgram,
  mountWorkerCanvasApp, WorkerSurface, startWorkerCompositor, CanvasRuntime, createCanvasHosts, coreWorkerProgram];
// `AdmissionPolicy` accepts only the documented values.
export const automatic: AdmissionPolicy = "automatic";
// @ts-expect-error Automatic admission is a closed, explicit policy.
export const invalidPolicy: AdmissionPolicy = "always";
