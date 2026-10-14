import type { EffectWrapperOptions } from "@babylonjs/lite";
import type { ElementSnapshot } from "./native.js";

export interface WorkerProgram {
  version: 1;
  capacity: number;
  shader: Pick<EffectWrapperOptions, "fragmentWGSL" | "bindings">;
}
export type WorkerAnimation = "none" | "opacity" | "ripple";
// The experimental transferable ElementImage is not in TypeScript's Transferable union.
export type WorkerSnapshot = ElementSnapshot & Transferable;
export interface WorkerFrame {
  type: "frame";
  id: number;
  width: number;
  height: number;
  uniforms: Float32Array;
  probe?: boolean;
  images: { slot: number; width: number; height: number; image: WorkerSnapshot }[];
}
export type WorkerRequest =
  | { type: "init"; id: number; canvas: OffscreenCanvas; program: WorkerProgram }
  | WorkerFrame
  | { type: "clock"; id: number; playing: boolean; reduced: boolean }
  | { type: "stats" | "stop" | "lose"; id: number };
export interface WorkerStats {
  frames: number;
  uploads: number;
  textureBytes: number;
  frameIntervals: number[];
  frameWork: number[];
  resources: { engines: number; textures: number; effects: number; renderers: number; scheduledFrames: number; snapshots: number };
}
export interface WorkerResponse {
  id: number;
  type: "ready" | "frame" | "clock" | "stats" | "stopped" | "error" | "lost";
  stats?: WorkerStats;
  error?: string;
  pixels?: number;
}
export function validateWorkerProgram(program: WorkerProgram) {
  if (!program || program.version !== 1 || !Number.isInteger(program.capacity) || program.capacity < 1 || program.capacity > 8
    || !program.shader || typeof program.shader.fragmentWGSL !== "string" || !program.shader.fragmentWGSL.length
    || program.shader.fragmentWGSL.length > 200_000 || !Array.isArray(program.shader.bindings)
    || program.shader.bindings.length !== program.capacity * 2 + 1) throw new Error("Invalid prebuilt worker program");
  for (let slot = 0; slot < program.capacity; slot++) {
    const texture = program.shader.bindings[slot * 2]!, sampler = program.shader.bindings[slot * 2 + 1]!;
    if (!texture || texture.kind !== "texture" || texture.binding !== slot * 2 || texture.name !== `layer${slot}`
      || !sampler || sampler.kind !== "sampler" || sampler.binding !== slot * 2 + 1 || sampler.textureBinding !== `layer${slot}`) {
      throw new Error("Invalid worker texture bindings");
    }
  }
  const uniform = program.shader.bindings.at(-1)!;
  if (!uniform || uniform.kind !== "uniform" || uniform.binding !== program.capacity * 2
    || uniform.uniformByteLength !== (4 + program.capacity * 44) * 4) throw new Error("Invalid worker uniform layout");
}
export function validateWorkerFrame(frame: WorkerFrame, capacity: number, maxDimension: number) {
  if (![frame.width, frame.height].every(value => Number.isInteger(value) && value > 0 && value <= maxDimension)
    || frame.width * frame.height > 2_000_000 || !(frame.uniforms instanceof Float32Array)
    || frame.uniforms.length !== 4 + capacity * 44 || !frame.uniforms.every(Number.isFinite)
    || frame.uniforms[0]! <= 0 || !Array.isArray(frame.images) || frame.images.length > capacity) {
    throw new Error("Invalid bounded worker frame");
  }
  const slots = new Set<number>();
  for (const image of frame.images) {
    if (!Number.isInteger(image.slot) || image.slot < 0 || image.slot >= capacity || slots.has(image.slot)
      || ![image.width, image.height].every(value => Number.isInteger(value) && value > 0 && value <= maxDimension)
      || image.width * image.height > 2_000_000 || typeof image.image?.close !== "function") throw new Error("Invalid worker snapshot");
    slots.add(image.slot);
  }
}
