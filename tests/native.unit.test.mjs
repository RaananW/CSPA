import test from "node:test";
import assert from "node:assert/strict";
import { capabilities, waitForPaint, validateGeometry } from "../src/canvas-spa/native.ts";

test("capability detection accepts functions, not names or dictionary constructors", () => {
  const unavailable = capabilities({ getContext: () => ({}) });
  assert.equal(unavailable.available, false);
  assert.equal(unavailable.dialect, "unavailable");
  const canvas = {
    layoutSubtree: false, getContext: () => ({ drawElementImage() {} }),
    requestPaint() {}, captureElementImage() {}, updateElementGeometry() {},
    clearElementGeometry() {}, getElementTransform() {},
  };
  assert.deepEqual(capabilities(canvas), { available: true, missing: [], dialect: "layoutSubtree" });
  canvas.updateElementGeometry = "not a function";
  assert.ok(capabilities(canvas).missing.includes("updateElementGeometry"));
});

test("paint timeout and request failure remove listeners", async () => {
  let listeners = 0;
  class Canvas extends EventTarget {
    addEventListener(...args) { listeners++; super.addEventListener(...args); }
    removeEventListener(...args) { listeners--; super.removeEventListener(...args); }
    requestPaint() {}
  }
  const canvas = new Canvas();
  await assert.rejects(waitForPaint(canvas, 5), /timed out/);
  assert.equal(listeners, 0);
  canvas.requestPaint = () => { throw new Error("capture unavailable"); };
  await assert.rejects(waitForPaint(canvas, 5), /capture unavailable/);
  assert.equal(listeners, 0);
  canvas.requestPaint = () => canvas.dispatchEvent(new Event("paint"));
  await waitForPaint(canvas, 5);
  assert.equal(listeners, 0);
});

test("bad native geometry is rejected atomically", () => {
  const identity = { is2D: true, a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  assert.doesNotThrow(() => validateGeometry(identity));
  for (const invalid of [{ a: 0 }, { f: NaN }, { is2D: false }]) {
    assert.throws(() => validateGeometry({ ...identity, ...invalid }), /finite invertible/);
  }
});
