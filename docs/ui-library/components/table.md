# Table

Tier B. Follows the [anatomy template](../design-language.md#17-component-anatomy-template) and the
[conventions](README.md#conventions).

## 1. Purpose and native element

Shows data in rows and columns, to compare and look up values. Renders a native `<table>` with a `<caption>`,
`<thead>` and `<tbody>`, and header cells with `scope="col"`: the browser gives the table semantics, so a screen
reader announces each cell with its column header. A sortable column's header holds a native `<button>`, and the
sorted column carries `aria-sort`, following the WAI-ARIA
[sortable table example](https://www.w3.org/WAI/ARIA/apg/patterns/table/examples/sortable-table/). A table that
is edited in place or navigated cell by cell is a grid (Tier C), not a Table.

## 2. Object

A **raised slab**, like a [Card](card.md), holding the table. Rows are separated by hairlines and the header row
by a stronger line; none of them has depth.

| Part | Shape | Height at 50% | Moves |
| --- | --- | --- | --- |
| Slab | Rounded plate, `radius.control`, `bevel.width` band | `elevation.raised` (3) | No |
| Header row | The top row, with a 2 px `edge` line under it | Flat (in the captured content) | No |
| Row | At least the density's control height, a 1 px line between rows | Flat | No |
| Sort button | The header cell's content, at least `target.min` (24) high | Flat | No |

## 3. Faces and materials

| Face | Colour role | Text role | Material role |
| --- | --- | --- | --- |
| Slab | `secondary` | `text` | `control` (`matte`) |
| Caption | None | `text`, strong | None |
| Header cell | None | `text`, strong, `font.size.small` | None |
| Row, hover | A 4% `text` tint | — | None |
| Row separator | `edge` at 50% | — | None |
| Sort indicator | — | `text` | None |

Numeric columns are aligned to the end, with tabular figures. `data-strata-material` on the table overrides the
slab's material.

## 4. Elevation per state

| State | Relief | Objects | CSS |
| --- | --- | --- | --- |
| Rest | Slab at `elevation.raised` | Slab at raised height | Relief recipe at `raised` |
| Row hover | A 4% tint | Same | Same |
| Sort button hover, pressed | A 6% or 10% tint on the header cell | Same | Same |
| Sort button focus-visible | `outline: focus.width solid accent`, inset | Same | Same |
| Sorted (`aria-sort`) | An arrow after the header's label, up for ascending, down for descending | Same | Same |

The slab does not rise or travel. Selected, invalid, disabled and busy rows do not apply; a busy table shows a
[ProgressBar](progress-bar.md) or [Spinner](spinner.md) near it.

## 5. Relief primitives

One `raised` primitive: the `.ug-table` wrapper, from its border box. The table is captured content on it.

## 6. Tokens it reads

| Token | Prop |
| --- | --- |
| `colour.secondary`, `colour.text`, `colour.edge` | — |
| `radius.control` | — (theme or scope) |
| `elevation.raised`, `bevel.*`, `shadow.*` | — |
| `material.roles.control` | `material` |
| `control.height`, `target.min`, `space.*`, `density`, `font.size.body`, `font.size.small` | `size` |
| `focus.width` | — |
| `level` | `level` |

## 7. DOM structure and overlay needs

```html
<div class="ug-table" data-strata-face="raised">
  <table class="ug-table__table">
    <caption class="ug-table__caption">Invoices</caption>
    <thead>
      <tr>
        <th class="ug-table__header" scope="col" aria-sort="ascending">
          <button class="ug-table__sort" type="button">Number</button>
        </th>
        <th class="ug-table__header" scope="col">
          <button class="ug-table__sort" type="button">Customer</button>
        </th>
        <th class="ug-table__header ug-table__header--numeric" scope="col">Amount</th>
      </tr>
    </thead>
    <tbody>
      <tr class="ug-table__row">
        <td class="ug-table__cell">1001</td>
        <td class="ug-table__cell">Ada Lovelace</td>
        <td class="ug-table__cell ug-table__cell--numeric">120.00</td>
      </tr>
      <tr class="ug-table__row">
        <td class="ug-table__cell">1002</td>
        <td class="ug-table__cell">Grace Hopper</td>
        <td class="ug-table__cell ug-table__cell--numeric">87.50</td>
      </tr>
    </tbody>
  </table>
</div>
```

A table that does not sort (and Astro's, which renders no sort buttons) has plain header cells; `aria-sort` still
says the order the rows are in:

```html
<div class="ug-table" data-strata-face="raised">
  <table class="ug-table__table">
    <caption class="ug-table__caption">Invoices</caption>
    <thead>
      <tr>
        <th class="ug-table__header" scope="col" aria-sort="ascending">Number</th>
        <th class="ug-table__header" scope="col">Customer</th>
        <th class="ug-table__header ug-table__header--numeric" scope="col">Amount</th>
      </tr>
    </thead>
    <tbody>
      <tr class="ug-table__row">
        <td class="ug-table__cell">1001</td>
        <td class="ug-table__cell">Ada Lovelace</td>
        <td class="ug-table__cell ug-table__cell--numeric">120.00</td>
      </tr>
    </tbody>
  </table>
</div>
```

- The wrapper `<div>` is the boundary element and the slab: refs, `class` and `style` reach it. It does not
  scroll; put a wide table in a scroll container of your own (a focusable region with a name).
- **Sorting:** a sortable column's header holds a `.ug-table__sort` button. Only the sorted column has `aria-sort`
  (`ascending` or `descending`); a click on its button reverses the order, and a click on another column's button
  sorts by it, ascending. The button's name is the column's name; `aria-sort` says the order.
- **React and Vue:** `<Table caption columns rows>` with `columns: { key, header, numeric?, sortable? }[]` and rows
  as records of cell values (`rowKey` names the column that identifies a row, the first by default). Sorting is
  controlled by `sort` (`{ key, direction }`) and `onSortChange` (`v-model:sort` in Vue), or left to the component
  with `defaultSort`, which sorts numbers by value and text with `localeCompare`. **Astro** renders the table with
  the headers' `aria-sort` and no sort buttons: sorting needs script.
- No overlay.

## 8. Keyboard and screen reader

| Key | Action |
| --- | --- |
| Tab, Shift+Tab | Move between the sort buttons and any controls in cells (native order) |
| Enter, Space | Sort by the focused column, or reverse its order (native button) |

- The table is named by its caption. Each cell is announced with its column header; the sorted column says
  "sorted ascending" or "descending".
- Screen reader table navigation (Ctrl+Alt+arrows and the like) works as on any native table.

## 9. CSS presentation

The `raised` recipe on the wrapper, with the card's `secondary` colour and `space.2` padding. The table is
`border-collapse: collapse` and full width. Cells have `space.3` and `space.4` padding and a 1 px separator under
each row except the last; the header row has a 2 px `edge` line. The sort arrow is a small triangle drawn by borders.
Under `forced-colors` the slab has a `CanvasText` border and the separators are `CanvasText`.

## 10. Tests

- **Bindings:** React, Vue and Astro render exactly the markup above; a click, Enter and Space on a sort button
  sort the rows and move `aria-sort`; controlled `sort` follows from outside; numeric columns sort by value; roles,
  names and header association; axe in light and dark.
- **GPU:** at Relief and Objects the table is one raised slab (an object slab at Objects) and its rows add nothing to
  the scene; a real click on a sort button through the GPU sorts the rows, with GPU on.
