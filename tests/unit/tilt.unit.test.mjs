/**
 * Unit tests for tilted transforms: the canonical projective matrix (`affine.ts`), its projection, and tilt channels
 * in timelines and typed motion. Pure math, no browser; `tests/browser/tilt.test.mjs` checks the same matrix against
 * the browser's own CSS composition, and the pixels and hits it produces. Run with `npm run test:unit`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { affine, canonical, cssMatrix, project, tilted, TILT_MAX } from "../../packages/core/src/affine.ts";
import { compileTimeline, parseTransform } from "../../packages/core/src/timeline.ts";
import { compileMotion } from "../../packages/core/src/motion.ts";

const near = (actual, expected, tolerance = 1e-9) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} vs ${expected}`);

test("an untilted transform keeps its exact 2D affine matrix", () => {
  const transform = { x: 12, y: -4, rotation: 30, scaleX: 1.5, scaleY: 0.5 };
  assert.deepEqual(canonical(transform, { x: 40, y: 50 }, { x: 10, y: 20 }), affine(transform, { x: 40, y: 50 }, { x: 10, y: 20 }));
  assert.deepEqual(canonical({ ...transform, tiltX: 0, tiltY: 0, perspective: 900 }), affine(transform));
  assert.equal(tilted({ tiltX: 0 }), false);
  assert.equal(tilted({ tiltY: -3 }), true);
});

test("a tilted transform is projective, keeps the pivot fixed and views the tilt from the perspective distance", () => {
  const around = { x: 130, y: 150 }, origin = { x: 40, y: 50 };
  const matrix = canonical({ tiltY: 35, perspective: 700 }, origin, around);
  assert.equal(matrix.length, 16);
  // The pivot does not move.
  const pivot = project(matrix, around);
  near(pivot.x, origin.x + around.x); near(pivot.y, origin.y + around.y);
  // rotateY(35deg) viewed from 700 px: a point d px right of the pivot lands at d·cos / (1 + d·sin / 700).
  const d = 100, angle = (35 * Math.PI) / 180;
  const right = project(matrix, { x: around.x + d, y: around.y });
  near(right.x - pivot.x, (d * Math.cos(angle)) / (1 + (d * Math.sin(angle)) / 700));
  // Positive tiltY sends the right edge away from the viewer (it shrinks), the left edge towards it (it grows).
  const left = project(matrix, { x: around.x - d, y: around.y });
  assert.ok(pivot.x - left.x > right.x - pivot.x);
  // Positive tiltX sends the top edge away from the viewer.
  const pitch = canonical({ tiltX: 30 }, origin, around);
  const top = project(pitch, { x: around.x, y: around.y - d }), bottom = project(pitch, { x: around.x, y: around.y + d });
  assert.ok(bottom.y - pivot.y > pivot.y - top.y);
  assert.match(cssMatrix(matrix), /^matrix3d\(/);
  assert.match(cssMatrix(affine({ x: 1 })), /^matrix\(/);
});

test("tilts beyond the limit, a viewer too close and points behind the viewer are refused", () => {
  assert.equal(TILT_MAX, 60);
  for (const bad of [{ tiltX: 61 }, { tiltY: -60.5 }, { tiltY: 10, perspective: 99 }, { tiltX: NaN }]) assert.throws(() => canonical(bad));
  // Viewed from 100 px, a point 300 px to the left comes 260 px towards the viewer: past it.
  const matrix = canonical({ tiltY: 60, perspective: 100 });
  assert.throws(() => project(matrix, { x: -300, y: 0 }), /behind the viewer/);
  assert.doesNotThrow(() => project(matrix, { x: 300, y: 0 }));
});

test("timelines parse and interpolate tilt only when a frame names it", () => {
  assert.deepEqual(parseTransform("translate(1px, 2px) rotate(3deg) scale(1)"), { x: 1, y: 2, rotation: 3, scaleX: 1, scaleY: 1 });
  assert.deepEqual(parseTransform("translate(0px, 0px) perspective(800px) rotate(0deg) rotateX(10deg) rotateY(-20deg) scale(1, 1)"),
    { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, perspective: 800, tiltX: 10, tiltY: -20 });
  assert.throws(() => parseTransform("translate(0px, 0px) rotate(0deg) rotateX(70deg) rotateY(0deg) scale(1)"), /±60/);
  const flat = compileTimeline([{ offset: 0, transform: "none", opacity: 1 }, { offset: 1, transform: "translate(10px, 0px) rotate(0deg) scale(1)", opacity: 1 }], { duration: 100 });
  assert.equal("tiltX" in flat.sample(50), false);
  const tilting = compileTimeline([{ offset: 0, transform: "none", opacity: 1 },
    { offset: 1, transform: "translate(0px, 0px) perspective(1000px) rotate(0deg) rotateX(0deg) rotateY(40deg) scale(1)", opacity: 1 }], { duration: 100 });
  assert.deepEqual(tilting.sample(50), { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, opacity: 1, tiltX: 0, tiltY: 20, perspective: 1300 });
  // An easing that overshoots past the tilt limit is refused at compile time.
  // (A keyframe's easing leads to the next frame.)
  assert.throws(() => compileTimeline([{ offset: 0, transform: "none", opacity: 1, easing: "cubic-bezier(0.3, 1.8, 0.6, 1.4)" },
    { offset: 1, transform: "translate(0px, 0px) rotate(0deg) rotateX(0deg) rotateY(58deg) scale(1)", opacity: 1 }], { duration: 100 }), /singular scale or exceeds/);
});

test("typed motion keyframes carry tilt in the canonical composition order", () => {
  const motion = compileMotion({ keyframes: [{ offset: 0 }, { offset: 1, tiltY: 15, perspective: 1200 }], timing: { duration: 200 } });
  assert.equal(motion.frames[0].transform, "translate(0px, 0px) rotate(0deg) scale(1, 1)");
  assert.equal(motion.frames[1].transform, "translate(0px, 0px) perspective(1200px) rotate(0deg) rotateX(0deg) rotateY(15deg) scale(1, 1)");
  assert.equal(motion.timeline.sample(200).tiltY, 15);
  assert.throws(() => compileMotion({ keyframes: [{ offset: 0 }, { offset: 1, tiltX: 90 }], timing: { duration: 200 } }));
});
