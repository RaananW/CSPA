/**
 * Unit tests for Pagination's pages (`packages/ui/src/shared/pagination.ts`, anatomy page `pagination.md`): the first
 * and last pages, the current page and its siblings, and an ellipsis for each run of skipped pages.
 * Run with `npm run test:unit`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

const { pageItems } = await import("../../packages/ui/src/shared/pagination.ts");
const shown = (page, count, siblings) => pageItems(page, count, siblings).map(item => (item === "ellipsis" ? "…" : item)).join(" ");

test("every page while none would be skipped", () => {
  assert.equal(shown(1, 1), "1");
  assert.equal(shown(3, 7), "1 2 3 4 5 6 7");
  assert.equal(shown(1, 0), "");
});

test("the first and last pages, the current page and its siblings, with ellipses for the gaps", () => {
  assert.equal(shown(4, 10), "1 … 3 4 5 … 10");
  assert.equal(shown(1, 10), "1 2 3 4 5 … 10");
  assert.equal(shown(3, 10), "1 2 3 4 5 … 10");
  assert.equal(shown(8, 10), "1 … 6 7 8 9 10");
  assert.equal(shown(10, 10), "1 … 6 7 8 9 10");
  assert.equal(shown(50, 100, 2), "1 … 48 49 50 51 52 … 100");
  // The same number of items wherever the current page is, so the row does not change length as the user moves.
  for (let page = 1; page <= 20; page++) assert.equal(pageItems(page, 20).length, 7, `page ${page}`);
  // Out of range pages are clamped.
  assert.equal(shown(99, 10), "1 … 6 7 8 9 10");
});
