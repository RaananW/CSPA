# Button

Tier A. Follows the [anatomy template](../design-language.md#17-component-anatomy-template) and the
[conventions](README.md#conventions).

## 1. Purpose and native element

Starts an action. Renders a native `<button>`, following the WAI-ARIA
[Button pattern](https://www.w3.org/WAI/ARIA/apg/patterns/button/). `type="button"` is the default, so
a Button inside a form never submits by accident; `type="submit"` and `type="reset"` are passed through.
A Button that navigates is a [Link](link.md), not a Button.

Variants: `secondary` (default), `accent` (the primary action) and `danger` (destructive). Sizes follow
the density's control height (section 13), never a separate size scale.

## 2. Object

A **key**: a rounded, tapered block whose base is the button's border box.

| Part | Shape | Height at 50% | Moves |
| --- | --- | --- | --- |
| Key body | Frustum from the base to the top, `object.taper` inset | `object.keyHeight` (8) | Down by `object.keyTravel` (6) on press; up by `keyHeight / 4` on hover |
| Key top | The captured face, screen-locked (section 6) | — | With the body |

The label and icon are on the key top. The whole travel stays inside the border box.

## 3. Faces and materials

| Face | Colour role | Text role | Material role |
| --- | --- | --- | --- |
| Key top, `secondary` | `secondary` | `text` | `control` (`matte`) |
| Key top, `accent` | `accent` | `on-accent` | `buttonPrimary` (`matte`) |
| Key top, `danger` | `danger` | `on-danger` | `control` |
| Key sides (Objects) | The top's colour, darkened by the bevel | — | Same as the top |

`data-strata-material` on the button overrides the role for one button.

## 4. Elevation per state

| State | Relief | Objects | CSS |
| --- | --- | --- | --- |
| Rest | `elevation.raised` (3) | Key at `keyHeight` | Relief recipe at `raised` |
| Hover | `raised × state.hoverHeight`; interior `+state.hoverLift` | Key rises `keyHeight / 4` | Larger shadow, `brightness(1.04)` |
| Pressed (`:active`) | `raised × state.pressHeight`; interior `−state.pressSink` | Key travels `keyTravel` | Smaller shadow, `brightness(0.96)` |
| Focus-visible | Accent edge, `focus.width` | Emissive glow on the key | `outline: focus.width solid accent` |
| Disabled | Height 0, no bevel gain, content at 38% | Key flattened to the face | Flat, content `opacity: 0.38` |
| Busy (`aria-busy="true"`) | Rest, with an `emissive` [Spinner](spinner.md) replacing the icon | Same | Same |

Selected and invalid do not apply; a latching button is a [ToggleButton](toggle-button.md).

## 5. Relief primitives

One `raised` primitive: the `<button>` itself, from its border box and `border-radius`
(`radius.control`).

## 6. Tokens it reads

| Token | Prop |
| --- | --- |
| `colour.secondary`, `colour.accent`, `colour.danger`, `colour.text` | `variant` picks the role |
| `radius.control` | — (theme or scope) |
| `elevation.raised`, `state.*`, `object.keyHeight`, `object.keyTravel`, `object.taper` | — |
| `material.roles.control`, `material.roles.buttonPrimary` | `material` |
| `density` (control height), `space.*` (padding) | — |
| `font.size.body`, `font.weight.strong` | — |
| `focus.width`, `focus.offset`, `motion.fast`, `motion.easing.press` | — |
| `level` | `level` |

## 7. DOM structure and overlay needs

```html
<button type="button" class="ug-button ug-button--accent" data-strata-face="raised">
  <span class="ug-button__icon" aria-hidden="true"><!-- optional SVG --></span>
  <span class="ug-button__label">Save</span>
</button>
```

- The `<button>` is the boundary element: React and Vue refs, `class` and `style` reach it.
- No overlay.
- Icon-only buttons are [IconButton](icon-button.md).

## 8. Keyboard and screen reader

| Key | Action |
| --- | --- |
| Enter, Space | Activate (native) |
| Tab, Shift+Tab | Move focus (native order) |

- Role `button` (native). The accessible name is the label text.
- `disabled` uses the native attribute, which removes the button from the tab order. A button that must stay
  focusable while unavailable uses `aria-disabled="true"`, and the binding blocks activation.
- Busy: `aria-busy="true"` on the button, and the label stays.

## 9. CSS presentation

The relief recipe at `elevation.raised`, with `box-shadow` derived from the light (section 7), the bevel
gradient, and the material's finish zones (section 4). Minimum size: the density's control height, and never
below `target.min` (24) in either dimension. Under `forced-colors`: `ButtonFace`, `ButtonText` and a
`ButtonBorder` outline; no shadows.

## 10. Tests

- **Plain DOM:** real pointer click and Enter and Space activate once; disabled does not activate; `type`
  defaults to `button` inside a form.
- **GPU:** at Relief and Objects, GPU stays active through hover, press and release; pixels are fresh after
  each; a hit at the key's edge pixel reaches the `<button>`.
- **Accessibility:** axe on every variant and state, in light, dark and high contrast; accessibility
  snapshot equal in DOM and GPU modes; focus ring visible in decoded pixels; contrast of the label on the lit
  top at `interior.max`.
- **Parity:** Relief and CSS within the P0.6 budget at rest, hover and pressed.
