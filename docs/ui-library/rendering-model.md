# The Strata Rendering Model

**Version 3 (Scene), which includes versions 2 (Objects) and 1 (Relief).** Status: normative. This document defines how Strata looks, independently of any engine,
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
| `format`, `version` | `"strata-scene"`, `1`, `2` or `3` (3: an environment map, 2C.4) | |
| `camera` | Version 2, required there: `{ distance, vanish }`, the camera objects are seen through (2B.1) | `camera.distance`, the stage |
| `environment` | Version 2: `{ source: "studio", strength }`, default strength 0.6 (2B.7) | |
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
| `primitives` | At most 256, **back to front**: a later primitive sits on an earlier one. In version 2 the list may also hold objects (2B). | the DOM (`data-strata-face`) |

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
multiplied by `1 − αᵢ`: the bevel light (2.5), the interior offset and finish (2.6), the arc overlay's colour and
alpha (2.7), and the cast shadow (2.8). A primitive therefore hides the relief, and the shadows, of those beneath it;
its own shadow is added after. The focus edge (2.10) is not occluded.

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
5. **Overlay:** arcs accumulate back to front into one overlay, a premultiplied colour `A` and an alpha `β`, both
   starting at 0:

   ```text
   A = A · (1 − arcᵢ) + ring.colour · arcᵢ
   β = β + arcᵢ · (1 − β)
   ```

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
   k = clamp(K · (1 − S · g), 1 − m, 1 + m)      g = m / shadow.strength if shadow.strength > m, else 1
   ```

   `g` scales a cast shadow so that it darkens a guarded face by at most `m`. Clamping it instead would cut every
   shadow above `m` off flat, and a tall caster's soft shadow would read as a grey plateau with an edge.

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
content = content · (1 − β) + A                              arc overlay (2.7)
content = clamp(mix(mix(content, 1, band), 0, dark), 0, 1)   finish (2.6)
out     = content · a + B · (1 − a) · (1 − S)                over the backdrop
out     = clamp(mix(out, E, edge), 0, 1)                     focus edge (2.10)
```

**Drawing over something other than the backdrop.** A renderer that composites onto content other than the
backdrop outputs premultiplied `(content · a, a + S·(1 − a))` before the focus edge, then draws the edge
over that. Over `B`, this gives the same result.

**The outset.** It holds no captured content (`a = 0`), so only shadows and focus edges appear there.

## 2B. Objects (version 2)

Version 2 adds the Objects level: each control's canonical object from [design language section 6](design-language.md#6-objects),
seen through the stage's perspective camera. Objects are **entries of the same back-to-front list** as relief
primitives, so a key on a slab, or a knob in a well, occludes what lies beneath it exactly as a primitive does (2.4).
Everything in part 2 still applies: an object adds a normal, coverage and a cast height where a primitive has its
profile and band.

### 2B.1 Camera, objects and the environment

**Camera.** `camera.distance` is `D`; `camera.vanish` is the vanishing point `V`, the stage's centre in layer-local
px. A point at height `z` drawn at `q` appears on the screen at `V + (q − V) · D / (D − z)`.

**Screen-locking.** A point at height `z` is *screen-locked* when it is placed at `V + (p − V) · (D − z) / D`, so
that it appears exactly at `p`. Solids are built screen-locked (design language section 6): their caps carry the
captured content, texel for pixel.

**Objects.**

