/**
 * `useStrataGpu`: presents the Strata panels among an Underglass root's direct children on the GPU while the calling
 * component is mounted (`@underglass/ui/gpu`). Pass the controller from `mountCanvasApp`, or a ref to it. It attaches in a
 * microtask: a component set up by `mountCanvasApp`'s first, synchronous render runs before the root exists (its
 * `container` throws until the mount returns).
 */
import { onBeforeUnmount, shallowRef, watch, type Ref } from "vue";
import { attachStrataGpu, type StrataGpu, type StrataGpuController, type StrataGpuOptions } from "../gpu/index.ts";

export function useStrataGpu(controller: StrataGpuController | null | undefined | Ref<StrataGpuController | null | undefined>, options?: StrataGpuOptions) {
  const handle = shallowRef<StrataGpu | undefined>(undefined);
  const source = () => (controller && "value" in controller ? controller.value : controller);
  // Each change of controller supersedes an attach still waiting for its microtask.
  let attach = 0;
  const stop = watch(source, value => {
    handle.value?.detach();
    handle.value = undefined;
    const current = ++attach;
    if (value) queueMicrotask(() => { if (current === attach) handle.value = attachStrataGpu(value, options); });
  }, { immediate: true });
  onBeforeUnmount(() => { stop(); attach++; handle.value?.detach(); handle.value = undefined; });
  return handle;
}
