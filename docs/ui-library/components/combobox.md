# Combobox

Tier C. Follows the [anatomy template](../design-language.md#17-component-anatomy-template) and the
[conventions](README.md#conventions).

## 1. Purpose and native element

Takes one line of text, with suggestions to choose from. Renders a native `<input list>` and its `<datalist>`, so the
browser provides the [Combobox pattern](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/): the input has the
`combobox` role, the browser filters the suggestions as the user types and opens its own list, and any other text may
still be typed. The browser draws the list, as it does a [Select](select.md)'s: there is no Strata popup and no
overlay. A label is required: use a [Field](field.md) or `aria-label`.

Use a [Select](select.md) when only the listed values are allowed. A custom listbox popup is not part of this
component.

## 2. Object

A [TextField](text-field.md) **well** with a **chevron** printed on its face at the end.

| Part | Shape | Height at 50% | Moves |
| --- | --- | --- | --- |
| Well | As TextField | −`elevation.well` | No |
| Bezel | As TextField | Inside the well | No |
| Face | The captured text and the chevron on `colour.field`, flat | — | No |

The chevron is flat line art on the face (section 10), not a mesh. The browser's list is outside the object and is
never drawn by the GPU.

## 3. Faces and materials

As [TextField](text-field.md), and:

| Face | Colour role | Text role | Material role |
| --- | --- | --- | --- |
| Chevron | — | `muted`, 3:1 or better | None |

## 4. Elevation per state

As [TextField](text-field.md): rest, hover, focus-visible, disabled, invalid and read-only. Opening the list changes
nothing on the object; focus stays in the input.

## 5. Relief primitives

One `well` primitive: the `<input>`, as TextField. The chevron is captured content.

## 6. Tokens it reads

As [TextField](text-field.md), and `colour.muted` for the chevron.

## 7. DOM structure and overlay needs

```html
<input class="ug-text-field ug-combobox" data-strata-face="well" type="text" autocomplete="off" id="fruit" list="fruit-options">
<datalist id="fruit-options">
  <option value="Apple"></option>
  <option value="Apricot"></option>
  <option value="Banana">Yellow</option>
</datalist>
```

- The `<input>` is the boundary element for refs, `class`, `style` and all native attributes. The `<datalist>`
  follows it; its id is the input's id with `-options`, so the input always has an id (its own, the Field's, or a
  generated one).
- `options` takes values, or `{ value, label }`: the browser shows a label beside its value.
- `autocomplete="off"` keeps the browser's form history out of the list; a caller may set it back.
- The chevron is a background on the input. The browser's own list button (`::-webkit-calendar-picker-indicator`)
  sits over it, transparent, so a click on the chevron opens the list.
- No overlay: the list belongs to the browser.

## 8. Keyboard and screen reader

| Key | Action |
| --- | --- |
| Typing | Edits the text and filters the list (native) |
| Down | Opens the list, then moves through it (native) |
| Enter | Chooses the highlighted suggestion (native) |
| Escape | Closes the list (native) |

- Role `combobox`, from the browser. The name comes from the label; help and error come from `aria-describedby`.
- `required`, `disabled` and `readonly` use the native attributes. `aria-invalid="true"` marks an invalid value.

## 9. CSS presentation

The TextField well, with a chevron drawn by two gradients at the end of the face in `muted`, mirrored in
right-to-left text. The browser's list button is made transparent and sized over the chevron. Under
`forced-colors` the background goes, so the chevron does, and the browser's list button shows instead.

## 10. Tests

- **Bindings:** matches this markup; the input is a `combobox` named by its label and lists its suggestions; typing
  updates the value (`onChange`, `v-model`) and the value is submitted; a value outside the list is allowed.
- **GPU:** the input is one `well` primitive; real typing shows each new character with GPU on.
- **Manual:** the browser's list opens from the chevron and from Down, and a suggestion chosen with Enter or a click
  fills the input, in a GPU-presented panel too. Test drivers cannot reach the browser's list.
