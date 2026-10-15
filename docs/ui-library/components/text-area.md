# TextArea

Tier A. Follows the [anatomy template](../design-language.md#17-component-anatomy-template) and the
[conventions](README.md#conventions).

## 1. Purpose and native element

Takes multi-line text. Renders a native `<textarea>`. As [TextField](text-field.md), except as below. There
is no WAI-ARIA Authoring Practices pattern for a text area; the native element has the `textbox` role with
`aria-multiline="true"` implied, so none applies. A label is required: use a [Field](field.md) or
`aria-label`.

`rows` passes through and defaults to 3. `maxlength` passes through; a character count belongs in the help
text and is not announced on every keystroke.

## 2. Object

As TextField: a **well** with a **bezel ring** just inside the edge, the base being the `<textarea>`'s
border box.

| Part | Shape | Height at 50% | Moves |
| --- | --- | --- | --- |
| Well | Rounded box sunk by `elevation.well` (2) | −`elevation.well` | No |
| Bezel | Ring of `bevel.width`, inside the edge, screen-locked | Inside the well | No |
| Face | The captured text on `colour.field`, flat | — | No |

Differences: the face scrolls inside the bezel when the text is longer than the box, and the browser's resize
grip sits in the bottom-right corner, inside the box. Neither moves the box. Auto-growing is not built in; the
application sets `rows`, or lets the user resize.

## 3. Faces and materials

As TextField (`field`, `text`, `muted`, `danger`; material role `field`). The scrollbar and the resize grip
are native and keep the browser's colours. Text can reach every part of the face, so the
[finish zones](../design-language.md#finish-zones) are off for this component.

## 4. Elevation per state

As TextField, with these notes:

| State | Difference |
| --- | --- |
| Hover, focus-visible, disabled, invalid | Same as TextField |
| Resize | The box changes size under the pointer; the well, bezel and shadow follow the new box, and GPU stays active |
| Scrolling | The face repaints; the bezel and well do not move |

Pressed, selected and busy do not apply.

## 5. Relief primitives

One `well` primitive: the `<textarea>`, from its border box and `border-radius` (`radius.control`). The
bezel is the well's inverted bevel.

## 6. Tokens it reads

As [TextField](text-field.md#6-tokens-it-reads). Rows are a prop, not a token. The line height comes from
`font.lineHeight.body`, so the minimum height is `rows` times the line height plus padding, and never below
the density's control height or `target.min` (24).

## 7. DOM structure and overlay needs

```html
<textarea class="ug-text-area" data-strata-face="well" id="notes" name="notes" rows="3"></textarea>
```

- The `<textarea>` is the boundary element for refs, `class`, `style` and native attributes.
- `resize` is `vertical` by default; `none`, `both` and `horizontal` are props. A resize that grows the box
  stays inside the Panel's layout; the Panel reflows, the control is not repositioned by Strata.
- No overlay.

## 8. Keyboard and screen reader

Typing, selection, Enter (new line), Tab and the clipboard are native. Tab moves focus out of the field; it
does not insert a tab character, and Strata does not trap it.

- Role `textbox` (native). Name from the label; help and error from `aria-describedby`.
- `required`, `disabled`, `readonly`, `aria-invalid` as in TextField.
- The scroll area is reachable by keyboard because the field itself is focusable.

## 9. CSS presentation

As TextField: inset shadow, inverted bevel gradient, `colour.field` face. Minimum size is the density's control
height by 24 px wide at least. Under `forced-colors`: `Field`, `FieldText` and a `ButtonBorder` border;
`GrayText` when disabled; `Highlight` focus outline. The scrollbar and grip use system colours already.

## 10. Tests

- **Plain DOM:** multi-line typing, paste and IME work; Enter inserts a new line; Tab leaves the field;
  `rows` and `maxlength` apply.
- **GPU:** at Relief and Objects, GPU stays active while typing, scrolling inside the field and resizing;
  pixels are fresh after each with no blank frame; a hit at the corner (grip) and at the edge pixel reaches
  the `<textarea>`. Also check in a headful window, where a scrollbar can put the canvas on fractional pixels.
- **Accessibility:** axe on the TextField states plus a long, scrolling value; accessibility snapshot equal
  in DOM and GPU modes; focus ring in decoded pixels; text contrast on the lit face at `interior.max`.
- **Parity:** Relief and CSS within the P0.6 budget at rest, focus and invalid, with and without a scrollbar.
