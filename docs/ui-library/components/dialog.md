# Dialog

Tier B. Follows the [anatomy template](../design-language.md#17-component-anatomy-template) and the
[conventions](README.md#conventions).

## 1. Purpose and native element

A modal window that asks for an answer or a short task before the page continues. It follows the
[APG modal dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/): `role="dialog"`,
`aria-modal="true"`, a name from its title, focus moved in on open and returned to the opener on close,
Tab kept inside, and Escape to close.

A Dialog is **not** a native `<dialog>`. It is a Strata [Panel](panel.md): a `<section>` at `elevation.modal`
that is a top-level panel, so the GPU presentation can enroll it as a layer like any other panel. What
`<dialog>.showModal()` does natively, `showStrataDialog` (`@underglass/ui/dom`) does for it: the background is
made inert, focus is placed and restored, Escape asks to close. A [Drawer](drawer.md) is the same component
fixed to an edge.

## 2. Object

A **raised slab** at the highest level: the Panel's plate, at `elevation.modal`, centred over a scrim.

| Part | Shape | Height at 50% | Moves |
| --- | --- | --- | --- |
| Slab | Rounded plate with a bevel band of `bevel.width` | `elevation.modal` (24) | Enters and leaves through depth, from `elevation.modal` towards its own height ([section 12](../design-language.md#12-motion)); optionally tilted |
| Shadow | Analytic cast shadow from the light (section 7) | — | With the slab |
| Scrim | A flat dim layer over the page, behind the slab | — | Fades in and out |

The scrim is not part of the slab and carries no relief. The slab's hit geometry is its box.

## 3. Faces and materials

As [Panel](panel.md#3-faces-and-materials): `colour.panel`, `colour.text`, `matte` by default;
`data-strata-material` overrides it (a `glass` dialog becomes `matte` under `prefers-reduced-transparency`).
The scrim is `black` at 40%, in every theme.

## 4. Elevation per state

| State | Relief | Objects | CSS |
| --- | --- | --- | --- |
| Open | `elevation.modal` (24) | Slab at modal height | Relief recipe at `modal` (`data-strata-elevation="modal"`) |
| Entering, leaving | Moves through depth; inert meanwhile | Same | `ug-panel-enter` and `ug-panel-leave`; none under reduced motion |
| Focus-visible | When the panel itself holds focus (no tabbable content): accent edge, `focus.width` | Emissive glow on the slab edge | `outline: focus.width solid accent` |

Hover, pressed, disabled, selected and invalid do not apply. The controls inside own their own states.

## 5. Relief primitives

One `raised` primitive: the `<section>` itself, from its border box and `border-radius` (`radius.panel`), at
`elevation.modal`. Same budgets as [Panel](panel.md#5-relief-primitives): at most 256 primitives per panel,
this one included.

## 6. Tokens it reads

As [Panel](panel.md#6-tokens-it-reads), with `elevation.modal` in place of `elevation.floating`, and
`space.*` (gaps and the margin to the viewport), `font.size.subtitle` and `font.weight.strong` for the title.

| Prop | Meaning |
| --- | --- |
| `size`, `material`, `level` | The [Strata props](README.md#conventions) |

## 7. DOM structure and overlay needs

```html
<div class="ug-scrim" aria-hidden="true"></div>
<section class="ug-panel ug-dialog" role="dialog" aria-modal="true" aria-labelledby="discard-title"
         aria-describedby="discard-description" data-strata-face="raised" data-strata-elevation="modal"
         tabindex="-1">
  <h2 class="ug-dialog__title" id="discard-title">Discard changes?</h2>
  <div class="ug-dialog__body">
    <p class="ug-dialog__description" id="discard-description">Your edits will be lost.</p>
  </div>
  <div class="ug-dialog__actions">
    <button type="button" class="ug-button" data-strata-face="raised" data-strata-close>
      <span class="ug-button__label">Keep editing</span>
    </button>
  </div>
</section>
```

Plain HTML and Astro render both elements closed, with the `hidden` attribute:

```html
<div class="ug-scrim" aria-hidden="true" hidden></div>
<section class="ug-panel ug-dialog" role="dialog" aria-modal="true" aria-labelledby="discard-title"
         aria-describedby="discard-description" data-strata-face="raised" data-strata-elevation="modal"
         tabindex="-1" hidden>
  <h2 class="ug-dialog__title" id="discard-title">Discard changes?</h2>
  <div class="ug-dialog__body">
    <p class="ug-dialog__description" id="discard-description">Your edits will be lost.</p>
  </div>
  <div class="ug-dialog__actions">
    <button type="button" class="ug-button" data-strata-face="raised" data-strata-close>
      <span class="ug-button__label">Keep editing</span>
    </button>
  </div>
</section>
```

- **Top-level, rendered into a container.** The `<section>` and the scrim just before it are direct children
  of one container, never inside a layer or another panel. In React and Vue the `container` prop selects it
  (the page body by default) and the component renders nothing while closed. On a page with
  `@underglass/ui/gpu` the container is the Underglass root where the panel is presented as a layer; that part
  lands separately. Other floating parts (menus, popovers, tooltips) still portal to the overlay host.
- The `<section>` is the boundary element and the enrollable layer. React and Vue refs, `class` and `style`
  reach it. The body is `overflow: auto`, so a tall dialog scrolls its body and keeps its title and actions.
- `description` (React and Vue; a paragraph in plain HTML) is the first child of the body and is the
  `aria-describedby` target. `actions` is optional.
- **Plain HTML:** `data-strata-open="{id}"` on any element opens the panel with that id, and `data-strata-close`
  inside an open panel closes it (`attachStrata`). `data-strata-close-on-scrim` on the panel makes a scrim click
  close it.
- **Script:** `showStrataDialog(panel, { onClose, initialFocus, returnFocus, closeOnScrim })` returns
  `{ close() }`. `onClose(reason)` receives `"escape"`, `"scrim"` or `"close"`; without it the dialog closes
  itself. React and Vue call it from `open`.
- Stacking: a later panel and scrim in the DOM sit above an earlier pair, which is how nested dialogs stack.

## 8. Keyboard and screen reader

| Key | Action |
| --- | --- |
| Tab, Shift+Tab | Moves between the controls inside; never reaches the page behind, which is `inert` |
| Escape | Asks the topmost dialog to close; focus returns to the opener |

- Role `dialog`, `aria-modal="true"`, named by the title; `aria-describedby` when there is a description.
- On open, focus moves to `initialFocus`, else an `[autofocus]` descendant, else the first tabbable descendant,
  else the panel (`tabindex="-1"`). On close it returns to the opener, or to `returnFocus`.
- The background is made inert (every sibling of the panel and of its ancestors, up to `<body>`) with each
  prior `inert` value restored exactly. With nested dialogs only the topmost answers Escape, and closing it
  restores the previous layer.
- A click on the scrim closes the dialog only with `closeOnScrim`, as a native `<dialog>` does not.
- The panel is inert while it enters or leaves, so nothing inside takes input mid-motion.

## 9. CSS presentation

Fixed, centred without a transform (so an enrolled boundary never carries one): `inset: 0; margin: auto`,
`width: min(32rem, 100vw - 2 × space.5)`, `max-height: 100dvh - 2 × space.5`, a flex column with the
title, a scrolling body and the actions, right-aligned. Padding follows the Panel's density. The scrim fades
with a CSS opacity transition, and has none under `prefers-reduced-motion: reduce`, where entering and leaving
are instant too. Under `forced-colors`: `Canvas` background and a `CanvasText` border, no shadow.

## 10. Tests

- **Plain DOM:** opening moves focus inside; Tab and Shift+Tab never land on the background, which is inert;
  Escape closes and focus returns to the opener; with nested dialogs Escape closes only the top one;
  `closeOnScrim` on and off; instant under reduced motion.
- **Bindings:** React, Vue and Astro render exactly the markup above (open for React and Vue, `hidden` for
  Astro).
- **Accessibility:** axe in light and dark; the accessibility snapshot of an open Dialog equals that of a native
  `<dialog>` opened with `showModal()` and the same content.
- **GPU (later):** the panel is one enrolled layer and stays on through open, close and content changes; a hit
  inside the box reaches the native child.
