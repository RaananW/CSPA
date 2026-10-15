# IconButton

Tier A. Follows the [anatomy template](../design-language.md#17-component-anatomy-template) and the
[conventions](README.md#conventions).

## 1. Purpose and native element

Starts an action, shown as an icon with no visible text. Renders a native `<button>` with an `aria-label`,
following the WAI-ARIA [Button pattern](https://www.w3.org/WAI/ARIA/apg/patterns/button/). As
[Button](button.md), except where this page says otherwise: same variants (`secondary`, `accent`,
`danger`), same `type` rules, same props.

The accessible name is required. A development build reports an IconButton with no `aria-label` or
`aria-labelledby` as an error. The default icon is a flat line icon; a 3D glyph is never the only label
(section 10).

## 2. Object

A **square key**: the [Button](button.md) key with equal width and height.

| Part | Shape | Height at 50% | Moves |
| --- | --- | --- | --- |
| Key body | Frustum from the base to the top, `object.taper` inset | `object.keyHeight` (8) | Down by `object.keyTravel` (6) on press; up by `keyHeight / 4` on hover |
| Key top | The captured face with the icon, screen-locked (section 6) | — | With the body |

The side is the density's control height, so the key is 34 by 34 at `comfortable`. The travel stays inside the
border box.

## 3. Faces and materials

As [Button](button.md#3-faces-and-materials). The icon takes the text role of its variant (`text`,
`on-accent` or `on-danger`) and follows the contrast rule on the lit top.

## 4. Elevation per state

As [Button](button.md#4-elevation-per-state). The focus edge follows the square shape at `radius.control`.
Selected and invalid do not apply; a latching icon button is a [ToggleButton](toggle-button.md). Busy
replaces the icon with an `emissive` [Spinner](spinner.md) of the same size.

## 5. Relief primitives

One `raised` primitive: the `<button>` itself, from its border box and `radius.control`.

## 6. Tokens it reads

As [Button](button.md#6-tokens-it-reads), without `font.*` (there is no text), plus `target.min`.

| Token | Prop |
| --- | --- |
| `colour.secondary`, `colour.accent`, `colour.danger`, `colour.text` | `variant` |
| `material.roles.control`, `material.roles.buttonPrimary` | `material` |
| `density` (control height) | — |
| `target.min` | — |

## 7. DOM structure and overlay needs

```html
<button type="button" class="ug-icon-button" data-strata-face="raised" aria-label="Close">
  <span class="ug-icon-button__icon" aria-hidden="true"><!-- SVG --></span>
</button>
```

- The `<button>` is the boundary element. Refs, `class` and `style` reach it.
- No overlay. A tooltip showing the label is a separate overlay component, not part of this one.

## 8. Keyboard and screen reader

As [Button](button.md#8-keyboard-and-screen-reader): Enter and Space activate, Tab moves focus.

- Role `button` (native). The accessible name is `aria-label` (or `aria-labelledby`). The icon is
  `aria-hidden`.
- Disabled and busy behave as Button.

## 9. CSS presentation

As [Button](button.md#9-css-presentation), with equal width and height. The minimum size is the density's
control height and never below `target.min` (24) in either dimension, so a compact icon button of 28 passes.
Under `forced-colors`: `ButtonFace`, `ButtonText` and a `ButtonBorder` outline; the icon uses `currentColor`
(so `ButtonText`); no shadows.

## 10. Tests

- **Plain DOM:** click, Enter and Space activate once; disabled does not activate; the accessible name is
  present; `type` defaults to `button`.
- **GPU:** at Relief and Objects, GPU stays active through hover, press and release; pixels are fresh after
  each; a hit at the key's edge pixel reaches the `<button>`.
- **Accessibility:** axe on every variant and state, in light, dark and high contrast; icon contrast at
  `interior.max` is at least 3:1; the box is at least 24 by 24 at every density.
- **Parity:** Relief and CSS within the P0.6 budget at rest, hover and pressed.
