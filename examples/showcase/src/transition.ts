import { defineEffect, type CanvasController, type EffectDescriptor, type EffectHandle } from "@underglass/react";

/**
 * Trusted local WGSL: burns a layer away along value noise, with a glowing rim and
 * charring just ahead of it. `amount` 0 is an exact identity and 1 is fully gone;
 * sweeping it from 1 to 0 materialises the layer instead. `tint` 0 is ember, 1 is cyan.
 */
export const burn = defineEffect({
  name: "showcase-burn",
  parameters: { amount: { min: 0, max: 1.1 }, glow: { min: 0, max: 1 }, tint: { min: 0, max: 1 }, grain: { min: 4, max: 64 } },
  geometry: "color", bounds: "layer", capabilities: ["webgpu"],
  wgsl: `
    let cell = local / parameters.w;
    let i = floor(cell);
    let f = fract(cell);
    let u = f * f * (3.0 - 2.0 * f);
    let a = fract(sin(dot(i, vec2f(12.9898, 78.233))) * 43758.5453);
    let b = fract(sin(dot(i + vec2f(1.0, 0.0), vec2f(12.9898, 78.233))) * 43758.5453);
    let c = fract(sin(dot(i + vec2f(0.0, 1.0), vec2f(12.9898, 78.233))) * 43758.5453);
    let d = fract(sin(dot(i + vec2f(1.0, 1.0), vec2f(12.9898, 78.233))) * 43758.5453);
    let coarse = mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
    let fine = fract(sin(dot(floor(local / 3.0), vec2f(39.346, 11.135))) * 43758.5453);
    let noise = coarse * 0.82 + fine * 0.18;
    let amount = parameters.x;
    let live = smoothstep(0.0, 0.04, amount);
    let keep = smoothstep(amount - 0.012, amount + 0.012, noise);
    let rim = (1.0 - smoothstep(amount, amount + 0.1, noise)) * keep * live;
    let ash = (1.0 - smoothstep(amount + 0.1, amount + 0.26, noise)) * live;
    let hot = mix(vec3f(1.0, 0.42, 0.08), vec3f(0.25, 0.85, 1.0), parameters.z);
    let shade = color.rgb * (1.0 - 0.55 * ash * (1.0 - parameters.z));
    let lit = mix(shade, hot, rim * parameters.y) + hot * rim * parameters.y * 0.5;
    return vec4f(min(lit, vec3f(1.0)), color.a * mix(1.0, keep, live));`,
});

const inert = { bounds: "layer", interaction: "inert", media: "identity", fallback: "static" } as const;
export type Step = { ripple?: number; chromatic?: number; burn?: { amount: number; glow?: number; tint?: number; grain?: number } };

/**
 * Runs a transition effect on a live, interactive layer for `duration` ms. Its content is
 * inert meanwhile (the runtime holds it), then interactive again. `step(t)` gives the
 * parameters for progress t in 0..1; the chain's shape is taken from step(0).
 * Skipped (but still timed) in ordinary DOM, under reduced motion or without WebGPU.
 */
export function transition(controller: CanvasController, id: string, duration: number, step: (t: number) => Step, done?: () => void) {
  const first = step(0);
  const burning = (values: Step): Record<string, number> => ({ amount: values.burn!.amount, glow: values.burn!.glow ?? 1, tint: values.burn!.tint ?? 0, grain: values.burn!.grain ?? 18 });
  const chain = (values: Step): Record<string, number>[] => [
    ...(values.ripple !== undefined ? [{ amplitude: values.ripple }] : []),
    ...(values.chromatic !== undefined ? [{ displacement: values.chromatic }] : []),
    ...(values.burn ? [burning(values)] : []),
  ];
  let handle: EffectHandle | undefined;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (controller.state().mode === "gpu" && !reduced && navigator.gpu) {
    const descriptors: EffectDescriptor[] = [
      ...(first.ripple !== undefined ? [{ kind: "ripple" as const, parameters: { amplitude: first.ripple }, time: { seconds: 0, playing: true }, ...inert }] : []),
      ...(first.chromatic !== undefined ? [{ kind: "chromatic" as const, parameters: { displacement: first.chromatic }, time: { seconds: 0 }, ...inert }] : []),
      ...(first.burn ? [{ kind: "custom" as const, definition: burn, parameters: burning(first), time: { seconds: 0 }, ...inert }] : []),
    ];
    try { handle = controller.setEffects(id, descriptors); } catch (error) { console.warn("Transition effect skipped", error); }
  }
  const started = performance.now();
  let frame = 0, stopped = false;
  const finish = () => {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(frame);
    try { handle?.cancel(); } catch { /* already ended */ }
    done?.();
  };
  const tick = (now: number) => {
    const t = Math.min(1, (now - started) / duration);
    if (handle) {
      try { handle.update(chain(step(t))); } catch { handle = undefined; }
    }
    if (t >= 1) finish(); else frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
  return finish;
}

export const ease = (t: number) => 1 - (1 - t) ** 3;
