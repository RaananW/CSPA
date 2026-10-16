# Toast

Tier B. Follows the [anatomy template](../design-language.md#17-component-anatomy-template) and the
[conventions](README.md#conventions).

## 1. Purpose and native element

A brief message about something that just happened ("Message sent", "Copied"), shown in a corner of the screen for a
few seconds, with at most one action ("Undo"). Toasts are created from script with `showStrataToast` (`toast` in
React and Vue). They live in one region at the end of `<body>`, a `<section>` named "Notifications" shown in the top
layer (`popover="manual"`). The region holds a persistent `role="status"` list, so each new toast is announced
politely, without moving focus. Each toast is a [MessageBar](message-bar.md) without a role of its own. A message
that needs attention, or an answer, is a MessageBar in the page or a [Dialog](dialog.md), not a toast.

## 2. Object

A **stack of floating slabs** in the end-bottom corner, newest at the bottom, each a MessageBar at
`elevation.overlay`.

| Part | Shape | Height at 50% | Moves |
| --- | --- | --- | --- |
| Region | A column 24rem wide at most, `space.4` from the viewport's end and bottom edges | — | No |
| Toast | A MessageBar at `elevation.overlay` (16) | `elevation.overlay` | Rises into place over `motion.normal`; fades out |

## 3. Faces and materials

As [MessageBar](message-bar.md), with its intent's stripe and icon.

## 4. Elevation per state

| State | Relief | Objects | CSS |
| --- | --- | --- | --- |
| Shown | A slab at `elevation.overlay` with its cast shadow | Same | Same |
| Entering | Rises 8 px and fades in over `motion.normal` | Same | Same |

Under `prefers-reduced-motion` toasts appear and go at once.

## 5. Relief primitives

None in a GPU scene: the region is in the top layer, outside every Underglass layer, and CSS presents the toasts.

## 6. Tokens it reads

As [MessageBar](message-bar.md), and `elevation.overlay`, `space.4`, `motion.normal`.

## 7. DOM structure and overlay needs

```html
<section class="ug-toast-region" aria-label="Notifications" popover="manual">
  <div class="ug-toast-region__list" role="status">
    <div class="ug-message-bar ug-message-bar--success ug-toast" data-strata-face="raised">
      <span class="ug-message-bar__icon" aria-hidden="true"></span>
      <div class="ug-message-bar__content">
        <p class="ug-message-bar__body">Message sent.</p>
      </div>
      <div class="ug-message-bar__actions">
        <button class="ug-button" data-strata-face="raised" type="button"><span class="ug-button__label">Undo</span></button>
      </div>
      <button class="ug-message-bar__dismiss" type="button" aria-label="Dismiss"></button>
    </div>
  </div>
</section>
```

- `showStrataToast({ message, title, intent, action, duration })` creates the region on first use and returns
  `{ dismiss() }`. `intent` is `info` (default), `success`, `warning` or `danger`; `action` is `{ label, onAction }`,
  and pressing it also dismisses the toast.
- **Timing:** a toast stays 5 s (`duration`, in ms; `Infinity` keeps it until it is dismissed). The time stops while the
  pointer is over the region or focus is in it, and starts again when they leave (WCAG 2.2.1), so a user who reaches a
  toast's action has time to use it.
- At most 3 toasts are shown; a fourth dismisses the oldest.
- Every toast has a dismiss button. When the last toast goes, the region is hidden.
- No component renders a toast in place: the region is the boundary, outside every layer.

## 8. Keyboard and screen reader

| Key | Action |
| --- | --- |
| Tab, Shift+Tab | Reach a toast's action and dismiss button (the region is at the end of the page) |
| Enter, Space | Press the focused button |

- Each toast's text is announced politely as it appears, without moving focus.

## 9. CSS presentation

The region is `position: fixed` in the end-bottom corner, a column with `space.2` gaps, with no background of its own.
Toasts are MessageBars at `elevation.overlay`, entering with `@starting-style`. Under `forced-colors` they are as
MessageBars.

## 10. Tests

- **Bindings:** a toast appears in the region, in the top layer and outside the app, inside the status list; it goes by
  itself after its duration, but not while the pointer is over it; its action runs and dismisses it; its dismiss button
  dismisses it; a fourth toast dismisses the oldest.
- **GPU:** a toast over a GPU-presented panel leaves the panel on the GPU.
