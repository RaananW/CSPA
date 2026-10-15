/**
 * Trusted local module adapter: mounts an already-imported application module through the same
 * `CanvasRuntime` and mount boundary as `mountCanvasApp`, for code that creates its own root (any
 * framework, or plain DOM) and registers existing elements itself. There is no URL loader or sandbox
 * (see `docs/api.md`).
 */
import { CanvasRuntime, type RuntimeOptions, type LayerDefinition, type CanvasController } from "./runtime.js";

/**
 * An already-imported, trusted local application. `mount` receives the adapter-owned root
 * container and an `enroll` function for original connected direct-root layers (which returns
 * that layer's release), creates exactly one persistent root and returns its synchronous unmount
 * callback. If `mount` throws, it must clean up its own partially created root.
 */
export interface LocalApplicationModule {
  mount(context: { container: HTMLDivElement; enroll(layer: LayerDefinition): () => void }): () => void;
}

/**
 * Mounts a trusted local module and returns the same narrow controller as `mountCanvasApp`.
 * Throws before mounting when `module` has no `mount` function, and after it when `mount` does not
 * return its unmount callback. The root starts in ordinary DOM; call `enable()` for GPU admission.
 */
export function mountApplicationModule(options: Omit<RuntimeOptions, "mount">, module: LocalApplicationModule): CanvasController {
  if (!module || typeof module.mount !== "function") throw new Error("A trusted, already-imported local application module is required");
  return new CanvasRuntime({ ...options, mount(container, runtime) {
    // The module's `enroll` is raw layer registration, not the ref-style `CanvasRuntime.enroll`.
    const cleanup = module.mount({ container, enroll: layer => runtime.register(layer) });
    if (typeof cleanup !== "function") throw new Error("Local module mount must return its persistent-root unmount callback");
    return cleanup;
  } });
}
