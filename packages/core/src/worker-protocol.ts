/**
 * Message and validation types shared by the main-thread controller (`experimental-worker.tsx`) and
 * the worker (`worker-thread.ts`) of the experimental worker compositor (see `docs/worker.md`).
 * The controller validates the prebuilt program when it is mounted; the worker validates the program on
 * `init` and each frame, so a malformed message is refused before it reaches the GPU.
 */
import type { EffectWrapperOptions } from "@babylonjs/lite";
import type { ElementSnapshot } from "./native.js";

/**
 * Prebuilt compositor shader for the worker, generated at build time by `workerCompositorProgram`.
 * `capacity` layers use `capacity * 2 + 1` bindings: a texture and sampler per layer, then one uniform.
 */
export interface WorkerProgram {
  version: 1;
  capacity: number;
  shader: Pick<EffectWrapperOptions, "fragmentWGSL" | "bindings">;
}
/** Decorative animation presets the worker can run on a layer. */
export type WorkerAnimation = "none" | "opacity" | "ripple";
// The experimental transferable ElementImage is not in TypeScript's Transferable union.
export type WorkerSnapshot = ElementSnapshot & Transferable;
/**
 * One frame sent to the worker. `uniforms` is the compositor uniform block (4 header floats plus
 * 44 per layer); `images` are the freshly captured layer snapshots to upload, which are transferred
 * to the worker. `probe` marks an admission probe frame.
 */
export interface WorkerFrame {
  type: "frame";
  id: number;
  width: number;
  height: number;
  uniforms: Float32Array;
  probe?: boolean;
  images: { slot: number; width: number; height: number; image: WorkerSnapshot }[];
}
/** Messages from the main thread to the worker; `id` correlates the worker's response. */
export type WorkerRequest =
  | { type: "init"; id: number; canvas: OffscreenCanvas; program: WorkerProgram }
  | WorkerFrame
  | { type: "clock"; id: number; playing: boolean; reduced: boolean }
  | { type: "stats" | "stop" | "lose"; id: number };
/** Counters the worker reports for diagnostics; `resources` counts the resources it currently holds. */
export interface WorkerStats {
  frames: number;
  uploads: number;
  textureBytes: number;
  frameIntervals: number[];
  frameWork: number[];
  resources: { engines: number; textures: number; effects: number; renderers: number; scheduledFrames: number; snapshots: number };
}
/** Messages from the worker to the main thread: replies carry the request `id`; unprompted `error`/`lost` messages use `0`. */
export interface WorkerResponse {
  id: number;
  type: "ready" | "frame" | "clock" | "stats" | "stopped" | "error" | "lost";
  stats?: WorkerStats;
  error?: string;
  pixels?: number;
}
/**
 * Throws unless `program` has the expected version, a capacity of 1..8, a bounded shader source and
 * exactly the binding layout the compositor shader declares (texture and sampler per layer, then
 * the uniform block).
 */
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
/**
 * Throws unless `frame` is within bounds: integer sizes up to `maxDimension` and 2,000,000 pixels,
 * a finite uniform block of the right length for `capacity`, and unique in-range snapshot slots
 * each carrying a closable image.
 */
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
