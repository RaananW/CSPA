# Strata Phase 4, step 4: the Objects level

**Status:** accepted (2026-10-16, #80): all five recommendations. This is the design note that the
[Phase 4 design](phase4.md#4-object-pass) promised for step 4 once steps 1 to 3 had landed. Steps 0 to 3 and 6 are
done, so the Relief level runs end to end on the GPU (#74 to #79). Each decision below has a recommendation and an
alternative.

**Progress:**

- **4a, done:** version 2 of the [Rendering Model](rendering-model.md) (part 2B), the reference implementation
  (`objects.ts` in `@underglass/ui/tokens`) and `objects-2.json`. Writing it refined two points:
  - **One back-to-front list.** Objects are entries of the scene's `primitives` list, not a separate list, so they
    occlude in document order with the relief primitives around them (a field's bezel over its well, a knob in a
    well).
  - **Solids are screen-space exact.** With screen-locked base outlines and caps, a solid's sides always project into
    the band between its cap and its base, so solids never draw outside their control. The taper rule then keeps
    their sides facing the viewer; only domes need the bounds check.

**Upstream check:**

- **WICG HTML-in-Canvas:** `5fb3df86` (2026-10-09), unchanged. #186 (rotated `canvasClip` hit testing) is still open,
  with no comments; it does not affect objects, which never take hits.
- **Chromium hotlist:** not accessible without signing in.
- **Tested on:** Canary 158.0.8108.0, Windows 11.

## What P0.4 proved, and what is new now

P0.4 drew native controls as real 3D objects with its own Babylon Lite engine and scene, on a probe page:

- tapered keys carrying the captured label, a switch knob, and a slider puck;
- PBR, a key light with a shadow map, and a hemispheric fill;
- 0 hit mismatches, 0 drawn key pixels outside the native button, and no recapture on state changes;
- 16,384 instanced meshes for under 1 ms.

The design language has since settled three things P0.4 did not have:

- screen-locked tops;
- analytic shadows everywhere, with no shadow maps at the Objects level;
- finish zones.

What core has to add is integration:

- one shared engine with the layer passes;
- a depth buffer;
- draw order with other layers;
- the engine-neutral standard;
- the same guarantees core gives today: fresh pixels, exact hits, and no DOM fallback for supported updates.

## Proposal

### The Objects part of the Rendering Model

A new version of the [Rendering Model](rendering-model.md) adds an **Objects** part, like the Relief part.

- **The scene format** gains per-layer `objects`. Each object has:
  - a kind: key, slab, bezel, well, knob, puck, rail or mark (design language section 6);
  - its base rectangle (the native control's border box);
  - its height;
  - its taper;
  - its travel state;
  - its material.

  The scene also carries the camera distance `D`, derived as the design language specifies.
- **The geometry is mathematics:** tapered rounded boxes, spheres and capsules, each defined as a solid with a top,
  sides and a base. That includes screen-locked tops, which are pre-scaled by `(D − h) / D`.
- **The shading** is **Decision 1** below.

### Core: an object pass per layer

- **API:** a new material kind, `objects`, carries the Objects scene. It is set through the same `setMaterial`, so a
  layer is at either the Relief or the Objects level.
- **Draw order:** core draws the layer's own pass first, its captured face as today. It then draws that layer's objects
  in a Lite scene pass, with a depth buffer cleared per layer. Objects of one layer occlude each other; layers keep
  their painter's order. This is **Decision 2**.
- **Captured tops:** an object's top samples the layer's captured texture, the same texture with no new capture.
  Because the top is screen-locked, its texels map 1:1 and the label stays exact.
- **Shadows:** analytic, from the Relief formula on each caster's footprint. Each one is a shader quad that receives
  onto the layer and casts into the shadow outset (step 3).
- **Moving parts:** states move meshes and change material values only, as in P0.4. There is no recapture and no
  recompile.

### Hit safety

Objects never take hits, so the native control's border box must contain every drawn pixel of its object.

- Core checks the taper rule from the scene's `D`, each object's height, and its distance from the vanishing point.
- An object that would break the rule is drawn at the Relief level for that frame, and a diagnostic says why. The
  application is not left with a wrong hit and is never sent to DOM. This is **Decision 3**.

### Fallback ladder

- **Order:** Objects falls back to Relief, and Relief falls back to CSS.
- **When:** an object pass that fails to compile, exceeds its budget, or loses its environment drops the layer to the
  Relief level. GPU stays on.
- **What the contract allows:** only GPU errors or a factual lack of support reach DOM. This matches the design
  language's adjust policy: never silent, and never a DOM fallback.

### Budget and environment

- **Objects:** at most 256 per layer, like relief primitives. Repeated kinds are instanced.
- **Environment:** `environment.source: "studio"` (the default) is generated in code, once per engine, with no asset.
  An `.hdr` or `.env` URL is optional and loaded once. While it loads, objects use the studio environment.

### Order of work

1. **4a:** the Objects part of the Rendering Model, its reference and its conformance suite. Docs and
   `@underglass/ui/tokens` only, like step 0.
2. **4b:** the core object pass with keys and slabs, the captured screen-locked tops, analytic shadows and the taper
   check. It needs a GPU browser test and a headful check.
3. **4c:** the remaining kinds: bezel, well, knob, puck, rail and mark.
4. **4d:** `@underglass/ui/gpu` builds the Objects scene from the same markup when a panel or scope sets
   `level="objects"`.

## Decisions

| # | Decision | Recommendation | Alternative |
| --- | --- | --- | --- |
| 1 | **How object surfaces are shaded in the standard.** | **Reuse the Relief lighting model** (section 2.5: Lambert relative to the face, the roughness lobe, coat and Fresnel) on each object's surface normals, plus the environment as one defined term. The reference implementation ray-casts the analytic shapes, so conformance stays **colour-exact**, and any engine (Lite PBR included) must match it. One look, defined once. | Use the engine's PBR (Lite's `createPbrMaterial`) and make the standard **geometric only**: containment, exact captured tops and the shadow formula at sample points, with lit colours left to the engine. Richer reflections sooner, but a new engine would only *approximate* the look. |
| 2 | **Where objects draw.** | After their own layer's pass, with a **depth buffer cleared per layer**: objects stay with their layer in the painter's order, and a panel on top hides the keys of a panel beneath. | One scene pass for all layers after every layer pass, with a shared depth buffer. Fewer passes, but objects would draw over layers stacked above theirs. |
| 3 | **When an object would break the taper rule.** | **Draw that object at the Relief level** (its primitive) and report a diagnostic. Hits stay exact. | Raise `D` automatically (as token validation does at build time). It always keeps objects, but changes the perspective of the whole page at runtime. |
| 4 | **Environment.** | **Studio in code by default**, with HDR URLs opt-in. | HDR by default. Richer reflections, but a network fetch before the Objects level looks right. |
| 5 | **Granularity of the level.** | **Per layer** (per panel), as the material slot already is. A scope or component setting is resolved by Strata into the panel's scene. | Per object. Mixed levels within one panel are possible, but core would need both passes' rules per object. |

## What does not change

- **Native capture, hits and geometry:** unchanged. Objects are decoration over the captured layer, driven by native
  state.
- **The Relief level:** stays the default, and Objects is opt-in.
- **The CSS presentation:** stays the same CSS relief for both levels.
