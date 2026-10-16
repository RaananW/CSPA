# Badge

Tier A. Follows the [anatomy template](../design-language.md#17-component-anatomy-template) and the
[conventions](README.md#conventions).

## 1. Purpose and native element

Shows a short status or count beside other content, such as "New" or "3". Renders a `<span>`. A Badge is not
interactive: it has no tab stop and no hit target, so the 24 by 24 target rule does not apply. There is no
APG pattern for a badge. A badge that must be announced when it changes sits in a live region the
application provides, or uses `role="status"`.

Variants: `neutral` (default), `accent`, `success`, `warning`, `danger` and `info`.

## 2. Object

None in 3D. A **flat pill**: a rounded shape with material only and no height, at every level. It has no
moving part.

## 3. Faces and materials

| Face | Colour role | Text role | Material role |
| --- | --- | --- | --- |
| Pill, `neutral` | `secondary` | `text` | `control` (`matte`) |
| Pill, `accent` | `accent` | `on-accent` | `control` |
| Pill, `success` | `success` | `on-success` | `control` |
| Pill, `warning` | `warning` | `on-warning` | `control` |
| Pill, `danger` | `danger` | `on-danger` | `control` |
| Pill, `info` | `info` (= `accent`) | `on-info` | `control` |

The meaning is in the text. Colour is an addition, never the only carrier (write "Failed", not a red dot).
Text against the pill is at least 4.5:1.

## 4. Elevation per state

| State | Relief | Objects | CSS |
| --- | --- | --- | --- |
| Rest | `elevation.ground` (0), flat | Flat | Flat fill, no shadow |

Hover, pressed, focus, selected, invalid and busy do not apply, because a Badge is not interactive. Disabled
is not a state of a Badge. A Badge inside a disabled control follows that control's 38% content opacity.

## 5. Relief primitives

One `flat` primitive: the `<span>` (`data-strata-face="flat"`), from its border box and `radius.pill`.

## 6. Tokens it reads

| Token | Prop |
| --- | --- |
| `colour.secondary`, `colour.accent`, `colour.success`, `colour.warning`, `colour.danger`, `colour.info`, `colour.text` | `variant` |
| `radius.pill` | — |
| `material.roles.control` | `material` |
| `font.size.caption`, `font.weight.strong` | — |
| `space.*` (padding) | — |

## 7. DOM structure and overlay needs

```html
<span class="ug-badge ug-badge--success" data-strata-face="flat">Active</span>
```

- The `<span>` is the boundary element. Refs, `class` and `style` reach it.
- No overlay. A count above a limit reads "99+", with the full number in a visually hidden suffix.

## 8. Keyboard and screen reader

- No keys: a Badge is not focusable.
- No role by default. The text is read in context, so the badge sits next to the label it describes.
- With `role="status"` the content is announced politely when it changes. This is opt-in.
- A badge with an icon and no text is not allowed; it needs text or a visually hidden label.

## 9. CSS presentation

An inline-flex pill with the flat recipe: fill from the colour role and the material's base layer, no bevel
and no shadow. Padding is `space.1` vertically and `space.2` horizontally. Under `forced-colors`: `Canvas`
fill, `CanvasText` text and a `CanvasText` outline, so the pill shape stays visible.

## 10. Tests

- **Plain DOM:** the text is present for every variant; the badge is not in the tab order.
- **GPU:** GPU stays active when the badge text changes; pixels are fresh with the new text; no blank frame.
- **Accessibility:** axe in light, dark and high contrast; text contrast of at least 4.5:1 for every variant;
  the `role="status"` form announces a change once.
- **Parity:** Relief and CSS within the P0.6 budget for every variant.
