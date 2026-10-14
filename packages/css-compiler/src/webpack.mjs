import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

export class UnderglassPlugin {
  constructor({ configFile = "underglass.config.json" } = {}) {
    this.configFile = configFile;
  }
  apply(compiler) {
    const loader = fileURLToPath(new URL("./webpack-loader.mjs", import.meta.url));
    const entry = fileURLToPath(new URL("./webpack-entry.mjs", import.meta.url));
    const configFile = resolve(compiler.context, this.configFile);
    new compiler.webpack.NormalModuleReplacementPlugin(/^virtual:underglass\/compiled$/, resource => {
      resource.request = `${loader}?${JSON.stringify({ configFile })}!${entry}`;
    }).apply(compiler);
  }
}
