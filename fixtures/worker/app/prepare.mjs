import { workerCompositorProgram } from "@underglass/react/build";
import * as runtime from "@underglass/react";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
// The public runtime surface, by name: a change here is an API change.
assert.deepEqual(Object.keys(runtime).sort(), ["Box", "EnrollmentError", "GPUHost", "NativeOverlay", "NativeScroll", "Presence", "Surface",
  "createCanvasHosts", "defineEffect", "mountApplicationModule", "mountCanvasApp", "useGPUHost", "useNativeOverlayHost", "useSurfaceRef"]);
for (const entry of ["experimental-worker", "experimental-worker/thread"]) {
  assert.doesNotMatch(await readFile(new URL(import.meta.resolve(`@underglass/react/${entry}`)), "utf8"),
    /compositionShader|fn effectFragment|private _device/);
}
await writeFile(new URL("./program.json", import.meta.url), JSON.stringify(workerCompositorProgram(8)) + "\n");
