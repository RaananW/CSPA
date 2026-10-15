/**
 * Browser suite for a plain-DOM application on `@underglass/core` alone (`vanilla.html`,
 * `window.frameworkProbe`): the shared framework-adapter contract in `tests/helpers/framework-contract.mjs`
 * at DPR 1 and 2. Content, structure and transform updates made with ordinary DOM writes must stay
 * GPU-presented with fresh pixels and correct native hits. Reports and screenshots go to the `frameworks`
 * evidence directory.
 */
import { test } from "../helpers/current-browser.mjs";
import { evidenceDirectory } from "../helpers/evidence.mjs";
import { frameworkContract } from "../helpers/framework-contract.mjs";

const directory = evidenceDirectory("frameworks");
for (const dpr of [1, 2]) test(`plain DOM on the core runtime keeps GPU presentation, fresh pixels and native hits DPR${dpr}`, async ({ browser }) => {
  await frameworkContract(browser, { path: "/vanilla.html", framework: "vanilla", dpr, directory });
});
