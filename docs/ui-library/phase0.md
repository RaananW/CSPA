# Strata Phase 0 report

Results of the feasibility probes in the [plan](plan.md#phase-0-upstream-check-and-feasibility-probes).
Each probe is a playground page plus a browser test. A probe answers what the installed browser
does; it is not Underglass runtime support, which still has to be built and tested in core.

| Probe | Status |
| --- | --- |
| P0.1 Projective hits | **Passed** (2026-10-15) |
| P0.2 Material pass | **Passed** (2026-10-15), one token finding |
| P0.3 Relief cost | **Measured** (2026-10-15): budget 256 primitives per panel |
| P0.4 Object pass | Not started |
| P0.5 Shadow outset | **Passed** (2026-10-15) |
| P0.6 CSS parity | Not started |

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

## Upstream check

Applies to every probe above.

- WICG html-in-canvas: `5fb3df86d84de598c7f0fcfc5ee53de1df067e7d` (2026-10-09), the latest commit
  when checked on 2026-10-15. The explainer types `canvasTransform` as `DOMMatrixInit`; its own WebGL
  3D-card example still registers only an axis-aligned rectangle, and precise hit testing
  ([WICG #148](https://github.com/WICG/html-in-canvas/issues/148)) is open.
- Chromium hotlist 6783002: not accessible without sign-in on 2026-10-15; no issue status read.
- Browser actually tested: Chrome Canary 158.0.8106.0 (Windows 11), launched with
  `--enable-blink-features=CanvasDrawElement,ElementCanvasTransform --enable-experimental-web-platform-features`.
