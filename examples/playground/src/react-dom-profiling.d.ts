// The public profiling entry lacks bundled declarations for these shared APIs.
// The playground uses `react-dom/profiling` so `Profiler.onRender` still fires in production builds (see
// `demo/react-root.ts`); this declares the two APIs it re-exports.
declare module "react-dom/profiling" {
  export { createRoot } from "react-dom/client";
  export { flushSync } from "react-dom";
}
