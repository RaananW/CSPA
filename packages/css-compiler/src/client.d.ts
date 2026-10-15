/**
 * Ambient type for the build-generated virtual module. Reference it with
 * `/// <reference types="@underglass/css-compiler/client" />` so application code can import the
 * compiled program set and pass it to `mountCanvasApp({ compiled })`.
 */
declare module "virtual:underglass/compiled" {
  /**
   * Prebuilt WGSL compositor program and native-geometry samplers for every configured entry, in
   * `underglass.config.json` order. Produced by the Vite or webpack adapter at production build time.
   */
  const compiled: import("@underglass/core").CompiledProgramSet;
  export default compiled;
}
