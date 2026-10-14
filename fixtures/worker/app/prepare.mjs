import { workerCompositorProgram } from "@canvas-spa/react/build";
import * as runtime from "@canvas-spa/react";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
assert.equal(Object.keys(runtime).length, 13);
for (const entry of ["experimental-worker", "experimental-worker/thread"]) {
  assert.doesNotMatch(await readFile(new URL(import.meta.resolve(`@canvas-spa/react/${entry}`)), "utf8"),
    /compositionShader|fn effectFragment|private _device/);
}
await writeFile(new URL("./program.json", import.meta.url), JSON.stringify(workerCompositorProgram(8)) + "\n");
