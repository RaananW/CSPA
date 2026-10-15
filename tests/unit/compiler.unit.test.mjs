/**
 * Unit test for `compileStyle` in `packages/core/src/compiler.ts`, which turns the typed layout and
 * appearance props into browser style values. Run with `npm run test:unit`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { compileStyle } from "../../packages/core/src/compiler.ts";

test("narrow authoring compiles browser layout and rejects invalid numeric values", () => {
  const style = compileStyle({ x: -2, width: 120, padding: 4, direction: "column", gap: 3 }, {}, true);
  assert.equal(style.position, "absolute");
  assert.equal(style.left, "-2px");
  assert.equal(style.boxSizing, "border-box");
  assert.equal(style.flexDirection, "column");
  assert.equal(style.gap, "3px");
  assert.throws(() => compileStyle({ width: NaN }), /Invalid authored width/);
  assert.throws(() => compileStyle({ padding: -1 }), /Invalid authored padding/);
  assert.throws(() => compileStyle({}, { borderWidth: Infinity }), /Invalid authored borderWidth/);
});

// Framework-neutral output: every value is a complete CSS string and unset properties are absent,
// so React, Vue and `Object.assign(element.style, style)` all apply it the same way.
test("compiled styles are complete strings with no unset properties", () => {
  assert.deepEqual(compileStyle({ width: 120, height: 0 }, { radius: 6 }), {
    boxSizing: "border-box", width: "120px", height: "0px", overflow: "visible", borderRadius: "6px",
  });
  assert.deepEqual(compileStyle({}, {}, true), { boxSizing: "border-box", position: "absolute", left: "0px", top: "0px", overflow: "visible" });
  assert.equal(compileStyle({ overflow: "scroll" }).overflow, "auto");
});
