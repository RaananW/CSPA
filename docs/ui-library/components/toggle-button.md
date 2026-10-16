# ToggleButton

Tier A. Follows the [anatomy template](../design-language.md#17-component-anatomy-template) and the
[conventions](README.md#conventions).

## 1. Purpose and native element

A button with two states, on and off, such as bold or mute. Renders a native `<button type="button">` with
`aria-pressed`, following the WAI-ARIA [Button pattern](https://www.w3.org/WAI/ARIA/apg/patterns/button/)
(toggle button). The label does not change when the state changes. For a setting that is saved on submit, use
[Switch](switch.md) or [Checkbox](checkbox.md). As [Button](button.md), except where this page says otherwise.

Variants: `secondary` (default) and `accent`. An icon-only toggle carries an `aria-label` and has the same
square shape as [IconButton](icon-button.md).

## 2. Object

A **latching key**: the [Button](button.md) key that stays down while on.

| Part | Shape | Height at 50% | Moves |
| --- | --- | --- | --- |
| Key body | As Button | `object.keyHeight` (8) | Off: rest. On: held down by `object.keyTravel` (6) |
| Key top | Captured face, screen-locked | — | With the body |

Pressing an off key travels down and stays. Pressing an on key travels down and returns to rest.

## 3. Faces and materials

| Face | Colour role | Text role | Material role |
| --- | --- | --- | --- |
| Key top, off | `secondary` | `text` | `control` |
| Key top, on, `secondary` | `secondary` tinted 16% towards `accent`, with a 3 px `accent` strip along the bottom | `text` | `control`; strip `indicator` (`emissive`) |
| Key top, on, `accent` | `accent` | `on-accent` | `buttonPrimary` |

The on state has three cues, none of them colour alone: the key is held down, its face is tinted, and the strip
is a shape (the lower edge of the top, inside the box) at 3:1 against the face. Screen readers get
`aria-pressed`.

## 4. Elevation per state

| State | Relief | Objects | CSS |
| --- | --- | --- | --- |
| Rest, off | `elevation.raised` (3) | Key at `keyHeight` | Relief recipe at `raised` |
| Rest, on | `raised × state.pressHeight`; interior `−state.pressSink` | Key held at `keyTravel` | Smaller shadow, `brightness(0.96)` |
| Hover | Off: as Button. On: `pressHeight × state.hoverHeight` | Key rises `keyHeight / 4` from its position | Shadow step, `brightness(1.04)` |
| Pressed (`:active`) | `raised × state.pressHeight` | Key travels `keyTravel` | Smaller shadow |
| Focus-visible | Accent edge, `focus.width` | Emissive glow | `outline: focus.width solid accent` |
| Selected | The "on" rows above (`aria-pressed="true"`) | — | — |
| Disabled | Height 0, content at 38%, state kept | Key flattened | Flat, content `opacity: 0.38` |

Invalid and busy do not apply.

## 5. Relief primitives

One `raised` primitive: the `<button>`. The on-state strip is part of the same face, not a second primitive.

## 6. Tokens it reads

As [Button](button.md#6-tokens-it-reads), plus:

| Token | Prop |
| --- | --- |
| `colour.accent`, `colour.secondary` | `variant` |
| `state.pressHeight`, `state.pressSink`, `state.hoverHeight` | — |
| `material.roles.indicator` | — |
| — | `pressed`, `defaultPressed` (controlled or not) |

## 7. DOM structure and overlay needs

```html
<button type="button" class="ug-toggle-button" data-strata-face="raised" aria-pressed="false">
  <span class="ug-toggle-button__label">Bold</span>
</button>
```

- The `<button>` is the boundary element. The binding keeps `aria-pressed` and the state in step.
- No overlay.

## 8. Keyboard and screen reader

| Key | Action |
| --- | --- |
| Enter, Space | Toggle (native) |
| Tab, Shift+Tab | Move focus |

- Role `button` with `aria-pressed` `true` or `false`. A screen reader announces "toggle button, pressed".
- Never `aria-pressed="mixed"` in Tier A.
- The label stays the same in both states.

## 9. CSS presentation

As [Button](button.md#9-css-presentation), with the held-down recipe selected by `[aria-pressed="true"]`.
Minimum size as Button, never below `target.min` (24). Under `forced-colors`: off uses `ButtonFace` and
`ButtonText`; on uses `Highlight` and `HighlightText`, so the state is visible without shadows.

## 10. Tests

- **Plain DOM:** each activation flips `aria-pressed` once; disabled does not toggle; the state survives a
  re-render.
- **GPU:** GPU stays active through toggling on and off; pixels are fresh after each; the held-down key
  matches `aria-pressed`; a native hit at the key's edge pixel reaches the `<button>`.
- **Accessibility:** axe in light, dark and high contrast, in both states; the on state is distinguishable
  without colour; accessibility snapshot equal in DOM and GPU modes.
- **Parity:** Relief and CSS within the P0.6 budget in both states.
