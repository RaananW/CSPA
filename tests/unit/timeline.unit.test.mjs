/**
 * Unit tests for `compileTimeline` and `parseTransform` in `packages/underglass/src/timeline.ts`: sampling
 * at delay, iteration and direction boundaries, easing overshoot, and rejection of unsupported inputs.
 * Run with `npm run test:unit`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { compileTimeline, parseTransform } from "../../packages/underglass/src/timeline.ts";

const frames = [
  { offset: 0, transform: "translate(0px, 0px) rotate(0deg) scale(1)", opacity: 1 },
  { offset: 1, transform: "translate(100px, 20px) rotate(30deg) scale(0.8)", opacity: 0.5 },
];
test("narrow timeline delay, alternate, endpoints and exact phase", () => {
  const timeline = compileTimeline(frames, { duration: 1000, delay: 100, iterations: 2, direction: "alternate" });
  assert.equal(timeline.sample(50).x, 0);
  assert.equal(timeline.sample(600).x, 50);
  assert.equal(timeline.sample(1100).x, 100);
  assert.equal(timeline.sample(1600).x, 50);
  assert.equal(timeline.sample(2100).x, 0);
  assert.equal(timeline.sample(10000).x, 0);
});
// Easing may overshoot 0..1, so transforms extrapolate; opacity is clamped to its valid range.
test("valid overshoot easing extrapolates transform, clamps only opacity and rejects singular paths", () => {
  const values = frames.map((frame, index) => ({ ...frame, opacity: index, transform: `translate(${index * 100}px, 0px) rotate(0deg) scale(1)` }));
  const timeline = compileTimeline(values, { duration: 1000, easing: "cubic-bezier(0.2,-2,0.8,3)" });
  assert.ok(timeline.sample(104).x < -40);
  assert.equal(timeline.sample(104).opacity, 0);
  assert.ok(timeline.sample(896).x > 140);
  assert.equal(timeline.sample(896).opacity, 1);
  assert.throws(() => compileTimeline([values[0], { ...values[1], transform: "translate(100px, 0px) rotate(0deg) scale(0.01)" }],
    { duration: 1000, easing: "cubic-bezier(0.2,-2,0.8,3)" }), /singular scale/);
});
test("whole timeline rejects dependent, incompatible, additive-like and unbounded declarations", () => {
  for (const transform of ["translate(10%, 0px)", "translate(calc(1px + 2px), 0px)", "translate(var(--x), 0px)",
    "translateX(10px)", "skew(1deg)", "perspective(100px)", "matrix(1,0,0,1,0,0)", "translate(0px, 0px) rotate(0deg) scale(0)"]) {
    assert.throws(() => parseTransform(transform));
  }
  for (const easing of ["steps(2)", "spring(1,2,3,4)", "cubic-bezier(-0.1,0,1,1)", "cubic-bezier(0,Infinity,1,1)"])
    assert.throws(() => compileTimeline(frames, { duration: 1000, easing }));
  assert.throws(() => compileTimeline(frames, { duration: 1000, iterations: 1.5 }));
  assert.throws(() => compileTimeline([{ ...frames[0], offset: 0.1 }, frames[1]], { duration: 1000 }));
  assert.throws(() => compileTimeline([frames[0], { ...frames[1], opacity: NaN }], { duration: 1000 }));
});
