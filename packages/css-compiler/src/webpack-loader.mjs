/**
 * webpack loader that produces the `virtual:underglass/compiled` module. It resolves each configured
 * stylesheet, runs the application's real loader chain on it with `importModule`, analyzes the resulting
 * CSS and returns the generated module source. Attached by `UnderglassPlugin` (`webpack.mjs`).
 */
import postcss from "postcss";
import { dirname } from "node:path";
import { createCompiler, readConfig } from "./index.mjs";

/**
 * The loader function. `options.configFile` is the absolute config path supplied by the plugin.
 * Marked not cacheable, so webpack runs it again on every build.
 */
export default async function underglassLoader() {
  this.cacheable(false);
  const { configFile } = this.getOptions();
  const loaded = await readConfig(dirname(configFile), configFile);
  this.addDependency(loaded.path);
  const compiler = createCompiler(loaded.config);
  // Resolve entry stylesheets with webpack's own resolver so package exports behave as in the application.
  const resolver = this.getResolve({ dependencyType: "esm" });
  const imports = [];
  // Entries grouped by resolved stylesheet file; a file is processed once for all of its entries.
  const groups = new Map();
  for (const entry of loaded.config.entries) {
    const filename = await resolver(dirname(configFile), entry.stylesheet);
    this.addDependency(filename);
    groups.set(filename, [...(groups.get(filename) ?? []), entry]);
  }
  for (const [filename, entries] of groups) {
    // Public importModule executes the application's actual loader chain at build time.
    const module = await this.importModule(filename);
    const css = module.default;
    if (!Array.isArray(css) || typeof css.toString !== "function" || !css.every(part => Array.isArray(part) && typeof part[1] === "string")) {
      throw new Error(`Underglass: ${filename} must expose processed CSS through css-loader's array export; DOM-injecting/extraction loaders are not supported by this adapter`);
    }
    // With `modules: { namedExport: false }` css-loader exposes class names on `locals`; otherwise fall back
    // to the module's named string exports.
    const modules = css.locals ?? Object.fromEntries(Object.entries(module).filter(([key, value]) => key !== "default" && typeof value === "string"));
    if (entries.some(entry => entry.selector[0] === "." && modules[entry.selector.slice(1)]?.includes(" "))) {
      throw new Error("Underglass: CSS Modules composition is not supported");
    }
    // Source map of the single processed part, so errors point at the original sources.
    const previous = css.length === 1 ? css[0][3] : undefined;
    if (css.length !== 1) throw new Error("Underglass: webpack aggregated/imported CSS array requires a dedicated stylesheet entry");
    // Re-parse the processed CSS text to obtain a PostCSS root for analysis.
    const processed = await postcss([]).process(css.toString(), { from: filename, map: previous ? { prev: previous, inline: false } : false });
    compiler.consume(filename, processed.root, entries, modules);
    imports.push(`import ${JSON.stringify(filename)};`);
  }
  return `${imports.join("\n")}\n${compiler.generate()}`;
}
