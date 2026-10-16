# Strata Phase 4: GPU presentation design

**Status:** proposal for review (2026-10-16). It turns the [plan's contract changes](plan.md#contract-changes) into
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

## Proposed PR sequence

Each step is its own PR with GPU browser tests, which show that GPU stays on, pixels are fresh and native hits are
correct. Each also gets a headful Canary check, and a changeset for `@underglass/core`.

### 1. Material interaction and a second chain

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
  - Inside the layer, beyond `bevel` px from any relief primitive's edge, the material's output is clamped to within
    `interiorMax` of the captured colour, in linear light. That is where text lives.
  - The clamp sits in core's shader, not in the material's code, so no material can break text contrast.
  - `interiorMax` is a per-layer uniform with a hard ceiling of 0.1, matching the token's validated range.
- **Uniform layout:** 8 more floats per layer for the material slot (the kind code and 4 parameters), plus the
  interior budget. **Decision 1** below.

### 2. Relief primitives

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
- This step is the largest. It gets its own design note after steps 1 to 3 land.

### 5. Projective transforms

- **What:** a projective canonical matrix, its admission check, and native hit witnesses, so panels can tilt (P0.1
  passed on a 16k-point grid).
- **When:** last, after WICG #186 settles, because rotated `canvasClip` hit testing is still open upstream.

### 6. Strata over core: `@underglass/ui/gpu`

- **Panel helper:** enrolls each `.ug-panel` as a layer, collects its `data-strata-face` primitives, syncs state
  from pointer, focus and ARIA, and switches the subtree to `data-strata-mode="face"`.
- **Tokens:** applies the resolved tokens as material parameters, with uniform updates for depth and light.
- **Bindings:** React and Vue get it as an opt-in prop or hook. Astro gets it through a client-side attachment.

## Decisions for review

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
