# List

Tier B. Follows the [anatomy template](../design-language.md#17-component-anatomy-template) and the
[conventions](README.md#conventions).

## 1. Purpose and native element

Shows a set of related items in rows, each with a primary line and optionally a secondary line, a leading icon and
trailing details. Renders a native `<ul role="list">` of `<li>` rows. The explicit `role` keeps the list's
semantics where `list-style: none` would remove them (Safari). A row that does something holds a native `<a href>`
or `<button>` that fills it. A list from which the user selects one or more values is a listbox (Tier C), not a
List.

## 2. Object

A **raised slab**, like a [Card](card.md), holding the rows. Rows are separated by hairlines; they have no depth of
their own. An actionable row is a flat target the width of the slab.

| Part | Shape | Height at 50% | Moves |
| --- | --- | --- | --- |
| Slab | Rounded plate, `radius.control`, `bevel.width` band | `elevation.raised` (3) | No |
| Row | The slab's width, at least the density's control height | — | No |
| Separator | A 1 px line between rows, inset by `space.5` | Flat (in the captured content) | No |

An actionable row's link or button is the whole row, at least `target.min` (24) high (WCAG 2.5.8).

## 3. Faces and materials

| Face | Colour role | Text role | Material role |
| --- | --- | --- | --- |
| Slab | `secondary` | `text` | `control` (`matte`) |
| Primary line | None | `text` | None |
| Secondary line, trailing details | None | `text`, at `font.size.small` | None |
| Separator | `edge` at 50% | — | None |
| Actionable row, hover | A 6% `text` tint | — | None |
| Current row (`aria-current`) | A 10% `accent` tint and a 3 px `accent` bar at the start | `text`, strong | None |

The secondary line and trailing details keep the `text` colour and are set apart by size: `muted` meets 4.5:1
only on the `panel` colour, not on the slab or on a tinted row. `data-strata-material` on the list overrides the
slab's material.

## 4. Elevation per state

| State | Relief | Objects | CSS |
| --- | --- | --- | --- |
| Rest | Slab at `elevation.raised` | Slab at raised height | Relief recipe at `raised` |
| Hover (actionable row) | A 6% tint on the row | Same | Same |
| Pressed (actionable row) | A 10% tint | Same | Same |
| Focus-visible (actionable row) | `outline: focus.width solid accent`, inset by `focus.width` so it stays on the slab | Same | Same |
| Current (`aria-current`) | Accent tint and start bar | Same | Same |
| Disabled (a `disabled` button row) | Content at 38% | Same | Same |

The slab does not rise or travel: rows are flat and own their states.

## 5. Relief primitives

One `raised` primitive: the `<ul>`, from its border box. Rows, separators and their content are captured content
on it.

## 6. Tokens it reads

| Token | Prop |
| --- | --- |
| `colour.secondary`, `colour.text`, `colour.edge`, `colour.accent` | — |
| `radius.control` | — (theme or scope) |
| `elevation.raised`, `bevel.*`, `shadow.*` | — |
| `material.roles.control` | `material` |
| `target.min`, `control.height`, `space.*`, `density`, `font.size.body`, `font.size.small` | `size` |
| `focus.width` | — |
| `level` | `level` |

## 7. DOM structure and overlay needs

```html
<ul class="ug-list" role="list" data-strata-face="raised" aria-label="Mailboxes">
  <li class="ug-list__item">
    <a class="ug-list__action" href="/inbox" aria-current="page">
      <span class="ug-list__start" aria-hidden="true"></span>
      <span class="ug-list__text">
        <span class="ug-list__primary">Inbox</span>
        <span class="ug-list__secondary">12 unread</span>
      </span>
      <span class="ug-list__end">Now</span>
    </a>
  </li>
  <li class="ug-list__item">
    <button class="ug-list__action" type="button">
      <span class="ug-list__text">
        <span class="ug-list__primary">Archive</span>
      </span>
    </button>
  </li>
  <li class="ug-list__item">
    <span class="ug-list__text">
      <span class="ug-list__primary">Storage</span>
      <span class="ug-list__secondary">4.2 GB of 15 GB used</span>
    </span>
  </li>
</ul>
```

- The `<ul>` is the boundary element: refs, `class` and `style` reach it. Name it with `aria-label` (the `label`
  prop) or `aria-labelledby` when there is more than one list on the page.
- A row is static, or holds one `.ug-list__action`: a link (`href`) or a button (`onClick`, or `type="button"` in
  plain HTML). Its content goes inside the action, so the whole row is the target. A row never holds a second
  control.
- `.ug-list__start` holds a decorative icon or avatar (`aria-hidden`); `.ug-list__end` holds trailing text, which
  is read. Both are optional, and so is the secondary line.
- `aria-current` (`page`, `true`, …) on a link marks the current row.
- **React, Vue and Astro:** `<List label>` with `<ListItem primary secondary start end href current disabled>`; a
  `ListItem` with `onClick` (React; a click listener in Vue) renders a button row. Astro renders link and static rows,
  and a button row with `button`.
- No overlay.

## 8. Keyboard and screen reader

| Key | Action |
| --- | --- |
| Tab, Shift+Tab | Move between actionable rows (native order); static rows are not in the tab order |
| Enter | Follow the link, or press the button (native) |
| Space | Press a button row (native) |

- Role `list` with `listitem` rows, so screen readers say "list, 3 items". A link row is a link named by its
  content: primary line, secondary line and trailing details, in that order.
- `aria-current="page"` is announced as "current page".

## 9. CSS presentation

The `raised` recipe on the `<ul>` (no bullets, no padding), with the card's `secondary` colour. Rows are flex rows
with `space.4` between the parts and `space.5` inline padding; the separator is the next row's top border, inset by
the padding. Under `forced-colors` the slab has a `CanvasText` border, separators are `CanvasText`, and the current
row's bar is `Highlight`.

## 10. Tests

- **Plain DOM and bindings:** React, Vue and Astro render exactly the markup above; a click and Enter on a link
  row follow it, a click and Space on a button row press it, a disabled button row does nothing; static rows are not
  focusable; roles, names and `aria-current`; axe in light and dark.
- **GPU:** at Relief and Objects the list is one raised slab (an object slab at Objects) and its rows add nothing
  to the scene; a real click on a button row through the GPU reaches it, with GPU on.
