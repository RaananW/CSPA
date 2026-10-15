/**
 * Unit tests for `compileMotion` in `packages/core/src/motion.ts`: typed keyframe and timing
 * validation, and sampling through the shared timeline. Run with `npm run test:unit`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { compileMotion } from "../../packages/core/src/motion.ts";

test("numeric motion snapshots channels/timing and shares bounded timeline sampling", () => {
  const descriptor = {
    keyframes: [{ offset: 0 }, { offset: 1, x: 70, y: 20, rotation: 10, scaleX: 0.85, scaleY: 0.85, opacity: 0.5 }],
    timing: { duration: 1000, delay: 100, iterations: 2, direction: "alternate", fill: "both" },
  };
  const compiled = compileMotion(descriptor);
  // Mutating the descriptor after compiling must not change the compiled motion (it is a snapshot).
  descriptor.keyframes[1].x = 999;
  descriptor.timing.duration = 1;
  assert.deepEqual(compiled.timeline.sample(600), { x: 35, y: 10, rotation: 5, scaleX: 0.925, scaleY: 0.925, opacity: 0.75 });
  assert.equal(compiled.timeline.sample(1600).x, 35);
  assert.deepEqual(compileMotion({ keyframes: [{ offset: 0 }, { offset: 1 }], timing: { duration: 1000 } }).timing,
    { duration: 1000, delay: 0, iterations: 1, direction: "normal", fill: "both", easing: "linear" });
});

test("typed motion rejects unsupported fields and nonfinite/singular paths before source creation", () => {
  for (const frame of [{ offset: 1, x: Infinity }, { offset: 1, opacity: NaN },
    { offset: 1, scaleX: 0 }, { offset: 1, color: "red" }, { offset: 1, x: "30" }]) {
    assert.throws(() => compileMotion({ keyframes: [{ offset: 0 }, frame], timing: { duration: 1000 } }));
  }
  assert.throws(() => compileMotion({ keyframes: [{ offset: 0 }, { offset: 1, scaleX: 0.01 }],
    timing: { duration: 1000, easing: "cubic-bezier(0.2,-2,0.8,3)" } }));
  assert.throws(() => compileMotion({ keyframes: [{ offset: 0 }, { offset: 1 }], timing: { duration: 1000, composite: "add" } }));
});
