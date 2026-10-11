import { test } from "node:test";
import assert from "node:assert/strict";
import { affine, inverse, point, cssMatrix } from "../../packages/canvas-spa/src/affine.ts";

test("canonical affine transform and inverse agree for rotation/scale/translation", () => {
  for (const transform of [{}, { x: 15, y: -2 }, { scaleX: 0.8, scaleY: 1.3, rotation: 27 }, { scaleX: -1, rotation: -75 }]) {
    const matrix = affine(transform, { x: 31, y: 82 });
    for (const original of [{ x: 0, y: 0 }, { x: 270, y: 115 }, { x: -14, y: 20 }]) {
      const restored = point(inverse(matrix), point(matrix, original));
      assert.ok(Math.abs(restored.x - original.x) < 1e-8);
      assert.ok(Math.abs(restored.y - original.y) < 1e-8);
    }
    assert.equal(cssMatrix(matrix), `matrix(${matrix.join(",")})`);
  }
});

test("finite singular/opacity guards reject without usable success defaults", () => {
  for (const transform of [{ x: NaN }, { y: Infinity }, { rotation: Infinity }, { scaleX: 0 }, { scaleY: 1e-12 },
    { opacity: -0.1 }, { opacity: 1.1 }]) assert.throws(() => affine(transform), /finite invertible/);
  assert.throws(() => inverse([0, 0, 0, 1, 0, 0]), /Invalid affine inverse/);
});

test("computed coefficients, determinant and inverse stay finite for extreme inputs", () => {
  assert.deepEqual(affine({ rotation: Number.MAX_VALUE }), affine({ rotation: Number.MAX_VALUE % 360 }));
  for (const transform of [{ scaleX: 1e308, scaleY: 1e308 },
    { x: Number.MAX_VALUE }, { scaleX: 1e308, scaleY: 1e-308, x: 1e308, y: 1e308 }]) {
    assert.throws(() => affine(transform, { x: Number.MAX_VALUE, y: 0 }), /finite invertible/);
  }
  assert.throws(() => inverse([1e308, 0, 0, 1e308, 0, 0]), /Invalid affine inverse/);
  assert.throws(() => inverse([1e308, 0, 0, 1e-308, 1e308, 1e308]), /Invalid affine inverse/);
});
