// Shim so the surface page imports the library's surface renderer from a stable local path, not package internals.
export { createSurfaceRenderer, type SurfaceRendererOptions } from "../../../packages/core/src/renderer";
