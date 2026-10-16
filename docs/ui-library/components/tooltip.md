# Tooltip

Tier B. Follows the [anatomy template](../design-language.md#17-component-anatomy-template) and the
[conventions](README.md#conventions).

## 1. Purpose and native element

A short description of a control, shown while the control is hovered or focused. Renders a `<div role="tooltip">`
that its trigger points to with `aria-describedby`, following the WAI-ARIA
[Tooltip pattern](https://www.w3.org/WAI/ARIA/apg/patterns/tooltip/). It is shown in the browser's top layer with
the Popover API (`popover="manual"`), so nothing clips it. A tooltip holds text only: anything interactive belongs in
a Popover (Tier C). A tooltip describes; it never names: an icon-only button still needs its own `aria-label`.

## 2. Object

A **small floating slab** at `elevation.overlay`, beside its trigger, presented by CSS above everything (it is in the
top layer, outside any Underglass layer).

| Part | Shape | Height at 50% | Moves |
| --- | --- | --- | --- |
| Slab | `radius.small`, `space.1` × `space.3` padding, at most 20rem wide | `elevation.overlay` (16) | Fades in over `motion.fast` |

It sits 8 px above its trigger, centred on it, or below when there is no room above, and stays inside the viewport.

## 3. Faces and materials

| Face | Colour role | Text role | Material role |
| --- | --- | --- | --- |
| Slab | `text` (inverted: dark in light themes, light in dark) | `panel` | `overlay` |

## 4. Elevation per state

| State | Relief | Objects | CSS |
| --- | --- | --- | --- |
| Hidden | Not rendered (`popover` closed) | Same | Same |
| Shown | A slab at `elevation.overlay`, with its cast shadow | Same | Same |

Under `prefers-reduced-motion` it appears at once.

## 5. Relief primitives

None in a GPU scene: the tooltip is in the top layer, outside every Underglass layer (a `popover` inside a layer
needs ordinary DOM), and CSS presents its relief. Its trigger may be anywhere, a GPU-presented control included.

## 6. Tokens it reads

| Token | Prop |
| --- | --- |
| `colour.text`, `colour.panel` | — |
| `radius.small`, `space.*`, `font.size.small` | — |
| `elevation.overlay`, `shadow.*` | — |
| `motion.fast` | — |

## 7. DOM structure and overlay needs

```html
<button type="button" class="ug-icon-button" data-strata-face="raised" aria-label="Copy link" aria-describedby="copy-tip"><span class="ug-icon-button__icon" aria-hidden="true"></span></button>
<div class="ug-tooltip" id="copy-tip" role="tooltip" popover="manual">Copies the address to the clipboard</div>
```

- The tooltip element is the boundary element: refs, `class` and `style` reach it. It must be **outside every
  Underglass layer**: at the end of `<body>`, or in the overlay host.
- **Showing:** 300 ms after the pointer rests on the trigger, or at once when the trigger takes keyboard focus.
  **Hiding:** when focus leaves, or 100 ms after the pointer leaves both the trigger and the tooltip (so the pointer
  can move onto it, WCAG 1.4.13), or on Escape, which leaves focus where it is.
- **Plain HTML:** `attachStrata` shows and hides every `.ug-tooltip` named by a trigger's `aria-describedby`.
  **React and Vue:** `<Tooltip content="…">` around one trigger, which gets the `aria-describedby`; the tooltip is
  portalled to `<body>` (Vue: teleported). **Astro:** `<Tooltip id content>`, placed at the end of the page, and the
  trigger's `aria-describedby`.
- `data-strata-placement="bottom"` on the tooltip prefers below.

## 8. Keyboard and screen reader

| Key | Action |
| --- | --- |
| Tab | Focus on the trigger shows the tooltip; leaving hides it |
| Escape | Hides the tooltip; focus stays on the trigger |

- The trigger's description is the tooltip's text, read after its name: "Copy link, button, Copies the address to
  the clipboard".

## 9. CSS presentation

The `raised` recipe at `elevation.overlay` with the inverted colours, `font.size.small`, and `position: fixed` at the
coordinates the behaviour sets. It fades in with `opacity` over `motion.fast` (`@starting-style`), at once under
reduced motion. Under `forced-colors` it is `Canvas` with a `CanvasText` border.

## 10. Tests

- **Plain DOM and bindings:** React, Vue and Astro render exactly the markup above; hover after the delay and focus
  at once show it, above the trigger and inside the viewport; leaving hides it, but not while the pointer is on the
  tooltip; Escape hides it and keeps focus; the trigger's description; axe in light and dark.
- **GPU:** for a trigger in a GPU-presented panel, a real hover shows the tooltip above the trigger's drawn position,
  and GPU stays on (the tooltip is outside the layer).
