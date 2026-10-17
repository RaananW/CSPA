# Carousel

Tier C. Follows the [anatomy template](../design-language.md#17-component-anatomy-template) and the
[conventions](README.md#conventions).

## 1. Purpose and native element

A few items of the same kind (featured stories, product photos) shown one at a time in the same space, which the user
steps through. It follows the WAI-ARIA [Carousel pattern](https://www.w3.org/WAI/ARIA/apg/patterns/carousel/) with no
automatic rotation: a `<section aria-roledescription="carousel">` named by `aria-label`, whose slides are
`role="group"` with `aria-roledescription="slide"` and a name such as "2 of 3". Only the current slide is shown; the
others are `hidden`, so their content is neither seen nor focusable. Native buttons step back and forward, wrapping,
and a row of small keys picks a slide. The slides' container is a polite live region, so a new slide is announced. For
content the user must see together, use a [List](list.md) or cards; Strata has no auto-rotating form (WCAG 2.2.2).

## 2. Object

**A stage with keys under it**: the slides are captured content in their own frame, and the controls are keys.

| Part | Shape | Height at 50% | Moves |
| --- | --- | --- | --- |
| Slides | A rounded frame, `radius.control`, as tall as the shown slide | Flat (captured) | The new slide fades in over `motion.normal` |
| Previous, Next | IconButtons with a chevron | `elevation.raised` | As IconButton |
| Picker key | A 24 px round key per slide | `elevation.raised` | The current slide's key stays down |

## 3. Faces and materials

| Part | Colour role | Material role |
| --- | --- | --- |
| Slides frame | `secondary` | — |
| Picker key | `secondary`; the current one `accent` | `control` |

The current slide's key is held down and filled; the slide also says "2 of 3" to assistive technology.

## 4. Elevation per state

| State | Relief | Objects | CSS |
| --- | --- | --- | --- |
| Previous, Next | As IconButton | Keys | As IconButton |
| Picker key, current (`aria-current="true"`) | Held at `state.pressHeight`, filled | Key held down | Filled |

## 5. Relief primitives

One `raised` primitive per control: Previous, Next and each picker key (keys at the Objects level, the current
picker key held down). The slides are captured content.

## 6. Tokens it reads

`colour.secondary`, `colour.accent`, `elevation.raised`, `radius.control`, `space.2`, `space.3`, `target.min`,
`state.*`, `focus.*`, `motion.normal`.

## 7. DOM structure and overlay needs

```html
<section class="ug-carousel" aria-roledescription="carousel" aria-label="Featured">
  <div class="ug-carousel__slides" aria-live="polite">
    <div class="ug-carousel__slide" role="group" aria-roledescription="slide" aria-label="1 of 3"><p>First</p></div>
    <div class="ug-carousel__slide" role="group" aria-roledescription="slide" aria-label="2 of 3" hidden><p>Second</p></div>
    <div class="ug-carousel__slide" role="group" aria-roledescription="slide" aria-label="3 of 3" hidden><p>Third</p></div>
  </div>
  <div class="ug-carousel__controls">
    <button type="button" class="ug-icon-button ug-carousel__previous" data-strata-face="raised" aria-label="Previous slide">
      <span class="ug-icon-button__icon" aria-hidden="true"></span>
    </button>
    <div class="ug-carousel__picker" role="group" aria-label="Slides">
      <button type="button" class="ug-carousel__key" data-strata-face="raised" aria-label="Slide 1" aria-current="true"></button>
      <button type="button" class="ug-carousel__key" data-strata-face="raised" aria-label="Slide 2"></button>
      <button type="button" class="ug-carousel__key" data-strata-face="raised" aria-label="Slide 3"></button>
    </div>
    <button type="button" class="ug-icon-button ug-carousel__next" data-strata-face="raised" aria-label="Next slide">
      <span class="ug-icon-button__icon" aria-hidden="true"></span>
    </button>
  </div>
</section>
```

- An empty icon gets a chevron from CSS; the bindings accept their own icons.
- React takes `slides` (an array), Vue its default slot's elements (one per slide), and Astro `count` with named slots
  `slide-1`, `slide-2` and so on. All take `index` or `defaultIndex` (from 0) and report changes (`onIndexChange`,
  Vue `v-model:index`); the labels are props (`previousLabel`, `nextLabel`, `pickerLabel`, `slideLabel(n, count)`,
  `keyLabel(n)`). In plain HTML and Astro, `attachStrata` runs the buttons and reports `strata-slide`
  (`detail.index`) from the carousel.
- No overlay.

## 8. Keyboard and screen reader

| Key | Action |
| --- | --- |
| Tab | Moves to Previous, each picker key and Next, and into the current slide's content |
| Enter, Space | Press the focused button |

- Announced as "Featured, carousel"; each slide as "2 of 3, slide". A new slide is announced politely. The picker keys
  say "Slide 2", and the current one "current".

## 9. CSS presentation

The slides frame is a `secondary` rounded box; the controls are a centred row under it with `space.2` gaps. A shown
slide fades in with `@starting-style` (at once under reduced motion). Under `forced-colors` the frame has a
`CanvasText` border, picker keys a `ButtonBorder` one, and the current key is `Highlight`.

## 10. Tests

- **Bindings:** matches this markup; Next and Previous step and wrap, a picker key jumps, only the current slide is
  shown, the current key carries `aria-current`, and the index is reported.
- **GPU:** the controls are keys (the current picker key held down) and the slides captured; a real click on Next
  shows the next slide with fresh pixels, and GPU stays on.
