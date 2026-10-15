# Link

Tier A. Follows the [anatomy template](../design-language.md#17-component-anatomy-template) and the
[conventions](README.md#conventions).

## 1. Purpose and native element

Navigates to another page, another place on the page or a file. Renders a native `<a href>`, following the
WAI-ARIA [Link pattern](https://www.w3.org/WAI/ARIA/apg/patterns/link/). Something that does an action and
does not navigate is a [Button](button.md). An `<a>` without `href` is not a Link; the component requires
`href`.

`target`, `rel` and `download` pass through. A link that opens a new context says so in its text or in a
visually hidden suffix.

## 2. Object

None. The link is flat text on the face beneath it. There is no moving part and no mesh at any level.

## 3. Faces and materials

| Face | Colour role | Text role | Material role |
| --- | --- | --- | --- |
| Text | The parent face | `accent` | None |

Link text uses the `accent` role and an underline. The underline carries the meaning, so a link is never
marked by colour alone. A link on an `accent` face uses that face's `on-accent` text role with an underline.
Contrast of the link colour against its face is at least 4.5:1 at `interior.max`.

## 4. Elevation per state

Links have no height. States change colour and decoration only.

| State | Relief | Objects | CSS |
| --- | --- | --- | --- |
| Rest | None | None | Underline, `accent` text |
| Hover | None | None | Underline 1 px thicker, `brightness(1.04)` |
| Pressed (`:active`) | None | None | `brightness(0.96)` |
| Focus-visible | Accent edge, `focus.width`, around the text box | None | `outline: focus.width solid accent`, offset `focus.offset` |
| Visited | None | None | Text mixed towards `muted`; underline kept |
| Disabled | None | None | Not a state of `<a>`; see section 8 |

Selected, invalid and busy do not apply. The current-page link uses `aria-current="page"` and
`font.weight.strong`.

## 5. Relief primitives

None. The link has no `data-strata-face`. The GPU captures it as part of its panel.

## 6. Tokens it reads

| Token | Prop |
| --- | --- |
| `colour.accent`, `colour.muted`, `colour.text` | — |
| `focus.width`, `focus.offset` | — |
| `font.size.body`, `font.weight.strong` | size inherits from the parent |
| `motion.fast` | — |
| `target.min` | — |

## 7. DOM structure and overlay needs

```html
<a class="ug-link" href="/docs">Read the guide</a>
```

- The `<a>` is the boundary element. Refs, `class` and `style` reach it.
- No overlay.

## 8. Keyboard and screen reader

| Key | Action |
| --- | --- |
| Enter | Follow the link (native) |
| Tab, Shift+Tab | Move focus |

- Role `link` (native). The accessible name is the link text. Space does not activate a link.
- There is no native disabled link. An unavailable link renders as plain text with content at 38% opacity,
  or as an `<a aria-disabled="true">` without `href`.
- `aria-current="page"` marks the current page.

## 9. CSS presentation

Inline text with an underline and no relief. Target size: an inline link inside a sentence is exempt under
WCAG 2.2 (2.5.8). A link that stands alone (a list, a nav item) has a box of at least `target.min` (24) in
both dimensions, through padding. Under `forced-colors`: `LinkText`, and `VisitedText` when visited, with the
underline kept; the focus ring is `Highlight`.

## 10. Tests

- **Plain DOM:** Enter follows the link; Space does not; `href`, `target` and `rel` pass through.
- **GPU:** GPU stays active while the link is hovered and focused; pixels are fresh after each; a hit on the
  text reaches the `<a>`.
- **Accessibility:** axe in light, dark and high contrast; link colour contrast at `interior.max`; the
  underline is present; standalone links are at least 24 by 24.
- **Parity:** Relief and CSS render the same text and underline within the P0.6 budget.
