# Switch

Tier A. Follows the [anatomy template](../design-language.md#17-component-anatomy-template) and the
[conventions](README.md#conventions).

## 1. Purpose and native element

Turns a setting on or off, taking effect at once. Renders a native `<input type="checkbox" role="switch">`
with a `<label>`, following the WAI-ARIA [Switch pattern](https://www.w3.org/WAI/ARIA/apg/patterns/switch/).
The element is native; `role="switch"` is the one ARIA attribute, because HTML has no switch element. A
choice that is submitted later with a form is a [Checkbox](checkbox.md).

## 2. Object

A **track** (a well) with a **spherical knob** that slides. The track's base is the input's border box.

| Part | Shape | Height at 50% | Moves |
| --- | --- | --- | --- |
| Track | Pill (`radius.pill`) sunk by `elevation.well` (2) | −`elevation.well` | No; turns `emissive` when on |
| Knob | Sphere of diameter track height − 2 · `object.taper` (14 at the default size) | `elevation.raised` (3) | Slides the track width minus the track height, over `motion.normal` |

The input's border box is `size.switchWidth` by `size.indicator`: 30 by 16, 36 by 20 (default) or 44 by 24 px for
`data-strata-size` small, medium or large (section 13), and the label row is at least `target.min` (24) high and covers the whole row, so the row is the target (WCAG 2.5.8). The
track fills the box. The knob's whole travel stays inside it, inset by `object.taper` at both ends, so the
native control covers every position of the knob (section 6, moving parts). The knob casts a shadow onto the
track.

## 3. Faces and materials

| Face | Colour role | Text role | Material role |
| --- | --- | --- | --- |
| Track, off | `track` | — | `field` (`matte`) |
| Track, on | `accent` | — | `trackOn` (`emissive`) |
| Knob, off | `knob`, with a 1.5 px `edge` ring | — | `knob` (`satin`) |
| Knob, on | `knob` (the same colour), with a 1.5 px `on-accent` ring | — | `knob` (`satin`) |
| Track outline | `edge`, 1 px | — | None |
| Label | None (sits on the panel) | `text` | None |

The track's `edge` outline keeps its shape at 3:1 against the panel. The knob keeps at least 3:1 against the
track under it in both states (section 8). The state is also shown by the knob's
position, never by colour alone. `data-strata-material` on the input overrides the track material.

## 4. Elevation per state

| State | Relief | Objects | CSS |
| --- | --- | --- | --- |
| Rest, off | Track at `−elevation.well`; knob at the start end | Knob at the start | Inset shadow, `track` fill |
| Hover | Knob height `× state.hoverHeight`; track interior `+state.hoverLift` | Knob rises a little | Larger knob shadow, `brightness(1.04)` |
| Pressed (`:active`) | Knob height `× state.pressHeight`; interior `−state.pressSink` | Knob sinks | Smaller shadow, `brightness(0.96)` |
| Focus-visible | Accent edge, `focus.width`, outside the track | Emissive glow on the track | `outline: focus.width solid accent` |
| On (`:checked`) | Track `emissive`; knob slides to the end over `motion.normal` | Track lights; knob slides | `accent` fill; knob `translateX` |
| Disabled | Track and knob at height 0, no emissive glow, content at 38% | Flattened to the face | Flat, `opacity: 0.38` |
| Invalid (`aria-invalid="true"`) | `danger` edge on the track | Same | `outline` in `danger` |

Busy does not apply; for work in progress the application disables the switch and shows a
[Spinner](spinner.md). Under `prefers-reduced-motion`, the knob jumps to the end with no slide.

## 5. Relief primitives

Two: the `<input>` is a `well` (`radius.pill`); the knob is a `knob`, drawn from a child
`<span data-strata-face="knob">`. Its position follows `:checked`; the pose lives in the GPU state and in
CSS `transform`, never in the input's box.

## 6. Tokens it reads

| Token | Prop |
| --- | --- |
| `colour.track`, `colour.accent`, `colour.knob`, `colour.edge`, `colour.text`, `colour.danger` | — |
| `radius.pill` | — (theme or scope) |
| `elevation.well`, `elevation.raised`, `object.taper`, `state.*`, `interior.max` | — |
| `material.roles.field`, `material.roles.trackOn`, `material.roles.knob` | `material` |
| `target.min` (track height), `density` (label row height), `space.*` | — |
| `font.size.body` | — |
| `focus.width`, `focus.offset`, `motion.normal`, `motion.easing.standard` | — |
| `level` | `level` |

## 7. DOM structure and overlay needs

```html
<label class="ug-switch">
  <input class="ug-switch__input" data-strata-face="well" type="checkbox" role="switch" name="wifi" />
  <span class="ug-switch__knob" data-strata-face="knob" aria-hidden="true"></span>
  <span class="ug-switch__label">Wi-Fi</span>
</label>
```

- The `<input>` is the boundary element (`appearance: none`, `size.switchWidth` by `size.indicator`). Refs and `checked` reach it.
- The wrapping `<label>` extends the hit target to the whole row, at least the density's control height.
  The knob is `pointer-events: none` and lies over the input.
- A label on the other side of the track is a `reverse` prop; the DOM order stays, so the focus and reading
  order do not change.
- No overlay.

## 8. Keyboard and screen reader

| Key | Action |
| --- | --- |
| Space | Toggle (native) |
| Tab, Shift+Tab | Move focus (native order) |

- Role `switch` (explicit), with the checked state exposed as `aria-checked` by the browser from `checked`.
  Screen readers say "on" or "off". The label must not contain "on" or "off".
- Name from the label text. Help and error through `aria-describedby` ([Field](field.md) without `label`).
- Enter does not toggle, as the native checkbox.

## 9. CSS presentation

The `well` recipe as a pill, the on-track as `accent` with a glow shadow for the `emissive` material, and
the knob as a circle with a spherical gradient and a cast shadow from the light. The input is `size.switchWidth` by
`size.indicator`; the row is at least the density's control height. Under `forced-colors`: the track has
a `ButtonBorder` border; off is `Field` with a `ButtonText` knob at the start; on is `Highlight` with a
`HighlightText` knob at the end; `GrayText` when disabled; no glow. Position and fill both show the state.

## 10. Tests

- **Plain DOM:** click on the track and on the label toggles once; Space toggles; `role` is `switch`; form
  data follows `checked`; disabled does not toggle.
- **GPU:** at Relief and Objects, GPU stays active through the slide; pixels are fresh at the end position
  and the track glows when on; a hit at the track's edge pixel and on the label reaches the input, at both
  knob positions.
- **Accessibility:** axe on on, off, disabled and invalid, in light, dark and high contrast; accessibility
  snapshot equal in DOM and GPU modes (`switch`, checked); focus ring in decoded pixels; knob contrast on both
  tracks.
- **Parity:** Relief and CSS within the P0.6 budget at rest, hover, on and focus.
