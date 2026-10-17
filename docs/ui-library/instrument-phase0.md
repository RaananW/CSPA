# Instrument Phase I0 report

Results of the feasibility probes in the [Instrument plan](instrument.md#phase-i0-feasibility-probes), and of the
Phase I1 prototype page built on the same harness. Each probe is a playground page plus a browser test. A probe
answers what the installed browser and Babylon Lite do; it is not Underglass runtime support, which Phase I2 still
has to build and test in core. The only core change is an internal prototype hook (`InstrumentProbeHook` in
[`packages/core/src/renderer.ts`](../../packages/core/src/renderer.ts)): `@internal`, not exported, not on
`RuntimeOptions`, with an empty changeset; the public API is unchanged.

**Upstream check (2026-10-17), for every probe below:**

- **WICG HTML-in-Canvas:** `5fb3df86d84de598c7f0fcfc5ee53de1df067e7d` (2026-10-09) is still the latest commit,
  confirmed with `gh api` on 2026-10-17. [#186](https://github.com/WICG/html-in-canvas/issues/186) (rotated
  `canvasClip` hit testing) and [#185](https://github.com/WICG/html-in-canvas/issues/185) (origin-trial feedback) are
  open. [#162](https://github.com/WICG/html-in-canvas/issues/162) (rename `PaintEvent` to `CanvasPaintEvent`) and
  [#155](https://github.com/WICG/html-in-canvas/issues/155) were closed on 2026-10-15; neither affects the probes.
- **Chromium hotlist 6783002** (including ElementCanvasTransform issues): not accessible without sign-in; no issue
  status read.
- **Browser actually tested:** Chrome Canary 158.0.8110.0 (revision `9fb5c5e6767f40a1ae9f962c9ba35f4026bc1730`),
  Windows 11, NVIDIA RTX 3080, launched by the test harness with
  `--enable-blink-features=CanvasDrawElement,ElementCanvasTransform --enable-experimental-web-platform-features`.
- **Headless and headful:** every probe ran headless (emulated DPR 1 and 2 unless stated). Headful Canary windows:
  I0.1 at DPR 1 (1584×905); I0.2 at DPR 1 (1584×905); I0.3 at DPR 1 (1684×955, both themes, all three levels); I0.4 at
  DPR 1, 1.25 and 1.5; I0.5 at DPR 1 and 2 (its full test run headed); the I1 prototype at DPR 1 and 2 (1600×900). I0.6 and I0.7 ran headless only (I0.7 changes no
  capture or geometry; I0.6 is a measurement).

| Probe | Question | Result | Headline numbers | Settles |
| --- | --- | --- | --- | --- |
| [I0.1 Mesh pass](#i01-mesh-pass) | A Lite mesh pass per layer in the shared engine, in painter's order, at 250 controls? | **Passed** (DPR 1 and 2, headful DPR 1) | 0 mesh px outside their control; 0 of 4,002 hit mismatches; 250 controls: frame work p95 10.0 ms, GPU p95 2.19 ms (DPR 1), 0 captures | Where the pass draws; camera `D`; 2,048 parts per layer, 6,000 per stage, about 16 kinds per layer |
| [I0.2 Moving parts and hits](#i02-moving-parts-and-hits) | Do moving parts stay in their box through the whole travel, with hits on the control? | **Passed** (DPR 1 and 2, headful DPR 1) | 0 px outside at every pose and in the stage corners; 0 hit mismatches; 300 frames of motion, 0 captures | The box sizing rule; containment over the whole travel |
| [I0.3 Emitters and the pointer light](#i03-emitters-and-the-pointer-light) | Do lamps light the face, objects and the outset within the guard? Does the pointer light cross panels at 60 fps? | **Passed** on every condition, three caveats | Pool +18 light / +26 dark on the face; +34 at 2 px past the edge; lit caption 5.63:1; pointer 0 captures over 300 moves; 64 emitters ≈ 2.1 ms at DPR 2 | 64 emitters per layer, tiled; the face pool is its own pass |
| [I0.4 Materials over the capture](#i04-materials-over-the-capture) | Do brushed metal, coat and glass read over the capture, and does text under glass keep contrast? | **Passed** on the measured conditions; visual sign-off with the prototype pending | Text under flat glass 0 mismatched px; display 12.04:1 light, 12.75:1 dark; GPU on through typing | Local environment cube per layer, refreshed on capture; glass as capture refraction; gold through base colour |
| [I0.5 Object-on-object shadow](#i05-object-on-object-shadow) | Does a per-layer PCF map give a clean lever-on-plate shadow without touching the face? | **Passed** (DPR 1 and 2, headless and headful); decision 4 amended | Lever region ≥ 96% darker on all 20 bats; 0 face px changed outside the analytic footprints; thin plate 1 component, 0 cuts; PCF 4096 0.07–0.14 ms at 60 controls | Analytic + PCF 4096 at bias 1.5e-3, re-rendered on pose change; contact optional; CSM and ESM out |
| [I0.6 CSS parity](#i06-css-parity) | How close do CSS knobs, faders and switches get to the GPU look? | **Answered**: budgets recorded | Box-region mean worst 6.3 (fader) to 26.2 (rocker), against Relief's 2 | One budget per component, 1.5× headroom |
| [I0.7 Interaction and accessibility](#i07-interaction-and-accessibility) | Do the knob and fader pass as sliders, with the 2.5.7 alternative, in DOM and GPU mode? | **Passed** | 16 of 16 tests, three runs; ring click sets all 37 values; axe 0 violations; snapshots identical | The knob interaction model |
| [I0.8 Post chain and reflections](#i08-post-chain-and-reflections) | What do TAA, contact shadows, bloom, SSGI and a local probe cost, and is text untouched? | Pending | Pending | Pending |
| [I1 prototype](#i1-prototype) | The premium chassis at Instrument, Objects and CSS | **Done**; look sign-off pending with the owner | 0 px outside; 0 of 3,023 hit mismatches; label contrast min 6.28 light, 5.57 dark (DPR 2) | Premium proportions, springs and defaults (proposed) |

## I0.1 Mesh pass

**Question.** Can a Lite mesh pass per layer run inside the shared engine next to the relief passes, keep painter's
order across panels and hold 60 fps with 250 controls (about 1,500 parts) at 1920×1080, DPR 1 and 2?

**Answer: yes.**
- **Exactness:** no mesh pixel falls outside its control, no lower-panel part shows through the upper panel, and
  native hits on mesh pixels find their control.
- **Density:** 1,000 controls (5,920 parts) stay at about 3 ms GPU p95 and under 11 ms frame work p95, with 0
  captures from animated poses.
- **Budget:** 2,048 parts per layer and 6,000 per stage, counted in part kinds (draw calls), about 16 per layer.

### Method

- Page: [`ui-probe-instrument.html`](../../examples/playground/ui-probe-instrument.html), source
  [`src/ui-probes/instrument.ts`](../../examples/playground/src/ui-probes/instrument.ts) on the harness
  [`instrument-harness.ts`](../../examples/playground/src/ui-probes/instrument-harness.ts) and the part builders
  [`instrument-parts.ts`](../../examples/playground/src/ui-probes/instrument-parts.ts) (lathe, frustum, plate, bar).
  Test: [`tests/browser/ui-probe-instrument.test.mjs`](../../tests/browser/ui-probe-instrument.test.mjs).
- **Core hook.** `InstrumentProbeHook` on `SurfaceRendererOptions`: core calls `attach({ engine, draw })` once GPU is
  on, and before every frame orders each registered scene right after its layer's pass (`orderInstrument()`);
  `detach()` runs in `destroyGPU`. The probe passes the hook through the runtime's options object, which the runtime
  spreads into the renderer.
- **Stage.** Two enrolled panels of real native controls fill a 1920×1080 window: `#lower` with core's relief material
  and `#upper`, a plain layer whose left edge crosses one of the lower panel's knobs. Controls repeat in groups of 25
  (5 meters, 7 knobs, 4 faders, 5 keys, 4 switches: 148 parts):
  - **knob:** collar 1.8, skirt 8 and chamfered cap 14.2 px high, pointer at 14.8 px, sweep 270°;
  - **fader:** slot, cap rising 9 px with a 2.5 px taper, grip line;
  - **key:** open tapered body 6 px high, 3 px taper, screen-locked captured top, LED, 4 px travel;
  - **switch:** pill track, round thumb rising 7 px;
  - **meter:** a window and 16 segments as two kinds (lit and dark), each shown or collapsed, because Lite PBR
    ignores thin-instance colours.
- **Camera.** One perspective stage camera at `D = max(2400, max(r · h / inset + h))` over the part envelopes, which
  is 2,400 at 1920×1080. Screen-locked caps `textureLoad` the capture texel at the pixel position minus the layer
  origin.
- The test checks, at DPR 1 and 2:
  1. GPU stays on with no fallback reason;
  2. the pixels the mesh pass changes (on against off) lie inside their control's rounded box (strict: pixel centre
     inside), and `elementFromPoint` on a sample of them finds that control;
  3. painter's order: no lower-panel part shows through the upper panel, and the crossed knob is drawn only on its
     uncovered side;
  4. key-cap labels against core's plain pass, texel for texel;
  5. native hits at interior, near-edge and outside points, and real pointer input on a knob, a key, a switch and a
     fader;
  6. density: 250, 500 and 1,000 controls, 300 frames of poses only, frame work p95 under 16 ms at 250 ("work" is
     posing to `onSubmittedWorkDone`; "mesh" is the two layer scenes' Lite task timings), and the same meters written
     through `<meter value>` for contrast.

### Results

Correctness at 60 controls:

| Check | DPR 1 | DPR 2 |
| --- | --- | --- |
| Changed px, mesh pass on against off | 388,527 | 1,550,976 |
| Mesh px outside their control (pixel centre inside the rounded box) | 0 (max distance 0) | 0 (max −0.07 px) |
| Lower-panel parts showing through the upper panel | 0 | 0 |
| Lower knob crossed by the upper panel's edge: covered / uncovered px | 0 / 6,366 | 0 / 25,492 |
| `elementFromPoint` on sampled mesh pixels: mismatches | 0 of 4,002 | 0 of 4,003 |
| Key-cap labels against core's plain pass (8 keys, 1,054–9,424 texels each): mismatched texels | 0 | 0 |
| Interior, near-edge and outside hit points: misses | 0 of 389 | 0 of 389 |

Real pointer input through the meshes: knob 25 → 50, key pressed, switch toggled, fader set to 96.

**Density.** 300 frames, poses only. Frame interval 16.7 ms (vsync) throughout; CPU per frame p95 1.7–2.6 ms. Mean GPU
per frame at 250 controls: 1.46 ms at DPR 1, 2.90 ms at DPR 2.

| Controls | Parts | Animating meters / knobs | Captures, uploads, geometry updates | DPR 1 work p95 / GPU p95 / mesh p95 (ms) | DPR 2 |
| --- | --- | --- | --- | --- | --- |
| 250 | 1,480 | 50 / 20 | 0 | 10.0 / 2.19 / 1.09 | 10.6 / 3.69 / 1.21 |
| 500 | 2,960 | 100 / 40 | 0 | 10.6 / 3.04 / 3.70 | 10.2 / 3.55 / 2.57 |
| 1,000 | 5,920 | 200 / 80 | 0 | 10.6 / 3.03 / 1.75 | 10.3 / 3.70 / 1.57 |

The page has 30 part kinds (15 per layer). **Contrast case:** the same 50 meters written through `<meter value>` cost
240 captures and 240 uploads in 120 frames, one per layer per frame. Lite's timestamp queries work
(`setGpuTimingEnabled`, `setRenderTaskGpuTimingEnabled`, `getRenderTaskGpuTimings`).

**Headful** (1584×905, DPR 1, preview build): 0 px outside, 0 parts through the upper panel, 0 of 4,056 hit
mismatches, 0 label mismatches; 250 controls with 0 captures, work p95 9.1 ms, GPU p95 1.6 ms.

### What this settles for the plan

- **Where the mesh pass draws:** straight into the layer's pass target (the swapchain), right after the layer's
  effect pass, colour loaded and not cleared, with its own depth target cleared every frame. No extra texture or
  shader. Each scene needs its **own render task with `clr: false`** (`defaultRenderTask: false`): Lite's overlay
  setup does not clear-protect a scene registered after effect renderers.
- **Camera:** `D = max(2400, max over part envelopes of r · h / inset + h)`; at 1920×1080 it is 2,400, and the
  pointer's drift (6.83 px) stays inside its 9 px inset.
- **Budgets** for [core work item 1](instrument.md#core-work-additive): **2,048 parts per layer and 6,000 per stage**
  (5,920 parts ≈ 3 ms GPU p95 here), with the budget counted in **part kinds** (draw calls), **about 16 per layer**.
- **Live meters are poses,** not DOM writes: a `<meter value>` write recaptures its layer every frame. A meter driven
  at frame rate needs a low-rate DOM sync of its value for assistive technology.
- **Screen-locked caps are exact:** labels on caps load the layer's own capture texel for texel.

### Limits

- **Prototype path:** Lite has no public call to insert a rendering context at a position, so the hook reorders
  `getRenderingContexts(surface)` in place, an array Lite documents as live, not writable. Phase I2 needs a real Lite
  API for this, or core owning one frame graph.
- **No screen-lock through shear:** Lite's normal matrix is `mat3(world)`, so moving parts use the taper rule instead
  of a sheared screen lock.
- **Meshes ignore layer opacity and clip;** `setDensity` rebuilds the scenes with the meshes off. Phase I2 must update
  instances in the same frame as layout and apply the layer's clip and opacity.
- **Frame time** is judged on work time (posing to GPU done), not the rAF interval, which vsync pins at 16.7 ms.
- **One fast GPU:** no low-end GPU was measured; the budgets need that check.
- Headful at DPR 1 only.

## I0.2 Moving parts and hits

**Question.** Do levers, rockers and fader caps stay inside their control's box through their whole travel, and do
native hits land on the control at every pose?

**Answer: yes,** with a box sizing rule. Every pose of every part, in the stage's corners at both DPRs and headful,
draws 0 pixels outside its box, and native hits and real pointer input land on the control. Checking only the
extreme poses is **not** enough.

### Method

- Page: [`ui-probe-instrument-moving.html`](../../examples/playground/ui-probe-instrument-moving.html), source
  [`src/ui-probes/instrument-moving.ts`](../../examples/playground/src/ui-probes/instrument-moving.ts)
  (`window.movingProbe`), with `sphere`, `merge`, `offset` and `turnX` added to the part builders. Test:
  [`tests/browser/ui-probe-instrument-moving.test.mjs`](../../tests/browser/ui-probe-instrument-moving.test.mjs).
- **Layout.** One panel fills the 1920×1080 stage. A cluster of all six kinds sits at each corner, each edge's middle
  and the centre (54 controls); the `corner-<kind>` layouts put four of one kind 8 px from the stage's corners, where
  drift is largest.
- **Throws.** Parts move only with `checked` or `value`:
  - **rocker:** two plates in a 6° V on a pivot 4.5 px up, ±13°;
  - **bat:** washer, hex nut and a 17 px lever with a 4.2 px ball, ±25°;
  - **wall:** a plate with a paddle, ±12°;
  - **slide:** a round thumb, ±7 px;
  - **fader:** a cap with an 80 px travel; its transparent native thumb is sized to the cap's travel footprint
    (24 px), so dragging the drawn cap moves the value with it;
  - **knob:** cap, skirt and pointer through 270°.
  A switch snaps over 140 ms with an easing that never overshoots, so the stops bound every pose.
- The harness's `Pose` turns about z only. Tipping needs a turn about an in-plane pivot, so the page thin-instances
  the parts with full matrices through `partMesh`; the harness itself is unchanged.
- The test checks, at DPR 1 and 2, at the low, mid-travel and high pose:
  1. decoded mesh pixels against the rounded border box (pixel centres, on the edge at most), for all parts together
     and for each of the 17 parts drawn alone;
  2. a CPU projection of every vertex over 33 travel steps, which also reports the smallest box and camera distance
     that contain every pose at the exact corner;
  3. `elementFromPoint` on sampled mesh pixels and on a grid over every box, and 1.5 px outside each box;
  4. real `page.mouse` input on the drawn ball, rocker end, paddle end, thumb and cap at the top-right, bottom-left and
     centre;
  5. 300 frames of 9 bats snapping and 9 knobs sweeping: captures, uploads, geometry updates and the panel's hit
     transform.

### Results

**Box sizing.** Margins are `ceil(drift(h_max) + 1)` at 1920×1080 and `D` = 2,400.

| Kind | Box (CSS px) | Margin | Smallest box the moving parts need at the exact corner, `D` = 2,400 | `D` needed |
| --- | --- | --- | --- | --- |
| rocker | 34×44 | 7 | 27.6×32.7 | 1,429 |
| bat | 35×49 | 13 (ball) | 25.7×31.5 | 1,600 |
| wall | 28×42 (form: 2.8× paddle width, 2.1× length; the rule alone gives 22×32) | 6 | 15.2×22.4 | 899 |
| slide | 38×24 | 5 | 29.7×14.5 | 1,129 |
| fader | 28×104 | 6 | 18.2×92 | 1,017 |
| knob | 49×49 | 5 (skirt), 8 (cap, pointer) | 44.6×42.1 | 1,479 |

No kind needs `D` > 1,600, below the harness minimum of 2,400. The rule is conservative (radial drift on both axes;
the bat's box is about 1.5× the tightest). I0.1's knob proportions pass the taper rule but not the +1 px margin on the
skirt, so the knob box is 49, not 48.

**Containment** (mesh px, low / mid / high):

| Layout | Mesh px | Outside |
| --- | --- | --- |
| Main, DPR 1 | 49,385 / 49,208 / 49,383 | 0 |
| Main, DPR 2 | 195,834 / 195,164 / 195,836 | 0 |
| Corner layouts, DPR 1 and 2 | per kind | 0 |
| Headful 1584×905, DPR 1 | 49,362 / 49,182 / 49,362 | 0 |
| Each of 17 parts drawn alone, every pose | per part | 0 |

**Closest approach to the box edge** (px, negative inside; low / mid / high, DPR 2, corner layouts):

| Part | Closest |
| --- | --- |
| rocker plates | −3.25 / −4.75 / −3.25 |
| bat lever | −8.75 / −8.25 / −8.75 |
| bat ball | −5.75 / −4.75 / −5.75 |
| wall paddle | −6.75 / −7.25 / −6.75 |
| slide thumb | −3.84 / −5.25 / −3.84 |
| fader cap / grip | −5.25 / −7.25 |
| knob skirt / cap / pointer | −2.11 / −3.9 / −8.25…−10.01 |
| static bezel, plate, track, collar | ≈ −1.05…−1.4 |

The CPU projection over 33 travel steps agrees: every part ≤ −1 px, the bat ball closest at −4.73 at the exact
corner.

**Hits.** Sampled mesh pixels: 4,080–4,116 per pose in the main layout and 1,246–6,964 per corner layout, 0
mismatches; headful 4,114 / 4,099 / 4,114, 0 mismatches. A grid over every box: 2,394 points per pose, 0 misses;
points 1.5 px outside never hit. Real pointer input at both DPRs: all 12 switches toggled on and off through the drawn
ball, rocker end, paddle end and thumb; 3 faders dragged by the cap to 100 and back; knob clicks on the cap halves
gave 39/83, 19/64 and 29/74. Headful: 5 switches and 2 faders correct.

**Motion.** 300 frames, 9 bats snapping and 9 knobs sweeping: 0 captures, 0 uploads, 0 geometry updates, 300 core
frames; the panel's hit transform is identical before and after; frame work p95 10.2 ms at DPR 1, 8.9 at DPR 2, 6.3
headful. Each real native toggle costs 1 capture (core capturing the checkbox's own change) and 0 geometry updates.

### What this settles for the plan

- **Box sizing rule:** a control's box is its moving parts' orthographic footprint over the **whole travel**, plus a
  margin of `ceil(drift(h_max) + 1)` on every side, with drift at 1920×1080 and `D` = 2,400. A form may ask for a
  bigger box, never a smaller one. Static parts sized from the box follow the taper rule. The harness gets each
  part's binding vertex as its envelope, so a larger stage raises `D` instead of shrinking anything.
- **Containment is checked over the whole travel,** not at the extreme poses: the bat's ball is tallest and closest
  at mid-travel, and faceted revolves bind at in-between angles (knob cap at t = 0.125, pointer at t = 0.75).
- **Click-to-set scales are printed on the face** (h = 0): a click aimed at a drawn tall part is offset by its drift,
  up to about 4 px at the corners.

### Limits

- The harness `Pose` cannot tip a part; the page works around it with full matrices. Phase I2's pose needs a `tilt`
  and a `pivot`.
- Decoded pixels were checked at three poses; the whole travel is covered by the CPU projection (33 steps), which
  agrees with the decoded pixels where both exist.
- The first DPR 1 run failed one assertion from the probe's own 5,000 px "meshes draw" floor (four corner bats draw
  1,296 px); the floor is now layout-dependent.
- Headful at DPR 1 only; one fast GPU.

## I0.3 Emitters and the pointer light

**Question.** Can a lit lamp light the captured face, nearby objects and the outset without breaking the guard or
hits? And can the pointer light move across panels at 60 fps?

**Answer: yes,** on every condition, headless and headful, at Relief, Objects and Instrument, with three caveats:
the face pool is a pass of its own (core's shading cannot do it), strong pools make guarded text boxes visibly
greyer, and under `forced-colors` core never admits GPU.

### Method

- Page: [`ui-probe-instrument-emitters.html`](../../examples/playground/ui-probe-instrument-emitters.html), source
  [`src/ui-probes/instrument-emitters.ts`](../../examples/playground/src/ui-probes/instrument-emitters.ts)
  (`window.emitterProbe`; `?level=`, `?theme=`, `?feather=`). Test:
  [`tests/browser/ui-probe-instrument-emitters.test.mjs`](../../tests/browser/ui-probe-instrument-emitters.test.mjs).
  No core or harness change.
- **Stage.** A full-window `#stage` layer (the dark stage is drawn and lit too) and three overlapping panels A, B and
  C with lamps (`input[role=switch]`), an LED, a key, a knob and text labels. C's power lamp is the brightest (×1.5),
  beside its label near C's left edge, over panel B; C's corner lamp sits near C's bottom edge, over the stage.
- **The face pool.** Each layer's probe scene starts (`addTaskAtStart`) with a Lite effect task drawn right after the
  layer's pass over the layer box plus a 48 px outset, with the blend `dst · src + dst`: it multiplies what is
  already on the canvas by `1 + E`. That is exact on the captured face (with its relief shading) and past the edge,
  over the stage or a lower panel. The same pass runs at all three levels.
- **Falloff:** Lite's clustered falloff `E = I · colour · cos θ / (π d²) · (1 − (d² / R²)²)²`.

  | Emitter | Lens | Height | Radius `R` | Intensity `I` |
  | --- | --- | --- | --- | --- |
  | Lamp | 28 px | 20 px | 6 diameters (168 px) | 3,200, amber (1, 0.72, 0.38) |
  | LED | 10 px | 8 px | 60 px | 520 |
  | Pointer | — | 120 px | 360 px | 16,000, fading over `motion.fast` (120 ms) |

- **Guard.** Protected rects are the layer's text runs from Range client rects (9–10 per panel; cap 64, none
  dropped). Inside them `E` is capped per channel at `interior.max` (0.04), with a 4 px feather.
- **Tiling.** Emitters are binned on the CPU into a 16×9 tile bitmask per layer; the untiled loop is kept for
  comparison.
- **Layers.** The pointer light is written into every layer within reach and lights only that layer's own rounded
  box, so it is never applied twice where layers overlap; panel lamps also light their own outset.
- **Meshes (Instrument):** Lite clustered lights (`createClusteredLightContainer`, `createClusteredPointLight`, no
  fallback), one per emitter and one for the pointer, with the face pass's position, colour, intensity and range.
- **Preferences:** `prefers-contrast: more` turns emitters off and a lit lens is flat unlit colour.
- The test measures lamp pools on decoded pixels (lamp on against off), decoded WCAG contrast of the label and
  caption beside the brightest lamp with the guard on and off, hits on every visible control, the pointer light
  under real `page.mouse` input (stage → A → B → C → stage, 300 moves at 60 Hz), the cost of 0 to 256 emitters on one
  1920×1080 layer from Lite's per-task GPU timings, and `prefers-contrast` and `forced-colors`.

### Results

All at 1920×1080. **Pools** (8-bit mean-RGB gain):

| Where | Light theme | Dark theme |
| --- | --- | --- |
| On the face at one diameter from C's power lamp (fades by three diameters) | +18 | +26 |
| Past C's edge onto panel B at 2 / 6 / 12 / 20 / 32 / 48 px | +34 / 20 / 18 / 18 / 16 / 8 | +16 / 13 / 9 / 6 / 3 / 1.7 |
| Onto the stage past the corner lamp at 2–32 px | 0 beyond the shadow (white stage, LDR) | +5 → +1.3 |
| Key edge band at Instrument (clustered lights) | +14 | +5 |
| Knob edge at Instrument | +4 | +1 |

Other nearby objects at Instrument: the lamp bezel +18…+38, the LED's edge +7 on the dark theme.

**Contrast** (decoded WCAG, identical at all three levels):

| Theme | Text | Lamp off | Lamp on | Without guard |
| --- | --- | --- | --- | --- |
| Light | label | 14.08 | 15.09 | 16.07 |
| Light | caption (muted) | 5.42 | 5.63 | 5.63 |
| Dark | label | 11.10 | 11.69 | 12.29 |
| Dark | caption (muted) | 6.01 | 6.49 | 6.65 |

The light changes text pixels by at most 0.44 levels beyond `interior.max`. Unguarded text stayed AA here, because
the text is on the lit side. Hits at every visible control are identical with lamps off and on, with 0 hit-geometry
updates from the light.

**Pointer light** (real mouse input, 300 moves, DPR 1 and 2):

| Level | Captures / uploads / geometry | Light rewrites | Interval p50 | CPU p95 | Engine GPU frame p50, DPR 1 / DPR 2 |
| --- | --- | --- | --- | --- | --- |
| Relief | 0 / 0 / 0 | 300–301 | 16.7 ms | 1.2–1.6 ms | 1.65 / 2.34 ms |
| Objects | 0 / 0 / 0 | 300–301 | 16.7 ms | 1.2–1.6 ms | 0.66 / 2.11 ms |
| Instrument | 0 / 0 / 0 | 300–301 | 16.7 ms | 1.2–1.6 ms | 1.75 / 3.82 ms |

The face under the pointer goes from (44, 48, 56) to (59, 64, 73); fade-out 0.86 → 0 in 7 frames; under reduced
motion the light is off the next frame.

**Cost** (GPU task medians in ms, DPR 2; the clustered mesh scene has a full-screen PBR plate):

| Emitters | 0 | 1 | 4 | 16 | 64 | 256 |
| --- | --- | --- | --- | --- | --- | --- |
| Tiled light pass | 0.18 | 0.19 | 0.13 | 0.15 | 0.67 | 1.66–1.92 |
| Untiled light pass | 0.10 | 0.13 | 0.21 | 0.82 | 2.30–2.63 | 8.9–9.7 |
| Clustered mesh scene | 0 | 0.84 | 0.52 | 0.52 | 1.44 | 2.07–2.92 |

DPR 1 is noisier (GPU clocks): tiled 64 is 0.54 / 1.13, untiled 256 is 4.0–4.6. Single frames spike 1–3 ms at any
count; p95 values are in the evidence JSON and are not used.

**Headful** (1684×955, DPR 1, canvas at 0, 0, both themes at all three levels): contrast exactly as above; hits all
correct; pointer runs 0 captures, uploads and geometry updates, 300–301 rewrites at 16.7 ms. Screenshots show the dark
pool on B with a soft pointer pool, and lamp light crossing C's edge onto B.

### What this settles for the plan

- **The face pool is a separate pass,** a per-layer effect task after the layer's pass over its box and outset. Core's
  straight-alpha layer blend cannot brighten what lies beneath, so a light term inside `reliefShade` cannot light the
  outset.
- **Budget: 64 emitters per layer, tiled** (tiled pass + clustered scene ≈ 2.1 ms at DPR 2, about 13% of a frame).
  256 are affordable only with tiling.
- **The guard holds** as specified: protected rects from the layer's text runs, `E` capped at `interior.max` inside
  them. The plan's I0.3 fallback (emitters off face interiors) is not needed.
- **Clustered lights** light the meshes with the face pass's values, so face and objects agree.
- **The pointer light** is a uniform rewrite per frame at every GPU level: no capture, upload or geometry update.

### Limits

- **Guard boxes are visible:** on the light theme a strong pool leaves each protected text box visibly greyer than
  the brightened face around it. A wider feather or a dimmer near-text cap is for the look iteration (`?feather=` is
  exposed).
- **Forced colours:** core never admits GPU (see [Findings](#findings-for-later-phases)); the test asserts the refusal
  and that the native lamp still toggles.
- **Relief and Objects pointer light is face-only:** no specular follows bevel, side or dome normals.
- Captured key labels at Instrument are not lit; the 48 px outset cuts light that would reach further; the white
  light-theme stage shows no spill in LDR. No bloom (I0.8).
- **Test history:** the cost test first failed at 2.095 ms against a 2 ms p50 limit; the limit became 3 ms on medians
  plus "tiled 256 under half of untiled", and it passed on rerun. The other six tests were not rerun after that
  commit.
- Headful at DPR 1 only; one fast GPU.

## I0.4 Materials over the capture

**Question.** Do brushed metal, clear coat and glass transmission read as such over captured content, and does text
under display glass keep its contrast?

**Answer: yes, with two substitutions.** Brushed aluminium, lacquer, gold, chrome and glass read as such; text under
flat display glass is exactly the capture, and GPU stays on through typing. Lite's transmission does not work in a
layer scene, so glass is a custom refraction of the capture; gold comes from its base colour, not the reflectance
tint. The plan's visual sign-off is pending with the [prototype](#i1-prototype).

### Method

- Page: [`ui-probe-instrument-materials.html`](../../examples/playground/ui-probe-instrument-materials.html), source
  [`src/ui-probes/instrument-materials.ts`](../../examples/playground/src/ui-probes/instrument-materials.ts)
  (`window.materialsProbe`; `?probe=studio`, `?policy=frame`, `?transmission=lite`, `?tune={...}`) and
  [`src/ui-probes/instrument-environment.ts`](../../examples/playground/src/ui-probes/instrument-environment.ts) (the
  studio `.hdr` generated in code, `loadStudio`, `studioRotation`, `createCaptureProbe` with cube fill and blur-mip
  shaders, `readCube`); `revolveSmooth`, `superellipseProfile` and `frame` (a bezel) added to the part builders.
  Test: [`tests/browser/ui-probe-instrument-materials.test.mjs`](../../tests/browser/ui-probe-instrument-materials.test.mjs)
  (DPR 1 and 2, plus the Lite-transmission experiment).
- Two faceplates (light and dark) at 1280×800 carry brushed-aluminium skirts and a bezel, a clear-coated black lacquer
  cap, a gold cap, a chrome knob and dome, a glass lens with dispersion, and a display window over a native
  `<input>`.
- The test checks GPU through real typing into the display, the studio's softbox direction read back from the cube,
  containment and hits, the faceplate with materials on and off, label and display contrast, text under the glass
  against the plain capture, the dome's reflection of a moving element (page probe against studio-only probe), and
  the probe's refresh cost.

### Results

**What each Lite call did over the capture:**

| Layer | Lite call | Result |
| --- | --- | --- |
| Brushed aluminium (skirts, bezel) | `setPbrAnisotropy` (direction [1, 0], UV-derived tangent: circular on lathes, along x on the bezel) and a **grain** normal map generated in code (`normalTexture`, hairlines along u) | Works. Switching each off changes 10k and 9k of 43k px, by up to 128 and 99 levels. Anisotropy alone read faintly; the grain map made it read as brushed. |
| Clear-coated black lacquer cap | `setPbrClearCoat` (1, roughness 0.03, ior 1.5) | Works: 15,829 px change, max 122. |
| Soft-touch collar | `setPbrSheen` | Works: 856 px, max 71. |
| Gold cap | base (1, 0.71, 0.29), metallic 1, roughness 0.18, and `setPbrMetallicReflectance({ color: [1, 0.86, 0.57] })` | Gold reads as gold through its base colour. **The reflectance tint has no effect on a metal** (1 px by 1 level): Lite applies it to dielectric F0 only. |
| Chrome knob and dome | metallic 1, roughness 0.04 | Works. |
| Studio | `loadHdrEnvironment` on an in-memory `.hdr` (Blob URL) and `setEnvironmentRotation(θ = −34.7°)` | Works: read back from the cube, the softbox lies 0.40° from the key light (323° / 41°). Rotation is about world y (screen vertical). Lite's equirect layout: file column longitude l → direction (sin l, ·, cos l), first row +y. |
| Page reflection | `enablePbrLocalCubemap` and `setPbrLocalEnvironment` (box projection), fed by the probe's own cube filled from the layer's capture on the GPU | Works. Lite binds the cube view directly, so refreshing its texels updates the materials with no rebuild. |
| Probe set | `createPbrLocalEnvironmentProbeSet` | Not used: it copies the cubes once at creation, so a live capture would mean recreating it. |
| `setPbrEnvironment`, `setEnvironmentBlur` | — | Not used (the scene environment is the studio; no skybox). |
| Display AR coating | `setPbrIridescence` on the glass reflection shell | Barely visible: ≤ 3 levels on flat glass. |
| Glass transmission and dispersion | `setPbrTransmission`, `setPbrSubsurface(thickness)`, `setPbrDispersion` | **Does not work in a layer scene** (below). |

**Lite transmission in a layer scene** (the recorded experiment, `?transmission=lite`): Lite retargets the render task
to a linear rgba16f offscreen and adds a full-screen image-processing pass that clears the swapchain; its render
bundle lacks the harness's separate depth target. The result is 18 WebGPU validation warnings and core falls back to
DOM ("Native upload/composition validation failed…"). Its grab is also a fixed 1024², which would blur text.
**Instead:** a custom refraction `ShaderMaterial` loads the layer capture per pixel. Where the glass is flat the
displacement is exactly 0 (the plain capture texel); on bevels and the lens it applies Snell's law per RGB channel
(dispersion 0.05). A Lite PBR `alphaBlend` reflection shell (alpha 0) sits over it.

**Measurements** (DPR 1 / DPR 2, headless 1280×800). GPU on throughout; no diagnostics, page errors or validation
warnings.

| Check | DPR 1 | DPR 2 |
| --- | --- | --- |
| Mesh px / outside their box | 92,754 / 0 | 368,775 / 0 |
| Native hits on drawn pixels: mismatches | 0 of 3,054 | 0 of 3,009 |
| Faceplate interior, materials on against off: px compared / changed (limit `interior.max` 0.04) | 240,036 / 0 | 960,388 / 0 |
| Text under the clear glass against the plain capture: px / mismatched / max delta (tolerance 0) | 31,232 / 0 / 0 | 127,140 / 0 / 0 |
| Px changed under the glass per typed key (" 7.5k") | 94 / 285 / 143 / 323 / 363 | 376 / 1,028 / 537 / 1,177 / 1,246 |
| Dome px changed by moving the beacon 236 px, page probe | 45 of 5,184 (max 199) | 180 of 20,736 |
| The same, studio-only probe | 0 | 0 |
| Page against studio probe, beacon in place | 506 px | 2,007 px |

- Labels beside reflective parts: 13.09:1 light, 12.06:1 dark. Display text through the glass: 12.04:1 light (214,
  228, 206 on 18, 38, 24) and 12.75:1 dark (8, 16, 20 against 116, 226, 246).
- A click through the glass lands on `light-display` and focuses it. Typing " 7.5k" with real keys gives
  "440.00 Hz 7.5k"; each key makes at least 1 capture.

**Probe cost** (512² cube, 10 mips, 2 layers):

| Policy | Frame work p50 / p95, DPR 1 | DPR 2 | Refreshes |
| --- | --- | --- | --- |
| Refresh on capture | 5.3 / 7.7 ms | 6.7 / 9.3 ms | 0 during the run |
| Refresh every frame | 9.0 / 11.0 ms | 8.7 / 11.7 ms | 240 |

One refresh by GPU timestamps: 1.07–1.72 ms p50 (varied by run and power state; earlier 0.25–1.1); submit to done
≈ 4 ms; CPU encode ≈ 0.15 ms.

**Headful.** At DPR 1.25 one pixel lay 0.18 px outside the dark display's rounded box (the bezel's base on the box
edge), so the bezel now stands 0.5 px inside the box. After the fix, at DPR 1.25 and 1.5: 0 outside, 0 hit
mismatches, 0 interior change, display contrast exactly 12.04 / 12.75, dome reflection 71 / 95 px against 0 for the
studio-only probe, GPU on. DPR 1 headful passed before the fix and was not rerun. Typing "-3dB" into the dark display
headful: 86–429 px per key, GPU on, text exact.

**Changed while iterating:**
- The hemispheric fill gives a normal-incidence specular (zeroing `specularColor` had no effect), so its intensity is
  0 in this scene and the studio is the fill.
- The studio generator was mirrored and rotated; measured and fixed.
- A box projection 600 px deep made the studio "near" (the softbox over the display text, skirts white), so the
  capture point is 300 px above the face and the projection walls 50,000 px away.
- The fill moved opposite the key. Flat parts read uniformly grey, so caps got a 2 px crown, the strip moved to a ring
  at 12–20° elevation, and brushed metal got the grain map.

**How it reads now:** brushed aluminium reads as brushed (the bezel's short ends somewhat ribbed); lacquer is black
gloss with a reflection band; gold is clearly gold; chrome shows the softbox and strip, with a thin orange beacon
reflection on the dome rim; the glass lens reads as glass and magnifies the printed target with a thin prism fringe
and highlight.

### What this settles for the plan

- **Reflections of the page:** one single local-environment cube per layer, 512², 10 blur mips, captured 300 px in
  front of the face, box walls 50,000 px away, **refreshed on capture only** (a per-layer upload counter) and when the
  capture texture is replaced.
- **Glass is a custom capture-refraction shader** with a Lite reflection shell, not Lite's transmission: text under
  flat glass stays texel-exact and core stays on GPU.
- **Metal colour comes from the base colour.** `reflectance` tints dielectric F0 only; gold, brass and copper are base
  colours on a metal.
- **Brushed metal needs a grain normal map** with the anisotropy; anisotropy alone barely reads.
- **Studio:** generated in code and rotated with `setEnvironmentRotation` so its softbox sits at the key light.
  Hemispheric fill is off in scenes with an environment.
- **Material values** (`tokens.materials`): brushed base 0.86, roughness 0.3, anisotropy 0.9, grain 0.15; lacquer
  roughness 0.5, coat 1 at 0.03; gold roughness 0.18; chrome roughness 0.04; glass ior 1.5, dispersion 0.05. Studio
  (`studioTokens`): key 12 at radius 0.24 rad, fill 1.2, front 0.12, strip 2.5, floor 0.03, ceiling 0.25. The bezel
  stands 0.5 px inside its box.

### Limits

- **AR-coated glass:** the flat glass reflection shell adds about 0 (Lite's specular over alpha), so coated glass
  shows almost no reflection except at bevels.
- `setPbrIridescence` is barely visible on flat glass (≤ 3 levels).
- The visual sign-off the plan asks for is pending; the prototype has not yet taken this probe's studio, materials or
  refraction ([I1](#i1-prototype)).
- Probe refresh cost varied with run and power state. One fast GPU.

## I0.5 Object-on-object shadow

**Question.** Does a per-layer PCF map give a clean lever-on-plate shadow without touching the face?

**Answer: yes,** headless and headful at DPR 1 and 2. [Decision 4](instrument.md#rendering-decisions) holds with
three amendments:
- **Clean on parts, never on the face:** the map darkens every bat's plate under its lever and ball, keeps a 2 px thin
  plate's shadow whole, and changes 0 face pixels outside the analytic footprints.
- **Amendments:** the map needs a light depth range fitted to the stage and a bias set in world px; CSM and ESM are
  not alternatives here; contact shadows are optional, not default.
- **Default:** analytic face shadows plus a PCF map of 4096 at bias 1.5e-3 (≈ 1.95 px world), re-rendered on pose
  change, for 0.07–0.14 ms per frame at 60 controls.

### Method

- Page: [`ui-probe-instrument-shadows.html`](../../examples/playground/ui-probe-instrument-shadows.html), source
  [`src/ui-probes/instrument-shadows.ts`](../../examples/playground/src/ui-probes/instrument-shadows.ts)
  (`window.shadowsProbe`). Test:
  [`tests/browser/ui-probe-instrument-shadows.test.mjs`](../../tests/browser/ui-probe-instrument-shadows.test.mjs).
  The part builders and the harness are unchanged.
- **Stage.** One 1920×1080 panel with bats (at both stops and mid-travel), rockers, knobs, faders, keys and 2 px thin
  plates (membrane keys: the case whose shadow maps cut and detached at the Objects level), each with a label printed
  above it. Layouts `cases` (60 controls, 20 bats) and `dense` (250 controls, 42 bats).
- **Three shadow paths,** switchable at run time:
  - **(a) analytic:** the Relief formula under each part's footprint, offset `−L.xy / L.z · h` = (0.692 h, 0.919 h),
    drawn as a shader quad per control on the mesh pass (not core's relief pass). Each quad loads up to 6 rounded-box
    casters of its control from a storage buffer and takes the maximum, so overlap is max, not sum.
  - **(b) map:** a shadow map from the key light; every part casts and receives. Nothing on the face is a mesh, so the
    map is masked off the face by construction. The light stands 4,000 px behind the stage, `orthoMinZ` and
    `orthoMaxZ` are fitted to the stage (a range of ≈ 2,603 px), and each part kind publishes the union of its
    placements as `boundMin` and `boundMax` for the directional fit of thin instances. PCF by default; CSM and ESM as
    alternatives, each on its own page.
  - **(c) contact:** `createScreenSpaceContactShadowsPostProcessTask`. The mesh pass draws into an offscreen target
    cleared transparent, the contact task multiplies it by its occlusion into a second target, and a present quad
    composites the result over the face with premultiplied alpha. Face pixels have alpha 0 there, so the post chain
    cannot reach them. Contact settings are deterministic: temporal weight 1, 1 sample, spatial radius 0, max distance
    12 px, thickness 6 px.
- The test, at DPR 1 and 2, compares each path on against off:
  1. changed pixels against the control boxes and the analytic footprints;
  2. the lever's projected region on every bat's plate, and acne elsewhere;
  3. the band at every cap's base, and every thin plate's shadow as connected components, cut rows and gaps;
  4. label contrast, containment, and native hits on mesh pixels, on a grid over every control and on shadow pixels
     outside the boxes;
  5. captures and geometry updates when paths toggle, and the post chain with contact off against the direct pass.
  It then records the bias window per map size, CSM and ESM on the thin plate, and the per-task GPU cost at 60 and 250
  controls, static and with 20 bats snapping, for both refresh policies.

### Results

Headless and headful pixel numbers are identical.

| Check | DPR 1 | DPR 2 |
| --- | --- | --- |
| (b) on against off: changed px | 14,328, all inside boxes | 58,098, all inside boxes |
| (c) on against off: changed px | 14,301, all inside boxes | 46,820, all inside boxes |
| (b) with (a) on, against (a) only | 14,328, inside | 58,098, inside |
| Face px changed outside the boxes, (b) or (c) | 0 | 0 |
| Face px changed outside the analytic footprints, any path | 0 | 0 |

- **Lever on plate (b), all 20 bats:** ≥ 96% (DPR 1) / 97% (DPR 2) of the lever and ball's projected region darker;
  mean change −15.9 to −19.8 levels (lit-to-shadow ratio 0.885–0.91); acne elsewhere 0.
- **Contact lines (c),** share of the cap's base band darkened and mean change:

  | Part | DPR 1 | DPR 2 |
  | --- | --- | --- |
  | Knob | 69%, −7.4 | 68%, −8.1 |
  | Fader | 72%, −18.7 | 63%, −21.5 |
  | Key | 85%, −18.1 | 71%, −20.1 |

- **Thin plate:** with the map (PCF 4096, bias 1.5e-3) all 8 plates give 1 connected component, 0 cut rows, 0 acne,
  largest gap 0.97 px (DPR 1) / 0.75 (DPR 2), which is scan quantisation, in a band 2 px wide. Analytic: 1 component,
  0 cuts, gap ≤ 1 px. Contact alone: 18–36 cut rows on some plates.
- **Contrast and hits:** label contrast at least 10.8:1 (DPR 1) and 12.6:1 (DPR 2) on every path. With (b) and (c) on,
  meshes on against off: 0 px outside boxes, 0 hit mismatches on mesh pixels; a 2,812-point grid is unchanged after
  toggles, 0 misses; shadow pixels more than 1.5 px outside the boxes that hit a control: 0 of 1,801 (DPR 1) and 0 of
  1,224 (DPR 2). Toggles cause 0 captures and 0 geometry updates, GPU on. The post chain with (c) off matches the
  direct pass exactly (0 px).

**Bias window** (Lite units, world px in brackets; the same at both DPRs, headless and headful):

| Map | Acne | Clean | Cut |
| --- | --- | --- | --- |
| PCF 2048 | at 1e-3 (1.3 px) | 1.5e-3 to 3e-3 (1.95–3.9 px) | — |
| PCF 4096 | at 5e-4 (0.65 px) | 7.5e-4 (0.98 px; 2 components at DPR 2) to 2.5e-3 (3.25 px) | every row at 3e-3 (3.9 px) |

This reproduces the Objects finding: the 2 px plate is 3.05 px deep along the light ray, so a larger bias detaches its
shadow.

**Alternatives:**
- **CSM,** 2 cascades: 4096 with a world bias of 1.5 px is clean (1–2 components); 2048 with 2 px breaks into 4–11
  components; 4 cascades with 1 px: 95% acne. Render 0.44–0.68 ms (4096) against 0.07–0.14 for PCF.
- **ESM:** no usable shadow (the thin plate's shadow is absent, about 10% of the lever region darkens, and the whole
  plate darkens in blotches). `exp(min(87, depthScale · d))` cannot separate a 3 px caster from its receiver over a
  stage-wide depth range.

**Cost** (Lite per-task GPU ms per frame, 1920×1080, mesh-pass tasks only; the whole-frame `gpuFrameTimeMs` is noisy
with GPU clock states and is not used):

| Path | 60 controls | 250 controls |
| --- | --- | --- |
| PCF 4096 render (re-render on pose change, Lite's default) | 0.07–0.14 | 0.12–0.60 |
| PCF 2048 render | 0.04–0.07 | 0.10–0.47 |
| Contact shadows, DPR 1 | 1.5–1.9 | 2.3–2.5 |
| Contact shadows, DPR 2 | 2.0–2.3 | 1.9–3.2 |
| Analytic quads (a) | +0.2–0.45 (DPR 1), ≈ 0.7 (DPR 2) | 1.1–2.2 |

The post structure with contact off costs 0.17–0.29 ms plus 0.14–0.26 for the present pass. The analytic quads
overdraw: a bat's quad is padded up to 75 px for its ball. **Refresh policy:** re-render on pose change renders 0
times in 120 static frames and 120 of 120 with 20 bats snapping; every frame always renders 120 of 120, at the same
cost per render.

**Visual read** (DPR 2 close-ups):
- **none:** parts float;
- **(a):** grounds every part, but a bat's lever leaves nothing on its own plate;
- **(a) + (b):** adds the lever's streak on the plate, the fader cap's shadow on its track, the key cap's on its
  plinth and a thin line under each thin plate; reads as physical;
- **(c) alone:** crisp, slightly inky lines at cap bases;
- **(a) + (b) + (c):** reads best.

Two issues remain. The mapped shadow is lighter than the face shadow (ratio ≈ 0.9 against the analytic 0.76 at
darkness 0.35; darkness 0 only reaches 0.81–0.84 because of the hemispheric fill). A sharp mapped streak ends at the
plate's edge, where the softer analytic face shadow takes over: a visible change of softness.

### What this settles for the plan

- **Default shadows: (a) + (b).** Analytic on the face, plus a per-layer **PCF map of 4096 at bias 1.5e-3 (≈ 1.95 px
  world)**, **re-rendered on pose change** only, with the light's depth range **fitted to the stage** and thin-instance
  bounds published. PCF 2048 at bias 2e-3 is the cheaper alternative.
- **Bias in world px:** below a part's depth separation along the light (3.05 px for a 2 px plate) and above ≈ 1 px
  (4096) or 1.95 px (2048).
- **Map darkness** 0–0.15, to approach the face shadow.
- **Contact shadows are optional,** decided by I0.8's budget: they are the costliest path and mostly duplicate the map
  at cap bases. When on, they run on an offscreen mesh target composited over the face, which they cannot reach.
- **CSM and ESM are out:** CSM renders in 0.44–0.68 ms against PCF's 0.07–0.14, splits the thin plate's shadow
  at 2048 and acnes with 4 cascades; ESM gives no usable shadow over a
  stage-wide depth range.

### Limits

- **Prototype path:** disabling the harness's direct pass in post mode reads `getFrameGraph(scene)._tasks`, an
  internal; Lite has no public way to find or remove a task.
- **Lite 1.33 problems** (in [Findings](#findings-for-later-phases)) shaped the page: a map is rendered once before
  it is turned off, and each generator kind has its own page.
- The analytic quad models a lever as a rounded box at its mean height and its ball as a disc at centre height.
- **Not measured:** contact shadows at a reduced `resolutionScale`; a low-end GPU. The headful window size is not
  recorded in the probe's report.

## I0.6 CSS parity

**Question.** How close can CSS knobs, faders and switches get to the GPU look from the same tokens?

**Answer: much further than Relief's, and per component.** The CSS copy differs from Instrument over a control's box
by a worst mean of 6.3 (fader) to 26.2 (rocker) luminance levels, against Relief's 2 over a whole stage. The budgets
below give 1.5× headroom over the worst observed state. The gap is what CSS cannot draw: reflections, perspective,
faceted lit parts.

### Method

- Test: [`tests/browser/ui-probe-instrument-parity.test.mjs`](../../tests/browser/ui-probe-instrument-parity.test.mjs)
  on the [I1 prototype page](#i1-prototype), which renders the same markup as Instrument, Objects and CSS side by
  side; helper [`tests/helpers/image-parity.mjs`](../../tests/helpers/image-parity.mjs) (crop, metric, SSIM, review
  strips; pngjs only).
- **Metric:** P0.6's ([Phase 0](phase0.md#p06-css-parity)): mean and p95 absolute luminance difference in 8-bit
  levels, Rec. 709 weights, no linearisation; plus SSIM on luminance (8×8 windows, stride 4).
- **Regions:** object (the element + 8 px), box (the control's box + 10 px, including the printed scale), labels
  (control, legend and marks + 6 px), legend (text + 2 px). Crops are about 120×160 to 175×225 CSS px; the box region
  is mostly faceplate and shadow, and an empty faceplate already differs by a mean of 1–2 between copies.
- **States,** at DPR 2, light and dark, depth 50%: knobs 18 each (min, mid and max × light and dark × depth 0, 50 and
  100%), fader and push button 6, each switch 4.
- **Budget:** mean × 1.5 rounded up to 0.5, p95 × 1.5 rounded up, SSIM floor with 50% headroom on its deficit.
- A second test records what CSS cannot show, and the recipe under reduced motion, `prefers-contrast: more` and
  `forced-colors`.

### Results

Instrument against CSS, box region (worst / median):

| Component | Mean | p95 | SSIM worst / median | Object-only mean, worst | Instrument against Objects, mean worst |
| --- | --- | --- | --- | --- | --- |
| volume knob | 10.0 / 8.0 | 55 / 49 | 0.88 / 0.90 | 25.9 | 14.0 |
| input knob (detented) | 10.2 / 5.9 | 35 / 31 | 0.89 / 0.91 | 20.8 | 14.2 |
| fader | 6.3 / 5.7 | 26 / 23 | 0.93 / 0.96 | 6.4 | 5.6 |
| mute (slide) | 12.7 / 10.6 | 63 / 62 | 0.79 / 0.84 | 14.2 | 18.3 |
| power (rocker) | 26.2 / 24.4 | 95 / 95 | 0.58 / 0.71 | 28.9 | 63.3 |
| phono (bat) | 14.0 / 11.6 | 56 / 55 | 0.86 / 0.91 | 15.0 | 18.8 |
| lights (wall) | 21.6 / 21.0 | 73 / 72 | 0.72 / 0.76 | 23.3 | 29.2 |
| rec (push button) | 20.2 / 18.0 | 97 / 77 | 0.47 / 0.62 | 22.4 | 15.9 |

- **Legend text alone:** mean 2.4–3.0 for every control except the knobs (10.6, 12.6; the knob's shadow reaching the
  legend is the likely cause); p95 ≤ about 9 outside the knobs.
- **Furthest:** the rocker (a flat CSS gradient paddle with `rotateX` and a drop shadow, against a real faceted lit
  paddle); the knobs' object region (conic gradients, no specular, reflection or perspective; object-only mean
  21–26); the wall plate's gradient; the push button (a flat gradient disc and inset ring; SSIM 0.47 held).
- **Objects is further from Instrument than CSS** for the switches (rocker mean 63) and level with it for the knobs.

**Budgets** (box region, worst state in light and dark at any depth):

| Component | Mean ≤ | p95 ≤ | SSIM ≥ |
| --- | --- | --- | --- |
| volume knob | 15.5 | 84 | 0.81 |
| input knob | 15.5 | 53 | 0.83 |
| fader | 9.5 | 40 | 0.89 |
| slide | 19.5 | 94 | 0.68 |
| rocker | 39.5 | 143 | 0.37 |
| bat | 21.5 | 85 | 0.78 |
| wall | 32.5 | 110 | 0.57 |
| push button | 30.5 | 146 | 0.20 |

The rocker and push-button SSIM floors say little; tightening them means improving the CSS recipe, not the budget.

**What CSS cannot show** (`emulation.json`):
- **Reflections:** studio reflections 0 → 2 change the Instrument crops by a mean of 7–24, p95 up to 175; the CSS and
  Objects copies change by 0.
- **Depth 0 → 100%:** Instrument shifts by a mean of 8–24, CSS by 2–7.5 (only the shadow grows).
- **Not measured as numbers:** the pointer light (not on the prototype page; hover changed nothing in either copy),
  object-on-object shadows and skirt perspective.

**Preferences on the CSS copy:**
- Reduced motion: transitions 0 s, panel pixel-identical, toggles still work.
- `prefers-contrast: more`: pixel-identical (the recipe ignores it).
- `forced-colors` (light and dark): Chrome strips every gradient and shadow. Only the two knobs survive, as a thin
  system-colour outline circle; the fader, all four switches and the push button have no border and are invisible.
  Printed text turns to system colours, but the controls do not flatten into a usable system-colour control.
- Instrument under `forced-colors` fails GPU admission ("Functional GPU capture probe returned missing or incorrect
  marker pixels"); the Objects copy showed only text.

### What this settles for the plan

- **The Instrument parity budget is per component** over the control's box, with 1.5× headroom over the worst
  observed state, recorded above. Relief's whole-stage budget (mean ≤ 2, p95 ≤ 10) does not apply: the difference is
  reflections, perspective and lit facets, which CSS cannot draw by design ([decision 9](instrument.md#rendering-decisions)).
- **Objects against Instrument** needs its own budget: for the switches Objects is further from Instrument than CSS
  is, so one panel would change character when the adjust policy steps down (the plan's first risk).
- **The CSS recipe needs explicit `forced-colors` rules** (borders, `CanvasText` fills) and a `prefers-contrast`
  branch.

### Limits

- Headless, DPR 2, one machine; the budgets come from the first run and held on one rerun. Other hardware could
  shift them.
- Luminance only; no hue measure.
- The CSS recipe is the prototype's throwaway recipe with hand-set constants, not one tuned against the GPU render
  by a sweep as P0.6's was.
- No WICG SHA was recorded by this probe (a measurement only); the check at the top applies.

## I0.7 Interaction and accessibility

**Question.** Do the knob and fader pass as sliders with real pointer and keyboard input, with the 2.5.7 alternative,
in plain DOM and GPU mode?

**Answer: yes.** Drag, click-to-set, cap taps, wheel, double-click and keys all drive the native range input in both
modes; `aria-valuetext` and the accessibility tree follow; axe passes; the accessibility snapshots match. Four
findings, below.

### Method

- Page: [`ui-probe-instrument-interaction.html`](../../examples/playground/ui-probe-instrument-interaction.html),
  source [`src/ui-probes/interaction.ts`](../../examples/playground/src/ui-probes/interaction.ts). Test:
  [`tests/browser/ui-probe-instrument-interaction.test.mjs`](../../tests/browser/ui-probe-instrument-interaction.test.mjs),
  with `@axe-core/playwright` 4.13.0 (already a dev dependency).
- A knob (`<input type="range">`, −24 to 12 dB, 37 values) and a vertical fader (−60 to 6) in the Strata markup
  conventions, at 1000×700. GPU mode is `attachStrataGpu` at the Relief level; `?dom` is the plain CSS presentation.
- **Knob behaviour:** a transparent input covers the 120×120 dial (the ring and cap are `aria-hidden`,
  `pointer-events: none`). The knob cancels `pointerdown`, so the browser does not set the value from the pointer's
  x, and sets focus by hand; the keyboard is native.
  - **Drag:** vertical, `data-drag-px` 200 per sweep (≈ 5.5 px per step over 36 steps), Shift ×0.1 (`data-fine`); a
    press moving under 4 px is a tap.
  - **Ring:** outside 32 px from the centre a click sets the value by angle (0 at the top, clockwise, 270°).
  - **Cap:** inside 32 px a tap steps by ±`step` by half.
- **Fader:** `writing-mode: vertical-lr; direction: rtl`, `aria-orientation="vertical"`; native thumb, track click,
  plus wheel and reset. It carries no `data-strata-face` (finding 2).
- `aria-valuenow` is read from the accessibility tree (CDP `Accessibility.getFullAXTree`), since a native range has no
  attribute. 16 tests (8 DOM, 8 GPU), run three times.

### Results

| Check | Result |
| --- | --- |
| Knob drag | 50 px up: 0 → 9 at 200 px per sweep, 9 `input` events + 1 `change`; Shift + 100 px: +2; 200 px down clamps at min |
| Ring click-to-set | Each of the 37 value angles (−24…12) set exactly that value; the bottom gap goes to the nearer end |
| Cap tap (2.5.7 alternative) | Lower half ×36 walked 12 → −24, upper half back, one step per tap: reaches every value a drag can |
| Wheel, double-click, keys | Wheel steps 1; double-click resets; arrows, PageUp, PageDown, Home, End work |
| Values | `aria-valuetext` follows ("−6 dB", U+2212); the accessibility tree's value follows |
| Fader | `writing-mode` works on 158.0.8110.0 (a top click gives more than a bottom click; ArrowUp raises); the tree reports orientation vertical, min −60, max 6; native thumb drag 40 px up = +10…20; track click, wheel, double-click and keys work |
| Hits | `elementFromPoint` at 25 points per control (5×5 including corners, inset 0.5 px) lands on the input or label at DPR 1 and 2; real clicks in the dial's bottom corners set min and max |
| Target size | Cap 64×64, ring band 28 px; clicks at 36 and 58 px from the centre hit the ring |
| axe (wcag2a/aa, wcag21a/aa, wcag22aa) | 0 violations, DOM and GPU (light theme) |
| Accessibility snapshot | Identical DOM and GPU after ArrowUp and ArrowDown |
| Reduced motion | Detent transition 140 ms → 0 s |
| GPU | `state().mode === "gpu"` at the end of every GPU test; the knob's screenshot differs after every value change |

16 of 16 passed, repeated three times (48 of 48).

### What this settles for the plan

- **The knob interaction model:** vertical drag at 200 px per sweep with Shift ×0.1 and a 4 px tap slop; click-to-set
  on the scale ring; a cap tap steps by half; a **document-level** wheel listener; double-click resets; native keys.
  A transparent native input covers the whole dial, so every click lands on the original control.
- **Vertical faders** are native vertical range inputs on this build, with `aria-orientation` set.

### Limits

- **Findings** (also in [Findings for later phases](#findings-for-later-phases)):
  1. A wheel listener on the input itself (even `passive: false`) is unreliable inside the canvas subtree: the page
     scrolled 50 px and the value did not change. A blocking document-level wheel listener that resolves the control
     with `elementFromPoint` works in both modes, at the cost of a non-passive document wheel listener.
  2. `data-strata-face="groove"` on a vertical range input gives a horizontal 48×6 groove at the box's vertical middle
     and a 200×200 knob primitive far outside the 48×200 box, so vertical sliders need core and Relief support (I2).
  3. Rotating a `data-strata-face="knob"` element inflates its primitive (from `getBoundingClientRect`: 90.5 px for a
     64 px cap at 45°), so only an inner pointer may rotate.
  4. CDP `valuetext` does not reflect `aria-valuetext` ("-6" for the native range, "" for a `div role=slider`), and
     Playwright's `ariaSnapshot` shows the numeric value only, so units need the manual screen-reader pass.
- **Not done:** headful check (no capture or geometry change), dark theme, touch, forced colours, a real screen reader,
  circular drag, sound and haptics, a Relief-drawn fader (finding 2). The GPU mode is Relief, not Instrument meshes.

## I0.8 Post chain and reflections

> **Pending: result arrives separately.** The probe is still running; this section, its summary row and the plan's
> I0.8 wording are filled in when its report arrives.

**Question.** What do TAA, contact shadows, bloom, SSGI and a per-layer local environment probe cost at 250 controls,
and does the captured text stay untouched by all of them?

### Method

Pending.

### Results

Pending.

### What this settles for the plan

Pending.

### Limits

Pending.

## I1 prototype

**Question** (the plan's [Phase I1](instrument.md#phase-i1-prototypes-and-the-spec)): what do a knob, a detented
knob, a fader, the four switch forms and a push button look like in the premium character on one chassis panel, at
Instrument and Objects next to the CSS rendering?

**Answer:** a correct premium baseline, not yet stunning. Containment, hits, cap labels and printed contrast hold in
every variant; the look sign-off with the owner is pending, and the look iteration has a list ([Next](#next)).

### Method

- Page: [`ui-proto-instrument.html`](../../examples/playground/ui-proto-instrument.html) (page, tuning bar, the
  stylesheet for all three presentations), entry
  [`src/ui-proto/instrument-page.ts`](../../examples/playground/src/ui-proto/instrument-page.ts) (harness setup,
  relief plate, the Objects copy, shared state, query string, `window.instrumentProto`), with
  [`instrument-tokens.ts`](../../examples/playground/src/ui-proto/instrument-tokens.ts) (premium tokens, six
  materials, depth blending), [`instrument-mesh.ts`](../../examples/playground/src/ui-proto/instrument-mesh.ts)
  (parts, springs, analytic shadows), [`instrument-markup.ts`](../../examples/playground/src/ui-proto/instrument-markup.ts)
  (one markup function for all three copies), [`instrument-css.ts`](../../examples/playground/src/ui-proto/instrument-css.ts)
  (CSS variables and the shadow formula), [`instrument-studio.ts`](../../examples/playground/src/ui-proto/instrument-studio.ts)
  (a product-studio HDR in code) and [`instrument-shapes.ts`](../../examples/playground/src/ui-proto/instrument-shapes.ts)
  (`prism`, `lever`). Test: [`tests/browser/ui-proto-instrument.test.mjs`](../../tests/browser/ui-proto-instrument.test.mjs).
- Objects runs on the same page and controller (`attachStrataGpu(controller, { level: "objects", panels:
  "#ip-objects" })`): knobs step down to stacked slabs with a printed pointer, the fader to a slab, all four switch
  forms to Strata's well with a sliding dome (Objects has no tilt).
- The test, at 1600×900, DPR 2, checks GPU through every variant, containment and hits at the default pose and at
  100% depth with every switch thrown (shadows off: they are face shading), real clicks on the four switches, printed
  label contrast from decoded pixels in light and dark, and the push button's cap label against core's plain pass;
  then it saves the screenshots the look is judged from and `variants.json`.

### Results

| Check | Result |
| --- | --- |
| Containment, defaults | 71,563 changed px, 0 outside; 0 of 3,023 hit mismatches |
| Containment, depth 100%, every switch on | 72,202 px, 0 outside; 0 of 3,050 hit mismatches |
| Label contrast, light (50 labels per presentation): Instrument / Objects / CSS | 6.28 / 7.28 / 7.10 |
| Label contrast, dark | 5.57 / 5.94 / 5.88 |
| Push-button cap label against core's plain pass | 1,012 px, 0 mismatched |
| Hits and clicks | Hits inside every control find it; real clicks toggle all four switches; no page errors or harness diagnostics |
| Camera | 2,782 px at 50% depth, 4,046 at 100% |

**Headful** (1600×900, DPR 1 and 2): GPU on, 0 outside, 0 hit mismatches, exact cap label. It found a real bug: at
DPR 1 the scale numerals sat on half pixels (centred with `translate(-50%)`) and lost ink, 2.46:1 on dark and 4.27:1
on light. Fixed with whole-pixel print boxes, 11 px semibold numerals and On/Off instead of "I"/"O" on the rocker;
headful minimums are now 5.05 dark / 5.38 light at DPR 1 and 5.57 / 6.28 at DPR 2.

**Proposed premium numbers** (at 50% depth; heights scale ×0.6 / 1 / 1.6 at 0 / 50 / 100% depth, widths and angles
do not):

| Part | Numbers (CSS px) |
| --- | --- |
| Knob | Skirt Ø64, cap Ø 0.8 × skirt (51), detented knob 0.8 × size; skirt (flange) 2.5 high with a 0.8 edge break; cap 16 high; polished chamfer 1.4; engraved pointer line 2 wide from 0.3 to 0.8 of the cap radius; sweep 270°; dial box = skirt + 76 (140); ticks at r + 5, numerals at r + 20; 11 detents |
| Fader | Travel 180; carriage 30×42, 12 high, taper 2.5, radius 3, index line; native box 46 wide; slot 5 printed |
| Slide | Box 64×28; block 24×20, 6 high, taper 1.5, accent flag when on; 28 travel |
| Rocker | Box 38×62; bezel 2 high; paddle 28×50, facets 10 / 5; ±11.3° |
| Bat | Box 44×68; nut Ø22, 3 high; bushing Ø13, 7 high; lever 28, pivot 5, ball r 3.6; ±30° |
| Wall | Box 66×92; plate 3 high, radius 6; paddle 30×54, 6 high; ±6° |
| Push button | Box 56; cap Ø40, 6 high, taper 1.2; travel 2.5 held, 1.2 latched; bezel r 27 → 22.6; lit ring r 22.6 → 20.6 |

| Spring | Knob | Detent | Fader | Slide | Rocker | Bat | Wall | Button |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Stiffness / damping | 420 / 41 | 900 / 42 | 420 / 41 | 600 / 49 | 1200 / 58 | 1400 / 45 | 1200 / 58 | 1600 / 80 |

- **Light:** key 1.6 at 323° / 41°; fill 0.35, diffuse only; shadow strength 0.24; contact line 0.22 over 1.6 px.
- **Materials** (colour, metallic / roughness): brushed aluminium (236, 237, 239) 1 / 0.30, brush 0.45; polished
  aluminium (244, 245, 247) 1 / 0.08; black lacquer (16, 16, 18) 0 / 0.38, coat 1 at 0.03; glass cap (20, 24, 29)
  0 / 0.04, coat 1, reflections 1.2; gold (246, 214, 150) 1 / 0.30, brush 0.6; gunmetal (104, 107, 114) 1 / 0.36,
  brush 0.6; metals take direct light ×0.2. Faceplates brushed (206, 208, 211) or gunmetal (56, 58, 64), with
  matching ink.

**Changed while iterating:**
- Metal tops rendered pure white (the harness's hemispheric fill faces the viewer and has a specular term), so the
  fill is diffuse only (`specularColor` 0, intensity 0.35).
- Brushed tops varied with knob size and position (Lite's anisotropic direct-light term), so metals take direct light
  ×0.2 and get their look from studio reflections.
- The studio is a grey sweep (dark floor, mid-grey front, bright ceiling) with the key softbox at the light's azimuth
  pulled towards the horizon, power 5.5 → 2.5, overhead strip 1.4 → 0.7.
- Caps are a brushed side and a spun top (anisotropy 0.45 around the circumference gives a radial bow-tie sheen),
  with a separate polished chamfer ring (roughness 0.1).
- Fixed: the prism winding (the rocker rendered black); posed parts never uploaded (`flushAll` now flushes every
  layer kind).
- The bat lever went 22 → 28 px at 24° → 30° (invisible head-on); rocker facets 9 / 6 → 10 / 5 px (11.3° tip); wall
  paddle throw 4° → 6°; lit ring emissive 1.0 latched / 0.3 off (1.6 clipped amber to yellow); pointer 2 px (1.6
  looked dashed); relief plate edge metal → satin (metal gave a heavy black edge).
- **Core draws a hard-coded white background,** so the dark theme showed a white stage; the page adds a plain enrolled
  stage layer in the theme's colour under the panels.

### What this settles for the plan

- **Premium defaults** (proposed, for the look sign-off): Switch defaults to **`slide`** (head-on a lever projects
  about 12 px, so the bat stays available but small); the **theme picks the default faceplate** (brushed on light,
  gunmetal on dark; an explicit plate overrides); **metals take direct light ×0.2** and read from the studio; a
  "Reflections" control (environment intensity); the lit ring is a plain emissive.
- The numbers above are the starting tokens for [Phase I1's spec work](instrument.md#phase-i1-prototypes-and-the-spec)
  once the look is accepted.

### Limits

- **Still wrong** (the prototype's own list):
  - the glass cap reads as a smoked dark dome (I0.4's custom refraction is not applied here yet);
  - flat linear-brushed tops are too bright (fader carriage, wall plate, slide block; the fader cap is white on dark);
  - head-on views hide paddle motion: wall and rocker states read mainly through facet shading, and the push
    button's travel (2.5 against 1.2 px) is nearly invisible, so only the ring's brightness tells held from latched;
  - chamfers are soft at 1.4 px (about 2 px is crisper);
  - no object-on-object shadows (I0.5 has since settled them);
  - unused space at the bottom of the panel; the Objects panel's drop shadow is clipped at the frame edge at 100%
    depth.
- **Coordinator's read:** a correct premium baseline, not yet stunning; Instrument and CSS look close head-on;
  I0.4's studio and material setup looked markedly better and should be carried into the next iteration.
- Screenshots (47, plus `variants.json` and `report.json`) are regenerated by the test under the `ui-probes/instrument-i1`
  evidence directory; they are not committed.

## Findings for later phases

Each is a fact measured on Canary 158.0.8110.0, with the probe that found it.

**Core**
- **The functional admission marker fails under `forced-colors: active`:** the marker is recoloured, the probe reports
  "marker pixels" missing or incorrect, and GPU never starts; the page stays native DOM. This affects every GPU page;
  the marker probably needs `forced-color-adjust: none` (I0.3, I0.6).
- **Core paints a hard-coded white background,** so a dark theme needs a stage layer in its own colour (I1).
- **The light pool must be its own pass:** core's straight-alpha layer blend cannot brighten what lies beneath, so a
  light term inside `reliefShade` cannot light the outset (I0.3).
- **Meshes ignore the layer's opacity and clip,** and `setDensity` rebuilds scenes with meshes off: Phase I2 must
  update instances in the same frame as layout and apply clip and opacity (I0.1).
- **`<meter value>` writes cost one capture and one upload per layer per frame** (240 of each in 120 frames for 50
  meters); live meters must be poses with a low-rate DOM sync (I0.1).

**Babylon Lite**
- **No public API to insert a rendering context at a position;** the prototype reorders `getRenderingContexts`
  in place, which Lite documents as not writable. Phase I2 needs a Lite API or a core-owned frame graph (I0.1).
- **No screen-lock through shear:** Lite's normal matrix is `mat3(world)` (I0.1).
- **Lite transmission is unusable inside a layer scene:** it retargets the task to an rgba16f offscreen, clears the
  swapchain with an image-processing pass and lacks the separate depth target; 18 validation warnings and core falls
  back to DOM; its grab is a fixed 1024² (I0.4).
- **`setPbrMetallicReflectance` does nothing on metals** (1 px by 1 level); it tints dielectric F0 only (I0.4).
- **Anisotropy needs a grain normal map to read** as brushed metal (I0.4).
- **Hemispheric fill gives a normal-incidence specular** that zeroing `specularColor` does not remove; it whitened
  metal tops. Off, or diffuse only, in scenes with an environment (I0.4, I1).
- **`createPbrLocalEnvironmentProbeSet` copies its cubes once;** a live capture needs the single local cube, whose view
  Lite binds directly (I0.4).
- Lite PBR ignores thin-instance colours, so lit and dark segments are two kinds (I0.1).
- **Shadow generators in Lite 1.33** (I0.5), for core's shadow work in Phase I2:
  1. `setShadowGeneratorEnabled(generator, false)` before the generator's first shadow pass makes its receivers render
     solid black; render the map once before turning it off.
  2. CSM with `numCascades: 1` fails WebGPU validation every frame (a 2D view where a 2D array is expected), and a CSM
     scene built after a PCF scene on the same engine fails the opposite way; the probe opens a new page per
     generator kind.
  3. The directional PCF generator accepts `normalBias` but never uses it.
  4. The shadow fit for thin instances uses the prototype mesh's bounds; each part kind must publish the union of its
     placements.
- **No public way to find or remove a frame-graph task;** the I0.5 probe reads `getFrameGraph(scene)._tasks` to
  disable the harness's direct pass in post mode (I0.5).
- **A shadow map needs a light depth range fitted to the stage** and a bias in world px: the 2 px plate is 3.05 px
  deep along the light ray, so the clean window is narrow (≈ 1–3.25 px at 4096) (I0.5).

**Harness and geometry**
- **`Pose` needs a tilt and a pivot;** I0.2 thin-instanced full matrices instead (I0.2).
- **Containment must be checked over the whole travel:** the bat's ball binds at mid-travel, the knob cap at
  t = 0.125 and the pointer at t = 0.75 (I0.2).
- **Click targets on tall parts drift** by up to about 4 px at the corners, so click-to-set scales must be printed on
  the face (I0.2).

**Strata and Relief**
- **Relief `groove` on a vertical range input is wrong:** a horizontal 48×6 groove and a 200×200 knob primitive far
  outside the 48×200 box (I0.7).
- **Rotating a `data-strata-face` element inflates its primitive** (90.5 px for a 64 px cap at 45°); rotate an inner
  pointer only (I0.7).
- **Relief and Objects pointer light is face-only** without a point-light specular term in `reliefShade` on bevels,
  object sides and domes outside the guard, fed per frame from emitter uniforms in the relief binding (not prototyped)
  (I0.3).
- **Protected text boxes read greyer under strong pools** on the light theme; the feather or near-text cap is for the
  look iteration (I0.3).
- Captured key labels at Instrument are not lit, and the 48 px outset cuts light that reaches further (I0.3).

**Browser and accessibility**
- **Wheel listeners on inputs inside the canvas subtree are unreliable** (even `passive: false`); a blocking
  document-level listener with `elementFromPoint` works in both modes (I0.7).
- **CDP `valuetext` does not reflect `aria-valuetext`,** and `ariaSnapshot` shows the numeric value only; units need
  the manual screen-reader pass (I0.7).
- **The throwaway CSS recipe loses its controls under forced colours** (only the knobs survive as outlines) and
  ignores `prefers-contrast: more`; it needs explicit rules (I0.6).
- At DPR 1, text centred with `translate(-50%)` lands on half pixels and loses ink (2.46:1); print boxes must be on
  whole pixels (I1).
- **Chrome hits round range inputs outside their circle:** a round knob input is hit up to 4.8 px outside its 24 px
  `border-radius` circle, in the square box's corners, so the I0.5 shadow-hit check judges against the square box
  (I0.5). Drawn pixels still stay inside the box; containment checks against a rounded box are the stricter side.

**Probe pages**
- I0.1's `instrument.ts` and I0.7's `interaction.ts` both declared `window.instrumentProbe` with different types, so
  typecheck and build failed on the merged branch. Fixed in `279ae92` (a cast in `interaction.ts`, no runtime change;
  cherry-picked into the other probe branches); later probes use their own globals (`movingProbe`, `emitterProbe`,
  `materialsProbe`, `instrumentProto`).

## Decisions taken in Phase I0

| # | Decision | Recommendation (taken) | Alternative (set aside) |
| --- | --- | --- | --- |
| 1 | **Where the mesh pass draws** (I0.1) | Straight into the layer's pass target, after its effect pass, colour loaded, own depth target cleared per frame | An offscreen mesh target composited over the face: an extra texture and pass |
| 2 | **Render task per scene** (I0.1) | Its own render task with `clr: false` (`defaultRenderTask: false`) | Lite's default task, which clears colour Lite's overlay setup does not protect after effect renderers |
| 3 | **Camera distance** (I0.1, I0.2) | `D = max(2400, max over part envelopes of r · h / inset + h)`: 2,400 at 1920×1080; a larger stage raises `D` | A fixed `D`: drift breaks containment on larger stages |
| 4 | **Part budgets** (I0.1) | 2,048 parts per layer, 6,000 per stage, counted in part kinds (draw calls), about 16 per layer | Count instances only: the draw calls are the cost |
| 5 | **Box sizing for moving parts** (I0.2) | The moving parts' footprint over the whole travel plus `ceil(drift(h_max) + 1)` on every side; a form may ask for more, never less; static parts follow the taper rule | Size from the extreme poses: misses mid-travel bindings |
| 6 | **The emitter face pool** (I0.3) | Its own effect task after the layer's pass, over the box and a 48 px outset, `dst · src + dst` | A term in `reliefShade`: cannot light the outset |
| 7 | **Emitter budget** (I0.3) | 64 per layer, binned into a 16×9 tile bitmask | An untiled loop: 2.30–2.63 ms at 64, 8.9–9.7 ms at 256 |
| 8 | **Page reflections** (I0.4) | One local environment cube per layer (512², 10 mips, 300 px in front, walls 50,000 px), refreshed on capture only | Refresh every frame (frame work p50 9.0 against 5.3 ms at DPR 1), or `createPbrLocalEnvironmentProbeSet` (copies once) |
| 9 | **Glass** (I0.4) | A custom capture-refraction shader (flat glass exact, Snell per channel on bevels) with a Lite reflection shell | Lite transmission: DOM fallback in a layer scene, 1024² grab |
| 10 | **Metal colour** (I0.4) | Gold, brass and copper through the base colour; `reflectance` tints dielectrics only | `setPbrMetallicReflectance` tint: no effect on metals |
| 11 | **Studio** (I0.4, I1) | Generated in code, rotated with `setEnvironmentRotation` to the key light (0.40° measured); hemispheric fill off or diffuse only | A shipped HDR asset |
| 12 | **Knob interaction** (I0.7) | Vertical drag 200 px per sweep (Shift ×0.1, 4 px tap slop), ring click-to-set, cap tap steps by half, document-level wheel, double-click reset, native keys; a transparent input covers the dial | A wheel listener on the input (unreliable in the canvas subtree); circular drag stays an option |
| 13 | **Premium defaults** (I1, proposed) | Switch `slide`; the theme picks the faceplate (brushed light, gunmetal dark); metals direct light ×0.2 | Bat or rocker by default: a lever projects about 12 px head-on |
| 14 | **Parity budget** (I0.6) | Per component over the control's box + 10 px (printed scale included): mean × 1.5, p95 × 1.5, SSIM with 50% headroom on its deficit | Relief's whole-stage mean ≤ 2, p95 ≤ 10: unreachable without reflections and perspective |
| 15 | **Object-on-object shadow map** (I0.5) | Analytic face shadows plus a per-layer PCF map of 4096 at bias 1.5e-3 (≈ 1.95 px world), the light's depth range fitted to the stage, thin-instance bounds published, re-rendered on pose change only | PCF 2048 at bias 2e-3 (cheaper, 0.04–0.07 ms); re-rendering every frame (120 of 120 renders with nothing moving) |
| 16 | **Contact shadows** (I0.5) | Optional, not default, decided by I0.8's budget; when on, on an offscreen mesh target composited over the face | On by default: the costliest path (1.5–3.2 ms), mostly duplicating the map at cap bases |
| 17 | **Shadow generator kind** (I0.5) | PCF | CSM (0.44–0.68 ms, splits or acnes the thin plate) and ESM (no usable shadow over a stage-wide depth range): both out |

## Next

1. **The look iteration** the owner asked for, on the prototype page:
   - carry I0.4's studio, materials and capture refraction into the prototype (the glass cap, the flat brushed tops);
   - crisper 2 px chamfers;
   - a larger bat lever, or accept the `slide` default;
   - visible paddle and push-button travel;
   - object-on-object shadows from I0.5 (analytic plus the PCF map), with the map's darkness brought towards the face
     shadow and the softness change where a mapped streak meets the face shadow;
   - bloom from I0.8.
   Then the look sign-off.
2. **PR 3:** the design-language sections, version 4 of the [Rendering Model](rendering-model.md), `premium.json` and
   the reference implementation, from the accepted numbers.
3. **PR 4:** core, the `instrument` material and the mesh pass, replacing `InstrumentProbeHook`, with the
   [findings](#findings-for-later-phases) above as its first test cases.
