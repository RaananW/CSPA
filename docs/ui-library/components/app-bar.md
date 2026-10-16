# AppBar

Tier B. Follows the [anatomy template](../design-language.md#17-component-anatomy-template) and the
[conventions](README.md#conventions).

## 1. Purpose and native element

The bar across the top of an application or a page: its name, and the few controls that apply everywhere
(navigation, search, the account). Renders a native `<header>`, which is the page's `banner` landmark when it is not
inside an `<article>`, `<aside>`, `<main>`, `<nav>` or `<section>`. Its controls are ordinary Strata components. No
APG pattern applies beyond the landmark.

## 2. Object

A **raised slab** across the width of its container, like a [Panel](panel.md)'s top edge brought forward. Its
controls' keys stand on it.

| Part | Shape | Height at 50% | Moves |
| --- | --- | --- | --- |
| Bar | Rounded plate, `radius.control`, at least `control.height + 2 × space.3` high | `elevation.raised` (3) | No |
| Start, end | Slots for controls, at the bar's ends | On the bar | As each control |
| Title | Text between them | Flat (captured content) | No |

## 3. Faces and materials

| Face | Colour role | Text role | Material role |
| --- | --- | --- | --- |
| Bar | `secondary` | `text` | `control` (`matte`) |
| Title | None | `text`, strong, `font.size.subtitle` | None |

`data-strata-material` on the bar overrides its material.

## 4. Elevation per state

| State | Relief | Objects | CSS |
| --- | --- | --- | --- |
| Rest | Slab at `elevation.raised` | Slab at raised height, its controls' keys on it | Relief recipe |

The bar takes no state; its controls have their own.

## 5. Relief primitives

One `raised` primitive: the `<header>`, then each control's own.

## 6. Tokens it reads

| Token | Prop |
| --- | --- |
| `colour.secondary`, `colour.text` | — |
| `radius.control`, `control.height`, `space.*`, `font.size.subtitle` | `size` |
| `elevation.raised` | — |
| `material.roles.control` | `material` |
| `level` | `level` |

## 7. DOM structure and overlay needs

```html
<header class="ug-app-bar" data-strata-face="raised">
  <div class="ug-app-bar__start">
    <button type="button" class="ug-icon-button" data-strata-face="raised" aria-label="Menu"><span class="ug-icon-button__icon" aria-hidden="true"></span></button>
  </div>
  <span class="ug-app-bar__title">Underglass</span>
  <div class="ug-app-bar__end">
    <button type="button" class="ug-button" data-strata-face="raised"><span class="ug-button__label">Sign in</span></button>
  </div>
</header>
```

- The `<header>` is the boundary element: refs, `class` and `style` reach it. The start and end slots are optional.
- The title is text, not a heading: the page's own `<h1>` names the page. Give `title` a heading when the bar's title
  is the page's name.
- The bar does not stick or scroll on its own; place it where the application's layout wants it. As its own
  Underglass layer it can stay in place while the content scrolls.
- **React and Vue:** `<AppBar title start end>` (Vue: `start` and `end` slots). **Astro:** `title` with `start` and
  `end` slots.
- No overlay.

## 8. Keyboard and screen reader

| Key | Action |
| --- | --- |
| Tab, Shift+Tab | Move between the bar's controls (native order) |

- A `banner` landmark when at the top level; screen readers list it among the landmarks.

## 9. CSS presentation

A flex row with the `raised` recipe and `secondary` colour, `space.3` block and `space.4` inline padding, and
`space.3` gaps. The title takes the free space and is truncated with an ellipsis. Under `forced-colors` the bar has a
`CanvasText` border.

## 10. Tests

- **Bindings:** React, Vue and Astro render exactly the markup above; the banner landmark at the top level; the
  slots' controls; the title truncates rather than wraps; axe in light and dark.
- **GPU:** at Relief and Objects the bar is a raised slab with its controls' keys on it; a real click on a control
  through the GPU reaches it, with GPU on.
