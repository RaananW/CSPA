/** Carousel (anatomy page `carousel.md`): the names the bindings share. */

/** Each slide's name ("2 of 3") and each picker key's ("Slide 2"), with the bindings' own wording when given. */
export function strataSlideLabels(count: number, slideLabel?: (number: number, count: number) => string, keyLabel?: (number: number) => string) {
  const numbers = Array.from({ length: count }, (_, at) => at + 1);
  return {
    slides: numbers.map(number => (slideLabel ?? ((n, total) => `${n} of ${total}`))(number, count)),
    keys: numbers.map(number => (keyLabel ?? (n => `Slide ${n}`))(number)),
  };
}
