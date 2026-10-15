# Strata Phase 0 report

Results of the feasibility probes in the [plan](plan.md#phase-0-upstream-check-and-feasibility-probes).
Each probe is a playground page plus a browser test. A probe answers what the installed browser
does; it is not Underglass runtime support, which still has to be built and tested in core.

| Probe | Status |
| --- | --- |
| P0.1 Projective hits | **Passed** (2026-10-15) |
| P0.2 Material pass | Not started |
| P0.3 Relief cost | Not started |
| P0.4 Object pass | Not started |
| P0.5 Shadow outset | Not started |
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

### Upstream check

- WICG html-in-canvas: `5fb3df86d84de598c7f0fcfc5ee53de1df067e7d` (2026-10-09), the latest commit
  when checked on 2026-10-15. The explainer types `canvasTransform` as `DOMMatrixInit`; its own WebGL
  3D-card example still registers only an axis-aligned rectangle, and precise hit testing
  ([WICG #148](https://github.com/WICG/html-in-canvas/issues/148)) is open.
- Chromium hotlist 6783002: not accessible without sign-in on 2026-10-15; no issue status read.
- Browser actually tested: Chrome Canary 158.0.8106.0 (Windows 11), launched with
  `--enable-blink-features=CanvasDrawElement,ElementCanvasTransform --enable-experimental-web-platform-features`.
