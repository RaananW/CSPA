# Toolbar

Tier B. Follows the [anatomy template](../design-language.md#17-component-anatomy-template) and the
[conventions](README.md#conventions).

## 1. Purpose and native element

Groups a set of controls, usually buttons and toggle buttons, that act on the same content (text formatting,
a list's actions), as one stop in the tab order. Renders a `<div role="toolbar">` named by `aria-label`, following
the WAI-ARIA [Toolbar pattern](https://www.w3.org/WAI/ARIA/apg/patterns/toolbar/): Tab enters and leaves the
toolbar, and the arrow keys, Home and End move between its controls. The controls are ordinary Strata components
([Button](button.md), [ToggleButton](toggle-button.md), [IconButton](icon-button.md)), with vertical
[Dividers](divider.md) between groups. A set of buttons that is not one tab stop is a [ButtonGroup](button-group.md).

## 2. Object

**Keys on one plinth**, as a [ButtonGroup](button-group.md): a raised slab with the controls' keys standing on it.
Dividers are grooves in the plinth.

| Part | Shape | Height at 50% | Moves |
| --- | --- | --- | --- |
| Plinth | Rounded plate, `radius.control + space.2`, `space.2` padding | `elevation.raised` (3) | No |
| Controls | Their own keys | On the plinth | As each control |
| Divider | A vertical groove, the plinth's inner height | −`elevation.well` | No |

## 3. Faces and materials

| Face | Colour role | Text role | Material role |
| --- | --- | --- | --- |
| Plinth | `panel` | — | `panel` |
| Controls | As each control | As each control | As each control |

`data-strata-material` on the toolbar overrides the plinth's material.

## 4. Elevation per state

| State | Relief | Objects | CSS |
| --- | --- | --- | --- |
| Rest | Plinth at `elevation.raised`, keys on it | Plinth slab, keys on it | Relief recipe |
| Control states | As each control | Same | Same |

The plinth itself takes no state: hover and press belong to its controls.

## 5. Relief primitives

One `raised` primitive for the plinth, then each control's own (keys, and grooves for dividers).

## 6. Tokens it reads

| Token | Prop |
| --- | --- |
| `colour.panel` | — |
| `radius.control`, `space.*` | `size` |
| `elevation.raised` | — |
| `material.roles.panel` | `material` |
| `level` | `level` |

## 7. DOM structure and overlay needs

```html
<div class="ug-toolbar" role="toolbar" aria-label="Formatting" data-strata-face="raised">
  <button type="button" class="ug-toggle-button" data-strata-face="raised" aria-pressed="false"><span class="ug-toggle-button__label">Bold</span></button>
  <button type="button" class="ug-toggle-button" data-strata-face="raised" aria-pressed="false"><span class="ug-toggle-button__label">Italic</span></button>
  <hr class="ug-divider ug-divider--vertical" data-strata-face="groove" aria-orientation="vertical">
  <button type="button" class="ug-button" data-strata-face="raised"><span class="ug-button__label">Undo</span></button>
</div>
```

- The toolbar `<div>` is the boundary element: refs, `class` and `style` reach it. A vertical toolbar is the class
  `ug-toolbar--vertical` and `aria-orientation="vertical"`.
- **One tab stop (roving tabindex):** the first time focus enters the toolbar, every control but the focused one
  gets `tabindex="-1"`, and from then on the control last focused is the toolbar's tab stop. The markup is rendered
  without these attributes, so it is the same with and without script; Tab into the toolbar and out of it behaves as
  one stop from the first focus.
- Disabled controls (`disabled`) are skipped; controls with `aria-disabled="true"` stay reachable, as the pattern
  recommends.
- **Plain HTML:** `attachStrata` handles every `.ug-toolbar`. **React and Vue:** `<Toolbar label orientation>`
  around the controls. **Astro:** `<Toolbar label>` with the controls in its slot.
- No overlay.

## 8. Keyboard and screen reader

| Key | Action |
| --- | --- |
| Tab, Shift+Tab | Into the toolbar, onto the control last focused (the first the first time); and out of it |
| Right Arrow, Left Arrow | The next or previous control, wrapping; reversed in right-to-left text. Down and Up when vertical |
| Home, End | The first or last control |
| Space, Enter | The focused control's own action (native) |

- Role `toolbar`, named by its label; screen readers announce the toolbar and the focused control.

## 9. CSS presentation

The ButtonGroup's plinth: an inline flex row, wrapping, `space.2` gap and padding, `panel` colour. Vertical
dividers stretch to the row's height. Vertical toolbars are a column.

## 10. Tests

- **Plain DOM:** Tab enters on the first control and the next Tab leaves the toolbar; arrows, Home and End move,
  wrapping and skipping disabled controls but not `aria-disabled` ones; vertical toolbars use Up and Down; right to
  left reverses the arrows; focus returns to the control last used.
- **Bindings:** React, Vue and Astro render exactly the markup above; the same keys through each binding; axe in
  light and dark.
- **GPU:** at Relief and Objects the plinth is a raised slab with its controls' keys on it; the arrow keys and a
  real click work through the GPU, with GPU on.
