/** Rating's shared wording and fill (`packages/ui/src/shared/rating.ts`, anatomy page `rating.md`). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { ratingItemLabel, ratingName, ratingStyle } from "../../packages/ui/src/shared/rating.ts";

test("a star is named by its score, and the display by the score out of the maximum", () => {
  assert.equal(ratingItemLabel(1), "1 star");
  assert.equal(ratingItemLabel(3), "3 stars");
  assert.equal(ratingName(4.5, 5), "4.5 out of 5 stars");
});

test("the display fills the score over the maximum, clamped to 0–1, and shows max stars", () => {
  assert.equal(ratingStyle(4.5, 5), "--strata-rating: 0.9; --strata-rating-max: 5;");
  assert.equal(ratingStyle(2, 3), "--strata-rating: 0.6667; --strata-rating-max: 3;");
  assert.equal(ratingStyle(7, 5), "--strata-rating: 1; --strata-rating-max: 5;");
  assert.equal(ratingStyle(-1, 5), "--strata-rating: 0; --strata-rating-max: 5;");
  assert.equal(ratingStyle(1, 0), "--strata-rating: 0; --strata-rating-max: 0;");
});
