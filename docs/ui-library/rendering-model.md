# The Strata Rendering Model

**Version 1 (Relief).** Status: normative. This document defines how Strata looks, independently of any engine,
shading language or graphics API. Underglass's GPU presentation is one implementation of it; any other renderer that
passes the [conformance suite](#4-conformance) is another.

It has four parts:

1. **[The scene format](#1-the-scene-format):** a versioned JSON description of one layer at one moment.
2. **[The shading model](#2-the-shading-model):** what colour each point of a scene has, as formulas.
3. **[The reference implementation](#3-the-reference-implementation):** the same model as a pure function.
4. **[The conformance suite](#4-conformance):** scenes, sample points and expected colours.

Where the [design language](design-language.md) already fixes a rule (the light vector, shadow offset and softness,
finish zones, state multipliers, the contrast invariant), this document cites it rather than restating its reasons.
The [Phase 4 design](phase4.md#the-strata-rendering-model-an-engine-neutral-standard) explains why the standard
exists and where the engine boundary sits.

**Keywords.** *Must*, *must not* and *may* are used as in RFC 2119.

## 1. The scene format

A scene describes one layer: its size, the one light, the resolved style values, the materials, and the relief
primitives on it. Every value is already resolved for a depth and a theme, so a scene never carries depth or theme
names. Colours come from the **captured content** (the layer's own pixels), never from the scene, except the focus
edge, the backdrop and ring arcs.

- **Schema:** [`strata-scene.schema.json`](../../packages/ui/src/tokens/strata-scene.schema.json) (JSON Schema
  2020-12), exported as `@underglass/ui/scene.schema.json`. `validateScene` in `@underglass/ui/tokens` checks the
  same rules without a schema library.
- **Units:** lengths are layer-local CSS px, with the origin at the layer's top-left corner, x to the right and y
  down. Angles are degrees. Colours are sRGB `#rrggbb`.
- **Resolving from tokens:** `sceneSettings(tokens, { depth, theme })` gives every field except `extent`, `outset` and
  `primitives`.

| Field | Meaning | Token source |
| --- | --- | --- |
| `format`, `version` | `"strata-scene"`, `1` | |
| `extent` | `{ width, height }`: the layer's border box | the element |
| `outset` | `{ top, right, bottom, left }`, default 0: room drawn outside the extent, for shadows only. It never takes hits. | the renderer |
| `backdrop` | The colour under the layer | `colour.stage` |
| `light` | `{ azimuth, elevation }` | `light.*` |
| `bevel` | `{ width, gain, profile }`, profile one of `quarter-round`, `chamfer`, `cove` | `bevel.*` |
| `shadow` | `{ strength }` | `shadow.strength` |
| `interior` | `{ max }`, at most 0.1: the contrast budget on face interiors | `interior.max` |
| `state` | `{ hoverHeight, pressHeight, hoverLift, pressSink }` | `state.*` |
| `focus` | `{ colour, width, offset }` | `colour.accent`, `focus.*` |
| `materials` | Materials by name, as numeric layers (below) | `material.presets.*` |
| `primitives` | At most 256, **back to front**: a later primitive sits on an earlier one | the DOM (`data-strata-face`) |

**Materials.** Each material has optional layers. Absent parameters take the defaults shown.

| Layer | Parameters (default) | Version 1 |
| --- | --- | --- |
| `base` | `roughness` (1), `metallic` (0) | Shaded |
| `coat` | `strength` (0), `roughness` (0), `ior` (1.5) | Shaded; `ior` reserved |
| `emissive` | `strength` (0) | Above 0, the primitive is **unlit** |
| `sheen`, `iridescence`, `transmission` | as in the design language | **Reserved:** accepted, and ignored |

**Primitives.**

| Field | Meaning |
| --- | --- |
| `face` | `raised`, `well`, `groove`, `knob`, `mark`, `ring` or `flat`, as the [components README](components/README.md#conventions) (*Relief primitives*) defines them |
| `rect` | `[x, y, width, height]`, the element's border box |
| `radius` | Corner radius, default 0, clamped to half the shorter side. A knob is always fully round. |
| `height` | Height above the face for `raised`, `knob` and `mark`. Depth for sunk faces, reserved in version 1. |
| `material` | A key of `materials` |
| `finish` | Default `false`. Whether the material's finish zones apply: only on faces whose text stays clear of them (design language section 4). |
| `state` | `{ hover, pressed, focus, disabled }`, each default `false` |
| `ring` | `ring` only, and required there: `{ thickness, start, sweep, colour }`, with angles clockwise from the top |

Faces fall into three groups:

- **Lifted** (`raised`, `knob`, `mark`) cast shadows and change height with state.
- **Sunk** (`well`, `groove`, `ring`) invert the bevel.
- **Flat** (`flat`) has no bevel and no shadow.

A **groove** is a well. Its narrower bevel follows from the band rule in 2.3.

## 2. The shading model

The model maps a scene, the captured content and a point `p = (x, y)` to a colour.

- **Colour space:** all colour arithmetic is on **sRGB-encoded** channels in 0–1, as in CSS compositing. This is
  deliberate: the token validator measures lit contrast on encoded channels, so its result holds exactly for what
  the model produces (2.9).
- **Points:** a renderer evaluates the model at each device pixel's centre, mapped to CSS px.

### 2.1 Notation

- `clamp(v, a, b)`, `mix(a, b, t) = a + (b − a)·t`.
- `smoothstep(e0, e1, v) = u²(3 − 2u)`, where `u = clamp((v − e0)/(e1 − e0), 0, 1)`.
- `C(p) = (c, a)` is the captured colour, with straight (not premultiplied) alpha. Outside the extent, `a = 0`.
- `B` is the backdrop, `E` the focus colour and `m` is `interior.max`.
- **Light.** `L` is the direction towards the light (design language section 3):

  ```text
  L = (sin az · cos el, −cos az · cos el, sin el)
  ```

- **Half vector.** `H = normalize(L + (0, 0, 1))`, for a viewer straight ahead.

### 2.2 Shapes

Each primitive `i` has a signed distance `dᵢ(p)`, negative inside. Its centre is `(cx, cy)`, the middle of `rect`, and
its half size is `(hw, hh)`.

- **Box faces** (all but `ring`) use a rounded box with radius `r`, clamped to `[0, min(hw, hh)]`:

  ```text
  q = |p − (cx, cy)| − (hw, hh) + (r, r)
  d = length(max(q, 0)) + min(max(q.x, q.y), 0) − r
  ```

  A knob takes `r = min(hw, hh)`. A circle and a pill are boxes with that radius.

- **Ring**, an annulus with outer radius `R = min(hw, hh)` and thickness `t`:

  ```text
  d = | ‖p − (cx, cy)‖ − (R − t/2) | − t/2
  ```

- **Coverage:** `αᵢ = 1 − smoothstep(−0.5, 0.5, dᵢ)`. This is the anti-aliased shape.

### 2.3 Derived values per primitive

Every quantity below derives from the scene and the primitive alone, never from the captured colour.

- **Lit:** a primitive is lit unless its face is `flat`, it is disabled, or its material has `emissive.strength > 0`.
- **Band width** `bᵢ`, the width of the bevel:

  | Primitive | `bᵢ` |
  | --- | --- |
  | Not lit | 0 |
  | Knob | `min(hw, hh)`: the knob is all bevel, a dome, with no interior |
  | Ring | `min(bevel.width, t/2)` |
  | Any other lit face | `min(bevel.width, min(hw, hh))` |

- **Slope sign** `σᵢ`: −1 for sunk faces, +1 otherwise.
- **Profile:** a knob always uses `quarter-round`; every other face uses `bevel.profile`.
- **Cast height** `hᵢ`, for lifted faces that are not disabled. Every other primitive has `hᵢ = 0`.

  ```text
  hᵢ = height · (1 + (hoverHeight − 1)·hover) · (1 − (1 − pressHeight)·pressed)
  ```

  Here `hover` and `pressed` are 1 when the state is set, and 0 otherwise.

- **Material values:** `roughness`, `metallic`, `coat` (the coat's strength) and `coatRoughness`, with the defaults
  in part 1.

### 2.4 Profiles, normals and occlusion

**Position in the band.** Inside the bevel band, the position is `s = clamp(−dᵢ / bᵢ, 0, 1)`: 0 at the outer edge
and 1 where the band meets the interior.

**Slope angle.** The profile gives a slope angle `θ(s)`, with `θmax = 1.2` rad. Each profile has the same mean
slope, `θmax / 2`.

| Profile | `θ(s)` | Shape |
| --- | --- | --- |
| `quarter-round` | `θmax · (1 − s)` | Convex: steepest at the edge, flat where it meets the interior |
| `chamfer` | `θmax / 2` | A flat facet |
| `cove` | `θmax · s` | Concave: flat at the edge, steepest where it meets the interior |

**Normal.**

```text
g = ∇dᵢ / ‖∇dᵢ‖          (the outward direction; (0, 0) where the gradient vanishes)
n = (σᵢ · sin θ · g, cos θ)
```

An implementation may take `∇d` analytically, or by central differences with a step of at most 0.5 px. The reference
implementation uses differences of exactly 0.5 px.

**Occlusion.** Primitives are visited back to front. On reaching primitive `i`, every term accumulated so far is
multiplied by `1 − αᵢ`: the bevel light (2.5), the interior offset and finish (2.6), and the ring arcs (2.7). A
primitive therefore hides the relief of those beneath it. Cast shadows (2.8) and the focus edge (2.10) are not
occluded.

### 2.5 Bevel light

For each lit primitive where `s < 1` (or anywhere on a knob):

```text
f        = max(n · H, 0)
lambert  = n · L − L.z                                  (0 on a flat face)
specular = f^mix(160, 6, roughness) · (1 − roughness) · mix(0.35, 1, metallic)
fresnel  = 0.04 + 0.96 · (1 − clamp(n.z, 0, 1))⁵
coatTerm = coat · (f^mix(90, 10, coatRoughness) · 0.9 + fresnel · 0.6)
shade   += (lambert · bevel.gain · (1 + metallic) + 1.2 · specular + coatTerm) · αᵢ
```

`shade` is added equally to every channel. It brightens the bevel facing the light and darkens the bevel facing away.
Because `σ = −1` inverts the normal, a sunk face is dark on the side nearest the light.

### 2.6 Interior and finish

For each lit primitive where `s ≥ 1`, except a knob, which has no interior:

```text
offset += hoverLift·hover − pressSink·pressed + coat · 0.02 + (1 − roughness) · 0.01
K       = 1 + clamp(offset, −m, m)                      (after every primitive)
```

`K` is the **interior factor**. It is one number for the whole face, so it changes a face and the text on it alike.

**Finish zones.** If the primitive has `finish: true`:

```text
along        = clamp((y − top) / height, 0, 1)
zoneBright, zoneDark = finish(along, { roughness, metallic, coat, coatRoughness })
band         = max(band, zoneBright)
dark         = max(dark, zoneDark)
```

`finish` is the finish-zone profile of the design language (section 4, *Finish zones*). The reference implementation
is `finish()` in `@underglass/ui/tokens`.

### 2.7 Ring arcs

A ring paints its arc in `ring.colour`, unlit and over the content. A disabled ring paints no arc.

1. **Angle:** `φ = atan2(x − cx, −(y − cy))`, in degrees, from 0 to 360, clockwise from the top.
2. **Position along the arc:** `u = (φ − start) mod 360`.
3. **Angular distance to the arc:**
   - inside it (`u ≤ sweep`): `δ = −min(u, sweep − u)`;
   - outside it: `δ = min(u − sweep, 360 − u)`.
4. **Coverage:**

   ```text
   arcᵢ = αᵢ · (1 − smoothstep(−0.5, 0.5, δ · π/180 · (R − t/2)))
   ```

   A sweep of 360 gives `arcᵢ = αᵢ`.

The arc's angle is a scene value. Turning it needs no recapture.

### 2.8 Cast shadow

Each primitive with `hᵢ > 0` casts a shadow. The shadow is its own shape moved away from the light by its height
(design language section 7):

```text
o  = −(L.x, L.y) / L.z · hᵢ
Sᵢ = shadow.strength · (1 − smoothstep(−0.5·hᵢ, 1.5·hᵢ + 1, dᵢ(p − o))) · smoothstep(−1, 0.5, dᵢ(p))
S  = max over i of Sᵢ
```

- **Softness:** the shadow softens over `2h + 1` px.
- **Placement:** it falls only outside the caster.
- **Overlap:** overlapping shadows take the darkest, not the sum.

### 2.9 The contrast guard

Text sits on face interiors, and its contrast is an invariant (design language section 8). The guard keeps every
change there within `m`, and keeps it the same for text and face.

1. **Clearance:**

   ```text
   clearance = min over i of (|dᵢ(p)| − bᵢ)
   ```

   A point is beyond every bevel band when its clearance is at least 0.
2. **Weight:**

   ```text
   w = smoothstep(0, 2, clearance)    if p is inside at least one primitive
   w = 0                              otherwise
   ```

   The guard takes hold over a 2 px ramp.
3. **Guarded factor:**

   ```text
   k = clamp(K · (1 − S), 1 − m, 1 + m)
   ```

   `k` depends only on geometry and state, never on the captured colour. So a glyph and the face around it are
   scaled by the same `k`.

**What the guard protects.** In the guarded region the content is `c · k` (2.11). The token validator therefore
checks each text pair as captured against the face scaled by `1 ± m`, and with both scaled by `1 ± m`. With the
defaults, every pair keeps at least 4.5:1 in all four themes.

**What is exempt, and why:**

- **Finish zones** (2.6): the design language exempts them, and components keep text clear of them.
- **Ring arcs** (2.7).
- **The focus edge** (2.10): an overlay outside the focused shape.

**Limit.** Within `bᵢ + 2` px of a caster's edge the shadow is not limited. Text placed that close to a raised
control can lose contrast, as it can under the CSS presentation's `box-shadow` today.

### 2.10 Focus edge

For each primitive with `focus` that is not disabled:

```text
edge = max(edge, smoothstep(offset − 0.5, offset + 0.5, dᵢ) · (1 − smoothstep(offset + width − 0.5, offset + width + 0.5, dᵢ)))
```

The edge is an anti-aliased band from `offset` to `offset + width` px outside the shape, in `focus.colour`.

### 2.11 Compositing

Per channel, with `c` the captured channel:

```text
content = mix((c · K + shade) · (1 − S),  c · k,  w)        guard (2.9)
content = mix(content, arc colour, arcᵢ)                     each ring, back to front (2.7)
content = mix(mix(content, 1, band), 0, dark)                finish (2.6)
out     = content · a + B · (1 − a) · (1 − S)                over the backdrop
out     = clamp(mix(out, E, edge), 0, 1)                     focus edge (2.10)
```

**Drawing over something other than the backdrop.** A renderer that composites onto content other than the
backdrop outputs premultiplied `(content · a, a + S·(1 − a))` before the focus edge, then draws the edge
over that. Over `B`, this gives the same result.

**The outset.** It holds no captured content (`a = 0`), so only shadows and focus edges appear there.

## 3. The reference implementation

`@underglass/ui/tokens` exports the model as plain TypeScript, with no GPU and no DOM
([`shade.ts`](../../packages/ui/src/tokens/shade.ts), [`scene.ts`](../../packages/ui/src/tokens/scene.ts)). It is
the oracle: written to be read next to this document, not to be fast. Its comments carry the section numbers.

| Export | Purpose |
| --- | --- |
| `shadePoint(scene, captured, x, y)` | The colour at a point, over the backdrop |
| `shadingTerms(scene, x, y)` | The terms `shade`, `K`, `S`, `w`, `band`, `dark`, `edge` and the arcs at a point |
| `renderScene(scene, captured, scale)` | The drawn area (extent plus outset) as RGBA bytes, sampled at device-pixel centres |
| `sceneSettings(tokens, { depth, theme })` | A scene's settings from a token source |
| `validateScene(scene)` | Format checks, matching the JSON Schema |
| `lightVector`, `profileAngle`, `roundedBoxDistance`, `drawnArea` | The model's building blocks |

**Where the standard and the reference implementation disagree:** the standard is authoritative. Fix the
implementation, regenerate the suite, and record the change in the [change log](#change-log).

## 4. Conformance

The suite is [`relief-1.json`](../../packages/ui/conformance/relief-1.json), exported as
`@underglass/ui/conformance/relief-1.json`.

**What a case holds:**

- a scene;
- its `capture`: rounded rectangles painted in order over transparent, which is the layer's content;
- sample points, each with an expected `#rrggbb` colour and a note on what it checks.

The cases cover:

- a floating panel and its shadow;
- buttons at rest, hovered, pressed and disabled;
- a well and a groove;
- a knob on a groove;
- a ring with an arc;
- the focus edge;
- finish zones on lacquer and metal;
- an emissive mark;
- the contrast guard;
- another light direction;
- each bevel profile;
- the dark theme.

**What it means to conform.** A renderer conforms to version 1 when, for every case, it does the following:

1. Presents the case's capture as the layer's content, and renders the scene over its backdrop at any device scale.
2. Decodes the pixel that contains each sample point.
3. Matches `expect` within `tolerance` (3, in 0–255 units) on every channel.

Sample points stay at least 1.5 px from any edge of the captured content, so the result does not depend on how a
renderer anti-aliases the capture.

**How the suite is kept honest:**

- **Where expectations come from:** the reference implementation computes them (`npm run build:conformance
  --workspace @underglass/ui`).
- **Hand checks:** `tests/unit/strata-rendering-model.unit.test.mjs` checks the key points against hand-computed
  values. These include:
  - interiors at `× 1.0055`, `× 1.04` and `× 0.96`;
  - the full shadow at `backdrop × (1 − strength)`;
  - the focus edge and the arc in their exact colours;
  - emissive and disabled faces left as captured;
  - the guard scaling a label and its panel by exactly `1 − m`.
- **Out-of-date suite:** the same test fails while the committed suite differs from what the reference
  implementation produces.

**Underglass and CSS:**

- **Underglass's GPU presentation must conform.** Phase 4 step 2 runs this suite against decoded GPU pixels.
- **The CSS presentation is a declared approximation.** It is bound by the P0.6 parity budget, not by this suite.

## 5. Scope and versions

- **Version 1 covers the Relief level:** faces, bevels, wells, finishes, shadows, focus and states.
- **The Objects and Scene levels** get their own parts in a later version. Their data (object kinds, proportions,
  travel) is already engine-neutral in the design language.
- **Reserved in version 1:** the `sheen`, `iridescence` and `transmission` layers, `coat.ior`, the depth of sunk faces
  (their inner shadow), and glyph-shaped marks. A check mark is presented as captured, with no primitive.
- **Versioning:** a change that alters any expected colour is a new version of the model, with a new suite file. A
  renderer states which versions it conforms to.

## Change log

- 2026-10-16: version 1 (Relief): the scene format, the shading model, the reference implementation in
  `@underglass/ui/tokens`, and the first conformance suite. It formalises the P0.2 prototype's shader with these
  changes:
  - **Occlusion:** a primitive hides the relief beneath it, so a knob no longer shows the groove's bevel through it.
  - **Interior factor:** one per face, from the topmost primitive, clamped once.
  - **Defined profiles:** `chamfer` and `cove` are defined.
  - **Contrast guard:** it is a uniform factor, so text and face change together.