| Field | Meaning |
| --- | --- |
| `object` | **Solids:** `key`, `slab`, `bezel`, `well`, `rail`, `mark`. **Domes:** `knob`, `puck`. |
| `rect` | The base: the native control's border box |
| `radius` | A solid's corner radius, clamped to half the shorter side. A dome's footprint is always fully round. |
| `height` | Height above `base`; for a `well`, its depth below it |
| `base` | The height of the surface it stands on, default 0 (a key on a slab stands at the slab's height) |
| `taper` | A solid's inset of its cap from its base |
| `width` | A bezel's ring width (required for a bezel) |
| `travel` | How far a key's or mark's cap sinks when pressed, default 0 |
| `material` | A key of `materials` |
| `colour` | A dome's own colour (required for domes): domes carry no captured content |
| `finish` | Finish zones on a solid's cap |
| `bounds` | The native control's border box, which must contain every drawn pixel; default `rect` |
| `state` | As for primitives |

**Environment.** `environment.source` is `studio` (the only source in the format); `environment.strength` is in 0–1,
default 0.6.

### 2B.2 Derived values per object

- **Heights.** `z0 = base`. A well's cap (its floor) is at `z1 = z0 − height`; every other solid's cap is at
  `z1 = z0 + height · (1 + hover / 4) − travel · pressed` (travel only for keys and marks, at most `height`). A dome's
  apex is at `z1 = z0 + height · (1 + hover / 4)`. Hover (not while disabled) raises the cap by a quarter of the height;
  it does not multiply it, so a tall object's shadow moves as little as a primitive's does. Hit safety (2B.6) checks the
  hovered geometry, the highest an object reaches, so hover never changes how an object is drawn.
- **Lit:** an object is lit unless it is disabled or its material is emissive.
- **Band** `b`, for the guard (2.9): the taper for a lit solid, `min(hw, hh)` for a lit dome, and 0 otherwise.
- **Cast height** `h`, for objects with `z1 > z0` that are not disabled:

  ```text
  h = (z1 − z0) · (1 − (1 − pressHeight)·pressed)
  ```

  Hover is already in `z1`, so `hoverHeight` applies to primitives only. For keys and marks the last factor is 1:
  their travel already lowers `z1`. A well casts nothing.

### 2B.3 Footprints

- A solid's footprint is its rounded box (2.2) with radius `r`. A **bezel**'s is the ring of width `w` just inside it:
  `d = | d_box + w/2 | − w/2`.
- A dome's footprint is its rect's inscribed pill (a box with radius `min(hw, hh)`).
- **Coverage** of a solid is `α = 1 − smoothstep(−0.5, 0.5, d)`, as for primitives. A dome's coverage is its
  silhouette's (2B.5).

### 2B.4 Solids

A solid's base outline and its cap are both screen-locked. On the screen, a point `p` inside the footprint is then:

- on the **cap** where `d ≤ −taper`. The cap is flat, so it takes the interior terms of 2.6 (the state and gloss offset,
  and finish zones when `finish` is set), and the captured content at `p`;
- on a **side** where `−taper < d ≤ 0`. Each side projects into the band between the cap and the base outline, so a
  solid never draws outside its base.

**Side normal.** With `g` the outward direction of the footprint's distance field (2.4):

```text
B  = p − d · g                                  (the base point across the band)
T  = B − taper · g                              (the cap point)
P0 = V + (B − V) · (D − z0) / D                 (both, screen-locked)
P1 = V + (T − V) · (D − z1) / D
Δ  = P1 − P0
n  = normalize((z1 − z0) · g,  −g · Δ)
```

The side facing the vanishing point is steeper than the side facing away. That asymmetry, and the sides' change
with travel, are what perspective adds to Relief's symmetric bevel.

**Light.** Where `−taper < d` (inside the band, or within the half pixel outside it that coverage weighs), a lit side
adds the bevel light of 2.5 with this `n`, plus the environment term (2B.7), times `α`.

### 2B.5 Domes

A dome is the upper half of an ellipsoid with semi-axes `hw`, `hh` and `z1 − z0`, centred on `(cx, cy, z0)`. It is not
screen-locked, so it is ray-cast. The ray through the screen point `p` meets height `z` at `p − u · z`, with
`u = (p − V) / D`. On the ellipsoid that gives a quadratic `a·z² + b·z + c = 0`, with `e = p − (cx, cy)`,
`s = (1/hw², 1/hh², 1/(z1 − z0)²)`:

```text
a = u.x²·s.x + u.y²·s.y + s.z
b = −2·(e.x·u.x·s.x + e.y·u.y·s.y) − 2·z0·s.z
c = e.x²·s.x + e.y²·s.y + z0²·s.z − 1
```

- **Hit:** the higher root `z = (−b + √(b² − 4ac)) / 2a`, valid when `z ≥ z0`. The normal is
  `normalize((e.x − u.x·z)·s.x, (e.y − u.y·z)·s.y, (z − z0)·s.z)`.
- **Coverage:** the smallest normalised radius the ray reaches is `ρ = √max(c − b²/4a + 1, 0)`. The silhouette's
  signed distance is `(ρ − 1) · min(hw, hh)`, and coverage is `1 − smoothstep(−0.5, 0.5, …)` of it, or 0 without a
  valid hit.
- **Colour:** a dome paints its `colour` over the captured content as the surface the light falls on. Domes
  accumulate into one surface overlay, back to front and occluded like arcs (2.7): `U = U·(1 − α) + colour·α`,
  `σ = σ + α·(1 − σ)`.
- **Light:** a lit dome adds the bevel light (2.5) with its normal, plus the environment term, times its coverage.

### 2B.6 Hit safety

Objects never take hits, so the native control's box must contain every pixel an object draws.

- **Solids** draw only inside their base (2B.4). The **taper rule** keeps their sides facing the viewer: at the base
  corner farthest from `V`, at distance `R`,

  ```text
  taper · (D − max(z0, z1)) ≥ |z1 − z0| · R
  ```

- **Domes** must project inside `bounds`: the eight corners of the dome's bounding box (its rect at `z0` and at
  `z1`), projected, lie within it.
