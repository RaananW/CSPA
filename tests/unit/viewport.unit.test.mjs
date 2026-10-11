import test from "node:test";
import assert from "node:assert/strict";
import { intersectViewport, localViewport, scrollOrigin, canvasContentOrigin, viewportContains } from "../../packages/canvas-spa/src/viewport.ts";

test("owner native border-box origin is separate from GPU bitmap content coordinates", () => {
  assert.deepEqual(canvasContentOrigin({ clientLeft: 8, clientTop: 5 }, { paddingLeft: "4px", paddingTop: "6px" }),
    { x: 12, y: 11 });
  assert.deepEqual(canvasContentOrigin({ clientLeft: 0, clientTop: 0 }, { paddingLeft: "0px", paddingTop: "0px" }), { x: 0, y: 0 });
});
test("a fully contained rotated layer needs no owner clip or axis-only restriction", () => {
  const frame = { x: 0, y: 0, width: 640, height: 420 }, extent = { width: 100, height: 50 };
  assert.equal(viewportContains({ a: 0.9, b: 0.1, c: -0.1, d: 0.9, e: 40, f: 50 }, extent, frame), true);
  assert.equal(viewportContains({ a: 1, b: 0, c: 0, d: 1, e: 600, f: 50 }, extent, frame), false);
});

test("axis-aligned viewport intersection maps CSS clip to native local coordinates", () => {
  const clip = intersectViewport({ x: 20, y: 10, width: 80, height: 60 }, { x: 60, y: 0, width: 100, height: 40 });
  assert.deepEqual(clip, { x: 60, y: 10, width: 40, height: 30 });
  assert.deepEqual(localViewport({ a: 2, b: 0, c: 0, d: 3, e: 40, f: 4 }, clip),
    { x: 10, y: 2, width: 20, height: 10 });
  assert.equal(intersectViewport(clip, { x: 150, y: 0, width: 10, height: 10 }).width, 0);
  assert.throws(() => localViewport({ a: 1, b: 1, c: 0, d: 1, e: 0, f: 0 }, clip), /axis-aligned/);
});

test("viewport origin includes offset-parent borders and ancestor scroll, not capture's own scroll", () => {
  const before = globalThis.HTMLElement;
  globalThis.HTMLElement = class {};
  try {
    const node = properties => Object.assign(new HTMLElement(), { clientLeft: 0, clientTop: 0,
      offsetLeft: 0, offsetTop: 0, scrollLeft: 0, scrollTop: 0 }, properties);
    const root = node({ clientLeft: 2, clientTop: 3, scrollLeft: 20, scrollTop: 30 });
    const ancestor = node({ offsetParent: root, parentElement: root, offsetLeft: 40, offsetTop: 50,
      clientLeft: 4, clientTop: 5, scrollLeft: 6, scrollTop: 7 });
    const element = node({ offsetParent: ancestor, parentElement: ancestor, offsetLeft: 10, offsetTop: 12,
      scrollLeft: 100, scrollTop: 200 });
    assert.deepEqual(scrollOrigin(element, root), { x: 30, y: 33 });
  } finally {
    if (before === undefined) delete globalThis.HTMLElement; else globalThis.HTMLElement = before;
  }
});
