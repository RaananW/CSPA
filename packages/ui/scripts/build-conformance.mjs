/**
 * Writes the Strata rendering model's conformance suites, `conformance/relief-1.json` and `conformance/objects-2.json`, from the cases in
 * `src/tokens/conformance.ts` and the reference implementation. Run after changing the model or the cases
 * (`npm run build:conformance` in this package); `tests/unit/strata-rendering-model.unit.test.mjs` fails while the
 * committed suite is out of date.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { buildConformance, buildObjectsConformance } from "../src/tokens/conformance.ts";

const directory = new URL("../conformance/", import.meta.url);
await mkdir(directory, { recursive: true });
for (const [name, suite] of [["relief-1.json", buildConformance()], ["objects-2.json", buildObjectsConformance()]]) {
  await writeFile(new URL(name, directory), `${JSON.stringify(suite, null, 2)}\n`);
  console.log(`strata conformance: wrote conformance/${name} (${suite.cases.length} cases, ${suite.cases.reduce((total, entry) => total + entry.samples.length, 0)} samples)`);
}
