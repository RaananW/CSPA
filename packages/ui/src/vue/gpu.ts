/**
 * `useStrataGpu`: presents the Strata panels among an Underglass root's direct children on the GPU while the calling
 * component is mounted (`@underglass/ui/gpu`). Pass the controller from `mountCanvasApp`, or a ref to it.
 */
import { onBeforeUnmount, shallowRef, watch, type Ref } from "vue";
import { attachStrataGpu, type StrataGpu, type StrataGpuController, type StrataGpuOptions } from "../gpu/index.ts";

export function useStrataGpu(controller: StrataGpuController | null | undefined | Ref<StrataGpuController | null | undefined>, options?: StrataGpuOptions) {
  const handle = shallowRef<StrataGpu | undefined>(undefined);
  const source = () => (controller && "value" in controller ? controller.value : controller);
  const stop = watch(source, value => {
    handle.value?.detach();
    handle.value = value ? attachStrataGpu(value, options) : undefined;
  }, { immediate: true });
  onBeforeUnmount(() => { stop(); handle.value?.detach(); handle.value = undefined; });
  return handle;
}
