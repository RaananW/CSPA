import { resolve, normalize } from "node:path";
import loadPostCSS from "postcss-load-config";
import MagicString from "magic-string";
import { createCompiler, readConfig } from "./index.mjs";

const request = "virtual:canvas-spa/compiled";
const virtual = "\0canvas-spa-compiled";
const marker = "__CANVAS_SPA_BUILD_PROGRAMS__";
export function canvasSPA({ configFile = "canvas-spa.config.json" } = {}) {
  let root, loaded, compiler;
  const selected = new Map();
  return {
    name: "canvas-spa-css-compiler",
    async config(config, environment) {
      if (environment.command !== "build") return;
      root = resolve(config.root ?? ".");
      loaded = await readConfig(root, configFile);
      compiler = createCompiler(loaded.config);
      const plugin = compiler.postcss(filename => selected.get(normalize(filename)));
      let postcss = config.css?.postcss;
      // Vite's mergeConfig concatenates arrays, so an inline object must contribute only the added plugin.
      if (postcss && typeof postcss === "object") return { css: { devSourcemap: true, postcss: { plugins: [plugin] } } };
      try {
        const original = await loadPostCSS({ env: "production" }, typeof postcss === "string" ? resolve(root, postcss) : root);
        postcss = { ...original.options, plugins: original.plugins };
      } catch (error) {
        if (!String(error.message).startsWith("No PostCSS Config found in:")) throw error;
        if (typeof config.css?.postcss === "string") throw error;
        postcss = { plugins: [] };
      }
      return { css: { devSourcemap: true, postcss: { ...postcss, plugins: [...(postcss.plugins ?? []), plugin] } } };
    },
    async buildStart() {
      if (!compiler) return;
      selected.clear();
      for (const entry of loaded.config.entries) {
        const specifier = entry.stylesheet.startsWith(".") ? resolve(root, entry.stylesheet) : entry.stylesheet;
        const importer = resolve(root, "__canvas_spa_entry.js");
        const resolved = await this.resolve(specifier, importer) ?? await this.resolve(resolve(root, entry.stylesheet), importer);
        if (!resolved || resolved.external) throw new Error(`CanvasSPA: stylesheet export is unavailable: ${entry.stylesheet}`);
        const path = normalize(resolved.id.split("?")[0]);
        selected.set(path, [...(selected.get(path) ?? []), entry]);
      }
      this.addWatchFile(loaded.path);
    },
    resolveId(id) {
      if (id === request) return virtual;
    },
    load(id) {
      if (id !== virtual) return;
      if (!compiler) throw new Error("CanvasSPA Vite adapter currently requires a production build; dev/HMR is not qualified");
      if (this.meta.watchMode) throw new Error("CanvasSPA Vite watch builds are not yet supported");
      return `${[...selected.keys()].map(path => `import ${JSON.stringify(path)};`).join("\n")}
        const compiled=${JSON.stringify(marker)}; export default compiled;`;
    },
    renderChunk(code) {
      if (!code.includes(marker)) return;
      const source = compiler.generate().replace("export default compiled;", "return compiled;");
      const expression = `(()=>{${source}})()`;
      const output = new MagicString(code);
      for (const match of code.matchAll(new RegExp(`(["'])${marker}\\1`, "g"))) {
        output.overwrite(match.index, match.index + match[0].length, expression);
      }
      return { code: output.toString(), map: output.generateMap({ hires: true }) };
    },
  };
}
