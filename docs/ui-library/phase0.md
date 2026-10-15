# Strata Phase 0 report

Results of the feasibility probes in the [plan](plan.md#phase-0-upstream-check-and-feasibility-probes).
Each probe is a playground page plus a browser test. A probe answers what the installed browser
does; it is not Underglass runtime support, which still has to be built and tested in core.

| Probe | Status |
| --- | --- |
| P0.1 Projective hits | **Passed** (2026-10-15) |
| P0.2 Material pass | **Passed** (2026-10-15), one token finding |
| P0.3 Relief cost | **Measured** (2026-10-15): budget 256 primitives per panel |
| P0.4 Object pass | **Passed** (2026-10-15), with a taper rule for raised parts |
| P0.5 Shadow outset | **Passed** (2026-10-15) |
| P0.6 CSS parity | **Passed** (2026-10-15): budget mean ≤ 2, p95 ≤ 10 luminance levels |

## P0.1 Projective hits

**Question.** Does `updateElementGeometry` with a perspective `canvasTransform` (non-zero `m34`) give
exact native hits on the installed Canary?

**Answer: yes.** The browser keeps all 16 coefficients, reports the matrix as 3D, and hit-tests the
drawable element through the full projection. Drawn pixels, `elementFromPoint` and real pointer clicks
agree exactly with the projection on every tested tilt, at DPR 1 and 2, headless and headful.

### Method

- Page: [`ui-probe-projective.html`](../../examples/playground/ui-probe-projective.html), source
  [`src/ui-probes/projective.ts`](../../examples/playground/src/ui-probes/projective.ts).
  Test: [`tests/browser/ui-probe-projective.test.mjs`](../../tests/browser/ui-probe-projective.test.mjs).
- Raw WebGPU and HTML-in-Canvas, no Underglass runtime. A drawable face (320 by 200 CSS pixels) holds
  four native buttons in distinct colours. Each native `paint` uploads it with
  `GPUQueue.drawElementImageToTexture`, and it is drawn onto a quad by one 4x4 matrix
  (element-local CSS pixels to canvas CSS pixels, perspective included). The same matrix is
  registered with `canvas.updateElementGeometry(face, { canvasTransform })`.
- For each tilt the test:
  1. compares all 16 coefficients of `getElementTransform` with the requested matrix (within 1e-5)
     and checks `is2D`;
  2. scans the canvas every 4 CSS pixels, keeps points at least 3 local pixels from any boundary,
     and checks that `elementFromPoint` and the decoded output pixel match the target given by the
     exact inverse projection;
  3. counts how many of those points a flat stand-in (the same matrix without its perspective row)
     would classify differently, and requires more than 50 for every tilted case, so a pass cannot
     come from an affine or bounding-box shortcut;
  4. clicks each button's projected centre with real pointer input and checks that only that
     button's click count changes.

### Results

Chrome Canary 158.0.8106.0 on Windows 11, emulated DPR 1 and 2, headless and in a headful window
(identical results).

| Tilt (rotateX, rotateY, perspective) | Points checked | Points an affine stand-in gets wrong | Hit mismatches | Pixel mismatches | Clicks |
| --- | --- | --- | --- | --- | --- |
| Flat (0°, 0°, none) | 15,792 | 0 | 0 | 0 | 4 of 4 correct |
| 20°, −35°, 700 px | 15,957 | 2,459 | 0 | 0 | 4 of 4 correct |
| −30°, 45°, 600 px | 16,089 | 6,397 | 0 | 0 | 4 of 4 correct |
| 0°, 55°, 900 px | 16,241 | 3,486 | 0 | 0 | 4 of 4 correct |

### What this settles for the plan

- Panels may be **tilted at rest**, not only during transitions: the browser supports exact
  projective hit geometry for a planar face.
- Core work item 6 in [Contract changes](plan.md#contract-changes) (projective canonical matrix,
  admission check and native hit witnesses) is unblocked.

### Limits

- This is the browser's capability, measured with raw WebGPU. Underglass core is still affine-only
  (`validateGeometry` requires `is2D`); its projective support needs its own implementation and
  GPU tests.
- Not covered: `canvasClip` under a perspective transform (rotated clips are already hit-tested by
  bounding box, Chromium 573454036 / WICG #186), overlapping tilted faces and hit order, text
  editing (caret, selection, IME) on a tilted face, and faces tilted past about 60°.
- DPR 2 is emulated through the device scale factor; physical display migration is not tested.

## P0.2, P0.3 and P0.5: relief material pass, its cost, and the shadow outset

**Questions.**
- **P0.2:** can a colour-only shading pass light an **interactive** panel at rest without moving
  pixels, breaking hits or lowering text contrast?
- **P0.3:** how many relief primitives can a panel carry, and do state changes avoid recapture?
- **P0.5:** can a panel's shadow be drawn outside its box while hits stay inside it?

**Answers.**
- **P0.2: yes.** Interiors are exactly the capture times one brightness factor, and native hits
  match the DOM layout. Hover, press and keyboard focus redraw with no capture, and typing captures
  fresh pixels.
- **P0.3:** 256 primitives per panel costs about 1 ms more per frame than 5 primitives.
- **P0.5: yes.** The panel's shadow falls outside its box, and those pixels hit the canvas, not the
  panel.
- **Token finding:** the hover brightening budget nearly uses up the accent button's contrast
  margin (below).

### Method

- Page: [`ui-probe-relief.html`](../../examples/playground/ui-probe-relief.html), source
  [`src/ui-probes/relief.ts`](../../examples/playground/src/ui-probes/relief.ts).
  Test: [`tests/browser/ui-probe-relief.test.mjs`](../../tests/browser/ui-probe-relief.test.mjs).
- Raw WebGPU and HTML-in-Canvas, no Underglass runtime. A 440 by 280 panel holds a heading, a text
  field, a checkbox and two buttons, styled in **face mode**: flat colours, no CSS shadows or
  outlines. Each native `paint` uploads it with `drawElementImageToTexture`.
- The fragment shader samples the capture at exactly the pixel the DOM laid it out (no displacement),
  then lights **relief primitives**: one rounded rectangle per `[data-relief]` control plus the panel.
  - **Bevel:** the signed distance gives a quarter-round bevel normal, lit by one key light from the
    top left.
  - **Wells:** inputs and tracks invert the bevel normal.
  - **Cast shadows:** raised shapes cast a shadow offset away from the light by their height.
  - **Interiors:** brighten on hover and darken on press, within an interior budget (4%).
  - **Focus:** keyboard focus adds an accent edge.
- Hover, press and focus come from native events on the original controls and change only the
  primitive buffer, never the DOM.
- The quad is drawn 40 px larger than the panel on every side (the **outset**), so the panel's own
  shadow can fall outside its box. Hit geometry is still the panel's box.

### Results

Chrome Canary 158.0.8106.0, Windows 11, emulated DPR 1 and 2, headless and headful (same results).

| Check | Result |
| --- | --- |
| Interiors at rest versus the unlit capture (text field, checkbox, both buttons) | Factor 1.000, worst deviation 0 levels |
| Save's interior while hovered versus the unlit capture | Factor 1.038, worst deviation 0.85 levels: a pure multiply, text included |
| Text contrast on lit faces | Cancel 15.68, text field 16.66, Save 5.17, unchanged from unlit; Save **4.85 while hovered** |
| Native hits, 11,700 grid points over the panel and outset | 0 mismatches (points within 2 px of a rounded edge are not judged; Chrome rounds corner hits by up to 1.2 px) |
| Panel shadow outside its box | Shadow side 176–184 on white; lit side 248–254; shadow pixels hit the canvas |
| Hover and press | Face brightens and darkens, the cast shadow shrinks on press, **0 captures** |
| Keyboard focus | Accent edge drawn around the focused text field (4.33:1 against the panel) |
| Typing | Fresh capture, typed text drawn, value correct |

**Cost (P0.3).** Each row is 300 animated frames with one control's hover changing every frame and
the given number of primitives in the loop. Times run from encode to queue completion on a 640 by 420
canvas. That includes presentation overhead, so they are not pure GPU time. Every row made 0 captures.

| Primitives | DPR 1 mean / p95 (ms) | DPR 2 mean / p95 (ms) |
| --- | --- | --- |
| 5 | 3.8 / 5.5 | 3.5 / 5.0 |
| 21 | 3.9 / 6.1 | 4.0 / 5.9 |
| 69 | 4.3 / 6.1 | 4.4 / 6.5 |
| 261 | 4.5 / 6.6 | 4.5 / 6.6 |
| 1,029 | 4.5 / 6.9 | 9.4 / 11.2 |

Headful runs gave the same pattern (DPR 2: 4.9 / 7.6 ms at 261 primitives, 9.5 / 11.5 ms at 1,029).

### What this settles for the plan

- **Material class:** the colour-only `"material"` effect class in
  [Contract changes](plan.md#contract-changes) is feasible as specified. Interiors only change by a
  bounded factor, and nothing moves.
- **Primitive budget:** **256 relief primitives per panel**. Every primitive is evaluated for every
  pixel, so cost grows with primitives times pixels. At DPR 2, 1,024 primitives doubles the frame
  time. Core should cull primitives per tile before raising the budget.
- **Shadow outset:** works as a draw-only extension of the layer quad.
- **Token rule for Phase 1:** text contrast must hold at the largest interior brightening and
  darkening, not only at rest. White on accent blue drops from 5.17 to 4.85 at +3.8%, so accent
  colours need a margin above 4.5:1. The build-time contrast check must test the brightened and
  darkened face colours.

### Limits

- **Browser capability only:** Underglass core has no material class, primitive buffer or outset
  yet; each needs its own implementation and GPU tests.
- **Probe-level visuals:** the light, bevel and shadow values are placeholders. Phase 1 prototypes
  set the real look.
- **Flat panel only:** relief on a tilted panel, and several panels sharing one light, are not
  probed.
- **Focus edge contrast:** measured at one point against the panel colour only.
- **Timing:** queue-completion time is not GPU execution time. No `timestamp-query` measurement was
  made.

## P0.4 Object pass

**Question.** Can native controls be drawn as real 3D objects on the shared engine, using PBR materials,
lights, shadow maps and many meshes, while clicks land only on the native controls?

**Answer: yes.**
- **Exactness:** native hits match the DOM layout, and no drawn key pixel falls outside its native
  button.
- **No recapture:** pressing, switching, sliding and keyboard focus move or light the objects
  without a new capture.
- **Cost:** 16,384 extra instanced meshes add well under 1 ms per frame.
- **Design rule:** raised parts must be **tapered** by at least the perspective drift (below).

### Method

- Page: [`ui-probe-objects.html`](../../examples/playground/ui-probe-objects.html), source
  [`src/ui-probes/objects.ts`](../../examples/playground/src/ui-probes/objects.ts).
  Test: [`tests/browser/ui-probe-objects.test.mjs`](../../tests/browser/ui-probe-objects.test.mjs).
- **Engine:** one Babylon Lite 1.33.0 WebGPU engine on the canvas. World units are canvas CSS pixels.
  The panel's front is the z = 0 plane, and a perspective camera at distance D maps that plane 1:1
  onto the canvas, so the panel's canvas transform is a plain translation.
- **Capture:** each native `paint` uploads the panel with `drawElementImageToTexture` into an sRGB
  dynamic texture, drawn unlit without tone mapping, so the HTML keeps its exact colours.
- **Lighting:** a directional key light with a PCF shadow map, plus a hemispheric fill. The panel
  is a slab that casts its own shadow, and shadow-only catchers sit on the panel and the
  backdrop.
- **Objects.** Each native control's box is the **base** of its object:
  - **Button:** a tapered key whose top (inset by the taper) carries the captured label, and which
    travels on press.
  - **Switch** (`role="switch"` checkbox, `appearance: none`): a track and a knob that slides
    when the checkbox changes.
  - **Range input** (`appearance: none`): a rail and a puck placed from the native value.
- **No recapture:** states come from native events and only move meshes or change material
  values (`markMaterialUboDirty`).

### Results

Chrome Canary 158.0.8106.0, Windows 11, emulated DPR 1 and 2, headless and headful (same results).

| Check | Result |
| --- | --- |
| Captured panel colour, unlit | (233, 235, 239), exact |
| Native hits, 9,600 grid points | 0 mismatches (points within 2 px of a rounded edge are not judged) |
| Key containment: 408 points 1.5, 3 and 5 px outside the native button | 0 drawn as key, 0 hit the button |
| Press (real pointer) | Key travels 6 px; its cast shadow disappears from the sampled point; **0 captures** |
| Switch (real click) | Native checkbox checked; knob drawn at the on position; **0 captures** |
| Slider (real click, then arrow keys) | Native value 80, then 78; the puck follows within 1% |
| Keyboard focus | Emissive glow on the focused knob |

**Cost.** Each row is 120 animated frames, timed from `renderFrame` to `waitForGpuIdle`. That is
not pure GPU time. The 18 draw calls stay constant because the extra meshes are thin instances.

| Extra instanced meshes | DPR 1 mean / p95 (ms) | DPR 2 mean / p95 (ms) |
| --- | --- | --- |
| 0 | 3.5 / 4.8 | 3.9 / 5.1 |
| 1,024 | 3.9 / 5.1 | 4.2 / 5.7 |
| 16,384 | 4.3 / 5.8 | 4.1 / 5.4 |

**Perspective drift.** A point at height h above the panel moves on screen by
`r · h / (D − h)`, where r is its distance from the vanishing point. Seeing an object's sides *is*
this drift; you cannot have one without the other. Largest drift over the probe panel, in CSS px:

| Camera distance D | h = 2 | h = 4 | h = 8 | h = 12 | h = 16 |
| --- | --- | --- | --- | --- | --- |
| 800 | 0.65 | 1.31 | 2.63 | 3.97 | 5.32 |
| 1,600 | 0.33 | 0.65 | 1.31 | 1.97 | 2.63 |
| 2,400 | 0.22 | 0.44 | 0.87 | 1.31 | 1.75 |
| 4,000 | 0.13 | 0.26 | 0.52 | 0.78 | 1.05 |

### What this settles for the plan

- **Objects level:** feasible as specified. The native element is the object's base, and meshes
  are decoration driven by native state.
- **Taper rule for the spec:** a raised part's top must be inset from its base by at least its
  drift, so every drawn pixel of the object stays inside the native control. The probe uses
  height 8, taper 3, D = 1,600 (drift 1.31).
  - **Camera distance must scale with the stage:** D ≥ r · h / taper + h, where r is the stage's
    half-diagonal.
  - **Example:** a 1,920 by 1,080 stage (r ≈ 1,100) with h = 8 and taper 3 needs D ≥ 2,950.
  - Parts that must stand taller (levers, knobs) sit inside a native control whose box covers
    their whole travel.
- **Mesh budget:** meshes are not the bottleneck when instanced: 16,384 extra instances cost under
  1 ms here. The budget should count **draw calls** (distinct object kinds and materials), not
  instances. The spec sets it per panel once the Tier A objects exist.
- **Adjust policy:** this machine shows no pressure, so default thresholds need measurements on a
  low-end GPU. Recorded as unperformed validation.
- **Lite API notes for core:**
  - An sRGB capture texture is needed for unlit HTML to keep its colours.
  - Material values are re-uploaded only after `markMaterialUboDirty`.
  - Emissive must be set before the scene is built.
  - Screenshots complete over later frames.

### Limits

- **Browser capability only:** this is a raw Babylon Lite probe. Underglass core has no object
  pass yet.
- **No IBL:** there is no environment map, so "metal" parts are glossy dielectrics here. Real metal
  needs an environment (Phase 1).
- **Rough geometry:** the key is a tapered box without rounded edges; Lite has no rounded box, so
  real objects need generated geometry.
- **Flat panel only:** objects on a tilted panel, and the CSS fallback for objects, are not
  probed.
- **Fast machine:** timing comes from one fast machine; low-end GPUs are not measured.

## P0.6 CSS parity

**Question.** How close can the plain HTML and CSS presentation get to the GPU relief when both come
from the same tokens?

**Answer: close.** Over the whole 640 by 420 stage, the tuned CSS recipe differs from the GPU render
by a mean of 1.3 luminance levels (of 255) and 7 levels at the 95th percentile, in every state.
That is the **parity budget**: mean ≤ 2, p95 ≤ 10. The remaining difference sits in the bevel bands,
which CSS can only approximate with inset shadows.

### Method

- **Pages:** [`ui-probe-parity.html`](../../examples/playground/ui-probe-parity.html), source
  [`src/ui-probes/parity.ts`](../../examples/playground/src/ui-probes/parity.ts). It is the relief
  probe's panel in plain DOM, at the same position.
- **One token source:** the relief tokens now live in
  [`src/ui-probes/tokens.ts`](../../examples/playground/src/ui-probes/tokens.ts), used by both the
  GPU pass and the CSS recipe.
- **The CSS recipe**, generated from the tokens:
  - Cast shadows use the same light and heights: offset `−light.xy / light.z · h`.
  - Bevels and wells are inset light and dark edges along the light axis.
  - Hover and press change the height and apply `filter: brightness()` within the interior
    budget.
  - Focus is a 3 px accent outline.
- **Recipe constants:** these are constants of the approximation (edge strengths, offsets, blurs),
  not design tokens. They were tuned by a coordinate-descent sweep against the GPU render at
  DPR 1, which cut the difference from mean 2.71 / p95 23 to 1.29 / 7.
- **Test:** [`tests/browser/ui-probe-parity.test.mjs`](../../tests/browser/ui-probe-parity.test.mjs).
  It drives rest, hover, press and keyboard focus with real input on both pages, with reduced
  motion so CSS transitions do not blur the comparison. It then compares the stages pixel by pixel
  in luminance, writes difference images, and holds every state to the budget.

### Results

Chrome Canary 158.0.8106.0, Windows 11, DPR 1 and 2, headless and headful (same results). Values are
mean / 95th percentile luminance difference.

| State | Whole stage | Bevel bands | Panel shadow | Control shadows | Face | Control interiors |
| --- | --- | --- | --- | --- | --- | --- |
| Rest | 1.28 / 7 | 6.26 / 16.3 | 2.74 / 8 | 0.98 / 7 | 0.17 / 0 | 0.83 / 8.0 |
| Hover | 1.31 / 7 | 6.52 / 16.9 | 2.74 / 8 | 1.21 / 7 | 0.17 / 0 | 0.63 / 4.8 |
| Press | 1.26 / 7 | 6.05 / 16 | 2.74 / 8 | 0.79 / 6 | 0.17 / 0 | 0.88 / 5.0 |
| Focus | 1.80 / 8 | 6.36 / 16.9 | 2.74 / 8 | 8.51 / 139 | 0.17 / 0 | 1.27 / 7.6 |

The table shows DPR 1; DPR 2 is within 0.15 of every whole-stage value.

### What this settles for the plan

- **The static look is achievable in CSS.** The plan's decision that the CSS fallback is a complete
  design system for the static look holds: at rest, hover and press the two presentations differ by
  about 1 level on average.
- **Parity budget for later tests:** every component state must stay within mean ≤ 2 and
  p95 ≤ 10 luminance levels of its GPU render. The spec's token build generates the CSS recipe
  from the tokens. The recipe constants are tuned once per renderer change, not per component.
- **Focus edge:** the GPU probe's focus ring uses a hard distance threshold, so it is aliased and
  steps along its top edge at DPR 1. That is the 139-level outlier in the control-shadow band. Core's
  material pass must anti-alias edges (`smoothstep` on the distance), as CSS outlines are.

### Limits

- **Relief only:** the Objects level has no CSS parity target. Its fallback is the CSS relief by
  design.
- **One panel and theme:** one layout and one light theme were compared; dark and high-contrast
  themes come with the Phase 1 tokens.
- **Luminance only:** hue differences are not measured. The recipe changes no hues except shadow
  darkness, which is neutral.
- **Tuning scope:** the recipe was tuned on this panel at DPR 1; other component shapes may need
  their own check, which the parity test provides.

## Upstream check

Applies to every probe above.

- WICG html-in-canvas: `5fb3df86d84de598c7f0fcfc5ee53de1df067e7d` (2026-10-09), the latest commit
  when checked on 2026-10-15. The explainer types `canvasTransform` as `DOMMatrixInit`; its own WebGL
  3D-card example still registers only an axis-aligned rectangle, and precise hit testing
  ([WICG #148](https://github.com/WICG/html-in-canvas/issues/148)) is open.
- Chromium hotlist 6783002: not accessible without sign-in on 2026-10-15; no issue status read.
- Browser actually tested: Chrome Canary 158.0.8106.0 (Windows 11), launched with
  `--enable-blink-features=CanvasDrawElement,ElementCanvasTransform --enable-experimental-web-platform-features`.
