# SegmentedControl

Tier C. Follows the [anatomy template](../design-language.md#17-component-anatomy-template) and the
[conventions](README.md#conventions).

## 1. Purpose and native element

One choice from two to five short, mutually exclusive options shown side by side, where the choice changes a view at
once (Day, Week, Month; List, Grid). Native radios in a `<fieldset>`, so it follows the WAI-ARIA
[Radio Group pattern](https://www.w3.org/WAI/ARIA/apg/patterns/radio/) natively: one tab stop, arrow keys move the
selection, and the value takes part in a form. Each radio is visually hidden over its key, so the key is the radio's
hit area. For longer options, or more of them, use a [RadioGroup](radio.md) or a [Select](select.md); for actions, a
[ButtonGroup](button-group.md); for panels of content, [Tabs](tabs.md).

## 2. Object

**Keys on one plinth**, as a [ButtonGroup](button-group.md): the selected key is held down, as a pressed
[ToggleButton](toggle-button.md).

| Part | Shape | Height at 50% | Moves |
| --- | --- | --- | --- |
| Plinth | `ug-segmented__plinth`: a rounded box `space.2` larger than the keys, in `panel` colour | Flat (on its panel) | No |
| Key | A button-sized key, `radius.control` | `elevation.raised` | Rises on hover, travels on press; the selected key stays down |

Each key is at least `target.min` (24 px) high and wide (WCAG 2.5.8).

## 3. Faces and materials

| Face | Colour role | Text role | Material role |
| --- | --- | --- | --- |
| Key | `secondary` | `text`, strong | `control` |
| Selected key | `accent` at 16% over `secondary`, with a 3 px `accent` strip along the bottom | `text` | `control` |

The selected key is held down, tinted and marked by its strip: never by colour alone.

## 4. Elevation per state

| State | Relief | Objects | CSS |
| --- | --- | --- | --- |
| Rest | Key at `elevation.raised` | Key | Relief recipe at `raised` |
| Hover | Height × `state.hoverHeight` | Key rises | Larger shadow |
| Pressed | Height × `state.pressHeight` | Key travels | Smaller shadow |
| Selected (`:checked`) | Held at `state.pressHeight`; tint and strip | Key held down | Tint and strip |
| Focus-visible | `outline: focus.width solid accent` on the key | Same | Same |
| Disabled | Height 0, label at 38% | Flattened | Flat, 38% |

## 5. Relief primitives

One `raised` primitive per key (`.ug-segmented__key`), from its border box. Its state comes from the radio in its
label: hover from the label, pressed from `:active` or `:checked`, focus from the radio's `:focus-visible`. At the
Objects level each key is a key object. The plinth is flat.

## 6. Tokens it reads

`colour.secondary`, `colour.accent`, `colour.panel`, `colour.text`, `elevation.raised`, `radius.control`,
`space.2`, `control.height`, `target.min`, `font.weight.strong`, `state.*`, `focus.*`, `motion.fast`.

## 7. DOM structure and overlay needs

```html
<fieldset class="ug-segmented">
  <legend class="ug-segmented__legend">View</legend>
  <div class="ug-segmented__plinth">
    <label class="ug-segmented__item">
      <input class="ug-segmented__input" type="radio" name="view" value="day" checked>
      <span class="ug-segmented__key" data-strata-face="raised">Day</span>
    </label>
    <label class="ug-segmented__item">
      <input class="ug-segmented__input" type="radio" name="view" value="week">
      <span class="ug-segmented__key" data-strata-face="raised">Week</span>
    </label>
    <label class="ug-segmented__item">
      <input class="ug-segmented__input" type="radio" name="view" value="month" disabled>
      <span class="ug-segmented__key" data-strata-face="raised">Month</span>
    </label>
  </div>
</fieldset>
```

- The `<legend>` names the group, above the plinth (a fieldset's legend is not laid out with its other children, so the
  keys sit in their own row); `ug-segmented__legend--hidden` hides it visually and keeps it for assistive
  technology, for a control whose label is shown elsewhere.
- The bindings take `options` (`{ value, label, disabled }`), `value` or `defaultValue`, a change callback, `name`
  (generated when absent) and `disabled` (on the fieldset).
- No overlay.

## 8. Keyboard and screen reader

| Key | Action |
| --- | --- |
| Tab | Moves to the selected key (or the first, when none is selected) and out of the group |
| Arrow keys | Select the next or previous enabled option, wrapping |
| Space | Selects the focused option |

- Announced as a radio group named by the legend, each key as "Day, radio button, checked, 1 of 3".

## 9. CSS presentation

The plinth is an inline flex row in `panel` colour with `space.2` padding and gaps; keys use the button recipe, and the
selected key the latched ToggleButton's. Under `forced-colors` keys have a `ButtonBorder` outline and the selected
key is `Highlight`.

## 10. Tests

- **Bindings:** matches this markup; arrow keys and clicks select and report the value; a disabled option is skipped;
  the value is submitted with a form; each key is at least 24 px.
- **GPU:** each key is a raised primitive (a key object at Objects); the selected key is held down; a real click on
  another key selects it, and GPU stays on.
