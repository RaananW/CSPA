/**
 * Writes `dist/css/tokens.css` and `dist/tokens.json` from the token source, after validating it against the
 * design language's invariants. Any broken invariant fails the build. Runs from `npm run build` in this package.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { strataTokens, tokensToCss, validateTokens } from "../src/tokens/index.ts";

const issues = validateTokens(strataTokens);
if (issues.length) {
  for (const { path, message } of issues) console.error(`strata tokens: ${path}: ${message}`);
  process.exit(1);
}
const dist = new URL("../dist/", import.meta.url);
await mkdir(new URL("css/", dist), { recursive: true });
await writeFile(new URL("css/tokens.css", dist), tokensToCss(strataTokens));
await writeFile(new URL("tokens.json", dist), `${JSON.stringify(strataTokens, null, 2)}\n`);
console.log("strata tokens: valid; wrote dist/css/tokens.css and dist/tokens.json");
