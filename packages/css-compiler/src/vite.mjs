/**
 * Vite adapter for the build-time CSS compiler (production builds only). It adds a PostCSS plugin that
 * analyzes the selected stylesheets as Vite processes them, serves `virtual:underglass/compiled` as a
 * placeholder module, and replaces the placeholder with the generated code at `renderChunk`, after every
 * stylesheet has been compiled. Analysis itself lives in `index.mjs`; code generation in `generate.mjs`.
 */
import { resolve, normalize } from "node:path";
import loadPostCSS from "postcss-load-config";
import MagicString from "magic-string";
import { createCompiler, readConfig } from "./index.mjs";

// The import specifier applications use, its internal (NUL-prefixed) virtual id, and the string that
// stands in for the program set until `renderChunk` substitutes the generated code.
const request = "virtual:underglass/compiled";
const virtual = "\0underglass-compiled";
const marker = "__UNDERGLASS_BUILD_PROGRAMS__";
/**
 * Creates the Vite plugin. `configFile` is resolved against the Vite root.
 */
export function underglass({ configFile = "underglass.config.json" } = {}) {
  let root, loaded, compiler;
  // Absolute stylesheet path -> config entries that select it, filled in `buildStart`.
  const selected = new Map();
  return {
    name: "underglass-css-compiler",
    async config(config, environment) {
      // The compiler exists only for `vite build`; in dev `load` refuses the virtual module.
      if (environment.command !== "build") return;
      root = resolve(config.root ?? ".");
      loaded = await readConfig(root, configFile);
      compiler = createCompiler(loaded.config);
      const plugin = compiler.postcss(filename => selected.get(normalize(filename)));
      let postcss = config.css?.postcss;
      // Vite's mergeConfig concatenates arrays, so an inline object must contribute only the added plugin.
      if (postcss && typeof postcss === "object") return { css: { devSourcemap: true, postcss: { plugins: [plugin] } } };
      // Reuse the project's PostCSS configuration so the compiler sees the same CSS the application ships.
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
      // Resolve each configured stylesheet through Vite's resolver, which handles package exports as well as
      // local paths, so the PostCSS plugin can recognize the selected files by their resolved path.
      if (!compiler) return;
      selected.clear();
      for (const entry of loaded.config.entries) {
        const specifier = entry.stylesheet.startsWith(".") ? resolve(root, entry.stylesheet) : entry.stylesheet;
        const importer = resolve(root, "__underglass_entry.js");
        const resolved = await this.resolve(specifier, importer) ?? await this.resolve(resolve(root, entry.stylesheet), importer);
        if (!resolved || resolved.external) throw new Error(`Underglass: stylesheet export is unavailable: ${entry.stylesheet}`);
        const path = normalize(resolved.id.split("?")[0]);
        selected.set(path, [...(selected.get(path) ?? []), entry]);
      }
      // Register the configuration file as a watched file.
      this.addWatchFile(loaded.path);
    },
    resolveId(id) {
      if (id === request) return virtual;
    },
    load(id) {
      if (id !== virtual) return;
      if (!compiler) throw new Error("Underglass Vite adapter currently requires a production build; dev/HMR is not qualified");
      if (this.meta.watchMode) throw new Error("Underglass Vite watch builds are not yet supported");
      // Import the selected stylesheets so Vite processes them (and the PostCSS plugin analyzes them) before
      // the chunk is rendered. The default export is the placeholder replaced in `renderChunk`.
      return `${[...selected.keys()].map(path => `import ${JSON.stringify(path)};`).join("\n")}
        const compiled=${JSON.stringify(marker)}; export default compiled;`;
    },
    renderChunk(code) {
      if (!code.includes(marker)) return;
      // Wrap the generated module in an IIFE and replace the placeholder string literals in the chunk. Done
      // at `renderChunk` because all stylesheets must already have been analyzed; MagicString keeps the
      // source map accurate.
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
