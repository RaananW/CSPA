# Pagination

Tier B. Follows the [anatomy template](../design-language.md#17-component-anatomy-template) and the
[conventions](README.md#conventions).

## 1. Purpose and native element

Moves between the pages of a long list or table. Renders a `<nav>` landmark named "Pagination" around a list of
page controls: native `<a href>` links when each page has an address, or native `<button>`s when the application
changes the page itself. The current page has `aria-current="page"`. No APG pattern applies beyond the landmark,
the list and the native controls.

## 2. Object

A **row of small keys**, one per page shown, with a Previous and a Next key at the ends. The current page's key is
held down, like a latched [ToggleButton](toggle-button.md).

| Part | Shape | Height at 50% | Moves |
| --- | --- | --- | --- |
| Page key | `radius.control`, the density's control height, at least as wide as it is high | `elevation.raised` (3) | Travels on press; the current page is held down |
| Previous, Next | The same key with a chevron | `elevation.raised` | As a page key; flat and dimmed at the first or last page |
| Ellipsis | "…" between keys, where pages are skipped | Flat | No |

## 3. Faces and materials

| Face | Colour role | Text role | Material role |
| --- | --- | --- | --- |
| Page key | `secondary` | `text`, tabular figures | `control` (`matte`) |
| Current page | `accent` | `on-accent`, strong | `buttonPrimary` |
| Ellipsis | None | `muted` | None |

The current page is shown by its fill, its weight and its key held down, never by colour alone.

## 4. Elevation per state

| State | Relief | Objects | CSS |
| --- | --- | --- | --- |
| Rest | Key at `elevation.raised` | Key | Relief recipe at `raised` |
| Hover | Height × `state.hoverHeight` | Key rises | Larger shadow |
| Pressed | Height × `state.pressHeight` | Key travels | Smaller shadow |
| Current (`aria-current="page"`) | Held at `state.pressHeight`, `accent` | Key held down | `accent` fill |
| Focus-visible | `outline: focus.width solid accent` | Same | Same |
| Disabled (Previous at the first page, Next at the last) | Height 0, chevron at 38% | Flattened | Flat, 38% |

## 5. Relief primitives

One `raised` primitive per key: each link or button, from its border box. At the Objects level each is a key, and
the current page's key is held at its travel (`aria-current`, as `aria-pressed`).

## 6. Tokens it reads

| Token | Prop |
| --- | --- |
| `colour.secondary`, `colour.accent`, `colour.on-accent`, `colour.text`, `colour.muted` | — |
| `radius.control`, `control.height`, `control.font`, `target.min`, `space.*` | `size` |
| `elevation.raised`, `state.*`, `object.keyHeight`, `object.keyTravel` | — |
| `material.roles.control`, `material.roles.buttonPrimary` | `material` |
| `focus.width`, `focus.offset` | — |
| `level` | `level` |

## 7. DOM structure and overlay needs

```html
<nav class="ug-pagination" aria-label="Pagination">
  <ul class="ug-pagination__list">
    <li class="ug-pagination__item"><a class="ug-pagination__link ug-pagination__link--previous" data-strata-face="raised" href="/items?page=3" aria-label="Previous page"></a></li>
    <li class="ug-pagination__item"><a class="ug-pagination__link" data-strata-face="raised" href="/items?page=1" aria-label="Page 1">1</a></li>
    <li class="ug-pagination__item" aria-hidden="true"><span class="ug-pagination__ellipsis">…</span></li>
    <li class="ug-pagination__item"><a class="ug-pagination__link" data-strata-face="raised" href="/items?page=3" aria-label="Page 3">3</a></li>
    <li class="ug-pagination__item"><a class="ug-pagination__link" data-strata-face="raised" href="/items?page=4" aria-label="Page 4" aria-current="page">4</a></li>
    <li class="ug-pagination__item"><a class="ug-pagination__link" data-strata-face="raised" href="/items?page=5" aria-label="Page 5">5</a></li>
    <li class="ug-pagination__item" aria-hidden="true"><span class="ug-pagination__ellipsis">…</span></li>
    <li class="ug-pagination__item"><a class="ug-pagination__link" data-strata-face="raised" href="/items?page=10" aria-label="Page 10">10</a></li>
    <li class="ug-pagination__item"><a class="ug-pagination__link ug-pagination__link--next" data-strata-face="raised" href="/items?page=5" aria-label="Next page"></a></li>
  </ul>
</nav>
```

- The `<nav>` is the boundary element: refs, `class` and `style` reach it. Its name defaults to "Pagination".
- **Pages shown:** the first and last pages, the current page and `siblings` (1) pages either side of it; a run of
  skipped pages is an ellipsis, hidden from assistive technology. With 7 pages or fewer (for 1 sibling) every page is
  shown.
- **Links or buttons:** with an address per page (`href`), every key is a link; otherwise each is a
  `<button type="button">` and the application changes the page (`onPageChange`). At the first page, Previous is a
  disabled button (or a link without `href`, with `aria-disabled="true"`); likewise Next at the last.
- **Names:** "Page N", which contains the visible number (WCAG 2.5.3); "Previous page" and "Next page" for the
  chevrons.
- **React and Vue:** `<Pagination page count onPageChange href siblings label>` (Vue: `v-model:page`, and `href` a
  function). **Astro:** `page`, `count` and `href`, a template with `{page}` (`"/items?page={page}"`).
- No overlay.

## 8. Keyboard and screen reader

| Key | Action |
| --- | --- |
| Tab, Shift+Tab | Move between the keys (native order); a disabled Previous or Next is skipped |
| Enter (link or button), Space (button) | Go to that page (native) |

- A `navigation` landmark named "Pagination" with a list of keys; the current page is announced as "Page 4,
  current page".

## 9. CSS presentation

A wrapping flex row with `space.3` gaps, so the keys' shadows do not touch. Keys use the `raised` recipe with
`secondary` (the current page `accent`), centred tabular figures, and `space.2` inline padding. The chevrons are drawn
by two borders. Under `forced-colors` keys have a `ButtonBorder` border and the current page is `Highlight` with `HighlightText`.

## 10. Tests

- **Bindings:** React, Vue and Astro render exactly the markup above; the pages shown for several positions;
  buttons change the page through `onPageChange` (`v-model:page`) with clicks and Enter; Previous and Next, and their
  disabled states at the ends; names and `aria-current`; axe in light and dark.
- **GPU:** at Relief and Objects every page is a key and the current page's key is held down (`pressed`); a real
  click on another page through the GPU moves it, with GPU on.
