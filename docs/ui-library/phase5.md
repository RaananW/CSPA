# Strata Phase 5: the Scene level

**Status:** accepted with the plan (2026-10-16); this note turns the [plan's Phase 5](plan.md#phase-5-scene-level-later) into
concrete changes, as the [Phase 4 design](phase4.md) did for Phase 4. The Relief and Objects levels run end to end on
the GPU (Phase 4), so the plan's condition for this phase holds.

**Upstream check:**

- **WICG HTML-in-Canvas:** `5fb3df86` (2026-10-09), unchanged. Nothing at the Scene level takes hits or captures
  content, so no open upstream issue affects it.
- **Chromium hotlist:** not accessible without signing in.
- **Tested on:** Canary 158.0.8108.0, Windows 11.

## What the Scene level is

Decorative 3D around the UI, on the shared engine (design language section 16):

| Part | What it adds | Example |
| --- | --- | --- |
| **Backdrop** | The stage behind the panels is a lit surface: a pool of the one light, falling off into a vignette, with an optional tint | A dashboard whose stage is lit from the top left, as its panels are |
| **Environment light** | Objects reflect an environment map instead of the studio | Metal keys reflecting a warm interior |
| **Particles** | Short-lived lit particles over the UI, moved by simple physics: gravity, drag, spin, a floor | Confetti from a submit button |
| **Settling** | Panels entering at the Scene level settle with a damped spring through depth and tilt | Cards dealt onto the stage |

Everything is **decorative**: it never takes hits, is never in the accessibility tree, never carries meaning, and never
changes a control. Without GPU it is simply absent (design language section 16: "Nothing").

## Proposal

### The Scene part of the Rendering Model (version 3)

A new version of the [Rendering Model](rendering-model.md) adds a **Scene** part, like Objects in version 2:

- **Stage scenes.** A new scene kind, `"strata-stage"`, describes one decorative layer that covers the stage: its
  backdrop and its particles. It carries the light and the camera of the panels' scenes, so the whole stage is lit by
  one light.
- **Backdrop:** the stage colour, lit as a flat surface with a light pool around the point the light would reach
  from its height, a vignette towards the edges, and an optional tint. Defined as formulas, like the rest.
- **Particles:** at most 256 per stage layer, each a small lit card (a rounded rectangle or a disc) with a position in
  3D, a rotation about its own axis, a tumble that tilts its normal, a colour and an opacity. They are drawn in
  perspective through the camera, lit by the light with the Relief lighting model, back to front. Their **motion is
  not in the model**: a scene is one moment; the physics that moves particles from frame to frame lives in Strata.
- **Environment maps:** version 2 scenes may name `environment.source: "map"` with a small equirectangular brightness
  grid (32 × 16 values), which replaces the studio function in the environment term (2B.7). The grid is data in the
  scene, so the standard stays engine-neutral and testable; loading and downsampling an `.hdr` file is Strata's job.
- **Conformance:** `scene-3.json`, rendered and compared like the other suites.

### Core

- **A `stage` material** for decorative layers: `setMaterial(id, { kind: "stage", scene })`, drawn in the layer's pass
  like the relief and objects materials, in the same binding.
- **Environment maps** in the `objects` material: the brightness grid is packed into the existing binding.
- **Budget:** 256 particles; a stage layer with no particles and no backdrop costs one pass of a flat colour.

### Strata (`@underglass/ui/gpu`)

- **Level:** the Scene level includes the Objects level. Where the application or a scope is at `scene`, the helper
  adds two decorative root children it owns: a **backdrop** before the first panel and a **particle layer** after
  the last, both `aria-hidden`, `inert` and empty, each enrolled with `decorative: true` and given a `stage` material.
- **Physics:** `strataBurst(origin, options)` emits confetti from an element: a fixed-step integrator (gravity, air
  drag, spin, a floor at the stage's bottom with damped bounce), seeded so a burst is reproducible. Particles are
  packed into the particle layer's scene each frame, and the layer is released when the last one dies.
- **Settling:** panels entering at the Scene level use a damped spring, sampled into core keyframes (at most 32), for
  their depth and tilt instead of the standard easing.
- **Environment:** `attachStrataGpu(controller, { environment: url })` loads an `.hdr` once, downsamples it to the
  grid and adds it to every Objects scene. While it loads, the studio lights the objects.
- **Reduced motion:** no particles and no settling; the backdrop stays (it does not move).
- **Adjust policy:** stepping down from `scene` to `objects` removes the backdrop and particle layers.

## Decisions

| # | Decision | Recommendation | Alternative |
| --- | --- | --- | --- |
| 1 | **Where particles draw.** | Analytically, in a decorative layer's pass, as the rest of Strata does: exact against the reference, no new pass type, and bounded by the budget. | Lite meshes with instancing (P0.4 proved 16k instances cheap), in a scene pass. More particles, but a second rendering path, a depth buffer and a model that only approximates. |
| 2 | **Where physics runs.** | In Strata, on the CPU, fixed-step and seeded: tens to hundreds of particles need no engine, and tests can reproduce a burst. | Lite's Havok physics. Real rigid bodies, but a WASM download and a nondeterministic step for decoration. |
| 3 | **Environment maps.** | A brightness grid in the scene (version 3 of the format), loaded and downsampled by Strata. Core never fetches. | Core loads `.hdr` and `.env` URLs. Fewer steps for apps, but network access and decoding in core. |
| 4 | **Who owns the decorative layers.** | The GPU helper creates, enrolls and removes them. Apps only set the level. | Apps render a backdrop and a particle element. More control, more ways to break the decorative contract. |

## Progress

- **5a, done:** this note, version 3 of the Rendering Model (part 2C), `stage.ts` and `scene-3.json`.
- **5b, done:** core's `stage` material and environment maps in the `objects` material. Both share the relief binding
  (now 1702 vec4s, about 27 KB, with the map after the primitives) and pass, so nothing else changes. Their decoded
  GPU pixels pass `scene-3.json`: 17 of 18 samples exact, 1 within 1/255.

## Order of work

1. **5a:** this note and the Scene part of the Rendering Model, its reference and `scene-3.json` (docs and
   `@underglass/ui/tokens`).
2. **5b:** core's `stage` material and environment maps in the `objects` material, with a GPU conformance test.
3. **5c:** the Scene level in `@underglass/ui/gpu`: backdrop, particles and `strataBurst`, settling, environment
   loading, reduced motion and the adjust policy's step from `scene`.
