// The public profiling entry lacks bundled declarations for these shared APIs.
declare module "react-dom/profiling" {
  export { createRoot } from "react-dom/client";
  export { flushSync } from "react-dom";
}