- **The hovered geometry is checked** (the highest an object reaches, never pressed), so a state change never moves an
  object across the rule.

An object that breaks its rule is drawn at the **Relief level**: a key, slab, rail or mark as a `raised` primitive (a
mark as a `mark`), a well as a `well`, a dome as a `knob` that keeps its colour on its footprint, and a bezel not at
all (the field's own well remains). It keeps its place in the back-to-front list. A renderer reports such objects.

### 2B.7 The environment

The studio environment is a brightness for a reflected direction: a dark floor rising to a bright ceiling. With the
viewer straight ahead, a normal `n` reflects towards `r.z = 2·n.z² − 1`:

```text
studio(z) = mix(0.18, 0.92, smoothstep(−0.35, 0.65, z))
env       = strength · (studio(r.z) − studio(1)) · mix(0.04, 1, metallic) · (1 − roughness)
```

Like the bevel's Lambert term, it is relative to a flat face: a cap or a dome's apex gets none, so caps keep the
interior budget of 2.9. Steep metal sides reflect the darker horizon.

### 2B.8 Compositing

Domes change the content before light. With the captured `(c, a)` and the surface overlay `(U, σ)`:

```text
a' = a · (1 − σ) + σ
c' = (c · a · (1 − σ) + U) / a'
```

Then 2.11 applies to `(c', a')` unchanged. The guard (2.9) protects caps exactly as it protects face interiors.

## 2C. Scene (version 3)

Version 3 adds the Scene level (design language section 16): decorative 3D around the UI. It takes no hits and
carries no content, so none of its parts is guarded. Its motion is not part of the model: a scene is one moment, and
whatever moves particles from frame to frame (Strata's physics) produces a new scene each frame.

### 2C.1 Stage scenes

A **stage scene** describes one decorative layer that covers the stage. It is a separate format,
`"strata-stage"`, version 3, validated by `validateStageScene`:

| Field | Meaning |
| --- | --- |
| `format`, `version` | `"strata-stage"`, `3` |
| `extent` | `{ width, height }`: the stage, in CSS px |
| `light` | `{ azimuth, elevation }`: the application's one light (2.1) |
| `camera` | `{ distance, vanish }`: as in 2B.1, the vanishing point in stage px |
| `backdrop` | Optional: `{ colour, pool, vignette, tint?, tintStrength? }` (2C.2). Without it the layer is transparent but for its particles. |
| `particles` | At most 256 (2C.3) |

### 2C.2 Backdrop

The stage as a lit surface. With `R` the stage's half-diagonal, `L` the light (2.1) and `C` the stage's centre:

```text
P        = C + (L.x, L.y) · R / 2                         (the pool's centre, towards the light)
pool     = backdrop.pool · (1 − smoothstep(0, R · (0.6 + 0.4 · L.z), ‖p − P‖))
vignette = backdrop.vignette · smoothstep(0.45 · R, 1.1 · R, ‖p − C‖)
base     = mix(colour, tint, tintStrength)                (tint defaults to colour, tintStrength to 0)
out      = clamp(base · (1 + 0.25 · pool − 0.35 · vignette), 0, 1),   opaque
```

### 2C.3 Particles

Each particle is a small card or disc in 3D:

| Field | Meaning |
| --- | --- |
| `shape` | `card` (a rounded rectangle, radius a quarter of its shorter half side) or `disc` (an ellipse) |
| `position` | `[x, y, z]`: its centre, `z` its height above the stage |
| `size` | `[width, height]` |
| `rotation` | Turn about the viewer's axis, degrees clockwise, default 0 |
| `tilt` | `[tx, ty]`: its face tilted about its own x axis, then its own y axis, degrees, default `[0, 0]` |
| `colour`, `opacity` | Its own colour, and 0–1 (default 1) |
| `roughness`, `metallic` | Default 0.6 and 0 |

- **Frame.** The card's axes `u`, `v` and normal `n` are `(1,0,0)`, `(0,1,0)`, `(0,0,1)` rotated about x by
  `tx`, then about y by `ty`, then about z by `rotation`.
- **Where it is seen.** The camera ray through the screen point `p` meets the card's plane at `X`. The card-local
  point is `((X − position) · u, (X − position) · v)`. The particle's signed distance there (its rounded box or
  ellipse, in card px) is scaled to screen px by `D / (D − z)`. Coverage is `(1 − smoothstep(−0.5, 0.5, …)) ·
  opacity`.
- **Light.** Two-sided: `n` is flipped when it faces away from the viewer. With `H` the half vector (2.1):

  ```text
  diffuse  = min(0.55 + 0.45 · max(n · L, 0) / L.z, 1.6)      (1 for a card facing the viewer)
  specular = max(n · H, 0)^mix(160, 6, roughness) · (1 − roughness) · mix(0.35, 1, metallic)
  colour   = clamp(colour · diffuse + specular, 0, 1)
  ```

- **Order.** Particles are drawn farthest first: by ascending `z`, then in list order.

### 2C.4 Environment maps

A version 3 object scene may set `environment` to `{ source: "map", strength, grid }`: brightness in a
32 × 16 equirectangular grid, row by row from the zenith, column 0 at the top of the screen, each value 0–4 (1 matches
the studio's ceiling). For a unit direction `r`:

```text
u = atan2(r.x, −r.y) / 2π + 0.5          (wraps)
v = acos(r.z) / π
map(r) = the grid sampled bilinearly between cell centres at (u · 32 − 0.5, v · 16 − 0.5), rows clamped
env    = strength · (map(r) − map(0, 0, 1)) · mix(0.04, 1, metallic) · (1 − roughness)
```

with `r` the reflected direction of 2B.7. It replaces the studio term; like it, a face towards the viewer gets none.
Loading and downsampling an image into the grid is not part of the model.

### 2C.5 Compositing

A stage scene's colour at a point starts as its backdrop (opaque) or as nothing, and each particle in order goes over
it with straight-alpha "over". Conformance renders stage scenes over white.

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
| `resolveObject`, `objectDistance`, `sideNormal`, `domeHit`, `objectDrawable`, `reliefEquivalent`, `environmentTerm` | The Objects part (2B), in [`objects.ts`](../../packages/ui/src/tokens/objects.ts) |
| `shadeStage`, `backdropColour`, `particleAt`, `particleOrder`, `environmentSample`, `validateStageScene` | The Scene part (2C), in [`stage.ts`](../../packages/ui/src/tokens/stage.ts) |

**Where the standard and the reference implementation disagree:** the standard is authoritative. Fix the
implementation, regenerate the suite, and record the change in the [change log](#change-log).

## 4. Conformance

There are two suites, exported from `@underglass/ui/conformance/`:

- [`relief-1.json`](../../packages/ui/conformance/relief-1.json): version 1, Relief.
- [`objects-2.json`](../../packages/ui/conformance/objects-2.json): version 2, Objects. A renderer conforms to version
  2 when it passes both suites.
- [`scene-3.json`](../../packages/ui/conformance/scene-3.json): version 3, Scene: backdrops, particles and an
  environment map. A renderer conforms to version 3 when it passes all three. Stage scenes have no capture and are
  rendered over white.

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

The Objects suite covers:

- keys on a slab at rest, hovered, pressed and disabled, seen from one side;
- a slab's cap, sides and shadow;
- a well with a dome knob standing on its floor;
- a bezel around a field, with guarded text;
- a metal rail with a puck;
- objects drawn as their Relief equivalents;
- the environment on metal and matte sides.

**What it means to conform.** A renderer conforms to version 1 when, for every case, it does the following:

1. Presents the case's capture as the layer's content, and renders the scene over its backdrop at a device scale of 1
   (one device pixel per CSS px).
2. Decodes the pixel whose centre is each sample point. Sample points are pixel centres: a bevel changes by several
   units per pixel, so a half-pixel offset alone would exceed the tolerance.
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
- **Version 2 adds the Objects level** (part 2B): solids and domes, the camera, the studio environment and hit
  safety. A version 1 scene, or a version 2 scene with no objects, shades the same under both.
- **Version 3 adds the Scene level** (part 2C): stage scenes with a backdrop and particles, and environment maps.
- **Reserved:** `light.intensity`, `light.ambient` and `light.colour` (one white light, as in version 1), the inner
  shadow of wells, and particle shadows.
- **Reserved in version 1:** the `sheen`, `iridescence` and `transmission` layers, `coat.ior`, the depth of sunk faces
  (their inner shadow), and glyph-shaped marks. A check mark is presented as captured, with no primitive.
- **Versioning:** a change that alters any expected colour is a new version of the model, with a new suite file. A
  renderer states which versions it conforms to.

## Change log

- 2026-10-16: version 3 (Scene): part 2C, stage scenes (`strata-stage`) with a lit backdrop and particles,
  environment maps for objects, the reference implementation in `stage.ts`, and the `scene-3.json` suite. The
  [Phase 5 design](phase5.md) explains the choices.

- 2026-10-16: version 2 (Objects): part 2B, the camera and environment in the scene format, the reference
  implementation in `objects.ts`, and the `objects-2.json` suite. Two decisions from the
  [Objects design](phase4-objects.md) are refined:
  - **One list:** objects are entries of the same back-to-front list as primitives, so a key on a slab, a knob in a
    well and a field's bezel over its well occlude in document order with the relief primitives around them.
  - **Cast shadows are occluded** (2.4), so a rail's shadow no longer falls on the puck standing above it. No
    expected colour of version 1 changes.

- 2026-10-16: writing core's GPU implementation settled three details. None changes an expected colour in the suite
  except the sample positions:
  - **Sample points are pixel centres** at a device scale of 1, because a bevel changes by several units per pixel.
  - **Ring arcs accumulate as one overlay** (2.7), so occlusion scales one colour and one alpha. A single arc, the
    only kind the suite has, is unchanged.
  - **Content is clamped to 0–1 before compositing** (2.11), so a partly transparent pixel cannot carry an
    over-bright value into the composite.
- 2026-10-16: version 1 (Relief): the scene format, the shading model, the reference implementation in
  `@underglass/ui/tokens`, and the first conformance suite. It formalises the P0.2 prototype's shader with these
  changes:
  - **Occlusion:** a primitive hides the relief beneath it, so a knob no longer shows the groove's bevel through it.
  - **Interior factor:** one per face, from the topmost primitive, clamped once.
  - **Defined profiles:** `chamfer` and `cove` are defined.
  - **Contrast guard:** it is a uniform factor, so text and face change together.
