# Popover

Tier C. Follows the [anatomy template](../design-language.md#17-component-anatomy-template) and the
[conventions](README.md#conventions).

## 1. Purpose and native element

Interactive content that one button opens beside itself, such as a few filters or a share form, without leaving the
page. The native **Popover API**: a `<div popover>` with `role="dialog"` (a non-modal dialog, named by its title),
opened by a `<button popovertarget>`. The browser provides the behaviour:

- the button toggles it, and exposes its expanded state;
- Escape or a click outside closes it (light dismiss), and focus returns to the button when it was inside;
- Tab from the button moves into it, and out of it to the control after the button;
- it is in the top layer, over everything, and only one auto popover chain is open at a time.

Text that only describes a control is a [Tooltip](tooltip.md); a task that must be finished or cancelled is a
[Dialog](dialog.md); a list of actions is a Menu.

## 2. Object

A **floating slab** at `elevation.overlay`, beside its button.

| Part | Shape | Height at 50% | Moves |
| --- | --- | --- | --- |
| Popover | A rounded box, `radius.control`, at most 24rem wide | `elevation.overlay` (16) | Fades in over `motion.fast` |

## 3. Faces and materials

| Face | Colour role | Text role | Material role |
| --- | --- | --- | --- |
| Popover | `panel` | `text` | `panel` |
| Title | — | `text`, `font.size.body`, strong | — |

## 4. Elevation per state

| State | Relief | Objects | CSS |
| --- | --- | --- | --- |
| Open | A slab at `elevation.overlay` with its cast shadow | Same | Same |

Under `prefers-reduced-motion` it appears and goes at once.

## 5. Relief primitives

None in a GPU scene: the popover is in the top layer, outside every Underglass layer, and CSS presents it. The core
keeps any `[popover]` inside a layer on DOM, so a popover is always rendered outside layers (the bindings portal it to
`<body>`); its button may be inside one.

## 6. Tokens it reads

`colour.panel`, `colour.text`, `elevation.overlay`, `radius.control`, `space.2`, `space.4`, `font.size.body`,
`font.weight.strong`, `motion.fast`.

## 7. DOM structure and overlay needs

```html
<button class="ug-button" data-strata-face="raised" type="button" popovertarget="filters-popover"><span class="ug-button__label">Filters</span></button>
<div class="ug-popover" data-strata-face="raised" id="filters-popover" popover role="dialog" aria-labelledby="filters-popover-title">
  <h2 class="ug-popover__title" id="filters-popover-title">Filters</h2>
  <div class="ug-popover__body"></div>
</div>
```

- **Placement:** below the button and aligned with its start edge, flipped above when there is no room, by CSS anchor
  positioning from the button (its implicit anchor). `data-strata-placement="top"` prefers above. Where
  `position-area` is not supported, it keeps the browser's default place, centred in the viewport. A button inside an
  Underglass layer is laid out inside the output canvas, where anchor positioning does not follow the layer's drawn
  place (open issue SCOPE-008), so `attachStrataPopovers` places such a popover from the button's box with script
  (`data-strata-anchor="script"`) and keeps it there as the page scrolls.
- Without a title, `label` names it (`aria-label`).
- React and Vue take the trigger (`trigger`, or Vue's `trigger` slot), the title, the content and `container`
  (`document.body` by default), and report `onOpenChange(open)` (Vue: `toggle`). In Astro the trigger is any button
  with `popovertarget` set to the popover's `id`.
- Put `autofocus` on a control inside to focus it when the popover opens.

## 8. Keyboard and screen reader

| Key | Action |
| --- | --- |
| Enter, Space (on the button) | Opens or closes it |
| Tab | From the button into the popover, and from its last control to the control after the button |
| Escape | Closes it; focus returns to the button |

- The button is announced as collapsed or expanded; the popover as a dialog named by its title.

## 9. CSS presentation

A `panel`-coloured slab with the raised recipe at `elevation.overlay`, `space.4` padding, fading over `motion.fast`
with `@starting-style`. Under `forced-colors` it has a `CanvasText` border.

## 10. Tests

- **Bindings:** matches this markup; the button opens it below itself, Tab enters it, Escape closes it and returns
  focus, a click outside closes it, and the open state is reported.
- **GPU:** a button inside a GPU panel opens it by a real click; it is in the top layer outside the root, a control
  in it takes a real click, and the panel stays on the GPU.
