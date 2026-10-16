/**
 * Writes the Strata rendering model's conformance suite, `conformance/relief-1.json`, from the cases in
 * `src/tokens/conformance.ts` and the reference implementation. Run after changing the model or the cases
 * (`npm run build:conformance` in this package); `tests/unit/strata-rendering-model.unit.test.mjs` fails while the
 * committed suite is out of date.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { buildConformance } from "../src/tokens/conformance.ts";

const directory = new URL("../conformance/", import.meta.url);
await mkdir(directory, { recursive: true });
const suite = buildConformance();
await writeFile(new URL("relief-1.json", directory), `${JSON.stringify(suite, null, 2)}\n`);
console.log(`strata conformance: wrote conformance/relief-1.json (${suite.cases.length} cases, ${suite.cases.reduce((total, entry) => total + entry.samples.length, 0)} samples)`);
