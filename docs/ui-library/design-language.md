# Strata design language

**Status:** draft for review (2026-10-15). The [plan](plan.md) defines the scope. The
[Phase 0 report](phase0.md) proves what is technically possible, and the
[prototypes](prototypes.md) settled the look. This document defines the language: its rules,
its tokens with their defaults and allowed ranges, and how each presentation renders them. The
machine-readable tokens are in [`strata.tokens.json`](../../packages/ui/src/tokens/strata.tokens.json), in the
`@underglass/ui` package.

Strata is **configurable by design**. Almost every value below is a token that an application,
a part of a page or a visitor's preference may change, within validated ranges. A short list of
[invariants](#invariants) protects what makes the language usable and recognisable: one light
per application, exact native hits, readable contrast and a visible focus. They are validated,
never silently relaxed.

## Contents

1. [Principles](#1-principles)
2. [Space](#2-space)
3. [Light](#3-light)
4. [Materials](#4-materials)
5. [Shape](#5-shape)
6. [Objects](#6-objects)
7. [Elevation and shadow](#7-elevation-and-shadow)
8. [Colour](#8-colour)
9. [Typography](#9-typography)
10. [Iconography](#10-iconography)
11. [Interaction states](#11-interaction-states)
12. [Motion](#12-motion)
13. [Layout and density](#13-layout-and-density)
14. [Accessibility](#14-accessibility)
15. [Theming and configuration](#15-theming-and-configuration)
16. [Presentation levels and adjust policy](#16-presentation-levels-and-adjust-policy)
17. [Component anatomy template](#17-component-anatomy-template)
18. [Distribution and frameworks](#18-distribution-and-frameworks)

Units: lengths are CSS pixels. Angles are degrees. Colours are sRGB 0–255 unless a section says
linear. "At 50%" means at the default depth.

## 1. Principles

Each principle is a rule a reviewer can check.

1. **Design in 3D, project down.** Every control is first a 3D object (section 6). Relief, Objects
   and CSS are projections of that object, never separate designs.
2. **Flat faces carry input.** An interactive surface is a flat face, parallel to the panel it sits
   on. Text sits on faces and is never extruded, curved or shaded below its contrast minimum.
3. **The native control is the object's footprint.** Every drawn pixel of a control's object lies
   inside its native element's box. Meshes are decoration driven by native state, never the reverse.
4. **One light per application.** All panels, components and levels in an application share one
   key light. Its direction is configurable per application, never per component.
5. **States are physical.** Hover lifts, press sinks, focus lights an edge, disabled flattens.
   State changes move light, height or pose; they never move a control's hit area.
6. **Space moves, controls do not.** Panels may travel and tilt through depth. Controls stay where
   the layout put them.
7. **Configurable, validated, never silently changed.** Every token may be configured within its
   range. Values that break an invariant are reported, and are never quietly altered or applied.

## 2. Space

**World units are CSS pixels.** The panel plane is z = 0. Heights are measured towards the viewer.

**Camera.** There is one perspective camera per stage, centred on the stage, at distance `D` from
the panel plane, and with a vertical field of view that maps z = 0 one-to-one onto CSS pixels:
`fov = 2 · atan(stageHeight / 2 / D)`.
- **Default distance:** `D` is derived, not fixed: `D = max(1600, r · h_max / taper + h_max)`, where
  `r` is the stage half-diagonal and `h_max` is the tallest object height in use. This keeps the
  [taper rule](#6-objects) satisfied on any screen size.
- **Configuring it:** `camera.distance` may be set explicitly, and validation raises it if needed.

**Elevation scale.** Each surface sits on one of five levels. The heights at 50% depth:

| Level | Token | Height at 50% | Used by |
| --- | --- | --- | --- |
| Ground | `elevation.ground` | 0 | Page background, wells |
| Raised | `elevation.raised` | 3 | Controls and cards on a panel |
| Floating | `elevation.floating` | 10 | Panels, toolbars |
| Overlay | `elevation.overlay` | 16 | Menus, popovers, tooltips |
| Modal | `elevation.modal` | 24 | Dialogs, drawers |

**Depth scaling.** Heights scale with depth through `depthScale(depth)`, which is piecewise linear:
0.6 at 0%, 1.0 at 50% and 1.6 at 100%. **Configuring them:** an application may override any
level's height, but the order of the levels is an invariant: ground < raised < floating <
overlay < modal.

**Panel tilt.** Panels may tilt at rest or in motion, up to `camera.tiltMax`, which defaults to 25° and
may be set from 0° to 60°. P0.1 proved exact native hits through perspective up to 55°.

## 3. Light

| Token | Default | Range | Meaning |
| --- | --- | --- | --- |
| `light.azimuth` | 323 | 0–359 | Where the light comes from, clockwise from the top of the screen. 323 = top left. |
| `light.elevation` | 41 | 20–80 | Height of the light above the panel plane |
| `light.intensity` | 1.6 | 0.5–3 | Key light strength (Objects level) |
| `light.ambient` | 0.55 | 0.2–1 | Fill light strength (Objects level) |
| `light.colour` | (255, 255, 255) | any | Key light colour (Objects level) |

- **Direction towards the light** in panel axes (x right, y down, z towards the viewer):
  `(sin a · cos e, −cos a · cos e, sin e)`, where `a` is the azimuth and `e` the elevation.
- **Themes:** a theme changes light intensity and colour, never direction.
- **Invariant, one light per application:** `light.*` is set at the application level only.
  Subtree scopes and components cannot override it.

## 4. Materials

Materials are **open**. A material is a named recipe of layers. Strata ships presets, an
application defines its own in the theme, and every presentation renders the same recipe with what
it can do. Materials are assigned by role (section 8), by scope or per component; components never
hard-code material values.

### Material layers

| Layer | Parameters (range) | Objects (Babylon Lite PBR) | Relief (material pass) | CSS |
| --- | --- | --- | --- | --- |
| `base` | colour role; `roughness` 0–1; `metallic` 0–1 | Base colour, roughness, metallic | Bevel lighting plus a specular lobe whose width follows roughness | Face colour; low roughness adds a highlight gradient |
| `coat` | `strength` 0–1; `roughness` 0–1; `ior` 1.3–1.8 | Clear coat (`setPbrClearCoat`), reflecting the environment on edges and sides, plus the [finish zones](#finish-zones) on key tops | A sharp highlight and a Fresnel rim on the bevels, plus the finish zones | An inset top highlight, an edge rim and the finish zones as a gradient |
| `sheen` | `colour`; `strength` 0–1; `roughness` 0–1 | Sheen (`setPbrSheen`) | A soft brightening at grazing bevel angles | A soft inner glow |
| `iridescence` | `strength` 0–1; `thickness` 100–1200 nm | Iridescence (`setPbrIridescence`) | A subtle hue shift on the bevels | Not rendered (the other layers still are) |
| `transmission` | `strength` 0–1; `ior` 1–2.4; `tint` colour role; `frost` 0–1 | Transmission and refraction (`setPbrTransmission`) | A frosted tint over the panel; refraction of decorative backdrops through the Underglass effect path | `backdrop-filter: blur()` plus tint |
| `emissive` | `colour` role; `strength` 0–4 | Emissive colour | An additive glow, not lit | A solid colour and a glow shadow |

### Presets

| Preset | Recipe | Feel |
| --- | --- | --- |
| `matte` (default) | base roughness from depth (0.8 → 0.45 → 0.3), metallic 0 | Plain painted surface |
| `satin` | base roughness 0.4; coat 0.3 at roughness 0.35 | Soft sheen |
| `gloss` | base roughness 0.25; coat 0.6 at roughness 0.12 | Shiny plastic |
| `lacquer` | base roughness 0.45; coat 1.0 at roughness 0.04, ior 1.5 | Glass-coated: a clear, glossy top layer |
| `glass` | transmission 0.9, ior 1.5, frost 0.3, tint from the role; base roughness 0.05 | Translucent glass |
| `metal` | metallic 1, roughness 0.3 | Brushed metal |
| `emissive` | emissive from the role colour, strength 1 | Light source: indicators, active tracks |

### Defining and assigning materials

- **Custom materials** are any combination of layers, defined in the theme. Each layer
  parameter is a token, so a custom material can blend with depth like any other token.

  ```ts
  createStrataTheme({
    materials: { candy: { base: { roughness: 0.2 }, coat: { strength: 1, roughness: 0.05 } } },
    roles: { buttonPrimary: "candy" },
  });
  // Per subtree or component: <StrataScope material="lacquer">, <Button material="candy">,
  // data-strata-material="candy" in plain HTML.
  ```

- **Material roles** and their defaults:

  | Role | Default |
  | --- | --- |
  | `panel` | `matte` |
  | `control` | `matte` |
  | `buttonPrimary` | `matte` |
  | `field` | `matte` |
  | `knob` | `satin` |
  | `rail` | `metal` |
  | `trackOn` | `emissive` |
  | `indicator` | `emissive` |
  | `overlay` | `matte` (`glass` is a common choice) |

- **Custom shading.** For looks the layers cannot express, a material may carry custom code:
  - **Relief:** a trusted WGSL colour function, with the same contract as Underglass's
    `defineEffect`. It receives the sampled colour, local position, surface normal, light
    direction and up to four parameters, and returns a colour. It never moves pixels.
  - **Objects:** a Babylon Lite shader or node material.
  - **CSS:** a custom material declares a CSS fallback, or inherits the nearest preset.
  - **Trust:** custom code is trusted application code, never built from user input.

### Finish zones

A material must read at a glance, yet face interiors carry labels whose contrast is protected
(`interior.max`). A centred single-line label sits between 35% and 65% of a raised control's
face height. Finishes therefore work at full strength in the zones labels never reach. Every
presentation renders them from one profile:

| Zone | Height | Coat | Base gloss | Metal |
| --- | --- | --- | --- | --- |
| Top | 0–32% | Reflection band (3–26%), peak `coat × 0.6`, crisper as `coat.roughness` falls, with a dark horizon line (24–32%, `coat × 0.16`) | Sheen fading from the top, `max(0, 0.5 − roughness) × 0.8` | Bright half, `metallic × 0.4` |
| Bottom | 70–100% | — | — | Dark half, `metallic × 0.36` |

- **Relief:** the material pass applies the profile on raised controls.
- **Objects:** a shader-material overlay on each key top applies the same profile over the
  captured label, alongside the real reflections of the environment on the key's sides and edges.
- **CSS:** the profile is sampled into a `background-image` gradient.
- **Contrast rule:** the finish zones are the one place a face may change beyond `interior.max`.
  A component whose text can reach a zone (multi-line, top-aligned or bottom-aligned labels) turns
  that zone off, and its anatomy tests check that text boxes stay clear of the active zones.

### Environment

Reflections (metal, gloss, coat, glass) need an environment.

| Token | Default | Options |
| --- | --- | --- |
| `environment.source` | `studio` | `studio` (a neutral studio generated in code, no asset: mostly dark, with a key softbox matching the key light, a fill opposite it and a strip overhead), `none`, or the URL of an `.hdr` or `.env` file |
| `environment.intensity` | 1 | 0–3 |

### Guardrails

- **Contrast holds.** Highlights, coats and custom shading reach full strength on bevels, edges,
  mesh sides and knobs. On face interiors, where text may sit, the material pass limits any
  brightness change to `interior.max`, whatever the material or custom code, so the contrast
  invariant (section 8) holds. The [finish zones](#finish-zones) are the only exception, and only
  where text stays clear of them.
- **Colour only.** A material may change colour; it never moves pixels or hit areas.
- **Preferences:**
  - `prefers-reduced-transparency`: `glass` becomes `matte`, and transmission is off.
  - `prefers-contrast: more`: coat, sheen and iridescence are off.
  - `forced-colors`: everything is flat.

## 5. Shape

| Token | Default | Range | Used by |
| --- | --- | --- | --- |
| `radius.small` | 4 | 0–12 | Chips, checkboxes |
| `radius.control` | 8 | 0–20 | Buttons, fields |
| `radius.panel` | 14 | 0–32 | Panels, cards, dialogs |
| `radius.pill` | 999 | — | Switch tracks, badges |
| `bevel.width` | 6 at 50% | 2–12 | Width of the bevel band at the edge of a raised face |
| `bevel.profile` | quarter-round | quarter-round, chamfer, cove | Shape of the bevel's cross-section |

- **Wells** are inset shapes for fields, tracks and checkboxes. They use the same bevel profile
  with the normal inverted, so the edge nearest the light is dark.
- **The bevel profile is one of the language's recognisable marks.** It is configurable, but an
  application uses one profile everywhere.

## 6. Objects

Each control has a canonical 3D object. Relief draws it head-on as lit faces, Objects draws its
mesh, and CSS draws its relief recipe. Anatomy pages define each component's object
(section 17).

**The footprint rule.** The native element's border box is the object's **base**.

**The taper rule.** Under perspective, a point at height `h` shifts on screen by
`drift = r · h / (D − h)`, where `r` is its distance from the vanishing point. Every raised part's
top is inset from its base by `taper ≥ drift(h)`, so every drawn pixel of the object stays inside
the native control (P0.4).
- **Validation:** if a configuration breaks the rule, validation raises `camera.distance` first,
  then `taper`, and reports what it changed.
- **Moving parts:** parts that must rise or move further (levers, knobs, thumbs) stay inside a
  native control whose box covers their whole travel.

**Screen-locked tops.** Raised parts that carry captured content (key tops with labels, field bezels) are
built with each point at height `h` pre-scaled towards the vanishing point by `(D − h) / D`. They then
project exactly onto the native control's pixels: labels map one texel to one pixel, with no resampling
blur, and their drift is zero. The sides between base and top still show the object's depth. The taper rule
remains for parts that are not screen-locked.

| Token | 0% | 50% | 100% | Range |
| --- | --- | --- | --- | --- |
| `object.keyHeight` | 4 | 8 | 12 | 0–24 |
| `object.keyTravel` | 3 | 6 | 9 | 0–keyHeight |
| `object.taper` | 2 | 3 | 4 | ≥ drift |
| `material.matte.base.roughness` | 0.8 | 0.45 | 0.3 | 0–1 |

**Object vocabulary:**

| Control | Object | Moving part |
| --- | --- | --- |
| Button | Rounded tapered key; the captured label is on its top | Travels `keyTravel` on press |
| Text field, text area | Bezel ring just inside the field; the text sits on the face | None |
| Switch | Rounded track (`well`), spherical knob | Knob slides; the track turns `emissive` when on |
| Toggle button | A key that latches down | Holds at `keyTravel` while pressed on |
| Button group | Keys on one raised plinth | The keys, as Button |
| Select | A key with a flat chevron on its top | Travels as Button |
| Checkbox | Small well, with a raised mark when checked | Mark rises |
| Radio | Round well, with a knob when checked | Knob rises |
| Slider | Rail (`metal`) with a puck | Puck follows the value |
| Progress, spinner | Groove (a ring for the spinner) with an `emissive` fill or arc | Fill advances, arc turns |
| Card, panel | Raised slab | None (a panel may move through depth) |
| Link, badge, divider | None: flat text, a flat pill, a groove | None |

## 7. Elevation and shadow

A surface's shadow follows from the light and its height. No component chooses its own shadow.

- **Offset:** `−light.xy / light.z · h`.
- **Softness:** the shadow grows over `2 · h + 1` px (GPU), and the CSS blur is `1.9 · h + 1`.
- **Strength:** `shadow.strength` is 0.32 at 50%, and runs 0.18 → 0.32 → 0.42 across depth. Range
  0–0.8.
- **Hover and press:** hover multiplies a raised part's height by `state.hoverHeight` (1.6). Press
  multiplies it by `state.pressHeight` (0.25).
- **Outside the box:** shadows may fall outside a panel's box (the GPU outset, P0.5). They never
  receive hits.
- **Analytic, everywhere.** Every caster in the language is a rounded footprint or a circle, so every
  presentation draws shadows from this one formula: the Relief pass, a shader quad per caster at the Objects
  level, and `box-shadow` in CSS. Shadow maps are reserved for free-form meshes at the Scene level; at the
  Objects level their resolution, depth bias and fitted bounds cut and detach the shadow of a thin panel.

## 8. Colour

Colours are roles, defined per theme. Every role is configurable, and an application may add
themes beyond light and dark.

| Role | Light | Dark | Use |
| --- | --- | --- | --- |
| `stage` | 255, 255, 255 | 24, 26, 31 | Page background |
| `panel` | 233, 235, 239 | 44, 48, 56 | Panel faces |
| `field` | 255, 255, 255 | 30, 33, 40 | Field and well interiors |
| `secondary` | 247, 248, 250 | 62, 67, 78 | Secondary controls |
| `text` | 28, 30, 36 | 232, 234, 240 | Body text (13.96:1 and 11.00:1 on the panel) |
| `muted` | 90, 94, 104 | 168, 174, 186 | Secondary text (5.44:1 and 5.94:1 on the panel) |
| `accent` | 37, 99, 235 | 96, 145, 255 | Primary actions, selection, focus |
| `success` | 21, 128, 61 | 74, 196, 120 | Positive status |
| `warning` | 180, 83, 9 | 245, 166, 60 | Caution |
| `danger` | 196, 43, 43 | 255, 120, 120 | Destructive actions, errors |
| `info` | = `accent` | = `accent` | Information |
| `track` | 205, 209, 217 | 52, 56, 66 | Unfilled tracks |
| `knob` | 252, 252, 253 | 236, 238, 242 | Knobs and thumbs |
| `edge` | 118, 124, 136 | 132, 139, 154 | Boundaries of wells, tracks and knobs |

- **High-contrast themes:** `contrast` and `contrast-dark` take over from light and dark under
  `prefers-contrast: more`, or when set explicitly. Surfaces (`stage`, `panel`, `field`, `secondary`,
  `track`, `knob`) are white or black, text and `edge` are the opposite, and the bevel gain is 0.

  | Role | `contrast` | `contrast-dark` |
  | --- | --- | --- |
  | `muted` | 46, 49, 56 | 215, 218, 224 |
  | `accent`, `info` | 0, 64, 192 | 140, 180, 255 |
  | `success` | 0, 100, 40 | 110, 220, 150 |
  | `warning` | 138, 60, 0 | 255, 190, 90 |
  | `danger` | 168, 20, 20 | 255, 150, 150 |

- **Text on role colours** (`on-accent`, `on-success` and so on) is derived: white or near-black
  (16, 18, 22), whichever contrasts more.
- **Lit contrast:** with the defaults, every role keeps at least 4.7:1 with its text at the
  brightest lit state.
- **Non-text contrast (WCAG 1.4.11):** a control's shape and state never rest on fills that are close to
  the panel (`field`, `track`).
  - **Boundaries:** wells, tracks and unchecked marks carry a 1 px `edge` outline, at least 3:1 against the
    lit panel and against fields.
  - **Fills:** an `accent` fill (progress, slider, switch on) is at least 3:1 against the unfilled `track`.
  - **Knobs:** a knob is at least 3:1 against the track under it, or carries an `edge` ring. A knob on an
    `accent` fill takes the `on-accent` colour.
  - **Not by colour alone:** state is also shown by position or shape (knob position, check mark).
- **Invariant, contrast on lit faces:** text against its face is at least 4.5:1, and large text and
  non-text indicators at least 3:1. This is measured on the **lit** face at the largest interior
  brightening and darkening (`interior.max`, 4%), not only at rest. Disabled controls are exempt,
  as in WCAG 1.4.3.

## 9. Typography

Text lives on faces. Strata never lights, extrudes or tilts text at rest; tilted panels carry
their text with them.

- **Anti-aliasing:** text drawn by the GPU presentations comes from the browser's HTML-in-Canvas capture, which uses
  greyscale anti-aliasing. The CSS presentation uses the platform's (often LCD subpixel on Windows), which looks
  slightly sharper. This is a browser capture property, not a Strata setting.
- **One texel per pixel:** captured text is never resampled at rest: panels map 1:1, and raised tops are
  screen-locked (section 6).

| Token | Default | Range |
| --- | --- | --- |
| `font.family` | `system-ui, sans-serif` | any |
| `font.mono` | `ui-monospace, monospace` | any |
| `font.size.caption` / `small` / `body` / `subtitle` / `title` / `headline` / `display` | 12 / 13 / 14 / 16 / 18 / 22 / 28 | 10–64, ascending |
| `font.weight.regular` / `strong` | 400 / 600 | 100–900 |
| `font.lineHeight.body` / `heading` | 1.45 / 1.25 | 1–2 |

## 10. Iconography

- **Default icons** are flat line icons on faces. They take the text colour and follow the text's
  contrast rule.
- **3D glyphs** (extruded icons) are allowed only at the Objects and Scene levels, as decoration
  beside a labelled control, and never as the only label.
- **Icon set:** configurable. Strata ships none of its own; it accepts SVG or an icon component.

## 11. Interaction states

Each state is a change of height, light, material or pose. None changes layout or the hit area.

Raised parts (keys, knobs) change height on hover and press as below. Wells (fields, checkbox and radio
wells, tracks) keep their depth: hover and press change only their interior light, by `state.hoverLift`
and `state.pressSink`.

| State | Relief | Objects | CSS |
| --- | --- | --- | --- |
| Rest | Height `raised` | Key at `keyHeight` | Relief recipe |
| Hover | Height × 1.6; interior +4% (`state.hoverLift`, clamped by `interior.max`) | Key rises by `keyHeight / 4` | Larger shadow; `brightness(1.04)` |
| Pressed | Height × 0.25; interior −4% (`state.pressSink` 6%, clamped) | Key travels `keyTravel` | Smaller shadow; `brightness(0.96)` |
| Focus-visible | Accent edge 0.5–3.5 px outside the shape, anti-aliased | Emissive glow on the object | `outline: 3px solid`, offset 0.5 px |
| Selected or checked | `emissive` fill on the track or mark (`material.roles.trackOn`, `material.roles.indicator`) | Mark rises, track lights | Accent fill |
| Disabled | Height 0, no bevel gain, 38% opacity text | Object flattened to the face | Flat; `opacity: 0.38` on content |
| Invalid | `danger` focus-style edge and message | Same, plus the edge on the bezel | `outline` in `danger` |
| Busy | `emissive` progress on the face | Same | Same |

## 12. Motion

| Token | Default | Range | Used by |
| --- | --- | --- | --- |
| `motion.fast` | 120 ms | 0–400 | Hover, press, focus |
| `motion.normal` | 200 ms | 0–600 | Switch throw, key travel, small panels |
| `motion.slow` | 320 ms | 0–1000 | Panels entering and leaving through depth |
| `motion.easing.standard` | `cubic-bezier(0.2, 0, 0, 1)` | any | Most transitions |
| `motion.easing.press` | `cubic-bezier(0.3, 0, 0.6, 1)` | any | Press and release |

- **Panel motion:** panels enter and leave through depth (from `elevation.modal` towards their
  level, optionally with tilt). Interactive content stays inert during such transition effects.
- **Invariant, reduced motion:** under `prefers-reduced-motion: reduce`, states change instantly,
  with no travel, tilt, parallax or particles. A theme cannot turn this off.

## 13. Layout and density

- **Spacing scale:** 2, 4, 8, 12, 16, 20, 24, 32, 40, 48 (`space.1`–`space.10`). The base unit is
  configurable (default 4).
- **Density:**

  | Density | Control height | Panel padding |
  | --- | --- | --- |
  | `compact` | 28 | 12 |
  | `comfortable` (default) | 34 | 18 |
  | `spacious` | 40 | 24 |

- **Layering:** panels are the GPU layer unit, so pages should use a few large panels, not one
  panel per control (layer budget 32–64; 256 relief primitives per panel, P0.3).
- **Invariant, target size:** every interactive target is at least 24 by 24 CSS px, whatever the
  density. Links inside a sentence are exempt, as in WCAG 2.5.8; a checkbox, radio or switch meets it
  through its label row.

## 14. Accessibility

Strata targets **WCAG 2.2 AA** and follows the **WAI-ARIA Authoring Practices** for every
component, in every presentation. The [plan](plan.md#accessibility) lists the tests. Language
rules:

- **Native first:** native elements first; ARIA only where no native element exists.
- **Contrast:** every configuration is checked on lit faces (section 8).
- **Focus:** the focus indicator is at least 2 px wide (default 3) with 3:1 against its
  surroundings, in GPU, CSS and forced colours.
- **Depth as a preference:** an application may expose depth to visitors ("less 3D"). Depth 0% is
  a complete, usable design, not a degraded one.
- **User preferences, applied automatically:**

  | Preference | Effect |
  | --- | --- |
  | `prefers-reduced-motion` | No travel, tilt, parallax or particles |
  | `prefers-reduced-transparency` | `glass` → `matte` |
  | `prefers-contrast: more` | The high-contrast theme: larger contrast margins, bevel gain 0, solid focus |
  | `forced-colors` | Flat 2D, system colours, no shadows or GPU shading |
  | `prefers-color-scheme` | Picks the light or dark theme, unless the application fixes one |

### Invariants

These are validated in every configuration. Development builds report a broken invariant as an
error, and strict mode throws.

| Invariant | What validation does |
| --- | --- |
| One light per application | `light.*` in a subtree scope or component is rejected. |
| Footprint and taper | Raises `camera.distance`, then `taper`, and reports the change. |
| Contrast on lit faces | Reports the failing role and ratio. Derived on-colours are picked automatically. Configured colours are never altered. |
| Visible focus | Rejects focus width under 2 px or contrast under 3:1. |
| Target size | Reports controls under 24 by 24 px. |
| Reduced motion | Cannot be disabled by any token. |
| Elevation order | Rejects levels out of order. |

## 15. Theming and configuration

Strata exposes as much as possible to its users. **Every token in this document is
configurable**, within its range, unless the invariants table says otherwise.

### Layers

Configuration comes in layers. Each later layer overrides the earlier ones, token by token:

1. **Defaults:** the values in this document and in `strata.tokens.json`.
2. **Theme:** an application theme, built once, for example
   `createStrataTheme({ depth: 0.4, light: { azimuth: 45 }, colour: { accent: "#0f766e" } })`. It
   can be serialised to and from the token JSON.
3. **Runtime updates:** the application changes any theme token while running (a dark-mode
   toggle, a depth control, a brand switch).
4. **Scope overrides:** a subtree overrides tokens for its contents. For example, a flatter
   sidebar is `<StrataScope depth={0.2}>` in React, `data-strata-depth="0.2"` in HTML, or the
   matching CSS custom properties. Light tokens are not scope-overridable.
5. **Component props:** a component accepts the tokens that apply to it, for example
   `material`, `density` or a colour role.
6. **Visitor preferences:** OS media queries (section 14) and any preference the application
   exposes, for example depth.

### What can be configured

| Group | Tokens | Scope-overridable |
| --- | --- | --- |
| Depth | `depth` (0–1), plus any individual depth token (it overrides the blend) | Yes |
| Light | `light.azimuth`, `elevation`, `intensity`, `ambient`, `colour` | No (application only) |
| Camera | `camera.distance`, `tilt.max` | Yes (`tilt.max`) |
| Elevation | `elevation.*` | Yes |
| Shape | `radius.*`, `bevel.width`, `bevel.profile` | Yes (`bevel.profile`: application only) |
| Objects | `object.*` | Yes |
| Materials | Every preset's layers, custom materials, the material for each role, `environment.*` | Yes (`environment.*`: application only) |
| Colour | Every role in every theme, plus additional themes | Yes |
| Typography | `font.*` | Yes |
| Spacing and density | `space.base`, `density` | Yes |
| Motion | `motion.*` | Yes |
| Focus | `focus.width`, `focus.offset`, `focus.colour` | Yes |
| Presentation | `level` (`relief`, `objects`, `scene`), adjust policy | Yes (`level`) |
| States | `state.hoverHeight`, `pressHeight`, `hoverLift`, `pressSink`, `interior.max` | Yes |

### How depth blends

Each depth token has three anchors, at 0%, 50% and 100% (the A, B and C prototypes).
`depth` interpolates piecewise-linearly between them. An application may:
- set `depth` alone (the common case);
- override individual tokens, which then ignore the blend;
- replace the anchors, defining its own "subtle" and "bold".

### Runtime mechanism

- **CSS:** tokens resolve to CSS custom properties (`--strata-depth`, `--strata-light-azimuth`,
  `--strata-colour-accent`, …) on the root and on each scope element. The CSS presentation
  computes its relief from these variables with `calc()`, so a token change restyles without
  regenerating CSS.
- **GPU:** the GPU presentation reads the resolved tokens per scope each frame.
  - Depth, light, material and state tokens are uniform updates: no capture.
  - Colour, typography, radius and density change the DOM's paint, so the affected panels capture
    fresh pixels as for any content change.
- **No fallback:** a configuration change never switches GPU off.
- **Serialisation:** a theme serialises to the W3C Design Tokens format, so it can be shared,
  versioned and loaded at runtime.

## 16. Presentation levels and adjust policy

| Level | Default | What it adds | Without GPU |
| --- | --- | --- | --- |
| `relief` | Yes | Lit faces, bevels, wells, shadows, physical states | CSS relief |
| `objects` | Opt-in | PBR meshes per section 6, with travel and pose | CSS relief |
| `scene` | Opt-in | Decorative 3D around the UI: particles, physics, environment light | Nothing (decorative) |

- **Setting the level:** per application, per scope or per component.
- **Adjust policy (opt-in):** `adjust: { enabled, frameBudgetMs, stepDownAfterFrames,
  stepUpAfterFrames }`. When the 95th-percentile frame time stays over budget, components step
  down from `scene` to `objects` to `relief`, and they step back up after a recovery window.
  - **Reporting:** every step fires a diagnostic event.
  - **GPU stays on:** the policy never switches GPU off. Defaults are set from measurements on a
    low-end GPU (open).

## 17. Component anatomy template

Every component has an anatomy page under [`docs/ui-library/components/`](components/README.md) with the
headings below. The [conventions](components/README.md#conventions) define the class names, the `data-strata-`
attributes and the seven relief primitives (`raised`, `well`, `groove`, `knob`, `mark`, `ring`, `flat`).

1. **Purpose and native element:** which element it renders (`<button>`, `<input type=checkbox
   role=switch>` and so on) and the WAI-ARIA pattern it follows.
2. **Object:** the canonical 3D object, its parts, moving parts and their travel.
3. **Faces and materials:** each face's role, colour role and material.
4. **Elevation per state:** rest, hover, pressed, focus, selected, disabled, invalid, busy.
5. **Relief primitives:** the shapes the material pass lights, as `data-strata-face`
   markers on the DOM.
6. **Tokens it reads:** and which it accepts as props.
7. **DOM structure and overlay needs:** the boundary element, and whether it portals to the
   overlay host.
8. **Keyboard and screen reader:** keys, roles, states and announcements.
9. **CSS presentation:** the recipe it uses, and any component-specific rules.
10. **Tests:** plain DOM, GPU (stays on, fresh pixels, native hits), accessibility, parity.

## 18. Distribution and frameworks

Strata is **standalone-first**. The language lives in framework-neutral layers; framework
packages are thin bindings that render the same markup and wire the same behaviour.

| Layer | Subpath | Contents | Depends on |
| --- | --- | --- | --- |
| Tokens | `@underglass/ui/tokens` | The token JSON, the typed token runtime, theme creation, validation | Nothing |
| HTML + CSS | `@underglass/ui/css` | The stylesheet: class names, custom properties, relief and face modes. Works with no JavaScript. | Nothing |
| Behaviour | `@underglass/ui/dom` | Plain-DOM behaviour where native elements need help (tabs, menus, dialogs, roving focus), state sync, scope attributes | Nothing |
| GPU | `@underglass/ui/gpu` | Relief, Objects and Scene levels, adjust policy | `@underglass/core` (optional peer) |
| React | `@underglass/ui/react` | Components and `StrataProvider` / `StrataScope` | `react` (optional peer) |
| Vue | `@underglass/ui/vue` | The same components and providers for Vue 3 | `vue` (optional peer) |
| Astro | `@underglass/ui/astro` | `.astro` components that render the markup on the server | `astro` (optional peer) |

- **One package, one version.** Framework dependencies are optional peers, so an application
  installs only what it uses.
- **One markup contract.** Each component's anatomy page (section 17) defines its DOM: elements,
  classes, attributes and ARIA. Every binding renders exactly that markup, so a plain HTML page, a
  React app, a Vue app and an Astro site look and behave the same. Binding tests compare the
  rendered DOM with the contract.
- **Order:** React first, then Vue, then Astro. Other stacks (Svelte, Solid, Angular, server
  templates) use the markup with `/css` and `/dom`; more bindings can follow.
- **Server rendering.** The markup and CSS render on the server with no JavaScript, so pages are
  readable and usable before scripts load. Astro components do exactly that. Behaviour and GPU
  presentation attach in the browser: through the plain-DOM runtime, or through React or Vue
  islands (`client:only`, as the [frameworks guide](../guide/frameworks.md) describes for
  Underglass). This gives Strata server rendering even though Underglass's own mounting is
  client-only (SCOPE-003 in the open issues).
- **No Web Components as the shared layer.** Strata relies on real native elements in the light
  DOM for forms, labels, focus order and ARIA relationships, which shadow roots make harder (form
  association and ARIA references do not cross shadow boundaries without extra machinery). Shadow
  DOM drawing in HTML-in-Canvas was reported fixed in Chromium
  ([WICG #116](https://github.com/WICG/html-in-canvas/issues/116), closed 2026-08-11), but neither
  Underglass nor Strata has probed it on the installed build. Light-DOM markup with small bindings
  is simpler and more robust.

## Change log

- 2026-10-15: first draft. Depth at 50%, light from the top left (323°, 41°), light theme with
  a blue accent, and dark theme. The configuration model is "everything configurable within
  invariants".
- 2026-10-15: section 4 rewritten: open, layered materials (base, coat, sheen, iridescence,
  transmission, emissive), presets including `lacquer` (glass-coated), custom materials and custom
  shading, a generated studio environment, and contrast guardrails.
- 2026-10-15: the coat band became the finish zones (top 0–32%, bottom 70–100%), shared by Relief,
  Objects and CSS, after the tuning page showed materials were too subtle to see.
- 2026-10-15: screen-locked raised tops (section 6), the dark studio environment, and the captured-text
  anti-aliasing note (section 9).
- 2026-10-15: shadows are analytic in every presentation (section 7).
- 2026-10-15: added section 18: standalone-first layers, one markup contract, React, Vue and Astro
  bindings, and server rendering.
- 2026-10-16: anatomy pages for every Tier A component, with the markup conventions and relief primitives
  (section 17). From their review: the `edge` colour and non-text contrast rules, a darker dark-theme
  `track` (the accent fill reached only 2.5:1), objects for the remaining Tier A controls, wells that keep
  their depth on hover and press, cards at `raised`, and the inline-link target exemption.
- 2026-10-16: the high-contrast themes `contrast` and `contrast-dark` (section 8). The token source moved to the
  `@underglass/ui` package, which validates it and generates the token stylesheet.
