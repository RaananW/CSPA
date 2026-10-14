/**
 * Unit tests for the browser capability and input helpers in `packages/underglass/src/native.ts`, using
 * small fakes for the DOM and the canvas instead of a real browser. Run with `npm run test:unit`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { capabilities, waitForPaint, validateGeometry, nativeEditingControl, nativeScrollKind } from "../../packages/underglass/src/native.ts";

test("native editing eligibility distinguishes original text controls from viewport targets", () => {
  class Input { type = "text"; disabled = false; isConnected = true; }
  class Textarea { disabled = false; isConnected = true; }
  const document = { defaultView: { HTMLInputElement: Input, HTMLTextAreaElement: Textarea } };
  const input = Object.assign(new Input(), { ownerDocument: document });
  const textarea = Object.assign(new Textarea(), { ownerDocument: document });
  const viewport = { ownerDocument: document, isConnected: true };
  assert.equal(nativeEditingControl(input), true);
  assert.equal(nativeEditingControl(textarea), true);
  assert.equal(nativeScrollKind(input, viewport), "editing");
  assert.equal(nativeScrollKind(viewport, viewport), "enrolled-viewport");
  assert.equal(nativeScrollKind({ ...viewport }, viewport), "descendant-viewport");
  for (const type of ["checkbox", "button", "file", "range", "hidden"]) {
    input.type = type;
    assert.equal(nativeEditingControl(input), false);
  }
  input.type = "text"; input.disabled = true;
  assert.equal(nativeEditingControl(input), false);
  input.disabled = false; input.isConnected = false;
  assert.equal(nativeEditingControl(input), false);
  assert.equal(nativeEditingControl({ ...viewport, ownerDocument: { defaultView: null } }), false);
});

// Support is judged by each API being a callable function, not by a property name merely existing.
test("capability detection accepts functions, not names or dictionary constructors", () => {
  const unavailable = capabilities({ getContext: () => ({}) });
  assert.equal(unavailable.available, false);
  assert.equal(unavailable.dialect, "unavailable");
  const canvas = {
    content: "fallback", getContext: () => { throw Error("Must not acquire a 2D owner"); },
    requestPaint() {}, getElementImageDefaultSize() {}, updateElementGeometry() {},
    clearElementGeometry() {}, getElementTransform() {},
  };
  assert.deepEqual(capabilities(canvas), { available: true, missing: [], dialect: "content-drawable" });
  assert.equal(capabilities({ ...canvas, content: undefined }).available, true);
  const { content, ...legacy } = canvas;
  assert.equal(capabilities({ ...legacy, layoutSubtree: true }).available, false);
  canvas.updateElementGeometry = "not a function";
  assert.ok(capabilities(canvas).missing.includes("updateElementGeometry"));
});

// `listeners` is the net number of registered listeners, so a paint listener left behind on any exit path fails the test.
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

// `validateGeometry` must throw for a non-invertible, non-finite or 3D matrix.
test("bad native geometry is rejected atomically", () => {
  const identity = { is2D: true, a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  assert.doesNotThrow(() => validateGeometry(identity));
  for (const invalid of [{ a: 0 }, { f: NaN }, { is2D: false }]) {
    assert.throws(() => validateGeometry({ ...identity, ...invalid }), /finite invertible/);
  }
});
