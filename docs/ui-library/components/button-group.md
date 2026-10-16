# ButtonGroup

Tier A. Follows the [anatomy template](../design-language.md#17-component-anatomy-template) and the
[conventions](README.md#conventions).

## 1. Purpose and native element

Groups related buttons so they read and sit as one set, such as alignment options or a split action. Renders
a `<div role="group">` with an `aria-label` or `aria-labelledby`. `role="group"` is used because no native
element names a set of buttons. There is no APG pattern for a button group. The nearest is the
[Toolbar pattern](https://www.w3.org/WAI/ARIA/apg/patterns/toolbar/), which applies only to a toolbar with
roving focus; Tier A does not do that. Children are [Button](button.md), [IconButton](icon-button.md) or
[ToggleButton](toggle-button.md); each keeps its own role and tab stop.

A group of mutually exclusive choices is a [RadioGroup](radio.md), not a ButtonGroup.

## 2. Object

**Keys on one plinth**: the children's keys share a low base.

| Part | Shape | Height at 50% | Moves |
| --- | --- | --- | --- |
| Plinth | Rounded box under all keys, from the group's border box | `elevation.raised` (3) | None |
| Keys | As their own components, `space.1` apart | `object.keyHeight` (8) | As their own components |

The plinth is part of the group's relief, not a new object type. The first and last key take the outer corners
of the plinth; inner corners use `radius.small`. All key travel stays inside each button's own box.

## 3. Faces and materials

| Face | Colour role | Material role |
| --- | --- | --- |
| Plinth | `panel` | `panel` |
| Keys | As each child | As each child |

## 4. Elevation per state

State belongs to the children; see [Button](button.md#4-elevation-per-state). The group adds nothing on hover
or press, so one key moving never moves its neighbour. Focus is on the child. Disabled on the group sets
`disabled` on every child, and the plinth flattens to height 0 with them. Selected, invalid and busy do not
apply to the group.

## 5. Relief primitives

One `raised` primitive for the plinth (`data-strata-face="raised"` on the `<div>`), plus the primitive of
each child.

## 6. Tokens it reads

| Token | Prop |
| --- | --- |
| `elevation.raised` | — |
| `radius.control`, `radius.small` | — |
| `space.1` | — |
| `colour.panel`, `material.roles.panel` | — |
| `density` | inherited by the children |

## 7. DOM structure and overlay needs

```html
<div class="ug-button-group" role="group" aria-label="Alignment" data-strata-face="raised">
  <button type="button" class="ug-button" data-strata-face="raised"><span class="ug-button__label">Left</span></button>
  <button type="button" class="ug-button" data-strata-face="raised"><span class="ug-button__label">Centre</span></button>
  <button type="button" class="ug-button" data-strata-face="raised"><span class="ug-button__label">Right</span></button>
</div>
```

- The `<div>` is the boundary element. It is a layout box and adds no hit area of its own.
- No overlay. `orientation="vertical"` changes the flow, not the markup.

## 8. Keyboard and screen reader

- Tab moves between children in DOM order. Arrow keys do nothing in Tier A.
- Role `group` with an accessible name from `aria-label` or `aria-labelledby`. A development build reports a
  group with no name.
- Each child keeps its own name, role and `aria-pressed`.

## 9. CSS presentation

A flex row (or column) with the plinth relief on the container. Each child keeps at least `target.min` (24)
in both dimensions, and the gap is never negative, so adjacent hit areas do not overlap. Under
`forced-colors`: the plinth has a `ButtonBorder` outline; children as their own components.

## 10. Tests

- **Plain DOM:** each child activates once; Tab visits each in order; the group has an accessible name.
- **GPU:** GPU stays active while one child is pressed; neighbours do not move; pixels are fresh; a native
  hit in the gap between keys does not reach a button.
- **Accessibility:** axe in light, dark and high contrast; accessibility snapshot equal in DOM and GPU modes.
- **Parity:** Relief and CSS within the P0.6 budget with three children.
