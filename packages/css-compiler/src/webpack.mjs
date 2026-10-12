import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

export class CanvasSPAPlugin {
  constructor({ configFile = "canvas-spa.config.json" } = {}) {
    this.configFile = configFile;
  }
  apply(compiler) {
    const loader = fileURLToPath(new URL("./webpack-loader.mjs", import.meta.url));
    const entry = fileURLToPath(new URL("./webpack-entry.mjs", import.meta.url));
    const configFile = resolve(compiler.context, this.configFile);
    new compiler.webpack.NormalModuleReplacementPlugin(/^virtual:canvas-spa\/compiled$/, resource => {
      resource.request = `${loader}?${JSON.stringify({ configFile })}!${entry}`;
    }).apply(compiler);
  }
}
