# Divider

Tier A. Follows the [anatomy template](../design-language.md#17-component-anatomy-template) and the
[conventions](README.md#conventions).

## 1. Purpose and native element

Separates two groups of content. Renders a native `<hr>`, which has the `separator` role. No APG pattern
applies to a static separator (the APG Window Splitter is a focusable, movable separator, a different
component). Orientation is horizontal. A vertical Divider (in a toolbar or a row) sets
`aria-orientation="vertical"`. If a gap needs no meaning, use spacing and not a Divider.

## 2. Object

A **groove**: a thin channel cut into the panel face.

| Part | Shape | Height at 50% | Moves |
| --- | --- | --- | --- |
| Groove | `groove`, 2 px thick (fixed rule), full length of the box | Sunk by `elevation.well` (2) | No |

The groove stays inside the `<hr>` box. It has no moving parts.

## 3. Faces and materials

| Face | Colour role | Text role | Material role |
| --- | --- | --- | --- |
| Groove floor | `panel`, darkened by the inverted bevel | — | `panel` (`matte`) |

## 4. Elevation per state

| State | Relief | Objects | CSS |
| --- | --- | --- | --- |
| Rest | Sunk by `elevation.well` | Same | Inset line: dark edge on the light side, light edge opposite |

Hover, pressed, focus, selected, disabled, invalid and busy do not apply. A Divider is not interactive and
not focusable. A Divider inside a disabled group is unchanged.

## 5. Relief primitives

One `groove` primitive: the `<hr>`, from its border box. In `forced-colors` it is a `flat` primitive.

## 6. Tokens it reads

| Token | Prop |
| --- | --- |
| `colour.panel` | — |
| `elevation.well`, `bevel.gain` | — |
| `material.roles.panel` | `material` |
| `space.*` (margin) | — |

## 7. DOM structure and overlay needs

```html
<hr class="ug-divider" data-strata-face="groove">
<hr class="ug-divider ug-divider--vertical" data-strata-face="groove" aria-orientation="vertical">
```

- The `<hr>` is the boundary element: refs, `class` and `style` reach it.
- No children and no overlay.

## 8. Keyboard and screen reader

No keys; not in the tab order.

- Role `separator` (native). It has no name and needs none.
- `aria-orientation` is set only for the vertical case.

## 9. CSS presentation

The relief recipe for a groove: an inverted bevel, so the edge nearest the light is dark, and a short inner
shadow. In GPU mode the CSS paints the flat face only. Minimum size: 2 px thick; the length is the layout's.
The `target.min` rule does not apply, because a Divider is not a target. Under `forced-colors`: a 1 px
`CanvasText` line (`border-top` or `border-left`), no groove, no shadow.

## 10. Tests

- **Plain DOM:** `<hr>` exposes role `separator`; vertical sets `aria-orientation`; it is not in the tab
  order.
- **GPU:** one `groove` primitive on the layer; GPU stays on through resize and layout changes; pixels show
  the groove after each; hits on the Divider reach the `<hr>`.
- **Accessibility:** axe in light, dark and high contrast; accessibility snapshot equal in DOM and GPU
  modes; the groove is visible against `panel` in decoded pixels. The 3:1 non-text contrast rule does not apply, because the Divider
  carries no information.
- **Parity:** Relief and CSS within the P0.6 budget, horizontal and vertical.
