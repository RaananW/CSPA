/**
 * `useStrataGpu`: presents the Strata panels among an Underglass root's direct children on the GPU, for as long as
 * the calling component is mounted (`@underglass/ui/gpu`). Pass the controller from `mountCanvasApp`; with no
 * controller the CSS presentation stays.
 */
import { useEffect, useRef } from "react";
import { attachStrataGpu, type StrataGpu, type StrataGpuController, type StrataGpuOptions } from "../gpu/index.ts";

export function useStrataGpu(controller: StrataGpuController | null | undefined, options?: StrataGpuOptions): { current: StrataGpu | undefined } {
  const handle = useRef<StrataGpu | undefined>(undefined);
  const panels = options?.panels, poll = options?.poll, level = options?.level;
  useEffect(() => {
    if (!controller) return;
    handle.current = attachStrataGpu(controller, { panels, poll, level });
    return () => { handle.current?.detach(); handle.current = undefined; };
  }, [controller, panels, poll, level]);
  return handle;
}
