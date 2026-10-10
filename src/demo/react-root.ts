import { createRoot as clientRoot } from "react-dom/client";
import { flushSync as clientFlush } from "react-dom";
import { createRoot as profilingRoot, flushSync as profilingFlush } from "react-dom/profiling";

export const createRoot = import.meta.env.PROD ? profilingRoot : clientRoot;
export const flushSync = import.meta.env.PROD ? profilingFlush : clientFlush;
