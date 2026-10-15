# ProgressBar

Tier A. Follows the [anatomy template](../design-language.md#17-component-anatomy-template) and the
[conventions](README.md#conventions).

## 1. Purpose and native element

Shows how far a task has come. Renders a native `<progress>`, which has the `progressbar` role. Without a
`value` attribute it is indeterminate. There is no APG pattern for a progress bar; the `progressbar` role
and the native element define the behaviour. It is not a `meter` (a gauge in a known range, which is not Tier A). Work with no known end can also be a [Spinner](spinner.md).

Sizes follow no scale: the bar is 8 px thick (a fixed rule, at most the groove limit) and fills the width of
its container.

## 2. Object

A **groove with an emissive fill**.

| Part | Shape | Height at 50% | Moves |
| --- | --- | --- | --- |
| Groove | `groove`, 8 px thick, `radius.pill` ends | Sunk by `elevation.well` (2) | No |
| Fill | Lit bar in the groove, from the start edge, flush with the rim | Emissive, no height | Advances with `value / max`; in the indeterminate state a segment travels along the groove |

The fill never leaves the `<progress>` box. It casts no shadow.

## 3. Faces and materials

| Face | Colour role | Text role | Material role |
| --- | --- | --- | --- |
| Groove | `track` | — | `field` (`matte`) |
| Fill | `accent` | — | `indicator` (`emissive`) |
| Groove outline | `edge`, 1 px | — | None |

The fill keeps 3:1 against the unfilled `track`, and the `edge` outline keeps the groove's extent at 3:1
against the panel, so the remaining amount is visible (section 8). `data-strata-material` overrides the fill's
material for one bar.

## 4. Elevation per state

| State | Relief | Objects | CSS |
| --- | --- | --- | --- |
| Rest, determinate | Groove sunk by `elevation.well`; fill at `value / max` | Same | Inset groove; fill with a glow |
| Rest, indeterminate | Groove; a segment (one third of the width, fixed rule) sweeps | Same | Same, animated |
| Reduced motion, indeterminate | Fill is a static diagonal stripe pattern across the whole groove; no sweep | Same | No animation |
| Complete (`value = max`) | Fill spans the groove | Same | Same |

Hover, pressed, focus, selected, disabled, invalid and busy do not apply. The bar is not interactive and not
focusable. A bar that ends with an error is replaced by the message in the [Field](field.md) or the page.

## 5. Relief primitives

One `groove` primitive: the `<progress>` border box, with `radius.pill`. The fill has no DOM element. Its
width is derived from `value` and `max`, and the integration updates it as a uniform, with no recapture.

## 6. Tokens it reads

| Token | Prop |
| --- | --- |
| `colour.track`, `colour.edge`, `colour.accent` | — |
| `radius.pill` | — |
| `elevation.well` | — |
| `material.roles.field`, `material.roles.indicator` | `material` |
| `motion.normal`, `motion.easing.standard` | — |
| `level` | `level` |

Native props pass through: `value`, `max` (default 1). The indeterminate sweep takes 1400 ms per pass (fixed
rule, linear, no token).

## 7. DOM structure and overlay needs

```html
<label for="upload">Upload</label>
<progress id="upload" class="ug-progress" data-strata-face="groove" value="40" max="100"></progress>
```

- The `<progress>` is the boundary element: refs, `class` and `style` reach it.
- The name comes from a `<label for>` or, when there is no visible label, from `aria-label` or
  `aria-labelledby`. A bar with no name is reported in development builds.
- A visible value ("40%") is separate text next to the bar. `aria-valuetext` is not needed when the value is
  a percentage of `max`.
- No overlay.

## 8. Keyboard and screen reader

No keys; not in the tab order.

- Role `progressbar` (native), with the value and maximum from the attributes. No `value` means no value is
  announced (indeterminate).
- Browsers announce value changes at their own rate. Strata does not add a live region around the bar.
- When the task ends, the page announces the result in its own status message; the bar disappearing is not
  an announcement.

## 9. CSS presentation

The groove recipe, with the fill styled through `::-webkit-progress-bar`, `::-webkit-progress-value` and
`::-moz-progress-bar` and `appearance: none`. The fill advances over `motion.normal`. In GPU mode the CSS
paints the flat groove only and the GPU draws groove and fill. Minimum size: 8 px thick; the length is the
layout's. A bar is not a target, so `target.min` does not apply. Under `prefers-reduced-motion: reduce`: the
fill jumps to each value and the indeterminate bar is the static stripe pattern. Under `forced-colors`: a
`CanvasText` outline on `Canvas`, the fill in `Highlight`, no glow.

## 10. Tests

- **Plain DOM:** role `progressbar`; `value` and `max` appear in the accessibility tree; no `value` is
  indeterminate; the label names it.
- **GPU:** at Relief and Objects, GPU stays active while `value` changes; the fill width tracks
  `value / max` and pixels are fresh on each change; the indeterminate segment moves between frames; a hit on
  the bar reaches the `<progress>`.
- **Accessibility:** axe in light, dark and high contrast; accessibility snapshot equal in DOM and GPU modes;
  fill against groove at least 3:1 in light and dark; under reduced motion 5 consecutive frames of an
  indeterminate bar are identical.
- **Parity:** Relief and CSS within the P0.6 budget at 0, 50% and 100%, and in the indeterminate state.
