# Slider

Tier A. Follows the [anatomy template](../design-language.md#17-component-anatomy-template) and the
[conventions](README.md#conventions).

## 1. Purpose and native element

Picks one number from a range. Renders a native `<input type="range">`, following the WAI-ARIA
[Slider pattern](https://www.w3.org/WAI/ARIA/apg/patterns/slider/). The native element already has the
role, the value, the keys and form participation, so Strata adds no ARIA and no script.

One thumb only. A range with two thumbs has no native element and is not Tier A. The slider is horizontal.
Sizes follow the density's control height (section 13), never a separate size scale.

## 2. Object

A **rail with a puck**: a thin metal groove cut into the panel, and a round puck that sits in it.

| Part | Shape | Height at 50% | Moves |
| --- | --- | --- | --- |
| Rail | `groove`, 6 px thick (fixed rule), centred in the box, pill ends | Sunk by `elevation.well` (2) | No |
| Puck | `knob`: disc of `target.min` (24) diameter, `object.taper` inset at the top | `elevation.raised` (3) | Along the rail with the value; rises on hover, sinks while dragged |

The puck centre runs from half a puck width to half a puck width short of the other end, as the native
thumb does. The whole travel stays inside the `<input>` box.

## 3. Faces and materials

| Face | Colour role | Text role | Material role |
| --- | --- | --- | --- |
| Rail | `track` | — | `rail` (`metal`) |
| Puck | `knob` | — | `knob` (`satin`) |
| Puck shadow | Cast onto the rail | — | — |
| Rail and puck outline | `edge`, 1 px | — | None |

The rail and the puck carry `edge` outlines, so both keep 3:1 against what is around them (non-text
contrast, section 8). The slider has no text and no filled part. `data-strata-material` overrides the rail's material for one
slider. The puck keeps the `knob` role.

## 4. Elevation per state

| State | Relief | Objects | CSS |
| --- | --- | --- | --- |
| Rest | Puck at `elevation.raised` (3); rail at `elevation.well` | Puck at `elevation.raised` | Relief recipe: well on the rail, raised thumb |
| Hover | Puck `raised × state.hoverHeight`; interior `+state.hoverLift` | Puck rises by `elevation.raised × (state.hoverHeight − 1)` | Larger thumb shadow, `brightness(1.04)` |
| Pressed (`:active`, dragging) | Puck `raised × state.pressHeight`; interior `−state.pressSink` | Puck sinks to the same height | Smaller thumb shadow, `brightness(0.96)` |
| Focus-visible | Accent edge, `focus.width`, around the control box | Emissive glow on the puck | `outline: focus.width solid accent` |
| Disabled | Height 0, no bevel gain, content at 38% | Puck flattened to the rail | Flat, content `opacity: 0.38` |

Selected, invalid and busy do not apply. A required or invalid value is shown by the [Field](field.md)
around the slider, not by the slider.

## 5. Relief primitives

- One `groove` primitive: the rail, from the `<input>` border box with the rail thickness and `radius.pill`.
- One `knob` primitive: the puck. The thumb has no DOM element, so the integration derives its centre from
  `value`, `min`, `max` and the box width. This is a uniform update, not a recapture.

## 6. Tokens it reads

| Token | Prop |
| --- | --- |
| `colour.track`, `colour.knob`, `colour.edge`, `colour.accent` (focus) | — |
| `radius.pill` | — |
| `elevation.raised`, `elevation.well`, `state.*`, `interior.max`, `object.taper` | — |
| `material.roles.rail`, `material.roles.knob` | `material` |
| `density` (control height), `target.min` | — |
| `focus.width`, `focus.offset`, `motion.fast`, `motion.easing.standard` | — |
| `level` | `level` |

Native props pass through: `min`, `max`, `step`, `value`, `disabled`, `name`, `form`.

## 7. DOM structure and overlay needs

```html
<input type="range" class="ug-slider" data-strata-face="groove"
       min="0" max="100" step="1" value="40" aria-label="Volume">
```

- The `<input>` is the boundary element: React and Vue refs, `class` and `style` reach it.
- The name comes from a `<label for>` (usually a [Field](field.md)) or from `aria-label`.
- `aria-valuetext` is set only when the number alone is unclear ("40 percent", "Tuesday").
- A visible value is a separate `<output>` in the Field, not part of the slider.
- No overlay.

## 8. Keyboard and screen reader

| Key | Action |
| --- | --- |
| Right, Up | Increase by `step` (native) |
| Left, Down | Decrease by `step` (native) |
| PageUp, PageDown | Larger step, as the browser defines it (native) |
| Home, End | Minimum, maximum (native) |
| Tab, Shift+Tab | Move focus (native order) |

- Role `slider` (native), with the value, minimum and maximum from the attributes.
- `disabled` uses the native attribute, which removes the slider from the tab order.
- Pointer and touch drag are native. Strata adds no handler that changes the value.

## 9. CSS presentation

The relief recipe: a well on the rail (inverted bevel, inner shadow) and a raised round thumb with a cast
shadow, styled through `::-webkit-slider-runnable-track`, `::-webkit-slider-thumb` and the `::-moz-range-*`
pseudo-elements, with `appearance: none`. In GPU mode the CSS paints flat faces only (section 16) and the GPU
draws rail and puck. Minimum size: the density's control height, and never below `target.min` (24) in either
dimension. Under `forced-colors`: the rail is a `ButtonBorder` outline on `Canvas`, the thumb is `ButtonFace`
with a `ButtonText` outline, and focus uses `Highlight`; no shadows.

## 10. Tests

- **Plain DOM:** arrow, Page, Home and End keys change `value` by the native amounts; pointer drag sets the
  value; `input` and `change` fire as natively; disabled ignores keys and drag.
- **GPU:** at Relief and Objects, GPU stays active while dragging and on keyboard changes; the puck moves
  with the value and pixels are fresh on each change; a hit on the puck and on the rail reaches the
  `<input>`; layout and DPR changes keep GPU on.
- **Accessibility:** axe in light, dark and high contrast; accessibility snapshot equal in DOM and GPU modes
  (role, name, value, min, max); focus edge visible in decoded pixels; puck against rail at least 3:1.
- **Parity:** Relief and CSS within the P0.6 budget at rest, hover, pressed, and at minimum, middle and
  maximum value.
