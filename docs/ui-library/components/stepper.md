# Stepper

Tier C. Follows the [anatomy template](../design-language.md#17-component-anatomy-template) and the
[conventions](README.md#conventions).

## 1. Purpose and native element

Where the user is in a task of a few ordered steps (Cart, Shipping, Payment): an ordered list (`<ol>`) named by
`aria-label`, whose current step carries `aria-current="step"`. Steps before it are complete, and say so to assistive
technology in a visually hidden "(completed)"; steps after it are to come. It shows progress only: the task's own
controls (Back, Next) move between steps. No APG pattern applies beyond the list and `aria-current`.

## 2. Object

**Coins on a groove**: each step's marker is a small raised coin, and a groove joins it to the step before.

| Part | Shape | Height at 50% | Moves |
| --- | --- | --- | --- |
| Marker | A circle, `size.indicator + 8` px (28 at medium), with the step's number | `elevation.raised` | No |
| Line | A groove 4 px thick between two markers | `elevation.well` | No |

Complete and current markers stand raised; markers to come are flat. A complete step's line is filled.

## 3. Faces and materials

| Part | Colour role | Text role | Material role |
| --- | --- | --- | --- |
| Complete marker | `accent` | `on-accent` | `control` |
| Current marker | `secondary`, with a 2 px `accent` ring inside its edge | `text`, strong | `control` |
| Marker to come | `track` | `text` (`muted` on `track` is under 4.5:1) | flat |
| Line, complete | `accent` | — | `rail` |
| Line, to come | `track` | — | `rail` |
| Label | — | `text` (current: strong; to come: `muted`) | — |

The current step is marked by its ring and its strong label, and complete steps by their fill: never by colour alone,
and all of them by `aria-current` and the hidden status for assistive technology.

## 4. Elevation per state

| State | Relief | Objects | CSS |
| --- | --- | --- | --- |
| Complete | Raised coin, filled | A slab coin | Relief recipe at `raised` |
| Current | Raised coin with its ring | A slab coin | Same |
| To come | Flat marker | Flat | Flat |

## 5. Relief primitives

Per step: one `raised` primitive for the marker (`flat` to come), and from the second step on one `groove` primitive
for the line. At the Objects level markers are slabs (they are not controls).

## 6. Tokens it reads

`colour.accent`, `colour.on-accent`, `colour.secondary`, `colour.track`, `colour.text`, `colour.muted`,
`elevation.raised`, `size.indicator`, `space.2`, `space.6`, `font.size.small`, `font.weight.strong`.

## 7. DOM structure and overlay needs

```html
<ol class="ug-stepper" aria-label="Checkout progress">
  <li class="ug-stepper__step">
    <span class="ug-stepper__marker" data-strata-face="raised" aria-hidden="true">1</span>
    <span class="ug-stepper__label">Cart<span class="ug-stepper__status"> (completed)</span></span>
  </li>
  <li class="ug-stepper__step" aria-current="step">
    <span class="ug-stepper__line" data-strata-face="groove" aria-hidden="true"></span>
    <span class="ug-stepper__marker" data-strata-face="raised" aria-hidden="true">2</span>
    <span class="ug-stepper__label">Shipping</span>
  </li>
  <li class="ug-stepper__step">
    <span class="ug-stepper__line" data-strata-face="groove" aria-hidden="true"></span>
    <span class="ug-stepper__marker" data-strata-face="flat" aria-hidden="true">3</span>
    <span class="ug-stepper__label">Payment</span>
  </li>
</ol>
```

- The bindings take `label` (the list's name), `steps` (their labels), `current` (0-based), `completedLabel`
  (" (completed)") and `orientation` (`horizontal` or `vertical`, as `ug-stepper--vertical`).
- A step's state is its place relative to `aria-current`; the CSS reads it with `:has()`. Only a marker to come is
  `flat`, so the GPU has no face to raise for it.
- No overlay.

## 8. Keyboard and screen reader

Not focusable. Read as "Checkout progress, list, 3 items", then "1, Cart (completed)", "current step, 2, Shipping".

## 9. CSS presentation

A row (or a column) of steps of equal width; the line runs from the previous marker's centre to this one's, behind
the markers. Under `forced-colors` complete markers and lines are `Highlight`, and the current marker has a
`CanvasText` ring.

## 10. Tests

- **Bindings:** matches this markup; `aria-current` follows `current`; complete steps carry the hidden status; the
  vertical form stacks.
- **GPU:** complete and current markers are raised (slabs at Objects), the marker to come is flat, lines are grooves;
  moving `current` updates them, and GPU stays on.
