/**
 * Writes the stylesheets and `dist/tokens.json` from the token source, after validating it against the design
 * language's invariants. Any broken invariant fails the build. Runs from `npm run build` in this package.
 *
 * - `dist/css/tokens.css`: the token custom properties (`strata.tokens` layer).
 * - `dist/css/components.css`: the Tier A components (`strata.components` layer).
 * - `dist/css/strata.css`: both, with the layer order declared first.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { strataTokens, tokensToCss, validateTokens } from "../src/tokens/index.ts";

const issues = validateTokens(strataTokens);
if (issues.length) {
  for (const { path, message } of issues) console.error(`strata tokens: ${path}: ${message}`);
  process.exit(1);
}
const dist = new URL("../dist/", import.meta.url);
const tokens = tokensToCss(strataTokens);
const components = await readFile(new URL("../src/css/components.css", import.meta.url), "utf8");
await mkdir(new URL("css/", dist), { recursive: true });
await writeFile(new URL("css/tokens.css", dist), tokens);
await writeFile(new URL("css/components.css", dist), components);
await writeFile(new URL("css/strata.css", dist), `@layer strata.tokens, strata.components;\n\n${tokens}\n${components}`);
await writeFile(new URL("tokens.json", dist), `${JSON.stringify(strataTokens, null, 2)}\n`);
console.log("strata tokens: valid; wrote dist/css/strata.css, tokens.css, components.css and dist/tokens.json");
