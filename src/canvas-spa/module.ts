import { CanvasRuntime, type RuntimeOptions, type LayerDefinition } from "./runtime";
import type { CanvasController } from "./react";

export interface LocalApplicationModule {
  mount(context: { container: HTMLDivElement; enroll(layer: LayerDefinition): () => void }): () => void;
}

export function mountApplicationModule(options: Omit<RuntimeOptions, "mount">, module: LocalApplicationModule): CanvasController {
  if (!module || typeof module.mount !== "function") throw new Error("A trusted, already-imported local application module is required");
  return new CanvasRuntime({ ...options, mount(container, runtime) {
    const cleanup = module.mount({ container, enroll: layer => runtime.register(layer) });
    if (typeof cleanup !== "function") throw new Error("Local module mount must return its persistent-root unmount callback");
    return cleanup;
  } });
}
