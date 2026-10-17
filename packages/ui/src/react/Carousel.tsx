/**
 * Carousel (anatomy page `carousel.md`), the WAI-ARIA Carousel pattern without rotation: one slide shown at a time in a
 * polite live region, stepped by Previous and Next (wrapping) or picked by a key whose `aria-current` marks the slide.
 */
import { forwardRef, useState, type HTMLAttributes, type ReactNode } from "react";
import { strataSlideLabels } from "../shared/carousel.ts";
import { classes, strataAttributes, type StrataProps } from "./shared.ts";

export interface CarouselProps extends Omit<HTMLAttributes<HTMLElement>, "children">, StrataProps {
  /** The carousel's name, such as "Featured". */
  label: string;
  slides: readonly ReactNode[];
  /** Controlled: the shown slide, from 0. */
  index?: number;
  /** The first slide shown when uncontrolled. */
  defaultIndex?: number;
  onIndexChange?: (index: number) => void;
  previousLabel?: string;
  nextLabel?: string;
  pickerLabel?: string;
  /** A slide's name; "2 of 3" by default. */
  slideLabel?: (number: number, count: number) => string;
  /** A picker key's name; "Slide 2" by default. */
  keyLabel?: (number: number) => string;
  previousIcon?: ReactNode;
  nextIcon?: ReactNode;
}

export const Carousel = forwardRef<HTMLElement, CarouselProps>(function Carousel(
  { label, slides, index, defaultIndex = 0, onIndexChange, previousLabel = "Previous slide", nextLabel = "Next slide", pickerLabel = "Slides",
    slideLabel, keyLabel, previousIcon, nextIcon, size, material, level, className, ...rest }, ref,
) {
  const [own, setOwn] = useState(defaultIndex);
  const count = slides.length, current = index ?? own;
  const labels = strataSlideLabels(count, slideLabel, keyLabel);
  const show = (next: number) => { if (index === undefined) setOwn(next); onIndexChange?.(next); };
  return (
    <section ref={ref} className={classes("ug-carousel", className)} aria-roledescription="carousel" aria-label={label} {...strataAttributes({ size, material, level })} {...rest}>
      <div className="ug-carousel__slides" aria-live="polite">
        {slides.map((slide, at) => (
          <div key={at} className="ug-carousel__slide" role="group" aria-roledescription="slide" aria-label={labels.slides[at]} hidden={at !== current}>{slide}</div>
        ))}
      </div>
      <div className="ug-carousel__controls">
        <button type="button" className="ug-icon-button ug-carousel__previous" data-strata-face="raised" aria-label={previousLabel} onClick={() => show((current - 1 + count) % count)}>
          <span className="ug-icon-button__icon" aria-hidden="true">{previousIcon}</span>
        </button>
        <div className="ug-carousel__picker" role="group" aria-label={pickerLabel}>
          {labels.keys.map((name, at) => (
            <button key={at} type="button" className="ug-carousel__key" data-strata-face="raised" aria-label={name} aria-current={at === current ? "true" : undefined} onClick={() => show(at)} />
          ))}
        </div>
        <button type="button" className="ug-icon-button ug-carousel__next" data-strata-face="raised" aria-label={nextLabel} onClick={() => show((current + 1) % count)}>
          <span className="ug-icon-button__icon" aria-hidden="true">{nextIcon}</span>
        </button>
      </div>
    </section>
  );
});
