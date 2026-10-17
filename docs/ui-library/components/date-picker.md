# DatePicker

Tier C. Follows the [anatomy template](../design-language.md#17-component-anatomy-template) and the
[conventions](README.md#conventions).

## 1. Purpose and native element

Takes one date. Renders a native `<input type="date">`, so the browser provides the segmented date field, the
calendar and the validation. The browser draws the calendar, as it does a [Select](select.md)'s list: there is no
Strata calendar and no overlay. A label is required: use a [Field](field.md) or `aria-label`.

The value is always `YYYY-MM-DD` (or empty), whatever order and language the browser displays. A date and time, a
month, a week or a range are not part of this component.

## 2. Object

A [TextField](text-field.md) **well** with a small **calendar** printed on its face at the end.

| Part | Shape | Height at 50% | Moves |
| --- | --- | --- | --- |
| Well | As TextField | −`elevation.well` | No |
| Bezel | As TextField | Inside the well | No |
| Face | The captured date and the calendar on `colour.field`, flat | — | No |

The calendar glyph is flat line art on the face (section 10), not a mesh. The browser's calendar is outside the
object and is never drawn by the GPU.

## 3. Faces and materials

As [TextField](text-field.md), and:

| Face | Colour role | Text role | Material role |
| --- | --- | --- | --- |
| Calendar glyph | — | `muted`, 3:1 or better | None |

## 4. Elevation per state

As [TextField](text-field.md): rest, hover, focus-visible, disabled, invalid and read-only. Opening the calendar
changes nothing on the object; focus stays in the input.

## 5. Relief primitives

One `well` primitive: the `<input>`, as TextField. The calendar glyph is captured content.

## 6. Tokens it reads

As [TextField](text-field.md), and `colour.muted` for the calendar glyph.

## 7. DOM structure and overlay needs

```html
<input class="ug-text-field ug-date-picker" data-strata-face="well" type="date" id="due" min="2026-01-01" max="2026-12-31">
```

- The `<input>` is the boundary element for refs, `class`, `style` and all native attributes; `type` is always
  `date`.
- The value is a `YYYY-MM-DD` string. `min`, `max` and `step` use the same form, and a date outside `min` and `max`
  is natively invalid (`validity.rangeOverflow`, `rangeUnderflow`).
- The calendar glyph is a background on the input. The browser's own calendar button
  (`::-webkit-calendar-picker-indicator`) sits over it, transparent, so a click on the glyph opens the calendar.
- No overlay: the calendar belongs to the browser.

## 8. Keyboard and screen reader

| Key | Action |
| --- | --- |
| Left, Right, Tab | Move between the day, month and year segments (native) |
| Up, Down | Change the focused segment (native) |
| Digits | Type the focused segment (native) |
| Backspace, Delete | Clear the focused segment (native) |
| Space, Alt+Down | Open the browser's calendar, where the browser offers it (native) |

- The name comes from the label; help and error come from `aria-describedby`. The browser exposes the segments.
- `required`, `disabled`, `readonly`, `min` and `max` use the native attributes. `aria-invalid="true"` marks an
  invalid value.

## 9. CSS presentation

The TextField well, with a calendar drawn by gradients at the end of the face in `muted`, mirrored in right-to-left
text. The date segments stay the browser's own. The browser's calendar button is made transparent and sized over the
glyph. Under `forced-colors` the background goes, so the glyph does, and the browser's calendar button shows
instead.

## 10. Tests

- **Bindings:** matches this markup; the input is named and described by its Field; real keys set the value
  (`onChange`, `v-model`) and the value is submitted as `YYYY-MM-DD`; a date outside `min` and `max` is
  `rangeOverflow`; the glyph is printed.
- **GPU:** the input is one `well` primitive; a real click focuses it and real keys type a date with GPU on.
- **Manual:** the browser's calendar opens from the glyph, and a date chosen in it fills the input, in a
  GPU-presented panel too. Test drivers cannot reach the browser's calendar.
