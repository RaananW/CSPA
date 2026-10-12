import type { EffectWrapperOptions } from "@babylonjs/lite";
import type { Transform } from "./affine.js";

export interface CompiledAnimation {
  id: string;
  selector: string;
  name: string;
  frames: readonly {
    offset: number;
    matrix: readonly number[];
    opacity: number;
    easing: string;
  }[];
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
  sample(milliseconds: number): Transform;
}

export interface CompiledProgramSet {
  version: 1;
  animations: readonly CompiledAnimation[];
  programs: readonly Pick<EffectWrapperOptions, "bindings" | "fragmentWGSL">[];
}

export interface CompiledMotion {
  index: number;
  phase: number;
  origin: { x: number; y: number };
}

export function validateCompiledPrograms(compiled: CompiledProgramSet) {
  if (!compiled || compiled.version !== 1 || !Array.isArray(compiled.animations) || !Array.isArray(compiled.programs)
    || compiled.animations.length < 1 || compiled.animations.length > 32 || compiled.programs.length < 1 || compiled.programs.length > 8) {
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
  for (const [index, program] of compiled.programs.entries()) {
    const count = index + 1;
    if (!program || typeof program.fragmentWGSL !== "string" || !program.fragmentWGSL.length
      || !Array.isArray(program.bindings) || program.bindings.length !== count * 2 + 1) throw new Error("Invalid compiled compositor program");
    for (let layer = 0; layer < count; layer++) {
      const texture = program.bindings[layer * 2]!, sampler = program.bindings[layer * 2 + 1]!;
      if (texture.kind !== "texture" || texture.binding !== layer * 2 || texture.name !== `layer${layer}`
        || sampler.kind !== "sampler" || sampler.binding !== layer * 2 + 1 || sampler.textureBinding !== `layer${layer}`) {
        throw new Error("Invalid compiled texture bindings");
      }
    }
    const uniform = program.bindings.at(-1)!;
    if (uniform.kind !== "uniform" || uniform.binding !== count * 2 || uniform.uniformByteLength !== (4 + count * 48) * 4) {
      throw new Error("Invalid compiled uniform layout");
    }
  }
}

export function verifyCompiledAnimation(element: HTMLElement, source: Animation, compiled: CompiledAnimation) {
  if (!(source instanceof CSSAnimation) || source.animationName !== compiled.name || !element.matches(compiled.selector)
    || !(source.effect instanceof KeyframeEffect)) throw new Error("Compiled CSS animation target/name mismatch");
  const frames = source.effect.getKeyframes();
  if (frames.length !== compiled.frames.length) throw new Error("Compiled CSS keyframe count mismatch");
  const compact = (value: string) => value.replace(/\s+/g, "");
  frames.forEach((frame, index) => {
    const expected = compiled.frames[index]!;
    if (Object.keys(frame).some(key => !["offset", "computedOffset", "easing", "composite", "transform", "opacity"].includes(key))
      || typeof frame.transform !== "string") throw new Error("Compiled CSS requires complete transform/opacity frames only");
    const matrix = new DOMMatrix(frame.transform === "none" ? undefined : frame.transform);
    if (!matrix.is2D || [matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f].some((value, i) =>
      Math.abs(value - expected.matrix[i]!) > 1e-4 * Math.max(1, Math.abs(value)))
      || Number(frame.opacity) !== expected.opacity || frame.computedOffset !== expected.offset
      || compact(frame.easing) !== compact(expected.easing)
      || frame.composite !== "auto" && frame.composite !== "replace") throw new Error("Compiled CSS keyframe/provenance mismatch");
  });
  const timing = source.effect.getTiming();
  for (const key of ["duration", "delay", "iterations", "direction", "easing", "fill"] as const) {
    if (timing[key] !== compiled.timing[key]) throw new Error(`Compiled CSS timing mismatch: ${key}`);
  }
  if (timing.endDelay !== 0 || timing.iterationStart !== 0) throw new Error("Unsupported compiled CSS timing dependency");
}
