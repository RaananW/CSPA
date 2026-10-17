/** Rating (anatomy page `rating.md`): the wording and the fill shared by the bindings. */

/** A star's name: "1 star", "2 stars". */
export function ratingItemLabel(score: number): string {
  return `${score} ${score === 1 ? "star" : "stars"}`;
}

/** The display's name: "4.5 out of 5 stars". */
export function ratingName(value: number, max: number): string {
  return `${value} out of ${max} stars`;
}

/** The display's style: the filled fraction (0–1, to four places) and the number of stars. */
export function ratingStyle(value: number, max: number): string {
  const fraction = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  return `--strata-rating: ${Math.round(fraction * 10000) / 10000}; --strata-rating-max: ${max};`;
}
