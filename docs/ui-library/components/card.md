# Card

Tier A. Follows the [anatomy template](../design-language.md#17-component-anatomy-template) and the
[conventions](README.md#conventions).

## 1. Purpose and native element

Groups related content on a slab inside a [Panel](panel.md). Renders a native `<article>` when the content
is self-contained (a list item, a result, a post), or a native `<section>` when it is a titled part of the
page. A Card is **not its own GPU layer**: it is a relief primitive on its Panel's layer, so Cards count
against the Panel's 256 primitives.

No APG pattern exists for a card. `<article>` has the `article` role. `<section>` is a `region` landmark
only when it has an accessible name. A Card is not interactive. A clickable Card contains one
[Link](link.md) or [Button](button.md), which is the only target.

## 2. Object

As [Panel](panel.md), except: a **raised slab** that is lower than the panel it sits on.

| Part | Shape | Height at 50% | Moves |
| --- | --- | --- | --- |
| Slab | Rounded plate, `bevel.width` band | `elevation.raised` (3) | No |
| Shadow | Analytic cast shadow onto the panel | — | With the slab |

The slab and its shadow stay inside the Panel's layer. A Card does not tilt or travel on its own.

## 3. Faces and materials

As [Panel](panel.md), except:

| Face | Colour role | Text role | Material role |
| --- | --- | --- | --- |
| Slab top | `secondary` | `text` | `control` (`matte`) |
| Slab edge | The top's colour, shaded by the bevel | — | Same as the top |

`secondary` keeps the Card readable against the `panel` colour it sits on. `data-strata-material` overrides
the role for one Card.

## 4. Elevation per state

| State | Relief | Objects | CSS |
| --- | --- | --- | --- |
| Rest | `elevation.raised` (3) | Slab at raised height | Relief recipe at `raised` |
| Hover, pressed | Do not apply to the Card; the contained Link or Button owns them | — | — |
| Focus-visible | When a contained control has focus (`:has(:focus-visible)`): accent edge, `focus.width`, around the Card | Emissive glow on the slab edge | `outline: focus.width solid accent` on the Card |
| Disabled | Height 0, no bevel gain, content at 38%, only if the Card is made unavailable as a whole | Flattened to the panel | Flat, content `opacity: 0.38` |

Selected, invalid and busy do not apply. A busy Card shows a child [Spinner](spinner.md) or
[ProgressBar](progress-bar.md). A Card has no `disabled` attribute; "unavailable" is set by disabling its
controls and, optionally, by `aria-disabled="true"` on a clickable Card's link.

## 5. Relief primitives

One `raised` primitive: the Card element, from its border box and `border-radius` (`radius.panel`), at
`elevation.raised`. Content inside has its own primitives (buttons, fields). A Card never holds another Card.

## 6. Tokens it reads

| Token | Prop |
| --- | --- |
| `colour.secondary`, `colour.text` | — |
| `radius.panel` | — |
| `elevation.raised`, `bevel.width`, `bevel.gain`, `shadow.strength`, `interior.max` | `elevation` |
| `material.roles.control` | `material` |
| `space.*`, `density` (padding) | — |
| `focus.width`, `focus.offset` | — |
| `level` | `level` |

## 7. DOM structure and overlay needs

```html
<article class="ug-card" data-strata-face="raised" aria-labelledby="card-1-title">
  <h3 id="card-1-title" class="ug-card__title">Latency</h3>
  <div class="ug-card__body">…</div>
  <div class="ug-card__footer"><!-- optional actions --></div>
</article>
```

- The Card element is the boundary element: React and Vue refs, `class` and `style` reach it.
- A Card needs a heading to be named. Without one, the `<article>` has no name and is announced as
  "article" only.
- `ug-card__title`, `ug-card__body` and `ug-card__footer` are optional parts and carry no relief.
- No overlay. A Card outside any Panel is reported in development builds, because it would have no layer.

## 8. Keyboard and screen reader

The Card adds no keys and is not in the tab order. Keyboard behaviour belongs to the controls inside it.

- `<article>`: role `article`. `<section>` with a name: role `region`.
- Do not give the Card `role="button"` or an `onclick`. The whole Card is clickable through a Link whose
  `::after` covers the Card, so the only tab stop is the Link.

## 9. CSS presentation

As [Panel](panel.md), except: the relief recipe at `elevation.raised`, with a smaller shadow. Padding follows
the density. In GPU mode the CSS paints the flat face only. Under `forced-colors`: `Canvas` background and a
`CanvasText` border, no shadow. Hover and press have no motion, so reduced motion changes nothing here.

## 10. Tests

- **Plain DOM:** `<article>` role; named `<section>` is a `region`; a stretched Link is the only tab stop
  and activates once.
- **GPU:** the Card adds no layer; GPU stays on when Card content changes; pixels are fresh; a hit on a
  contained control reaches it, and a hit on the Card body reaches the Card.
- **Accessibility:** axe in light, dark and high contrast; accessibility snapshot equal in DOM and GPU
  modes; text contrast on the `secondary` face at `interior.max`; focus edge visible in decoded pixels.
- **Parity:** Relief and CSS within the P0.6 budget at rest and with a focused child.
