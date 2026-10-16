/**
 * `@underglass/core/experimental-worker`: the framework-neutral main-thread primitives of the
 * experimental worker compositor (see `docs/worker.md`). The React controller in
 * `@underglass/react/experimental-worker` builds on these: the worker message protocol and its
 * validators, and the native capture and geometry helpers it uses to snapshot original elements.
 * The worker side is the separate `./experimental-worker/thread` entry.
 */
export { decorative } from "./ripple.js";
export { capabilities, enableDrawable, validateAppliedGeometry, waitForPaint } from "./native.js";
export type { DrawableCanvas } from "./native.js";
export { LAYER_BLOCK_FLOATS, validateWorkerProgram, validateWorkerFrame } from "./worker-protocol.js";
export type { WorkerProgram, WorkerAnimation, WorkerSnapshot, WorkerFrame, WorkerRequest, WorkerResponse, WorkerStats } from "./worker-protocol.js";
