# Spinner

Tier A. Follows the [anatomy template](../design-language.md#17-component-anatomy-template) and the
[conventions](README.md#conventions).

## 1. Purpose and native element

Shows that work of unknown length is in progress. Renders a native `<span>` with `role="status"`, because HTML
has no element for it. `status` is a polite live region, so the text inside is announced when it appears.
There is no APG pattern for a spinner or a loading indicator; the closest are the `status` role and
[WCAG 4.1.3](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html). Work of known length is a
[ProgressBar](progress-bar.md).

Sizes: `sm` (16), `md` (24, default) and `lg` (40), as fixed rules in CSS pixels. A Spinner is not a target,
so `target.min` does not apply.

## 2. Object

A **ring groove with an emissive arc** that runs around it.

| Part | Shape | Height at 50% | Moves |
| --- | --- | --- | --- |
| Ring | `ring`, an annulus, thickness one eighth of the diameter (fixed rule) | Sunk by `elevation.well` (2) | No |
| Arc | The `ring` primitive's arc, about a quarter of the ring (fixed rule), `emissive` | In the groove, flush with the rim | Rotates around the ring centre |

Both parts are inside the `<span>` box, which is square. The arc is lit by itself and casts no shadow.

## 3. Faces and materials

| Face | Colour role | Text role | Material role |
| --- | --- | --- | --- |
| Ring | `track` | — | `field` (`matte`) |
| Arc | `accent` | — | `indicator` (`emissive`) |
| Label | — | `text` | — |

`data-strata-material` on the Spinner overrides the arc's material for one Spinner.

## 4. Elevation per state

| State | Relief | Objects | CSS |
| --- | --- | --- | --- |
| Rest (running) | Ring sunk by `elevation.well`; arc emissive | Same | Ring as inset border; arc as a conic or border segment with a glow `box-shadow` |
| Reduced motion | Arc fixed at the top, label visible | Same | No animation, label shown |

Hover, pressed, focus, selected, disabled, invalid and busy do not apply: a Spinner is not interactive and not
focusable, and it is the busy indicator for other components. A Spinner that is mounted means busy; one that
is unmounted means done.

## 5. Relief primitives

One `ring` primitive: the `<span>`, an annulus from its border box, with the arc as its fill. The arc's
angle is a uniform, so the rotation needs no recapture. Core relief primitives gain the ring shape for this
([plan](../plan.md#contract-changes), relief primitives).

## 6. Tokens it reads

| Token | Prop |
| --- | --- |
| `colour.track`, `colour.accent`, `colour.text` | — |
| `elevation.well` | — |
| `material.roles.field`, `material.roles.indicator` | `material` |
| `motion.*` | — |
| `font.size.small` (label) | — |
| `level` | `level` |

One revolution takes 800 ms (fixed rule, linear, no token). It never uses `motion.fast`, `normal` or `slow`,
which are for state changes.

## 7. DOM structure and overlay needs

```html
<span class="ug-spinner ug-spinner--md" role="status" data-strata-face="ring">
  <span class="ug-spinner__arc" aria-hidden="true"></span>
  <span class="ug-spinner__label">Loading</span>
</span>
```

- The outer `<span>` is the boundary element. React and Vue refs, `class` and `style` reach it.
- The label is required: it is the live region's content, which screen readers announce (a `status` takes no
  name from its content). It is visually hidden while the
  Spinner animates and visible under reduced motion. `aria-label` is not used, because a live region
  announces its content, not its label.
- Inside a [Button](button.md) with `aria-busy="true"` the Spinner renders without `role` and with
  `aria-hidden="true"`, so the Button announces the busy state once.
- No overlay.

## 8. Keyboard and screen reader

No keys; not in the tab order.

- Role `status` (native live region, `aria-live="polite"`, `aria-atomic="true"`). The text is announced when
  the Spinner is added to the page. Adding the Spinner is the announcement; Strata does not change the text
  while it runs.
- Do not put a Spinner in a container that is already a live region.

## 9. CSS presentation

The ring is an inset border (the groove recipe) on a circle (`border-radius: 50%`). The arc is a conic
segment or a border segment, rotated with `transform: rotate()`, with a glow. In GPU mode the CSS paints flat
faces and does not animate the arc; the GPU draws the arc and sets its angle as a pose uniform each frame, so
rotation needs no recapture. Under `prefers-reduced-motion: reduce`: no rotation and no pulsing. The arc
stays at the top, the label becomes visible, and a Spinner with no label is reported in development builds.
Under `forced-colors`: a `CanvasText` ring and a `Highlight` arc, no glow; the label is visible.

## 10. Tests

- **Plain DOM:** role `status`; its text is the announcement; no focusable descendants; inside a busy Button
  it has no role.
- **GPU:** the arc turns through frames while GPU stays active; no capture per frame; pixels differ between
  two angles; a hit on the Spinner reaches the `<span>`; unmounting leaves no stale pixels.
- **Accessibility:** axe in light, dark and high contrast; accessibility snapshot equal in DOM and GPU modes;
  under reduced motion the arc is static, the label is visible and 5 consecutive frames are identical; arc
  against ring at least 3:1.
- **Parity:** Relief and CSS within the P0.6 budget at two fixed angles and under reduced motion.
