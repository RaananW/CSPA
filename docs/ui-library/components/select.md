# Select

Tier A. Follows the [anatomy template](../design-language.md#17-component-anatomy-template) and the
[conventions](README.md#conventions).

## 1. Purpose and native element

Chooses one value from a list. Renders a native `<select>` with `<option>` and `<optgroup>` children. The
WAI-ARIA [Combobox pattern](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/) covers custom selects; a
native `<select>` already provides the behaviour, so Tier A adds no ARIA. The browser opens its own list:
Tier A has no select popup and no overlay. A searchable custom listbox is a later component.

`multiple` and `size > 1` render a native list box, which keeps the browser's look and has no key. Tier A
styles only the single-line form. Label, help and error text come from [Field](field.md).

## 2. Object

A **key with a chevron**: the [Button](button.md) key shape, holding the current value and a chevron.

| Part | Shape | Height at 50% | Moves |
| --- | --- | --- | --- |
| Key body | As Button | `object.keyHeight` (8) | Down by `object.keyTravel` (6) while pressed |
| Key top | Captured face: value text on the left, chevron on the right | — | With the body |

The chevron is flat line art on the key top (section 10), not a separate mesh. The browser's list is outside
the object and is never drawn by the GPU.

## 3. Faces and materials

| Face | Colour role | Text role | Material role |
| --- | --- | --- | --- |
| Key top | `field` | `text` | `field` (`matte`) |
| Chevron | — | `muted`, 3:1 or better | None |
| Key sides (Objects) | The top's colour, darkened by the bevel | — | Same as the top |

A placeholder option (a disabled first option with an empty value) uses the `muted` text role.

## 4. Elevation per state

| State | Relief | Objects | CSS |
| --- | --- | --- | --- |
| Rest | `elevation.raised` (3) | Key at `keyHeight` | Relief recipe at `raised` |
| Hover | `raised × state.hoverHeight` | Key rises `keyHeight / 4` | Larger shadow, `brightness(1.04)` |
| Pressed (`:active`) | `raised × state.pressHeight` | Key travels `keyTravel` | Smaller shadow |
| Focus-visible | Accent edge, `focus.width` | Emissive glow | `outline: focus.width solid accent` |
| Invalid (`aria-invalid="true"`) | `danger` edge and message | Same, on the key | `outline` in `danger` |
| Disabled | Height 0, content at 38% | Key flattened | Flat, content `opacity: 0.38` |

Selected and busy do not apply. A new value is a content change, so the face is captured fresh.

## 5. Relief primitives

One `raised` primitive: the `<select>` from its border box and `radius.control`.

## 6. Tokens it reads

| Token | Prop |
| --- | --- |
| `colour.field`, `colour.text`, `colour.muted`, `colour.danger` | — |
| `radius.control`, `elevation.raised`, `state.*` | — |
| `object.keyHeight`, `object.keyTravel`, `object.taper` | — |
| `material.roles.field` | `material` |
| `density` (control height), `space.*` | — |
| `font.size.body` | — |
| `focus.width`, `focus.offset`, `motion.fast`, `motion.easing.press` | — |
| `target.min` | — |

## 7. DOM structure and overlay needs

```html
<select class="ug-select" data-strata-face="raised" id="size" name="size">
  <option value="" disabled selected>Choose a size</option>
  <option value="s">Small</option>
  <option value="m">Medium</option>
</select>
```

- The `<select>` is the boundary element. It uses `appearance: none`, and the chevron is a background image
  on the same element, so there is no wrapper.
- No overlay. The list is the browser's own and is not captured, themed or hit-tested by Strata.

## 8. Keyboard and screen reader

The native behaviour is kept in full.

| Key | Action |
| --- | --- |
| Alt+Down, Space, Enter | Open the list (browser dependent) |
| Up, Down | Change the value, or move in the open list |
| A letter | Jump to a matching option |
| Home, End | First or last option |
| Esc | Close the list |

- Role as the browser exposes it (`combobox` or `listbox`). The name comes from the `<label>` in
  [Field](field.md), or `aria-label`.
- `aria-invalid` and `aria-describedby` point at the Field error and help.
- `change` events are native.

## 9. CSS presentation

The `raised` recipe with trailing padding for the chevron. Minimum size is the density's control height and
never below `target.min` (24); the whole box opens the list. The page's `color-scheme` follows the theme so the
browser's list matches. Under `forced-colors`: `Field`, `FieldText` and a `ButtonBorder` outline; the chevron
uses `ButtonText`; no shadows.

## 10. Tests

- **Plain DOM:** keyboard changes the value and fires `change` once; the form submits the value; disabled
  and `required` behave natively.
- **GPU:** GPU stays active while the list opens and closes and the value changes; the face shows the new
  value in fresh pixels; a hit on the key reaches the `<select>`.
- **Accessibility:** axe in light, dark and high contrast; label association; chevron contrast of at least
  3:1; accessibility snapshot equal in DOM and GPU modes.
- **Parity:** Relief and CSS within the P0.6 budget at rest, hover and focus.
