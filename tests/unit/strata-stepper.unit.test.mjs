/** Stepper's shared marker face (`packages/ui/src/shared/stepper.ts`, anatomy page `stepper.md`). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { stepperFace } from "../../packages/ui/src/shared/stepper.ts";

test("markers stand raised up to the current step and are flat after it", () => {
  assert.deepEqual([0, 1, 2, 3].map(index => stepperFace(index, 1)), ["raised", "raised", "flat", "flat"]);
});
