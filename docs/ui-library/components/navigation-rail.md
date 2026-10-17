# NavigationRail

Tier C. Follows the [anatomy template](../design-language.md#17-component-anatomy-template) and the
[conventions](README.md#conventions).

## 1. Purpose and native element

An application's top-level destinations (three to seven) in a narrow column at the start edge, each an icon above a
short label. A `<nav>` landmark named by `aria-label`, holding a list of native links; the current destination
carries `aria-current="page"`. Tab moves through the links and Enter follows one, natively. For a bar across the top
use an [AppBar](app-bar.md); for many destinations, or with secondary text, a [List](list.md) of links.

## 2. Object

**Keys on a raised slab down the start edge**, as an [AppBar](app-bar.md) turned on its side.

| Part | Shape | Height at 50% | Moves |
| --- | --- | --- | --- |
| Rail | A column `space.2` larger than its keys, `radius.control` | `elevation.raised` | No |
| Destination | A key, at least 56 px wide and 48 px high, icon above label | `elevation.raised` on the rail | Rises on hover, travels on press; the current one stays down |

## 3. Faces and materials

| Face | Colour role | Text role | Material role |
| --- | --- | --- | --- |
| Rail | `secondary` | — | `control` |
| Destination | `secondary` | `text`, `font.size.small`, strong | `control` |
| Current destination | `accent` at 16% over `secondary`, with a 3 px `accent` strip along its start edge | `text` | `control` |

The current destination is held down, tinted and marked by its strip: never by colour alone.

## 4. Elevation per state

| State | Relief | Objects | CSS |
| --- | --- | --- | --- |
| Rest | Keys at `elevation.raised` on the raised rail | Keys on a slab | Relief recipe |
| Hover | Height × `state.hoverHeight` | Key rises | Larger shadow |
| Pressed | Height × `state.pressHeight` | Key travels | Smaller shadow |
| Current (`aria-current="page"`) | Held at `state.pressHeight`; tint and strip | Key held down | Tint and strip |
| Focus-visible | `outline: focus.width solid accent` on the key | Same | Same |

## 5. Relief primitives

One `raised` primitive for the rail and one per destination. At the Objects level the rail is a slab and each
destination (a link) is a key on it, held down while it is the current page.

## 6. Tokens it reads

`colour.secondary`, `colour.accent`, `colour.text`, `elevation.raised`, `radius.control`, `space.1`, `space.2`,
`font.size.small`, `font.weight.strong`, `state.*`, `focus.*`.

## 7. DOM structure and overlay needs

```html
<nav class="ug-nav-rail" data-strata-face="raised" aria-label="Main">
  <ul class="ug-nav-rail__list" role="list">
    <li class="ug-nav-rail__entry">
      <a class="ug-nav-rail__item" data-strata-face="raised" href="/inbox" aria-current="page">
        <span class="ug-nav-rail__icon" aria-hidden="true"></span>
        <span class="ug-nav-rail__label">Inbox</span>
      </a>
    </li>
    <li class="ug-nav-rail__entry">
      <a class="ug-nav-rail__item" data-strata-face="raised" href="/drafts">
        <span class="ug-nav-rail__icon" aria-hidden="true"></span>
        <span class="ug-nav-rail__label">Drafts</span>
      </a>
    </li>
  </ul>
</nav>
```

- The bindings take `label` (the landmark's name), `items` (`{ label, href, icon }`) and `current` (the current
  item's `href`). An item's click reaches `onNavigate(href, event)` (React and Vue `navigate`), so a router can
  prevent the default and route instead.
- The icon is decorative; the label always shows, so every destination is named by its text.
- No overlay.

## 8. Keyboard and screen reader

| Key | Action |
| --- | --- |
| Tab, Shift+Tab | Move through the destinations |
| Enter | Follows the focused link |

- Announced as the "Main" navigation landmark, a list, and each link by its label; the current one as "current page".

## 9. CSS presentation

A column of keys with `space.1` gaps on the rail, each key a column of icon (24 px) and label. Under `forced-colors`
the rail has a `CanvasText` border, keys a `ButtonBorder` one, and the current key is `Highlight`.

## 10. Tests

- **Bindings:** matches this markup; `aria-current` follows `current`; a click reports its `href`; each destination is
  at least 24 px and named by its label.
- **GPU:** the rail is raised (a slab at Objects) and each destination a raised key, the current one held down; a real
  click reaches the link, and GPU stays on.
