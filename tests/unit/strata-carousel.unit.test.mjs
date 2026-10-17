/** Carousel's shared names (`packages/ui/src/shared/carousel.ts`, anatomy page `carousel.md`). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { strataSlideLabels } from "../../packages/ui/src/shared/carousel.ts";

test("slides are named by place and picker keys by number, in the binding's wording when given", () => {
  assert.deepEqual(strataSlideLabels(3), { slides: ["1 of 3", "2 of 3", "3 of 3"], keys: ["Slide 1", "Slide 2", "Slide 3"] });
  assert.deepEqual(strataSlideLabels(2, (n, total) => `${n}/${total}`, n => `Go to ${n}`), { slides: ["1/2", "2/2"], keys: ["Go to 1", "Go to 2"] });
});
