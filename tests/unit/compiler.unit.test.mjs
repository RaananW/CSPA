import test from "node:test";
import assert from "node:assert/strict";
import { compileStyle } from "../../packages/underglass/src/compiler.ts";

test("narrow authoring compiles browser layout and rejects invalid numeric values", () => {
  const style = compileStyle({ x: -2, width: 120, padding: 4, direction: "column", gap: 3 }, {}, true);
  assert.equal(style.position, "absolute");
  assert.equal(style.left, -2);
  assert.equal(style.boxSizing, "border-box");
  assert.equal(style.flexDirection, "column");
  assert.equal(style.gap, 3);
  assert.throws(() => compileStyle({ width: NaN }), /Invalid authored width/);
  assert.throws(() => compileStyle({ padding: -1 }), /Invalid authored padding/);
  assert.throws(() => compileStyle({}, { borderWidth: Infinity }), /Invalid authored borderWidth/);
});
