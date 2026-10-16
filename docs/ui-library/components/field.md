# Field

Tier A. Follows the [anatomy template](../design-language.md#17-component-anatomy-template) and the
[conventions](README.md#conventions).

## 1. Purpose and native element

Wraps one control with a label, optional help text and an optional error message. Renders a `<div>`
that holds a native `<label>`, the control and two `<p>` elements. There is no WAI-ARIA pattern for a
form field wrapper, so none applies. The label and description follow the HTML and WCAG 1.3.1, 3.3.1 and
3.3.2 rules.

Field wraps [TextField](text-field.md), [TextArea](text-area.md) and [Select](select.md). A
[Checkbox](checkbox.md) or [Switch](switch.md) carries its own label, so a Field around it omits `label`
and supplies only help and error. [RadioGroup](radio.md) renders its own `<fieldset>` and the same help
and error parts.

## 2. Object

None. Field is layout and has no object, no moving part and no relief of its own. The wrapped control
draws its own object.

## 3. Faces and materials

| Part | Colour role | Text role | Material role |
| --- | --- | --- | --- |
| Label | None (sits on the panel) | `text` | None |
| Help | None | `muted` | None |
| Error | None | `danger` | None |

Text sits on the panel face, so it keeps the contrast rule of section 8. The error text uses `danger` on
`panel`; the binding also prefixes the message with the visible word "Error:", so colour is never the
only signal.

## 4. Elevation per state

Field has no height. It passes state to its control and changes only the text roles.

| State | Effect |
| --- | --- |
| Rest, hover, pressed, selected, busy | No change |
| Focus-visible | None on Field; the control shows the focus edge |
| Disabled | Label and help at 38% content opacity; the control is disabled with the native attribute |
| Invalid | Error message shown; the control gets `aria-invalid="true"` and its own invalid edge |

## 5. Relief primitives

None. Field carries no `data-strata-face`.

## 6. Tokens it reads

| Token | Prop |
| --- | --- |
| `colour.text`, `colour.muted`, `colour.danger` | — |
| `font.size.body` (label), `font.size.small` (help, error), `font.weight.strong` (label) | — |
| `font.lineHeight.body` | — |
| `space.*` (gaps between parts) | — |
| `density` | — |

## 7. DOM structure and overlay needs

```html
<div class="ug-field">
  <label class="ug-field__label" for="email">Email (required)</label>
  <input id="email" class="ug-text-field" data-strata-face="well"
         aria-describedby="email-help email-error" aria-invalid="true" required />
  <p class="ug-field__help" id="email-help">We only use it for receipts.</p>
  <p class="ug-field__error" id="email-error">Error: enter an address like name@example.com.</p>
</div>
```

- The `<div class="ug-field">` is the boundary element. It is not a GPU layer; it sits inside a Panel.
- The binding creates the ids (`useId` in React, `useId` in Vue) and passes `id`, `aria-describedby`,
  `aria-invalid`, `required` and `disabled` to the control. The control stays the original child, with
  its own ref and state.
- `aria-describedby` lists the help id, then the error id, and only the parts that exist.
- A required control uses the native `required` attribute. The label shows a visible "(required)" suffix.
- No overlay.

## 8. Keyboard and screen reader

Field adds no keys. Tab order is the DOM order: the label is not focusable, and a click on it focuses
the control.

- The accessible name is the label text, linked by `for` and `id`. No `aria-label` duplicates it.
- Help and error are the accessible description, read after the name and role.
- The error is not a live region. It is present from the moment it renders and is read when the control
  gains focus. On a failed submit the application moves focus to the first invalid control; Field never
  moves focus itself. This avoids repeated announcements.
- Remove the error and `aria-invalid` together when the value becomes valid.

## 9. CSS presentation

Vertical stack with `space.1` between label, control, help and error. Label above the control; help and
error below it. The label and messages wrap and never truncate. Text is at least `font.size.small`
(13). Under `forced-colors`: `CanvasText` for label and help, `GrayText` for disabled text, and the error
in `CanvasText` with the "Error:" prefix (a system colour has no danger hue). No shadows.

## 10. Tests

- **Plain DOM:** clicking the label focuses the control; `aria-describedby` lists only existing parts; the
  error appears and disappears with `aria-invalid`; ids are unique across several Fields.
- **GPU:** Field has no layer of its own. At Relief, GPU stays active while an error appears and
  disappears; pixels are fresh for the new text; a hit on the control still reaches the native element.
- **Accessibility:** axe on rest, help, error, disabled and required, in light, dark and high contrast;
  accessibility snapshot equal in DOM and GPU modes; no `role="alert"` or `aria-live` in the markup.
- **Parity:** Relief and CSS within the P0.6 budget for the text stack.
