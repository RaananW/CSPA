/**
 * webpack adapter for the build-time CSS compiler.
 */
import type { Compiler } from "webpack";
/**
 * webpack plugin that makes `virtual:underglass/compiled` resolve to the compiled program set.
 * `configFile` defaults to `underglass.config.json` in the compiler context.
 */
export class UnderglassPlugin {
  constructor(options?: { configFile?: string });
  apply(compiler: Compiler): void;
}
