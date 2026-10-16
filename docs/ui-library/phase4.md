# Strata Phase 4: GPU presentation design

**Status:** accepted (2026-10-16): all five recommendations below, plus an engine-neutral standard for the look
(the Strata Rendering Model). It turns the [plan's contract changes](plan.md#contract-changes) into
concrete changes to `@underglass/core`, based on a read of the current effect pipeline, before any core code changes.
Phases 1 to 3 are done: tokens, CSS, and the 19 Tier A components in React, Vue and Astro, all CSS-presented.

**Upstream check:**

- **WICG HTML-in-Canvas:** `5fb3df86` (2026-10-09), unchanged since Phase 0.
  - #162, which renames `PaintEvent` to `CanvasPaintEvent`, changes only the interface name in the README. The event
    type stays `paint`, which is what core listens for.
  - #186, on `canvasClip` hit testing under a rotated transform, is open, and matters for projective transforms.
- **Chromium hotlist:** not accessible without signing in.
- **Tested on:** Canary 158.0.8107.0, Windows 11.

## What core does today

| Area | Today | Where |
| --- | --- | --- |
| Effect interaction | `decorative` (the whole layer is inert, aria-hidden and has no controls) or `inert` (a transition: content is inert while the handle lives). Anything else falls back to DOM. | `effects.ts:15-26`; `runtime.ts:672`, `1549-1562` |
| Chains | One chain per layer, of 1 to 3 operations, each kind once, sampling before colour. A new `setEffects` replaces the old chain. | `effects.ts:121-134`; `runtime.ts:168`, `1584` |
| Custom effects | `defineEffect`, colour only (`geometry: "color"`), at most 4 parameters and 4096 characters. One custom definition per layer pass. | `effects.ts:96-114`; `composition.ts:161-165`, `244` |
| Uniforms | 44 floats per layer: matrix, extent, effect slots and clip. Mirrored in `LAYER_PASS_FLOATS`, the compiled-program validator and the CSS compiler's shader generator. | `composition.ts:35`; `compiled.ts:39`; `css-compiler/src/generate.mjs` |
| Frame | One blended pass per layer, with no extra textures and no intermediate targets. Parameters change per frame with no recompile or recapture. | `renderer.ts:272-304`, `619-644` |
| Bounds | No outset. The clip rectangle is both the shader's scissor and the native `canvasClip`. The vertex triangle covers the clip's bounds plus 2 px. Overflowing content falls back to DOM. | `composition.ts:107-115`, `283-301`; `renderer.ts:576-613`; `runtime.ts:681` |

## The Strata Rendering Model: an engine-neutral standard

Decision 3 makes Strata's look data, not shader code. That data, and what it means, is written as a standard that
names no engine, shading language or graphics API. Underglass's WGSL is then one implementation of it, and a later
engine (WebGL, a native renderer, a different WebGPU engine) can be another, judged by the same tests.

The standard is [`rendering-model.md`](rendering-model.md) (version 1, Relief; step 0). It has four parts:

1. **The scene format:** a versioned JSON description of one layer, validated by a JSON Schema. It holds:
   - the layer extent;
   - the one light's direction;
   - the bevel (width, gain and profile);
   - the shadow strength and the interior budget;
   - the materials, as numeric layer parameters (base, coat, sheen, iridescence, transmission, emissive);
   - the primitives: shape, rectangle in layer-local CSS px, radius, height, material and state.

   The token source (W3C Design Tokens) already describes the theme. The scene format is what one layer needs at one
   moment, resolved from the tokens (for a depth and theme) and the DOM.
2. **The shading model, as mathematics:**
   - coordinate systems (CSS px, y down, z towards the viewer);
   - each shape's signed distance;
   - the three bevel profiles as height-over-distance functions, and the normals they give;
   - the lighting equation;
   - the finish zones;
   - the analytic shadow;
   - the effect of each state;
   - the contrast clamp on face interiors.

   It is written in formulas and pseudocode, never in WGSL or GLSL. Where Phase 1 already fixed a formula (the
   shadow offset and softness, the finish profile, the taper and screen-locking rules), the standard cites it.
3. **A reference implementation:** a pure function in plain TypeScript, with no GPU and no DOM, mapping a scene, a
   captured colour and a pixel position to a colour. It is the oracle: clear, not fast. It ships in
   `@underglass/ui/tokens`, so tools and tests can use it anywhere.
4. **A conformance suite:** scenes with sample points and expected colours within a stated tolerance, generated from
   the reference implementation and checked by hand at key points.
   - A backend **conforms** when its decoded pixels match the suite.
   - Underglass's GPU presentation must conform.
   - The CSS presentation is a declared **approximation**, bound by the P0.6 parity budget instead.

**Where the engine boundary sits.** Core's built-in `relief` material takes the scene format as its input, and its
WGSL is core's implementation of the shading model. Strata produces scenes; it never sees a shader. Changing engines
means implementing the standard and passing the suite. The tokens, the scene format, Strata's components and the
tests stay as they are.

**Scope.** The standard covers the Relief level: faces, bevels, wells, finishes, shadows and states. The Objects
level (meshes) and the Scene level get their own sections when those steps arrive. Their data (object kinds,
proportions, travel) is already engine-neutral in the design language.

## Proposed PR sequence

Each step is its own PR with GPU browser tests, which show that GPU stays on, pixels are fresh and native hits are
correct. Each also gets a headful Canary check, and a changeset for `@underglass/core`.

### 0. The Strata Rendering Model

Before any core change: [`rendering-model.md`](rendering-model.md), the scene JSON Schema, the reference
implementation and the conformance suite, with unit tests. Docs and `@underglass/ui/tokens` only, so core is
untouched. Step 2 then implements it in WGSL and runs the suite against decoded GPU pixels.

Writing it settled one detail of step 1's contrast guard. A per-channel clamp to the captured colour is not enough:
it lets a glyph brighten while the face around it darkens, which takes some default pairs under 4.5:1. The guard is
therefore one factor per point, computed from geometry and state and never from the captured colour
([rendering model 2.9](rendering-model.md#29-the-contrast-guard)). The token validator now checks text and face
scaled together.

### 1. Material interaction and a second chain

Implemented: `setMaterial`, a 52-float layer block and compiled program sets at version 3. A material holds one
custom colour definition. In this step the whole layer is the guarded face, because relief primitives arrive in
step 2.

- **New interaction `"material"`:**
  - It is allowed on interactive layers at rest, with content left fully interactive (not inert).
  - It is colour-only: a chain with `interaction: "material"` may contain only colour operations (`custom` with
    `geometry: "color"`), never `ripple` or `chromatic`, because those move pixels.
  - The structural check (`runtime.ts:672`) accepts it.
  - The architecture note changes from "effects are decorative/inert only" to "effects that move pixels never touch
    live controls".
- **Two chains per layer:** `material` (persistent) and `effect` (the existing decorative or transition chain), held
  separately. `setMaterial(id, descriptor)` returns a handle like `setEffects` does, and replacing one chain never
  touches the other. In the shader, the material runs first, then the existing chain.
- **Contrast guard in the shader:**
  - Inside the layer, beyond `bevel` px (plus a 2 px ramp) from any relief primitive's edge, the output is the
    captured colour times one factor within `1 ± interiorMax`, as the rendering model's guard defines it (2.9). That
    is where text lives.
  - A custom material's interior output is reduced to that form: core takes the factor from the material's result
    on a neutral input, so the captured colour cannot make text and face move apart.
  - The clamp sits in core's shader, not in the material's code, so no material can break text contrast.
  - `interiorMax` is a per-layer uniform with a hard ceiling of 0.1, matching the token's validated range.
- **Uniform layout:** 8 more floats per layer for the material slot (the kind code and 4 parameters), plus the
  interior budget. **Decision 1** below.

### 2. Relief primitives

Implemented: `setMaterial(id, { kind: "relief", scene })`, shading the rendering model's scene in WGSL
(`packages/core/src/relief.ts`). Its decoded GPU pixels pass the conformance suite: 57 of the 60 samples inside the
layer match exactly, and 3 are 1 unit off. One deviation from decision 2: Lite's effect wrapper offers only uniform,
texture and sampler bindings, so the primitives live in a **second uniform binding**, not a storage buffer. 256
primitives with their header and material table take about 25 KB, inside WebGPU's guaranteed 64 KiB per uniform
binding, and only relief passes carry it. Relief is refused with compiled program sets for now, like custom
materials.

- **Primitive list:** a layer may carry up to **256** primitives (the P0.3 budget). Each has:
  - a shape: rounded box, circle, pill or ring with an arc;
  - a rectangle in layer-local px and a radius;
  - a height and a material index;
  - a state: hover, press, focus or disabled, as uniform flags.
- **Storage:** they live in a per-layer storage buffer (**Decision 2**). Hover, press and focus are buffer writes, with
  no recapture and no recompile.
- **Lighting:** core lights them analytically with signed distance fields, from one light and a depth per layer (the
  P0.2 probe's shader, generalised).
  - This lighting is a built-in material kind, `relief`, so the shader stays one fixed program.
  - Strata's look (finish zones, bevel profile) is passed in as parameters, so core knows nothing about Strata's
    markup.
- **Reconciliation:** the list is rebuilt on the triggers core already has (resize, mutation, layout). Core takes
  rectangles. Collecting them from `data-strata-face` markers is Strata's job, in `@underglass/ui/gpu` (step 6).

### 3. Shadow outset

Implemented: the relief scene's `outset` grows the pass's drawn rectangle (`drawRectangle` in
`composition.ts`), only on sides the layer's clip does not cut, and is capped at 128 px per side. Outset pixels
hold no captured content, so they show shadows and focus edges only. A pixel half on the layer's edge keeps both
its content and the shadow beyond it. The native `canvasClip` is unchanged. All 64 conformance samples now
compare on GPU pixels, outset included.

- **Drawing:** a layer may declare `outset: { top, right, bottom, left }`. The vertex triangle and the shader's draw
  rectangle grow by it. Pixels in the outset are shadow-only: analytic, from the primitives and the panel's own box,
  with no texture sample.
- **Hits:** the native `canvasClip` stays the border box, so the outset never takes hits. P0.5 proved this.
- **Policy:** `bounds: "layer"` stays the only value for effects. The outset belongs to the layer, not to effects,
  so the existing tests and docs keep holding for effects.
- **Clamping:** the outset is clamped to the canvas frame, as the bounds are today.

### 4. Object pass

- **Meshes:** these are for the Objects level, anchored to element boxes and drawn in the shared engine with a depth
  buffer. They are decorative and never hit-tested, and they have their own budget, like the layer budget.
- **Screen-locked tops:** raised tops are screen-locked (design language section 6), so the captured labels map
  1:1.
- **Shadows:** analytic shadows are reused from step 3.
- This step is the largest. Its design note is [phase4-objects.md](phase4-objects.md).
- Implemented in core as the `objects` material (steps 4a to 4c); `@underglass/ui/gpu` builds its scenes in 4d.

### 5. Projective transforms

Implemented without waiting for #186:
- **Transforms:** `Transform` gains `tiltX`, `tiltY` and `perspective`, composed as CSS composes them.
- **Shader:** maps canvas to layer through the inverse homography. The layer block gains a projective row: 56 floats,
  and compiled sets move to version 4.
- **Admission:** proves projective hits with two witnesses, and tilt on the GPU requires that proof.
- **The #186 case is refused:** a tilted layer inside a clipping viewport, or with clipped overflow. Unclipped tilted
  layers need no `canvasClip`, the same rule core already used for rotation (open issue SCOPE-007).

- **What:** a projective canonical matrix, its admission check, and native hit witnesses, so panels can tilt (P0.1
  passed on a 16k-point grid).
- **When:** last, after WICG #186 settles, because rotated `canvasClip` hit testing is still open upstream.

### 6. Strata over core: `@underglass/ui/gpu`

Implemented: `attachStrataGpu(controller)`, and `useStrataGpu` for React and Vue.
- **Tokens:** read from each panel's resolved `--strata-*` properties. The numeric ones are registered, so their
  depth blends resolve to numbers.
- **States:** read from `:hover`, `:active`, `:focus-visible` and `:disabled`.
- **Geometry:** read from layout, and followed through CSS transitions frame by frame.
- **No dependency on core:** the helper never imports `@underglass/core`.
- **A core bug, fixed separately:** building the helper showed that layers laid out at fractional sizes never
  admitted (#78).

- **Depth transitions:** `strataEnter` and `strataLeave` move a presented panel with core's `transition` (scale for
  depth, tilt and opacity, about the panel's centre) while its scene height travels from `elevation.modal`. The panel
  is inert while it moves, and reduced motion makes the change instant.

- **Panel helper:** enrolls each `.ug-panel` as a layer, collects its `data-strata-face` primitives, syncs state
  from pointer, focus and ARIA, and switches the subtree to `data-strata-mode="face"`.
- **Tokens:** applies the resolved tokens as material parameters, with uniform updates for depth and light.
- **Bindings:** React and Vue get it as an opt-in prop or hook. Astro gets it through a client-side attachment.
- **Overlays:** the root is a stage (`data-strata-stage`). Dialog and Drawer rendered into it are presented as their own
  panels while open (relief at `elevation.modal`, entering through depth), over a scrim enrolled as a plain layer and
  faded by core. `showStrataDialog` hands them to the stage as they show and takes them back before they hide, in the
  same task, because a presented layer must never be hidden. Their accessibility snapshot matches a native
  `<dialog>` (#86) and is the same on the GPU, so the plan's fallback to `<dialog>` is not needed. Tooltip, Menu,
  Popover and Select popups stay in the overlay host.
- **Presentation levels and the adjust policy:** `level` (application), `data-strata-level` (scope or component),
  and an opt-in adjust policy that caps levels by measured frame intervals and reports every step; GPU stays on.

## Decisions (accepted 2026-10-16)

| # | Decision | Recommendation | Alternative |
| --- | --- | --- | --- |
| 1 | **Where the material lives in the uniform block.** | Grow the per-layer block from 44 to 52 floats, keeping one pass per layer. This touches `BLOCK`, `LAYER_PASS_FLOATS`, the compiled-program validator and the CSS compiler's generator together, with a layout version in compiled programs so a stale build fails clearly. | A second pass per Strata layer. It needs no layout change, but doubles the per-layer draw cost and adds an intermediate texture, against today's "no extra textures" budget. |
| 2 | **Where primitives live.** | A per-layer storage buffer (WebGPU, read-only in the fragment stage), sized to 256 entries and allocated only for layers that use relief. Ordinary layers stay as they are. | A uniform array. That limits the budget to about 64 primitives at the default uniform size. |
| 3 | **Whether the material is code or a built-in.** | A built-in `relief` kind in core, with numeric parameters, plus custom colour-only materials through `defineEffect`. Strata ships no WGSL, and its look is data. | Strata ships its material as a custom `defineEffect`. Core stays smaller, but every Strata page compiles a custom pass, and the contrast guard would have to trust that code. |
| 4 | **Contrast enforcement.** | A clamp in core's shader, outside the material, on face interiors (beyond the bevel band from every primitive's edge). | Trust the material's code. That is weaker: the design language makes contrast an invariant. |
| 5 | **Order of work.** | Steps 1, 2, 3 and then 6, so Relief (the default level) ships end to end. Then 4, the Objects level, and last 5, tilt. | Follow the plan's order strictly (4 before 6). Objects would arrive before any Strata page is GPU-presented. |

## What does not change

- **Effects:** existing decorative and transition effects, their API, their tests and their bounds.
- **Capture:** native capture stays neutral. Materials and relief never enter `drawElementImageToTexture`, so
  snapshots and fallbacks show original content.
- **Fallback rules:** DOM fallback still happens only for a GPU error or a factual lack of support. A material or
  relief primitive never revokes GPU.
