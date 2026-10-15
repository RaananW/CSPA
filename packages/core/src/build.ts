/**
 * `@underglass/core/build` (re-exported as `@underglass/react/build`): build-only generators that
 * run in Node before an application build, so the compiled and worker browser bundles consume
 * literal WGSL instead of generating it. Used by the CSS compiler package and by worker
 * applications' prepare scripts. Do not import this entry into browser runtime code.
 */
export { compositionShader, layerShader } from "./composition.js";
export { compileTimeline, parseTransform } from "./timeline.js";
export { affine } from "./affine.js";
export type { CompiledAnimation, CompiledProgramSet } from "./compiled.js";
import { compositionShader } from "./composition.js";
import { validateWorkerProgram, type WorkerProgram } from "./worker-protocol.js";

/**
 * Generates the prebuilt shader program for the experimental worker compositor: one fullscreen
 * pass compositing `capacity` (1..8) layers, with the decorative opacity preset compiled in.
 * Serialize the result to JSON and pass it as `program` to `mountWorkerCanvasApp`; enrolling more
 * worker layers than `capacity` is refused at runtime. Throws for an out-of-range capacity.
 */
export function workerCompositorProgram(capacity: number): WorkerProgram {
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 8) throw new Error("Worker capacity must be 1..8");
  const program: WorkerProgram = { version: 1, capacity, shader: compositionShader(capacity, [], undefined, true) };
  // Same check the worker and main-thread controller apply to the program they receive.
  validateWorkerProgram(program);
  return program;
}
