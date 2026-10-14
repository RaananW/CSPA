/**
 * webpack plugin for the build-time CSS compiler. It rewrites imports of `virtual:underglass/compiled`
 * to an inline-loader request that runs `webpack-loader.mjs` over the empty `webpack-entry.mjs` module.
 */
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

/**
 * Add to `plugins` in the webpack configuration. `configFile` is resolved against `compiler.context`.
 */
export class UnderglassPlugin {
  constructor({ configFile = "underglass.config.json" } = {}) {
    this.configFile = configFile;
  }
  apply(compiler) {
    const loader = fileURLToPath(new URL("./webpack-loader.mjs", import.meta.url));
    const entry = fileURLToPath(new URL("./webpack-entry.mjs", import.meta.url));
    const configFile = resolve(compiler.context, this.configFile);
    // The loader receives the absolute config path as its query options.
    new compiler.webpack.NormalModuleReplacementPlugin(/^virtual:underglass\/compiled$/, resource => {
      resource.request = `${loader}?${JSON.stringify({ configFile })}!${entry}`;
    }).apply(compiler);
  }
}
