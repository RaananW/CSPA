import postcss from "postcss";
import { dirname } from "node:path";
import { createCompiler, readConfig } from "./index.mjs";

export default async function canvasSPALoader() {
  this.cacheable(false);
  const { configFile } = this.getOptions();
  const loaded = await readConfig(dirname(configFile), configFile);
  this.addDependency(loaded.path);
  const compiler = createCompiler(loaded.config);
  const resolver = this.getResolve({ dependencyType: "esm" });
  const imports = [];
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
      throw new Error(`CanvasSPA: ${filename} must expose processed CSS through css-loader's array export; DOM-injecting/extraction loaders are not supported by this adapter`);
    }
    const modules = css.locals ?? Object.fromEntries(Object.entries(module).filter(([key, value]) => key !== "default" && typeof value === "string"));
    if (entries.some(entry => entry.selector[0] === "." && modules[entry.selector.slice(1)]?.includes(" "))) {
      throw new Error("CanvasSPA: CSS Modules composition is not supported");
    }
    const previous = css.length === 1 ? css[0][3] : undefined;
    if (css.length !== 1) throw new Error("CanvasSPA: webpack aggregated/imported CSS array requires a dedicated stylesheet entry");
    const processed = await postcss([]).process(css.toString(), { from: filename, map: previous ? { prev: previous, inline: false } : false });
    compiler.consume(filename, processed.root, entries, modules);
    imports.push(`import ${JSON.stringify(filename)};`);
  }
  return `${imports.join("\n")}\n${compiler.generate()}`;
}
