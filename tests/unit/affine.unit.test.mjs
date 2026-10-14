import { test } from "node:test";
import assert from "node:assert/strict";
import { affine, inverse, pivot, point, cssMatrix } from "../../packages/underglass/src/affine.ts";

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

test("transform origin pivots rotation and scale like CSS transform-origin", () => {
  const size = { width: 200, height: 100 };
  assert.deepEqual(pivot(undefined, size), { x: 0, y: 0 });
  assert.deepEqual(pivot("top-left", size), { x: 0, y: 0 });
  assert.deepEqual(pivot("center", size), { x: 100, y: 50 });
  assert.deepEqual(pivot({ x: 1, y: .25 }, size), { x: 200, y: 25 });
  for (const origin of [{ x: NaN, y: 0 }, { x: 0, y: Infinity }, "middle", null]) {
    assert.throws(() => pivot(origin, size), /Transform origin requires/);
  }
  const layer = { x: 30, y: 40 }, around = pivot("center", size);
  const transform = { x: 5, y: -7, rotation: 63, scaleX: 1.4, scaleY: .6 };
  const matrix = affine(transform, layer, around);
  // The pivot only moves by the translation; CSS: translate(O) * T * translate(-O).
  const fixed = point(matrix, around);
  assert.ok(Math.abs(fixed.x - (layer.x + around.x + transform.x)) < 1e-9);
  assert.ok(Math.abs(fixed.y - (layer.y + around.y + transform.y)) < 1e-9);
  // Independent composition: translate(O + t) * rotate * scale * translate(-O).
  const r = transform.rotation * Math.PI / 180, cos = Math.cos(r), sin = Math.sin(r);
  const linear = [cos * transform.scaleX, sin * transform.scaleX, -sin * transform.scaleY, cos * transform.scaleY];
  const expected = [...linear,
    layer.x + around.x + transform.x - (linear[0] * around.x + linear[2] * around.y),
    layer.y + around.y + transform.y - (linear[1] * around.x + linear[3] * around.y)];
  expected.forEach((value, index) => assert.ok(Math.abs(value - matrix[index]) < 1e-9));
  assert.deepEqual(affine(transform, layer, { x: 0, y: 0 }), affine(transform, layer));
  assert.throws(() => affine({}, layer, { x: NaN, y: 0 }), /finite invertible/);
});
