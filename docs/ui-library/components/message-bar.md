# MessageBar

Tier B. Follows the [anatomy template](../design-language.md#17-component-anatomy-template) and the
[conventions](README.md#conventions).

## 1. Purpose and native element

Tells the user something about the page or a section in place: information, a success, a warning or an error,
with optional actions. Renders a `<div>` with `role="status"` (information and success, announced politely) or
`role="alert"` (warnings and errors, announced at once), following the WAI-ARIA
[Alert pattern](https://www.w3.org/WAI/ARIA/apg/patterns/alert/). Its actions and its dismiss button are native
`<button>`s. A message that comes and goes on its own is a Toast; one that needs an answer is a [Dialog](dialog.md).

## 2. Object

A **raised slab** with a coloured **stripe** along its start edge, in the message's intent. It stands on the
surface like a [Card](card.md); it has no moving parts.

| Part | Shape | Height at 50% | Moves |
| --- | --- | --- | --- |
| Slab | Rounded plate, `radius.control` | `elevation.raised` (3) | No |
| Stripe | 4 px along the start edge, inside the slab | Flat (captured content) | No |
| Icon | A 20 px glyph in the intent colour | Flat | No |
| Dismiss button | A 24 px round button with a cross, at the end | Flat | No |

## 3. Faces and materials

| Face | Colour role | Text role | Material role |
| --- | --- | --- | --- |
| Slab | `secondary` | `text` | `control` (`matte`) |
| Stripe and icon | `info`, `success`, `warning` or `danger` | — | None |
| Title | None | `text`, strong | None |

The intent is shown by the stripe, the icon's shape (i, a check, ! or ×) and the role, never by colour alone.
`data-strata-material` on the bar overrides the slab's material.

## 4. Elevation per state

| State | Relief | Objects | CSS |
| --- | --- | --- | --- |
| Rest | Slab at `elevation.raised` | Slab at raised height | Relief recipe at `raised` |
| Dismiss button hover, focus-visible | A 10% `text` tint; `outline: focus.width solid accent` | Same | Same |

The slab takes no other state; its actions are [Buttons](button.md) with their own.

## 5. Relief primitives

One `raised` primitive: the bar, from its border box. Actions inside it that are Buttons add their own keys.

## 6. Tokens it reads

| Token | Prop |
| --- | --- |
| `colour.secondary`, `colour.text`, `colour.info`, `colour.success`, `colour.warning`, `colour.danger` | — |
| `radius.control`, `space.*`, `font.size.body` | `size` |
| `elevation.raised`, `bevel.*`, `shadow.*` | — |
| `material.roles.control` | `material` |
| `focus.width` | — |
| `level` | `level` |

## 7. DOM structure and overlay needs

```html
<div class="ug-message-bar ug-message-bar--warning" data-strata-face="raised" role="alert">
  <span class="ug-message-bar__icon" aria-hidden="true"></span>
  <div class="ug-message-bar__content">
    <p class="ug-message-bar__title">Storage almost full</p>
    <p class="ug-message-bar__body">You have used 95% of your space.</p>
  </div>
  <div class="ug-message-bar__actions">
    <button class="ug-button" data-strata-face="raised" type="button"><span class="ug-button__label">Upgrade</span></button>
  </div>
  <button class="ug-message-bar__dismiss" type="button" aria-label="Dismiss"></button>
</div>
```

- The bar is the boundary element: refs, `class` and `style` reach it. The intent is the class
  `ug-message-bar--info` (default), `--success`, `--warning` or `--danger`.
- **Role:** `status` for `info` and `success`, `alert` for `warning` and `danger`. Render the bar when the message
  appears, so that it is announced; a bar present when the page loads is read in the page's order.
- The title and the actions are optional; so is the dismiss button. Dismissing removes the bar: the application
  does it, and the bar reports the request.
- **Plain HTML:** a click on the dismiss button dispatches a bubbling `strata-dismiss` event from the bar
  (`attachStrata`). **React and Vue:** `<MessageBar intent title actions onDismiss>` (Vue: an `actions` slot and a
  `dismiss` listener); `dismissLabel` changes the dismiss button's name. **Astro:** `intent`, `title`, an `actions`
  slot and `dismissible`.
- No overlay.

## 8. Keyboard and screen reader

| Key | Action |
| --- | --- |
| Tab, Shift+Tab | Move between the actions and the dismiss button (native order) |
| Enter, Space | Press the focused button (native) |

- The bar does not take focus: a live region announces its text when it appears, without moving the user.

## 9. CSS presentation

A flex row with the `raised` recipe, `secondary` background, `space.4` padding and a 4 px intent stripe: the start
border. The icon is a mask in the intent colour. The dismiss button is a round button
with a cross, as on a Chip. Under `forced-colors` the bar has a `CanvasText` border and the stripe is
`CanvasText`.

## 10. Tests

- **Plain DOM and bindings:** React, Vue and Astro render exactly the markup above; the role follows the intent;
  the dismiss button is named and reports the request (click and Enter); actions are ordinary buttons; axe in light
  and dark for every intent.
- **GPU:** at Relief and Objects the bar is one raised slab (a slab at Objects) and its action a key; a real click
  on the action through the GPU reaches it, with GPU on.
