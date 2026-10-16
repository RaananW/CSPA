# Breadcrumb

Tier B. Follows the [anatomy template](../design-language.md#17-component-anatomy-template) and the
[conventions](README.md#conventions).

## 1. Purpose and native element

Shows where the current page sits in the site's hierarchy, with a link to each level above it. Renders a native
`<nav>` landmark named "Breadcrumb" around an ordered list `<ol>` of [Links](link.md), following the WAI-ARIA
[Breadcrumb pattern](https://www.w3.org/WAI/ARIA/apg/patterns/breadcrumb/). The last item is the current page:
its link has `aria-current="page"`.

## 2. Object

None: flat text on the panel, like a [Link](link.md). The separators between items are drawn by CSS and are not
read.

| Part | Shape | Height at 50% | Moves |
| --- | --- | --- | --- |
| Item | A Link, at least `target.min` (24) high | 0 | No |
| Separator | A 6 px chevron between items, in `muted` | 0 | No |

## 3. Faces and materials

| Face | Colour role | Text role | Material role |
| --- | --- | --- | --- |
| Link | None | `accent-text`, underlined on hover | None |
| Current page | None | `text`, strong, not underlined | None |
| Separator | `muted` | — | None |

The current page is shown by its colour, its weight and its missing underline, never by colour alone.

## 4. Elevation per state

| State | Relief | Objects | CSS |
| --- | --- | --- | --- |
| Rest | Flat links | Same | Same |
| Hover | Underline 2 px | Same | Same |
| Focus-visible | `outline: focus.width solid accent` | Same | Same |
| Current (`aria-current="page"`) | `text`, strong, no underline | Same | Same |

## 5. Relief primitives

None. A breadcrumb adds nothing to a GPU scene; it is captured content.

## 6. Tokens it reads

| Token | Prop |
| --- | --- |
| `colour.accent-text`, `colour.text`, `colour.muted` | — |
| `font.size.small`, `space.*`, `target.min` | `size` |
| `focus.width`, `focus.offset` | — |

## 7. DOM structure and overlay needs

```html
<nav class="ug-breadcrumb" aria-label="Breadcrumb">
  <ol class="ug-breadcrumb__list">
    <li class="ug-breadcrumb__item"><a class="ug-link ug-breadcrumb__link" href="/">Home</a></li>
    <li class="ug-breadcrumb__item"><a class="ug-link ug-breadcrumb__link" href="/settings">Settings</a></li>
    <li class="ug-breadcrumb__item"><a class="ug-link ug-breadcrumb__link" href="/settings/profile" aria-current="page">Profile</a></li>
  </ol>
</nav>
```

- The `<nav>` is the boundary element: refs, `class` and `style` reach it. Its name defaults to "Breadcrumb"
  (the `label` prop changes it, for another language).
- Every item is a link, the current page included, so it can be bookmarked and copied. The separators are
  `::before` content on each item after the first, and are not read.
- **React and Vue:** `<Breadcrumb items={[{ label, href }]}>`; the last item is the current page. **Astro:** the
  same props.
- No overlay.

## 8. Keyboard and screen reader

| Key | Action |
| --- | --- |
| Tab, Shift+Tab | Move between the links (native order) |
| Enter | Follow the focused link (native) |

- A `navigation` landmark named "Breadcrumb", holding a list of N items; the last link is announced as
  "current page".

## 9. CSS presentation

A wrapping flex row with `space.2` between items, at `font.size.small`. Each item after the first starts with a
chevron drawn by two borders. Under `forced-colors` links are `LinkText`, the current page `CanvasText`, and the
chevrons `CanvasText`.

## 10. Tests

- **Bindings:** React, Vue and Astro render exactly the markup above; the landmark, list, links and
  `aria-current`; a click follows a link; the separators are not in the accessibility tree; axe in light and dark.
