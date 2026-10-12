import { workerCompositorProgram } from "canvas-spa-phase-one/build";
import * as runtime from "canvas-spa-phase-one";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
assert.equal(Object.keys(runtime).length, 13);
for (const entry of ["experimental-worker", "experimental-worker/thread"]) {
  assert.doesNotMatch(await readFile(new URL(import.meta.resolve(`canvas-spa-phase-one/${entry}`)), "utf8"),
    /compositionShader|fn effectFragment|private _device/);
}
await writeFile(new URL("./program.json", import.meta.url), JSON.stringify(workerCompositorProgram(8)) + "\n");
