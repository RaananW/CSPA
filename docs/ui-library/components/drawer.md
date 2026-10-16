# Drawer

Tier B. Follows the [anatomy template](../design-language.md#17-component-anatomy-template) and the
[conventions](README.md#conventions). A Drawer is a [Dialog](dialog.md) fixed to a viewport edge; everything
the Dialog page says about behaviour applies.

## 1. Purpose and native element

A modal panel that slides in from the start, end, top or bottom edge for a longer task or a detail view
(settings, a filter list, a navigation menu on a narrow screen). It follows the
[APG modal dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/) and, like the Dialog, is a
`<section role="dialog" aria-modal="true">`, not a native `<dialog>`, so it is a top-level Strata panel the GPU
presentation can enroll. Background inert, focus in and back, Escape and nesting come from the same
`showStrataDialog`.

## 2. Object

A **raised slab** at `elevation.modal`, square on the edge it sits on and rounded (`radius.panel`) on the
others, over a scrim.

| Part | Shape | Height at 50% | Moves |
| --- | --- | --- | --- |
| Slab | Plate with a bevel band of `bevel.width`, square on its edge | `elevation.modal` (24) | Enters and leaves through depth ([section 12](../design-language.md#12-motion)) |
| Shadow | Analytic cast shadow from the light (section 7) | — | With the slab |
| Scrim | A flat dim layer over the page, behind the slab | — | Fades in and out |

## 3. Faces and materials

As [Dialog](dialog.md#3-faces-and-materials).

## 4. Elevation per state

As [Dialog](dialog.md#4-elevation-per-state).

## 5. Relief primitives

One `raised` primitive: the `<section>` itself, at `elevation.modal`. Same budgets as
[Panel](panel.md#5-relief-primitives).

## 6. Tokens it reads

As [Dialog](dialog.md#6-tokens-it-reads).

| Prop | Meaning |
| --- | --- |
| `side` | `end` (the default), `start`, `top` or `bottom`; logical, so `start` is the left edge in left-to-right text |
| `size`, `material`, `level` | The [Strata props](README.md#conventions) |

## 7. DOM structure and overlay needs

```html
<div class="ug-scrim" aria-hidden="true"></div>
<section class="ug-panel ug-drawer ug-drawer--end" role="dialog" aria-modal="true"
         aria-labelledby="filters-title" aria-describedby="filters-description" data-strata-face="raised"
         data-strata-elevation="modal" tabindex="-1">
  <h2 class="ug-drawer__title" id="filters-title">Filters</h2>
  <div class="ug-drawer__body">
    <p class="ug-drawer__description" id="filters-description">Narrow the list.</p>
  </div>
  <div class="ug-drawer__actions">
    <button type="button" class="ug-button" data-strata-face="raised" data-strata-close>
      <span class="ug-button__label">Done</span>
    </button>
  </div>
</section>
```

Plain HTML and Astro render both elements closed, with the `hidden` attribute:

```html
<div class="ug-scrim" aria-hidden="true" hidden></div>
<section class="ug-panel ug-drawer ug-drawer--end" role="dialog" aria-modal="true"
         aria-labelledby="filters-title" aria-describedby="filters-description" data-strata-face="raised"
         data-strata-elevation="modal" tabindex="-1" hidden>
  <h2 class="ug-drawer__title" id="filters-title">Filters</h2>
  <div class="ug-drawer__body">
    <p class="ug-drawer__description" id="filters-description">Narrow the list.</p>
  </div>
  <div class="ug-drawer__actions">
    <button type="button" class="ug-button" data-strata-face="raised" data-strata-close>
      <span class="ug-button__label">Done</span>
    </button>
  </div>
</section>
```

- **Top-level, rendered into a container**, exactly as the [Dialog](dialog.md#7-dom-structure-and-overlay-needs):
  the section and the scrim before it are direct children of one container (the page body, or the Underglass
  root where `@underglass/ui/gpu` presents them, in a later change), never inside a layer. React and Vue render
  nothing while closed and take a `container` prop.
- The side is the class `ug-drawer--start`, `--end`, `--top` or `--bottom`.
- Plain HTML wiring and `showStrataDialog` are as for the Dialog.

## 8. Keyboard and screen reader

As [Dialog](dialog.md#8-keyboard-and-screen-reader): Tab stays inside through the inert background, Escape
closes, and focus returns to the opener.

## 9. CSS presentation

Fixed to its edge with logical insets and no transform. A start or end drawer is full height and
`min(24rem, 100vw - 2 × space.5)` wide; a top or bottom drawer is full width, as tall as its content up to
`100dvh - 2 × space.5`. Its body scrolls and its title and actions stay. Motion, scrim and preferences are as
for the Dialog.

## 10. Tests

- **Plain DOM:** each side lays out on its edge; the Dialog's focus, inert, Escape and reduced-motion checks.
- **Bindings:** React, Vue and Astro render exactly the markup above (open for React and Vue, `hidden` for
  Astro).
- **Accessibility:** axe in light and dark.
- **GPU (later):** as for the Dialog.
