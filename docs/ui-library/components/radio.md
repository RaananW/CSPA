# Radio and RadioGroup

Tier A. Follows the [anatomy template](../design-language.md#17-component-anatomy-template) and the
[conventions](README.md#conventions).

## 1. Purpose and native element

Picks one option from a set. Radio renders a native `<input type="radio">` with a `<label>`. RadioGroup
renders a `<fieldset>` with a `<legend>` and gives all its radios one `name`. It follows the WAI-ARIA
[Radio Group pattern](https://www.w3.org/WAI/ARIA/apg/patterns/radio/). The native `<fieldset>` has the
`group` role, and the grouping and keys come from the browser, so no `role="radiogroup"` is added.

A set where several options may be on is a group of [Checkboxes](checkbox.md). A set that acts like buttons
is a [ButtonGroup](button-group.md).

## 2. Object

A **round well** with a **knob** (the dot) when selected. The well's base is the input's border box.

| Part | Shape | Height at 50% | Moves |
| --- | --- | --- | --- |
| Well | Circle (`radius.pill`) sunk by `elevation.well` (2) | −`elevation.well` | No |
| Dot | Sphere of diameter box − 4 · `object.taper` (12 at the default), centred | `elevation.raised` (3) | Rises from the well floor on select, sinks when another radio is chosen |

The input's border box is 24 by 24 px (`target.min`, a fixed rule), so the native control meets the target
size on its own. The dot is centred and well inside the box.

The section 6 vocabulary lists "Checkbox, radio: small well with a raised mark". Radio uses the `knob`
primitive for the dot, as the [README](README.md) index says: a round dot reads as a sphere, not a glyph.

## 3. Faces and materials

| Face | Colour role | Text role | Material role |
| --- | --- | --- | --- |
| Well floor | `field` | — | `field` (`matte`) |
| Dot (selected) | `accent` | — | `indicator` (`emissive`) |
| Well outline | `edge`, 1 px | — | None |
| Label | None (sits on the panel) | `text` | None |
| Legend | None | `text` | None |

The well's `edge` outline keeps its shape at 3:1 against the panel, and the dot against the well floor keeps
at least 3:1 (non-text contrast, section 8).

## 4. Elevation per state

| State | Relief | Objects | CSS |
| --- | --- | --- | --- |
| Rest, unselected | Round well at `−elevation.well`; no dot | Empty well | Inset shadow |
| Hover | Interior `+state.hoverLift` (clamped by `interior.max`) | Same | `brightness(1.04)` |
| Pressed (`:active`) | Interior `−state.pressSink` | Same | `brightness(0.96)` |
| Focus-visible | Accent edge, `focus.width`, outside the circle | Emissive glow on the well | `outline: focus.width solid accent` |
| Selected (`:checked`) | Dot `emissive` at `elevation.raised`, `motion.fast` | Dot rises | Accent dot |
| Disabled | Well and dot at height 0, content at 38% | Flattened to the face | Flat, `opacity: 0.38` |
| Invalid (`aria-invalid="true"`) | `danger` edge on every well in the group | Same | `outline` in `danger` |

Busy does not apply. Under `prefers-reduced-motion`, the dot appears with no rise.

## 5. Relief primitives

Two per radio: the `<input>` is a `well` (circle); the dot is a `knob`, drawn from a child
`<span data-strata-face="knob">` shown when `:checked`. The `<fieldset>` has no primitive.

## 6. Tokens it reads

| Token | Prop |
| --- | --- |
| `colour.field`, `colour.edge`, `colour.accent`, `colour.text`, `colour.danger` | — |
| `radius.pill` | — (theme or scope) |
| `elevation.well`, `elevation.raised`, `object.taper`, `state.*`, `interior.max` | — |
| `material.roles.field`, `material.roles.indicator` | `material` |
| `target.min` (box size), `density` (label row height), `space.*` | — |
| `font.size.body`, `font.weight.strong` (legend) | — |
| `focus.width`, `focus.offset`, `motion.fast` | — |
| `level` | `level` |

## 7. DOM structure and overlay needs

```html
<fieldset class="ug-radio-group" aria-describedby="plan-help plan-error">
  <legend class="ug-radio-group__legend">Plan</legend>
  <label class="ug-radio">
    <input class="ug-radio__input" data-strata-face="well" type="radio" name="plan" value="free" checked />
    <span class="ug-radio__dot" data-strata-face="knob" aria-hidden="true"></span>
    <span class="ug-radio__label">Free</span>
  </label>
  <label class="ug-radio"><!-- next radio, same name --></label>
  <p class="ug-field__help" id="plan-help">You can change it later.</p>
  <p class="ug-field__error" id="plan-error">Error: choose a plan.</p>
</fieldset>
```

- The `<fieldset>` is the group's boundary element; each `<input>` is a radio's. Layout (row or column) is
  a CSS prop and never changes the DOM order, which sets the arrow-key order.
- The wrapping `<label>` extends the hit target to the whole row, at least the density's control height.
- The group owns `name`, `value` and `onChange`. `required` on the radios makes the group required natively.
- `aria-invalid="true"` goes on each radio. The message is in the fieldset's description.
- `disabled` on the `<fieldset>` disables every radio natively.
- No overlay.

## 8. Keyboard and screen reader

| Key | Action |
| --- | --- |
| Tab, Shift+Tab | Enter or leave the group, landing on the selected radio (or the first, if none) |
| Arrow Down, Right | Select the next radio, wrapping (native) |
| Arrow Up, Left | Select the previous radio, wrapping (native) |
| Space | Select the focused radio, if not already selected |

- Role `radio` (native), inside the `group` of the `<fieldset>`, named by the `<legend>`. The browser
  announces the position ("2 of 3") and the checked state.
- Disabled radios inside an enabled group are skipped by the arrow keys, as native.
- Home and End are not part of native radio behaviour and Strata does not add them.

## 9. CSS presentation

The `well` recipe as a circle, the dot as a sphere shaded from the light, the dot in `accent`. The box is
24 by 24 and the row at least the density's control height. Legend and options sit on `space.2` gaps.
Under `forced-colors`: `Field` background, a `ButtonBorder` border, the dot in `FieldText`, `GrayText`
when disabled, a `Highlight` focus outline. The dot's presence shows the state.

## 10. Tests

- **Plain DOM:** click on the circle and on the label selects; arrows move and select with wrap; Tab enters
  once and lands on the selected radio; form data holds the selected value; disabled radios are skipped.
- **GPU:** at Relief and Objects, GPU stays active through selecting and arrowing; pixels are fresh (the old
  dot gone, the new one present); a hit at the circle's edge pixel and on the label reaches the input.
- **Accessibility:** axe on selected, unselected, disabled and invalid, in light, dark and high contrast;
  accessibility snapshot equal in DOM and GPU modes (group name, checked, position); focus ring in decoded
  pixels; dot contrast against the lit well floor.
- **Parity:** Relief and CSS within the P0.6 budget at rest, hover, focus and selected.
