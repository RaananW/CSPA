# Chip and Tag

Tier B. Follows the [anatomy template](../design-language.md#17-component-anatomy-template) and the
[conventions](README.md#conventions).

## 1. Purpose and native element

A compact label for a category, a filter or an entered value. One component in three forms:

- **Tag:** a static label (`<span>`), for a category or a status that is not a count ([Badge](badge.md) is for
  counts and short statuses on another element).
- **Filter chip:** a native `<button aria-pressed>` that turns a filter on and off, like a small
  [ToggleButton](toggle-button.md).
- **Removable chip:** a tag with a native remove `<button>` named "Remove {label}", for values the user entered
  (recipients, keywords).

No APG pattern applies beyond the native button.

## 2. Object

A **small raised pill**. A filter chip is a key that latches down while on, as a ToggleButton does; a tag and a
removable chip are slabs (only their remove button is a control).

| Part | Shape | Height at 50% | Moves |
| --- | --- | --- | --- |
| Pill | `radius.pill`, `size.indicator + 8` px high (24, 28 or 32) | `elevation.raised` (3) | A filter chip travels down and stays down while on |
| Remove button | A circle the pill's height minus 8 px, at its end, with a cross | Flat (captured content) | No |

The pill is at least 24 px high, and a removable chip's remove button has a 24 px target that covers the pill's end
(WCAG 2.5.8).

## 3. Faces and materials

| Face | Colour role | Text role | Material role |
| --- | --- | --- | --- |
| Tag, removable chip | `secondary` | `text`, `font.size.small`, strong | `control` (`matte`) |
| Filter chip, off | `secondary` | `text` | `control` |
| Filter chip, on | `accent` at 16% over `secondary`, with a check before the label | `text` | `control` |
| Remove button | None; a 10% `text` tint on hover | `text` (the cross) | None |

A filter chip that is on shows a check mark and is held down, never by colour alone.

## 4. Elevation per state

| State | Relief | Objects | CSS |
| --- | --- | --- | --- |
| Rest | Pill at `elevation.raised` | Key (filter chip) or slab (tag) | Relief recipe at `raised` |
| Hover (filter chip) | Height × `state.hoverHeight` | Key rises | Larger shadow |
| Pressed (filter chip) | Height × `state.pressHeight` | Key travels | Smaller shadow |
| On (`aria-pressed="true"`) | Held at `state.pressHeight`; check mark; tint | Key held down | Tint and check |
| Focus-visible | `outline: focus.width solid accent` on the chip, or on the remove button | Same | Same |
| Disabled (filter chip) | Height 0, label at 38% | Flattened | Flat, 38% |

## 5. Relief primitives

One `raised` primitive: the chip, from its border box and pill radius. A filter chip, a `<button>`, is a key at the
Objects level; a tag or removable chip is a slab. The remove button and the check mark are captured content.

## 6. Tokens it reads

| Token | Prop |
| --- | --- |
| `colour.secondary`, `colour.accent`, `colour.text` | — |
| `radius.pill`, `size.indicator`, `space.*`, `font.size.small` | `size` |
| `elevation.raised`, `state.*`, `object.keyHeight`, `object.keyTravel` | — |
| `material.roles.control` | `material` |
| `focus.width`, `focus.offset` | — |
| `level` | `level` |

## 7. DOM structure and overlay needs

```html
<span class="ug-chip" data-strata-face="raised"><span class="ug-chip__label">Design</span></span>
<button class="ug-chip" data-strata-face="raised" type="button" aria-pressed="true"><span class="ug-chip__label">Remote</span></button>
<span class="ug-chip" data-strata-face="raised">
  <span class="ug-chip__label">ada@example.com</span>
  <button class="ug-chip__remove" type="button" aria-label="Remove ada@example.com"></button>
</span>
```

- The chip (`<span>` or `<button>`) is the boundary element: refs, `class` and `style` reach it.
- A filter chip is a toggle button: `aria-pressed` is its state; the check mark is CSS (`::before`) and is not read.
- The remove button's cross is CSS; its name is "Remove" and the label. Removing the chip, and moving focus to a
  sensible place (the next chip, or the field), is the application's job: the chip reports the request.
- **Plain HTML:** `attachStrata` toggles a filter chip's `aria-pressed` on click and dispatches
  `strata-pressed-change` (as for a ToggleButton), and a click on a remove button dispatches a bubbling
  `strata-remove` event from its chip.
- **React and Vue:** `<Chip>` is a tag; with `pressed`/`defaultPressed` and `onPressedChange` (`v-model:pressed`) a
  filter chip; with `onRemove` (Vue: a `remove` listener) a removable chip. `removeLabel` changes the remove button's
  name ("Remove {label}" by default). **Astro:** `pressed` for a filter chip and `removable` for a removable one, with
  `attachStrata` for their behaviour.
- No overlay.

## 8. Keyboard and screen reader

| Key | Action |
| --- | --- |
| Tab, Shift+Tab | Move to a filter chip, or to a remove button (native order); a tag is not focusable |
| Space, Enter | Toggle a filter chip, or press a remove button (native) |

- A filter chip is a toggle button: "Remote, toggle button, pressed". A tag is its text. A remove button is
  "Remove ada@example.com, button".

## 9. CSS presentation

An inline flex pill with the `raised` recipe, `space.3` inline padding and `font.size.small`. A filter chip uses the
ToggleButton's latch (a smaller shadow and a tint) with a check mark drawn by borders. The remove button is a round
button with a cross drawn by two rotated bars. Under `forced-colors` chips have a `ButtonBorder` border; a filter chip
that is on is `Highlight` with `HighlightText`.

## 10. Tests

- **Plain DOM:** a click and Space toggle a filter chip and report `strata-pressed-change`; a click on a remove
  button reports `strata-remove` from its chip.
- **Bindings:** React, Vue and Astro render exactly the markup above; a filter chip follows `pressed` and reports
  changes; the remove button calls `onRemove` (Enter and click), and is named; a disabled filter chip does nothing;
  axe in light and dark.
- **GPU:** at Relief and Objects a tag is one raised pill (a slab at Objects) and a filter chip a key that is held
  down while on; a real click on a filter chip through the GPU toggles it, with GPU on.
