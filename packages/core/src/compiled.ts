/**
 * Contract between the build-time CSS compiler (`packages/css-compiler`) and the runtime. A
 * `CompiledProgramSet` carries precompiled animation descriptions and one WGSL program that plays
 * them inside the shader. This module defines those types, validates a set before use
 * (`validateCompiledPrograms`) and verifies that a live CSS animation still matches its compiled
 * description (`verifyCompiledAnimation`). The shader side is generated in `composition.ts`.
 */
import type { EffectWrapperOptions } from "@babylonjs/lite";
import type { Transform } from "./affine.js";

/** One CSS animation compiled at build time, matched to a live animation by `selector` and `name`. */
export interface CompiledAnimation {
  id: string;
  selector: string;
  name: string;
  // Per-keyframe 2D matrix [a, b, c, d, e, f], opacity and the easing leading to the next frame.
  frames: readonly {
    offset: number;
    matrix: readonly number[];
    opacity: number;
    easing: string;
  }[];
  // Normalized timing; easing is always `linear` here because easing lives on the frames.
  timing: {
    duration: number;
    delay: number;
    iterations: number;
    direction: "normal" | "alternate";
    easing: "linear";
    fill: "both";
  };
  /** Shader-specific bounded phase, not an absolute millisecond timestamp. */
  normalizeTime(milliseconds: number): number;
  /** CPU evaluation of the animation at `milliseconds`. */
  sample(milliseconds: number): Transform;
}

/** Floats in one per-layer pass uniform buffer: header (12), layer block (44), compiled slot (4). */
export const LAYER_PASS_FLOATS = 60;

/** What the CSS compiler emits: the animations plus the single shared per-layer program. */
export interface CompiledProgramSet {
  /** 2: one per-layer program drawn once per layer (version 1 held one program per layer count). */
  version: 2;
  animations: readonly CompiledAnimation[];
  programs: readonly Pick<EffectWrapperOptions, "bindings" | "fragmentWGSL" | "vertexWGSL">[];
}

/**
 * A layer's compiled motion state for one frame: `index` selects the animation in the set,
 * `phase` is its `normalizeTime` value and `origin` the layer's position in root coordinates,
 * which the shader's motion is applied relative to.
 */
export interface CompiledMotion {
  index: number;
  phase: number;
  origin: { x: number; y: number };
}

