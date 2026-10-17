# TreeView

Tier C. Follows the [anatomy template](../design-language.md#17-component-anatomy-template) and the
[conventions](README.md#conventions).

## 1. Purpose and native element

A hierarchy the user browses and picks from, such as folders and files, or sections of a document. HTML has no tree
element, so it follows the WAI-ARIA [Tree View pattern](https://www.w3.org/WAI/ARIA/apg/patterns/treeview/): a
`<ul role="tree">` named by `aria-label`, whose `<li role="treeitem">` items nest in `<ul role="group">` lists. A
parent item carries `aria-expanded`; every item carries `aria-selected` (one is selected at a time). The tree is one
tab stop (a roving `tabindex`), and the keys below move, open, close and select. A plain list of links is a
[List](list.md); sections that open in place are an [Accordion](accordion.md).

## 2. Object

**One raised slab, with flat rows on it**, as a [List](list.md).

| Part | Shape | Height at 50% | Moves |
| --- | --- | --- | --- |
| Tree | A rounded box around every row, `radius.control` | `elevation.raised` | No |
| Row | A full-width row, 32 px high, indented `space.5` per level | Flat | No |
| Toggle | A chevron at the start of a parent's row | Flat | Turns a quarter when the item opens |

## 3. Faces and materials

| Face | Colour role | Text role | Material role |
| --- | --- | --- | --- |
| Tree | `secondary` | `text` | `control` |
| Row, hovered | `text` at 6% over `secondary` | `text` | — |
| Row, selected | `accent` at 16% over `secondary`, with a 3 px `accent` strip along its start edge | `text`, strong | — |

The selected row is tinted, marked by its strip and strong: never by colour alone.

## 4. Elevation per state

| State | Relief | Objects | CSS |
| --- | --- | --- | --- |
| Rest | One slab at `elevation.raised`; rows flat | A slab | Relief recipe at `raised` |
| Focus-visible | `outline: focus.width solid accent` around the focused row | Same | Same |

## 5. Relief primitives

One `raised` primitive: the tree. Rows, toggles and labels are captured content. At the Objects level it is a slab.

## 6. Tokens it reads

`colour.secondary`, `colour.accent`, `colour.text`, `elevation.raised`, `radius.control`, `radius.small`,
`space.1`, `space.2`, `space.5`, `font.weight.strong`, `focus.*`, `motion.fast`.

## 7. DOM structure and overlay needs

```html
<ul class="ug-tree" data-strata-face="raised" role="tree" aria-label="Files">
  <li class="ug-tree__item" role="treeitem" data-strata-value="src" aria-expanded="true" aria-selected="false" tabindex="-1">
    <span class="ug-tree__row"><span class="ug-tree__toggle" aria-hidden="true"></span><span class="ug-tree__label">src</span></span>
    <ul class="ug-tree__group" role="group">
      <li class="ug-tree__item" role="treeitem" data-strata-value="src/index.ts" aria-selected="true" tabindex="0">
        <span class="ug-tree__row"><span class="ug-tree__label">index.ts</span></span>
      </li>
    </ul>
  </li>
  <li class="ug-tree__item" role="treeitem" data-strata-value="readme" aria-selected="false" tabindex="-1">
    <span class="ug-tree__row"><span class="ug-tree__label">README.md</span></span>
  </li>
</ul>
```

- An item's name is its label: a nested group is not part of it.
- `data-strata-value` identifies an item to the bindings and in `strata-select` and `strata-expand` events.
- The tab stop is the selected item when it is visible, else the first item.
- A collapsed item's group is hidden by CSS from `aria-expanded="false"`.
- The bindings take `label`, `items` (`{ value, label, children }`), `expanded` or `defaultExpanded` (the open
  values) and `selected` or `defaultSelected`, and report `onExpandedChange` and `onSelect` (Vue: `v-model:expanded`,
  `v-model:selected`). In plain HTML and Astro, `attachStrata` runs the keys and clicks, and reports `strata-select`
  and `strata-expand` events from the item.
- No overlay.

## 8. Keyboard and screen reader

| Key | Action |
| --- | --- |
| Tab | Moves into the tree (to the selected item, or the first) and out of it |
| Down, Up | Next or previous visible item |
| Right | Opens a closed parent; on an open parent, moves to its first child |
| Left | Closes an open parent; elsewhere, moves to the item's parent |
| Home, End | First or last visible item |
| Enter, Space | Selects the focused item |

- In right-to-left text Right and Left swap. A click on a row selects it; a click on a toggle opens or closes it.
- Announced as "Files, tree", each item as "src, expanded, level 1, 1 of 2", and the selected one as "selected".

## 9. CSS presentation

The tree is a padded slab with the raised recipe; rows are 32 px high with `radius.small`. The toggle is a chevron
drawn with borders, turning over `motion.fast` (at once under reduced motion). Under `forced-colors` the tree has a
`CanvasText` border, and the selected row is `Highlight`.

## 10. Tests

- **Bindings:** matches this markup; the arrow keys, Home and End move focus by the pattern; Right and Left open, close
  and move to the child and parent; Enter, Space and clicks select and report it; there is one tab stop.
- **GPU:** the tree is a raised slab (a slab at Objects) with flat rows; real keys and clicks through the GPU open
  items and select them, and GPU stays on.
