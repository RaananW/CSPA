export { compositionShader, layerShader } from "./composition.js";
export { compileTimeline, parseTransform } from "./timeline.js";
export { affine } from "./affine.js";
export type { CompiledAnimation, CompiledProgramSet } from "./compiled.js";
import { compositionShader } from "./composition.js";
import { validateWorkerProgram, type WorkerProgram } from "./worker-protocol.js";

export function workerCompositorProgram(capacity: number): WorkerProgram {
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 8) throw new Error("Worker capacity must be 1..8");
  const program: WorkerProgram = { version: 1, capacity, shader: compositionShader(capacity, [], undefined, true) };
  validateWorkerProgram(program);
  return program;
}
