import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { registerHooks } from "node:module";
import { validateWorkerFrame, validateWorkerProgram } from "../../packages/canvas-spa/src/worker-protocol.ts";

const sourceRoot = new URL("../../packages/canvas-spa/src/", import.meta.url).href;
const hooks = registerHooks({
  resolve(specifier, context, next) {
    return next(specifier.startsWith("./") && specifier.endsWith(".js") && context.parentURL?.startsWith(sourceRoot)
      ? specifier.slice(0, -3) + ".ts" : specifier, context);
  },
});
const { workerCompositorProgram } = await import("../../packages/canvas-spa/src/build.ts");
hooks.deregister();

test("worker shader and binding layout are emitted by the build entry for each bounded capacity", () => {
  for (let capacity = 1; capacity <= 8; capacity++) {
    const program = workerCompositorProgram(capacity);
    assert.equal(program.version, 1);
    assert.equal(program.capacity, capacity);
    assert.equal(program.shader.bindings.length, capacity * 2 + 1);
    assert.equal(program.shader.bindings.at(-1).uniformByteLength, (4 + capacity * 44) * 4);
    assert.equal((program.shader.fragmentWGSL.match(/sample\.a \*= 1.0 - 0.65/g) ?? []).length, capacity);
  }
  for (const value of [0, 9, -1, 1.5, NaN, Infinity]) assert.throws(() => workerCompositorProgram(value));
});
test("worker runtime source contains no shader generator", async () => {
  for (const path of ["experimental-worker.tsx", "worker-thread.ts"]) {
    const source = await readFile(`packages/canvas-spa/src/${path}`, "utf8");
    assert.doesNotMatch(source, /compositionShader|fn effectFragment|private _device/);
  }
});
test("prebuilt programs reject malformed layouts without reading browser globals", () => {
  const program = workerCompositorProgram(2);
  validateWorkerProgram(program);
  for (const bad of [null, { ...program, version: 2 }, { ...program, capacity: 9 },
    { ...program, shader: { ...program.shader, fragmentWGSL: "" } },
    { ...program, shader: { ...program.shader, bindings: [] } }]) {
    assert.throws(() => validateWorkerProgram(bad), /Invalid/);
  }
});
test("worker frames enforce finite uniforms, output/snapshot budgets and distinct slots", () => {
  const uniforms = new Float32Array(48); uniforms[0] = 1;
  const frame = { width: 100, height: 100, uniforms, images: [{ slot: 0, width: 100, height: 100, image: { close() {} } }] };
  validateWorkerFrame(frame, 1, 4096);
  for (const change of [{ width: 0 }, { height: 1.5 }, { width: 2000, height: 2000 },
    { uniforms: [1] }, { uniforms: new Float32Array(48).fill(NaN) },
    { images: [frame.images[0], frame.images[0]] },
    { images: [{ ...frame.images[0], slot: 1 }] },
    { images: [{ ...frame.images[0], image: {} }] }]) {
    assert.throws(() => validateWorkerFrame({ ...frame, ...change }, 1, 4096), /Invalid/);
  }
});
