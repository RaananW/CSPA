/**
 * React root helpers shared by the demo pages. Production builds use `react-dom/profiling` so the `Profiler`
 * `onRender` callbacks the pages count commits with still fire; development uses the regular client build.
 * Pages pass `createRoot` and `flushSync` to `mountCanvasApp`.
 */
import { createRoot as clientRoot } from "react-dom/client";
import { flushSync as clientFlush } from "react-dom";
import { createRoot as profilingRoot, flushSync as profilingFlush } from "react-dom/profiling";

export const createRoot = import.meta.env.PROD ? profilingRoot : clientRoot;
export const flushSync = import.meta.env.PROD ? profilingFlush : clientFlush;
