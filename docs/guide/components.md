# Building components for Underglass

This is the standard for components, your own or a library's, that should work
inside a Underglass app. The goal: **the component is ordinary React DOM first**, and
GPU presentation is an optional layer on top that never changes how it behaves.

A component that follows these rules works three ways without changes: in a plain
React app, in a Underglass app in ordinary DOM mode, and in GPU mode.

## The rules

### 1. Plain DOM first, no clones

- Render real elements, keep state in React, and use native controls.
- Never render a second "display copy" of an interactive element for the GPU to
  draw. Underglass draws the original element, and the original receives the input.
- Do not read layout to fake positions (for example, absolutely positioning a
  duplicate where you think the GPU drew something).

### 2. Expose one boundary element

A layer is one element. A component offers its root element as that boundary in
one of two ways:

- **App-owned layers (recommended for libraries).** Forward a `ref` to your root
  element and accept `className` and `style`. The app decides whether to enroll it:

  ```tsx
  export const Card = forwardRef<HTMLElement, CardProps>(function Card({ title, children, ...rest }, ref) {
    return <article ref={ref} className="card" {...rest}><h3>{title}</h3>{children}</article>;
  });

  // In a Underglass app:
  const ref = useSurfaceRef<HTMLElement>({ id: "welcome-card", origin: "center" });
  <Card ref={ref} title="Welcome" />;
  ```

  Enrolled elements must be **direct children of the Underglass root**, so render the
  card at the top level of the app tree, positioned absolutely by its own CSS.

- **Component-owned layers.** An app-level component can render `<Surface>`
  directly, with typed `layout` and `appearance` (they compile to CSS, so the
  component still has a DOM fallback).

Do not nest layers. A layer inside another layer falls back to DOM.

### 3. Leave the boundary's transform to Underglass

The boundary's `transform`, `translate`, `rotate`, `scale`, `opacity` and
`transform-origin` belong to the runtime in GPU mode.

- Do not animate them with CSS or `element.animate()` on the boundary itself. Use
  `transition`, `Presence` or `createMotion`, or hand an existing animation over
  with `ownAnimation` / `ownCSSAnimation` (see [Motion](motion.md)).
- **Inside** the boundary anything goes: CSS transitions, keyframe animations and
  hover effects on descendants are repainted and recaptured automatically.
- No `z-index` on the boundary; layers paint in DOM order.

### 4. Keep everything inside the box

A layer is captured at its own size. Anything painted outside the boundary is cut
off: box shadows, outlines, glows, or content overflowing with `overflow: visible`.

- Put shadows on an inner element and give the boundary enough padding, or use
  borders instead.
- Let content scroll (`overflow: auto`, or `<NativeScroll>`) or clip it, rather
  than letting it spill out. Visible overflow falls back to DOM.
- Rotated layers must not sit inside a clipping ancestor, and must not clip their
  own overflowing content (hit testing on a rotated clip is not exact in Chrome).
  Rotate layers that are children of the root and have no hidden overflow.

### 5. Send dialogs, popovers and menus to the overlay host

`<dialog>`, `popover`, and `contenteditable` regions inside a layer need ordinary
DOM. Render them through the adapter's overlay instead:

- `<NativeOverlay>{children}</NativeOverlay>` portals into the overlay host.
- Fluent UI v9: wrap the app in `<PortalMountNodeProvider value={useNativeOverlayHost()}>`
  (no DOM of its own). Every Fluent portal then mounts in the overlay host with its
  theme. `FluentProvider` renders a `<div>`, so put one inside each layer rather than
  around the layers. The showcase's `fluent.tsx` does both.
- For libraries with a portal `container` prop (Radix, Headless UI, MUI), pass
  `useNativeOverlayHost()`:

  ```tsx
  const overlay = useNativeOverlayHost();
  <Dialog.Portal container={overlay}>...</Dialog.Portal>
  ```

Text inputs and textareas are fine inside layers: editing, caret, selection and IME
composition stay native.

### 6. Separate decoration from interaction

Continuous shader effects only run on **decorative** layers: `inert`, `aria-hidden`,
with no buttons, links, inputs or focusable elements. If your component has artwork
worth animating with effects, render it as a sibling decorative element the app can
enroll with `decorative: true`, next to the interactive part. Do not mark
interactive content `aria-hidden` to make it eligible.

An interactive layer can carry a **transition effect** (`interaction: "inert"`) while
it enters, leaves or lands: its content is inert for that time, then interactive again
(see [Effects](effects.md#transition-effects-on-interactive-layers)). Keep the layer's
boundary element itself non-interactive (a wrapper, not a `<button>`).

### 7. Accessibility is the DOM's

GPU mode keeps the original elements in the accessibility tree; the output canvas
is not `aria-hidden`. Label controls, keep focus order sensible and respect
`prefers-reduced-motion` in your own CSS. Underglass already respects it for its own
motion and effects.

## Checklist before you ship a component

- [ ] Works in a plain React app with no Underglass.
- [ ] Root element accepts a `ref` (or the component renders a `Surface`).
- [ ] No transform or opacity animation on the root itself; descendants are free.
- [ ] No shadow, outline or content painted outside the root's box.
- [ ] Dialogs, popovers and menus accept a portal container.
- [ ] Decorative artwork is separable from controls.
- [ ] In the showcase or playground: enable GPU, use every control, move or rotate
      the layer, and check that clicks land and `controller.state().mode` stays
      `"gpu"`. If it drops to DOM, the `reason` names the rule (see
      [Troubleshooting](troubleshooting.md)).

## Example in the repository

The task app in `examples/playground/src/apps/todo` is an ordinary React component
(forms, list, detail view, dialog) reused unchanged by the showcase. Only its
decorative poster carries an effect. The showcase's `deck.tsx`, `notices.tsx` and
`pond.tsx` show `Surface`, `Presence`, `origin` and decorative layers in practice.