/** Throws a descriptive error unless `compiled` is a well-formed version 2 set the compositor can use. */
export function validateCompiledPrograms(compiled: CompiledProgramSet) {
  if ((compiled as { version?: unknown } | undefined)?.version === 1) throw new Error("Compiled program set version 1 predates per-layer drawing; rebuild it with the matching @underglass/css-compiler");
  if (!compiled || compiled.version !== 2 || !Array.isArray(compiled.animations) || !Array.isArray(compiled.programs)
    || compiled.animations.length < 1 || compiled.animations.length > 32 || compiled.programs.length !== 1) {
    throw new Error("Invalid compiled program set");
  }
  const ids = new Set<string>();
  for (const animation of compiled.animations) {
    if (!animation || typeof animation.id !== "string" || ids.has(animation.id)
      || typeof animation.selector !== "string" || !/^[.#][a-zA-Z_][a-zA-Z0-9_-]*$/.test(animation.selector)
      || typeof animation.name !== "string" || !/^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(animation.name)
      || typeof animation.sample !== "function" || typeof animation.normalizeTime !== "function"
      || !Array.isArray(animation.frames) || animation.frames.length < 2 || animation.frames.length > 32) {
      throw new Error("Invalid compiled animation descriptor");
    }
    ids.add(animation.id);
    const timing = animation.timing;
    if (!timing || !Number.isFinite(timing.duration) || timing.duration <= 0 || timing.duration > 3_600_000
      || !Number.isFinite(timing.delay) || timing.delay < 0 || timing.delay > 3_600_000
      || timing.iterations !== Infinity && (!Number.isInteger(timing.iterations) || timing.iterations < 1 || timing.iterations > 10000)
      || !["normal", "alternate"].includes(timing.direction) || timing.easing !== "linear" || timing.fill !== "both") {
      throw new Error("Invalid compiled animation timing");
    }
    for (const [index, frame] of animation.frames.entries()) {
      if (!frame || !Number.isFinite(frame.offset) || frame.offset < 0 || frame.offset > 1
        || index === 0 && frame.offset !== 0 || index === animation.frames.length - 1 && frame.offset !== 1
        || index > 0 && frame.offset <= animation.frames[index - 1]!.offset
        || !Array.isArray(frame.matrix) || frame.matrix.length !== 6 || !frame.matrix.every(Number.isFinite)
        || !Number.isFinite(frame.opacity) || frame.opacity < 0 || frame.opacity > 1 || typeof frame.easing !== "string") {
        throw new Error("Invalid compiled animation frame");
      }
    }
  }
  const program = compiled.programs[0];
  if (!program || typeof program.fragmentWGSL !== "string" || !program.fragmentWGSL.length || typeof program.vertexWGSL !== "string"
    || !Array.isArray(program.bindings) || program.bindings.length !== 3) throw new Error("Invalid compiled compositor program");
  // The program must use exactly the binding layout `layerShader` declares.
  const [texture, sampler, uniform] = program.bindings as NonNullable<EffectWrapperOptions["bindings"]>;
  if (texture!.kind !== "texture" || texture!.binding !== 0 || texture!.name !== "layer0"
    || sampler!.kind !== "sampler" || sampler!.binding !== 1 || sampler!.textureBinding !== "layer0") {
    throw new Error("Invalid compiled texture bindings");
  }
  if (uniform!.kind !== "uniform" || uniform!.binding !== 2 || uniform!.uniformByteLength !== LAYER_PASS_FLOATS * 4) {
    throw new Error("Invalid compiled uniform layout");
  }
}

const namedEasings: Record<string, number[]> = { linear: [0, 0, 1, 1], ease: [0.25, 0.1, 0.25, 1], "ease-in": [0.42, 0, 1, 1],
  "ease-out": [0, 0, 0.58, 1], "ease-in-out": [0.42, 0, 0.58, 1] };
/** Numeric cubic-bezier control points for a named or cubic-bezier easing, or undefined when unsupported. */
function easingPoints(value: string): number[] | undefined {
  const compact = value.replace(/\s+/g, "");
  const named = namedEasings[compact];
  if (named) return named;
  const match = compact.match(/^cubic-bezier\(([^,()]+),([^,()]+),([^,()]+),([^,()]+)\)$/);
  if (!match) return undefined;
  const points = match.slice(1).map(Number);
  return points.every(Number.isFinite) ? points : undefined;
}
/** True when two easing strings resolve to the same control points (within 1e-6), whatever their spelling. */
export function sameEasing(actual: string, expected: string) {
  const a = easingPoints(actual), b = easingPoints(expected);
  return !!a && !!b && a.every((value, index) => Math.abs(value - b[index]!) <= 1e-6);
}

/**
 * Throws unless the live CSS animation `source` on `element` is the one `compiled` describes: same
 * name and selector, same keyframe matrices, opacities, offsets and easings, and the same timing.
 * Guards against a stylesheet that changed after the compile.
 */
export function verifyCompiledAnimation(element: HTMLElement, source: Animation, compiled: CompiledAnimation) {
  if (!(source instanceof CSSAnimation) || source.animationName !== compiled.name || !element.matches(compiled.selector)
    || !(source.effect instanceof KeyframeEffect)) throw new Error("Compiled CSS animation target/name mismatch");
  const frames = source.effect.getKeyframes();
  if (frames.length !== compiled.frames.length) throw new Error("Compiled CSS keyframe count mismatch");
  frames.forEach((frame, index) => {
    const expected = compiled.frames[index]!;
    if (Object.keys(frame).some(key => !["offset", "computedOffset", "easing", "composite", "transform", "opacity"].includes(key))
      || typeof frame.transform !== "string") throw new Error("Compiled CSS requires complete transform/opacity frames only");
    const matrix = new DOMMatrix(frame.transform === "none" ? undefined : frame.transform);
    if (!matrix.is2D || [matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f].some((value, i) =>
      Math.abs(value - expected.matrix[i]!) > 1e-4 * Math.max(1, Math.abs(value)))
      || Math.abs(Number(frame.opacity) - expected.opacity) > 1e-6
      || !Number.isFinite(frame.computedOffset) || Math.abs(frame.computedOffset! - expected.offset) > 1e-6
      || !sameEasing(frame.easing, expected.easing)
      || frame.composite !== "auto" && frame.composite !== "replace") throw new Error("Compiled CSS keyframe/provenance mismatch");
  });
  const timing = source.effect.getTiming();
  for (const key of ["duration", "delay", "iterations", "direction", "easing", "fill"] as const) {
    if (timing[key] !== compiled.timing[key]) throw new Error(`Compiled CSS timing mismatch: ${key}`);
  }
  if (timing.endDelay !== 0 || timing.iterationStart !== 0) throw new Error("Unsupported compiled CSS timing dependency");
}
