# Menu

Tier C. Follows the [anatomy template](../design-language.md#17-component-anatomy-template) and the
[conventions](README.md#conventions).

## 1. Purpose and native element

A short list of actions one button opens, such as Rename, Duplicate and Delete. The WAI-ARIA
[Menu Button pattern](https://www.w3.org/WAI/ARIA/apg/patterns/menu-button/) on the native Popover API, like a
[Popover](popover.md): a `<div popover role="menu">` named by `aria-label`, opened by a
`<button popovertarget aria-haspopup="menu">`. Its items are native `<button role="menuitem">`s, and an `<hr>` is a
separator. The browser toggles it, closes it on Escape or a click outside and returns focus to the button;
`attachStrataMenus` adds the rest of the pattern: focus moves to the first item when it opens (the last, with Up),
the arrow keys, Home, End and a typed letter move between items, choosing an item closes it, and Tab closes it. Links
belong in a [NavigationRail](navigation-rail.md) or a [List](list.md); a choice of value is a [Select](select.md).

## 2. Object

A **floating slab** at `elevation.overlay` beside its button, as a [Popover](popover.md), with flat rows.

| Part | Shape | Height at 50% | Moves |
| --- | --- | --- | --- |
| Menu | A rounded box, at least 10rem wide, `space.1` padding | `elevation.overlay` (16) | Fades in over `motion.fast` |
| Item | A full-width row, 32 px high, `radius.small` | Flat | No |
| Separator | A 1 px line between groups of items | Flat | No |

## 3. Faces and materials

| Face | Colour role | Text role | Material role |
| --- | --- | --- | --- |
| Menu | `panel` | `text` | `panel` |
| Item, focused or hovered | `accent` at 16% over `panel` | `text` | — |
| Item, disabled | — | `text` at 38% | — |
| Separator | `edge` | — | — |

## 4. Elevation per state

| State | Relief | Objects | CSS |
| --- | --- | --- | --- |
| Open | A slab at `elevation.overlay` with its cast shadow | Same | Same |
| Item focus-visible | The tint and `outline: focus.width solid accent` inside the row | Same | Same |

## 5. Relief primitives

None in a GPU scene: like a Popover, the menu is in the top layer, outside every Underglass layer, and CSS presents it;
its button may be inside a layer. A button inside a layer places it by script (see [Popover](popover.md)).

## 6. Tokens it reads

`colour.panel`, `colour.accent`, `colour.edge`, `colour.text`, `elevation.overlay`, `radius.control`,
`radius.small`, `space.1`, `space.3`, `focus.*`, `motion.fast`.

## 7. DOM structure and overlay needs

```html
<button class="ug-button" data-strata-face="raised" type="button" popovertarget="actions-menu" aria-haspopup="menu"><span class="ug-button__label">Actions</span></button>
<div class="ug-menu" data-strata-face="raised" id="actions-menu" popover role="menu" aria-label="Actions">
  <button class="ug-menu__item" type="button" role="menuitem" tabindex="-1">Rename</button>
  <hr class="ug-menu__separator">
  <button class="ug-menu__item" type="button" role="menuitem" tabindex="-1" aria-disabled="true">Delete</button>
</div>
```

- Items are focusable only by script (`tabindex="-1"`); a disabled item (`aria-disabled="true"`) is still focusable but
  does nothing.
- React and Vue take the trigger (`trigger`, or Vue's `trigger` slot), `label` and `items`
  (`{ label, onSelect, disabled }` or `"separator"`), and portal the menu to `document.body`. In Astro the trigger is any
  button with `popovertarget` and `aria-haspopup="menu"`, and `attachStrata` reports `strata-select` (`detail.index`)
  from the chosen item.

## 8. Keyboard and screen reader

| Key | Action |
| --- | --- |
| Enter, Space, Down (on the button) | Opens it and focuses the first item |
| Up (on the button) | Opens it and focuses the last item |
| Down, Up | Next or previous item, wrapping |
| Home, End | First or last item |
| A letter | The next item whose label starts with it |
| Enter, Space (on an item) | Chooses it and closes the menu; focus returns to the button |
| Escape | Closes it; focus returns to the button |
| Tab | Closes it, and moves on from the button |

- The button is announced as a menu button, collapsed or expanded; the menu by its name, and each item as "Rename,
  menu item, 1 of 2".

## 9. CSS presentation

As Popover, with `space.1` padding, and rows with `space.3` inline padding. Under `forced-colors` the menu has a
`CanvasText` border and the focused item is `Highlight`.

## 10. Tests

- **Bindings:** matches this markup; opening focuses the first (or last) item; the keys move and choose; choosing runs
  the item and closes the menu with focus back on the button; a disabled item does nothing; Escape and Tab close it.
- **GPU:** a button inside a GPU panel opens it by a real click; real keys move and choose an item; focus returns to the
  button in the panel, and GPU stays on.
