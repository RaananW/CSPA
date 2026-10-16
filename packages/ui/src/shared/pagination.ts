/** Pagination's pages (anatomy page `pagination.md`), shared by the bindings. */
export type PageItem = number | "ellipsis";

/**
 * The pages shown for `page` of `count`: the first and last pages, `page` and `siblings` pages either side of it,
 * and an ellipsis for each run of skipped pages. Every page when that would skip none.
 */
export function pageItems(page: number, count: number, siblings = 1): PageItem[] {
  const all = (from: number, to: number) => Array.from({ length: Math.max(0, to - from + 1) }, (_, index) => from + index);
  const slots = siblings * 2 + 5;
  if (count <= slots) return all(1, count);
  const current = Math.min(Math.max(page, 1), count);
  const left = Math.max(current - siblings, 1), right = Math.min(current + siblings, count);
  const leftGap = left > 2, rightGap = right < count - 1;
  if (!leftGap) return [...all(1, slots - 2), "ellipsis", count];
  if (!rightGap) return [1, "ellipsis", ...all(count - (slots - 3), count)];
  return [1, "ellipsis", ...all(left, right), "ellipsis", count];
}
