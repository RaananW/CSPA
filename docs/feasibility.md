# Feasibility, backend decision and historical gates

**Evidence storage:** historical raw paths named below refer to the verified
external local archive, not files in this checkout. Only compact verdicts
remain tracked; [archive access, hashes and reproduction](archive-catalog.md).

## Decision

**Current review gate: bounded Phase 6 compatibility/comparison evidence,
following the accepted typed runtime, animation/effect and TODO pilot.**
The shared runtime lives in `src/canvas-spa/`; `/runtime.html` demonstrates the
intentional API. See [API usage](api.md) and the [current verification matrix](verification.md).
One persistent external root container and the public owning-canvas pixel-copy
bridge remain the adopted path. Clipping/scrolling and unsupported boundaries
use diagnosed DOM policies, not simulated interaction or private GPU APIs.

The [Phase 6 report](measurements.md) records actual matching React18/19
production/development behavior,2/4/8-layer DPR1/2 production comparisons,
native input-to-pixel bounds and all seven original milestone outcomes.
The separate parent-owned headful/AX report verifies bounded native keyboard,
original accessible controls, fallback continuity and effect pixels.
It is not screen-reader/OS IME/physical-device certification. Measured
root-wide capture/comparison, startup and storage overhead do not establish
a performance improvement.

The sections below retain the **historical Phase 1 gates**, including failures
that the new ownership/transfer path did not erase. The bounded native React/GPU
surface passes; Option 3 remains the user-adopted recovery direction. The landing
page remains ordinary DOM. The historical integrated specimen is `/surface.html`, not a declaration of
broad application compatibility.
The public configured-device loss observer now also passes genuine
explicit-destruction loss recovery to ordinary DOM. Physical GPU resets and
driver crashes remain untested. Maintained implementation contracts are in
[architecture.md](architecture.md); setup and validation are in
[CONTRIBUTING.md](../CONTRIBUTING.md).
Historical statements that React18, portals or all headful behavior were
untested describe those earlier gates; only the specific current
[verification matrix](verification.md) supersedes them.

A subsequently authorized bounded follow-up **does** restore ordinary DOM by
moving an externally owned, stable React root container out of the canvas with
`Element.moveBefore`. This is a different ownership-boundary mechanism from
changing the fixed canvas subtree's styles. It preserves the tested state and
has better upside than remounting. The user subsequently adopted it and
authorized the [native GPU integration below](#adopted-stable-root-gpu-integration).
See [the option 2/3 comparison](#follow-up-options-2-and-3).

The originally proposed **direct snapshot draw** into an independent 2D canvas
still fails. That does not prohibit ordinary pixel copies: drawing on the
owning canvas, then copying its pixels with `drawImage`, now reaches both public
Babylon backends successfully. The integrated WebGPU specimen additionally
verifies native controls at GPU-translated positions, alpha/shader pixels,
and stable-root DOM disable/reentry. The older generated-pixel evidence and
failed fixed-subtree transitions are preserved as historical, narrower results.

## Exact environment and primary definitions

Validation uses installed Google Chrome **154.0.8037.98**, revision
`b859317bf11f6be47f9b7799ec690a0a42a1fb33`, executable
`/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`.
Tests are headless, with temporary clean profiles. Everyday-profile flags and
interactive/headful behavior are not inferred from these runs.

Explicit experimental flags are
`--enable-blink-features=CanvasDrawElement,ElementCanvasTransform` and
`--enable-experimental-web-platform-features`. The evidence probe additionally
requests `--enable-automation` for CDP command-line retrieval; the follow-up
browser tests also request it explicitly. Its full actual
command line, CDP browser/JS versions, executable, and timestamp are in
[`report.json` (archived raw)](archive-catalog.md). Playwright's default launch
arguments include GPU/software-rendering choices; this is not a verified
hardware-accelerated production benchmark.

Current stable releases were checked against the npm registry when scaffolding,
then installed at exact versions:

| Package | Version |
| --- | --- |
| React / React DOM / their type packages | 19.3.0 |
| TypeScript | 7.0.2 |
| Vite | 8.3.4 |
| Babylon Lite | 1.33.0 |
| Babylon Lite GL | 1.15.0 |
| Playwright Test | 1.64.0 |
| pngjs | 7.0.0 |

Node 24.19.0/npm 11.17.0 satisfy Vite's supported Node range. See
[`package-versions.json` (archived raw)](archive-catalog.md),
`package-lock.json`, and [`npm-audit.json` (archived raw)](archive-catalog.md).
The audit reports zero vulnerabilities. The React baseline uses shared
18/19-era APIs; React 18 and a full compatibility matrix were not tested.

Primary definitions for this exact Chromium revision:

- [HTMLCanvasElement IDL](https://github.com/chromium/chromium/blob/b859317bf11f6be47f9b7799ec690a0a42a1fb33/third_party/blink/renderer/core/html/canvas/html_canvas_element.idl),
  saved in [`chrome-html-canvas.idl` (archived raw)](archive-catalog.md).
- [UpdateElementGeometryOptions IDL](https://github.com/chromium/chromium/blob/b859317bf11f6be47f9b7799ec690a0a42a1fb33/third_party/blink/renderer/core/html/canvas/update_element_geometry_options.idl),
  saved in [`chrome-geometry-options.idl` (archived raw)](archive-catalog.md).
- [Runtime feature definitions](https://github.com/chromium/chromium/blob/b859317bf11f6be47f9b7799ec690a0a42a1fb33/third_party/blink/renderer/platform/runtime_enabled_features.json5).
- [GPUQueue IDL](https://github.com/chromium/chromium/blob/b859317bf11f6be47f9b7799ec690a0a42a1fb33/third_party/blink/renderer/modules/webgpu/gpu_queue.idl).
- [Current HTML-in-Canvas explainer](https://github.com/WICG/html-in-canvas).

**Correction:** this browser does implement `ElementCanvasTransform`.
`layoutSubtree` being present and a `content` property probe being negative do
not establish that the implementation is "older." `ElementCanvasTransform`
is the Blink feature gating the one-argument `getElementTransform(Element)`
overload, not a JavaScript constructor. WebIDL dictionaries such as
`UpdateElementGeometryOptions` likewise need not have runtime constructors.
This revision's options contain `canvasTransform` and `preserveHitTestOrder`;
we do not assume the explainer's clip option exists here.

## Native capture and geometry: what passed

The original disposable controls remain descendants of their owning canvas.
The installed implementation requires enabling descendant layout:

```js
host.layoutSubtree = true;
host.requestPaint(); // wait for paint, with a 1500 ms timeout
const snapshot = host.captureElementImage(layer);
ctx.drawElementImage(snapshot, 40, 40, { preserveElementGeometry: true });
host.updateElementGeometry(layer, {
  canvasTransform: new DOMMatrix().translate(40, 40)
});
host.getElementTransform(layer); // e = 40, f = 40
snapshot.close();
host.clearElementGeometry(layer);
host.getElementTransform(layer); // identity
```

`preserveElementGeometry: true` suppresses staging/draw geometry changes; the
visible owning host receives explicit geometry updates. Two independent
drawable captures produce actual red `[240,30,60,255]` and green
`[20,200,90,255]` pixels. The nested drawable is separately composited rather
than painted twice as part of the parent.

Real browser mouse events hit translated, scaled, and rotated button
coordinates. Real keyboard events edit the original input from `original` to
`original-edited`; recapture changes the owning canvas's pixel hash.
DPR 1 and 2 tests also reject off-target hits and invalid/singular geometry.
No `element.click()` or synthetic input-value interaction is used for these
positive interaction checks. This native fixture is not React reconciliation
under a GPU host; the real React controls are tested separately in DOM mode.

## Runtime fallback gate: what failed

Every transition starts after a successful capture, clears the geometry of
**both** drawable layers, verifies identity with `getElementTransform`, and
clears the bitmap before applying the candidate and waiting two animation
frames. Original input identity, value/selection/focus, layout rectangles,
real pointer hits, and screenshots are recorded.

| Candidate | Observation |
| --- | --- |
| `content="fallback"` / remove `content` | No ordinary DOM controls painted; no successful hit |
| `display: contents` | Does not recover ordinary fallback descendants |
| `display: block` | Layout boxes can remain, but canvas presentation/hits do not become usable DOM |
| Zero bitmap dimensions | Does not promote descendants to ordinary painted controls |
| Hidden canvas / visible child | Does not restore usable descendant presentation |
| `layoutSubtree = false` | Removes descendant layout instead of exposing ordinary DOM |
| `display: none` | Removes the canvas subtree from presentation |

All eight fail real pointer clicks and their screenshots show absent controls.
Some preserve nonzero descendant layout boxes and hit the canvas; others have
zero boxes. The `content` attribute transitions are ineffective on the
observed `layoutSubtree` surface, not evidence that all modern APIs are absent.

Clearing `ElementCanvasTransform` geometry restores identity hit/accessibility
mapping; it does **not** request ordinary DOM visual painting. Browser canvas
fallback descendants are not ordinary visible DOM in a browser that supports
canvas. Preserving object identity or an input value alone is not recovery.
No supported restoration mechanism was demonstrated by the bounded checks;
this is a result for this executable/setup, not a universal impossibility proof.

**Initial fallback is different:** the real application chooses ordinary DOM
before mounting, since GPU admission in that original topology was blocked. Missing native methods and
an unavailable `navigator.gpu` leave native React controls usable. That does
not test switching an already-running GPU application back to DOM.

## Native transfer versus public backend feasibility

A snapshot captured from `host` can be drawn on `host`'s 2D context, but drawing
it onto an unrelated HTML 2D staging canvas throws:

> InvalidStateError: The source was captured from a different canvas.

An unrelated OffscreenCanvas 2D context throws the same ownership error.
Snapshots close in `finally`; failed original native starts create no engine
and clean their output/staging resources. This rules out drawing the snapshot
**directly** into that staging canvas, not ordinary copies from its owner.
The new `owning-staged` mode uses the latter and passes.

Chromium's GPUQueue exposes element-image texture copy/draw IDL, but those calls
were not integrated or exercised through Lite. No public GPUDevice accessor
was found in the installed Lite engine contract. Lite GL's public context
explicitly forbids raw GL-state mutation. Neither engine internals nor raw GL
state were used. `createHtmlTexture` was deliberately not used because its
element relocation/inert/static-fallback behavior violates this slice.

Separately, generated red/green canvases plus changing text are uploaded using
public `createDynamicTexture`/`updateDynamicTexture` APIs. One engine and one
composition effect render two textures per surface, with serial WebGPU then
WebGL2 lifetimes. Screenshots verify markers, upload-driven pixel changes, and
shader tint changes, not just method names or a created canvas.

Both backends pass 300 GPU-only frames with **zero new captures/uploads**.
Each generated run has zero native captures, three explicit uploads, and
227,600 estimated RGBA upload bytes. Twenty serial cycles per backend return
all six application-owned resource counters to zero. This proves public
upload/composition feasibility with generated sources, not native-layer
upload feasibility or an integrated renderer.

**Original recommendation, superseded for the bounded specimen below:** retain
DOM until native transfer and approved recovery topology are solved. Those
two gates now pass for the explicit mount adapter. Lite/WebGPU is the integrated
backend; Lite GL remains a serial comparison, not automatic backend recovery.

## Measurements, failures, and evidence limits

`report.json` contains capture/upload CPU durations, explicit counters,
per-frame CPU work, and animation-frame intervals. Representative headless
generated results were roughly 0.1/0.2 ms WebGPU work p50/p95 and
0/0.1 ms GL work p50/p95, with about 16.7 ms animation-frame intervals.
Timer precision can yield zero CPU samples. These are not GPU execution
timings, total pipeline latency, or proof of performance improvement.

Resource counters cover owned engines, textures, effects, staging canvases,
snapshots, and output canvases. Engine-managed renderers are explicitly
unregistered/disposed. Driver memory, engine internal buffers, and total GPU
resource counts are not measured. WebGPU startup is bounded at five seconds;
a late successful engine is disposed and a new lifetime is refused while
startup remains unresolved. The original backend timeout branch was not
browser-tested; the new surface separately tests delayed real adapter admission,
five-second timeout, serial refusal and late engine disposal.
GL shader readiness is bounded at 1500 ms.

Screenshots/readbacks are validation instrumentation outside timing loops.
GL uses `preserveDrawingBuffer` for screenshot evidence, not as a production
recommendation. Tests cover real unavailable-WebGPU initialization, unavailable
capture configuration, bad geometry, paint timeout/request failure, repeated
disposal, and serial-lifetime admission. The DOM UI diagnostic buttons only
show explicitly requested messages; they do not inject live renderer faults.

Evidence:

- [`chrome/report.json` (archived raw)](archive-catalog.md): exact build/launch,
  capture, native editing hashes, three transform hits, eight failed fallback
  transitions, Offscreen error, generated backend pixel checks, timings and disposal.
- `evidence/chrome/native-*.png`, `geometry-*.png`, `fallback-*.png`,
  `webgpu-*.png`, `webgl2-*.png`: corresponding rendered pixels.
- [`chrome-no-flags/report.json` (archived raw)](archive-catalog.md):
  same installed executable with no requested native experimental flags.
- [`browser-tests.json` (archived raw)](archive-catalog.md): current full installed
  Chrome tests; [`final-tests.log` (archived raw)](archive-catalog.md): three unit
  passes, TypeScript/production build, browser summary.
- `evidence/canary/` is historical pre-restriction exploration, not part of
  the approved installed-Chrome verdict.

At the original gate, not established: active GPU-to-DOM recovery, renderer-loss recovery, integrated
React/native/GPU updates and geometry, alpha/clipping conformance, scroll/resize
coverage, IME, screen-reader usability, cross-browser or React-version matrices.
The follow-up below establishes native-canvas-to-DOM adapter recovery, not
active GPU renderer recovery.

## Follow-up: options 2 and 3

**Option 3 has the better upside for retaining an existing React app's state.**
Both candidates restore visible ordinary DOM and remain interactive, but
remounting resets local React and browser state. Moving the *externally owned
root container* preserves the tested local hook state, DOM identity, uncontrolled
edits, focus, and selection without application-specific restoration code.
This is a feasibility recommendation, not production adoption or a speed claim.

### Ownership boundary and exact calls

The fixture owns a canvas, an ordinary-DOM destination, and `appContainer`
outside any React root. React owns **all descendants inside** `appContainer`.
For option 3, `createRoot(appContainer)` runs once and the target never changes:

```js
const appContainer = document.createElement("div"); // adapter-owned
appContainer.setAttribute("drawable", "");
captureHost.append(appContainer); // initial placement, before React mounts
const root = createRoot(appContainer);
root.render(<Specimen />);

captureHost.clearElementGeometry(appContainer);
// All captured ElementImages have already been closed.
domHost.moveBefore(appContainer, null); // no remove/append fallback

captureHost.moveBefore(appContainer, null); // reentry, same root
// Await native paint, recapture, then reestablish visible geometry.
```

Both parents and the moved container remain connected to the same document.
The fixture never moves JSX-created descendants, changes a portal target,
creates hidden duplicate controls, or calls `createRoot` again for option 3.
The unsupported-API test explicitly refuses admission before mounting, rather
than silently substituting `appendChild`. Other `moveBefore` failures propagate.

[React's createRoot reference](https://react.dev/reference/react-dom/client/createRoot)
describes React taking over DOM **inside** its root container. That documents
the ownership boundary, not a promise of HTML-in-Canvas transition behavior.
[Element.moveBefore](https://developer.mozilla.org/en-US/docs/Web/API/Element/moveBefore)
documents state-preserving movement with same-document/same-connectedness
constraints. The behavior here is established by this installed browser's
experiment, not inferred from either reference.

Option 2 explicitly unmounts the previous root, removes its now-empty container,
creates a new destination container/root, and mounts the same specimen. Only
the controlled value and submitted form result live in an external store.
An optional strategy explicitly focuses the new input with the previous ID
and reapplies selection offsets. It does not restore uncontrolled values.
This is not a claim that hoisting two specimen fields preserves arbitrary apps.

### Measured comparison

Each case edits controlled and uncontrolled fields through real pointer/keyboard
input, increments a nested local counter, selects text, exits canvas topology,
submits a form in ordinary DOM, removes/adds a conditional child, reenters the
canvas, interacts there, and runs ten more round trips. The initial exit/reentry
plus ten repeats is **22 transitions per case**.

| Observation | Option 2: remount | Option 3: stable-container `moveBefore` |
| --- | --- | --- |
| Ordinary DOM pixels and real interactions | Pass | Pass |
| Controlled value / submitted result | Retained only through the explicit external store | Retained |
| Nested local counter / hook identity | Reset / replaced on each transition | Retained unless intentionally removed by React |
| Parent's conditional visibility state | Resets to default | Retained |
| Original container and input identity | Replaced | Retained |
| Uncontrolled edits | Reset to `defaultValue` | Retained in both directions |
| Focus and selection, no restoration | Lost in both directions | Retained in both directions |
| Optional focus/selection restoration | Controlled field restored; uncontrolled selection clamps after value reset | Not used |
| React updates, conditional removals/additions, final unmount | Pass | Pass |
| Root creations across 22 transitions | 23 | 1 |

For example, selected controlled offsets `1..3` survive option 3's exit with
the same focused input. Plain remount loses focus and moves selection to the
end of the retained controlled value. Explicit remount restoration recovers
that controlled selection. On reentry, the edited uncontrolled value resets
to `native` (six characters); applying the old thirteen-character selection
clamps to six even though focus is explicitly restored. Option 3 retains
`edited-in-DOM` and its actual selection without restoration.

There are six measured comparison cases: move without restoration, remount
without restoration, and remount with explicit restoration, each on production
React and **development StrictMode**. Development initial effect accounting
confirms two mounts/one cleanup, so this is actual StrictMode replay rather
than just a production `<StrictMode>` wrapper. Effects are not replayed merely
because option 3 moves the container.

Owning-canvas screenshots change after real native edits. Every capture reads
the red marker pixel and checks the reapplied transform (`e=f=30`).
Ordinary-DOM screenshots verify the blue marker pixel; real pointer clicks,
keyboard updates, and form submission establish usable DOM, not just identity.
Native button interactions and conditional reconciliation continue to work on
reentry. Every transition clears owned root geometry before leaving canvas,
with the identity transform recorded, and every snapshot closes immediately.
Only one authoritative control tree is present throughout.

All cases finish with zero live roots, snapshots, and instrumented effects,
zero external-store subscribers, and no remaining specimen controls. Reports
contain no page/console/resource errors. This is owned-resource accounting,
not a heap, browser-memory, or GPU-driver leak proof.

### API shape, compatibility limits, and remaining blocker

Option 3 needs an **explicit mount adapter** that owns the root container and
both destination parents outside React's managed children. An ordinary
JSX-only wrapper cannot silently move one of its React-created child nodes
and claim the same ownership contract. Framework-managed/hydrated roots,
portals, and other root ownership arrangements need separate investigation.
Option 2 is easier to express as an explicit remount boundary, but its reset
semantics and application-specific state restoration are a major compatibility
cost for arbitrary nested applications.

Moving preserves tested state, not ancestry-dependent presentation. The same
specimen changes inherited background from red to blue and ancestor-selected
padding from 12 to 18 pixels on exit, then back on reentry. Capture/layout and
hit geometry must be rebuilt for the destination; ancestor selectors, inherited
variables, containing blocks and broader layout assumptions can change. No CSS
normalization system was built.

Recovery coverage is DPR 1, React 19.3.0, and the same installed headless Chrome
154.0.8037.98/revision/experimental flags as above. It does **not** establish
IME composition, portals, dialogs/popovers, iframe continuity, custom-element
lifecycle behavior, screen readers, broad CSS compatibility, React 18,
hydration, renderer-loss handling, or another browser/build. No active GPU
renderer is involved in these recovery experiments.

At this comparison gate the native snapshot-to-GPU transfer remained unsolved.
The subsequent ordinary-pixel transfer below resolves that narrower gate.
The original eight fixed-subtree fallback failures are retained.
This follow-up adds a successful host-boundary candidate, not a retroactive
pass for those mechanisms or a completed GPU application.

Reproduce with `npm run build && npm run test:browser -- recovery.test.mjs`.
Playwright starts/reuses production preview 5174 and development 5173 and
cleans up servers it starts. Evidence is in `evidence/recovery/`:
`move-restore-false-strict-{false,true}.json`,
`remount-restore-{false,true}-strict-{false,true}.json`, and matching `-dom.png`
and `-reentry.png` files. Each JSON records the actual Chrome build/launch
command, before/after state, identities, styles, capture pixel hashes,
transitions, and final disposal. `evidence/recovery-tests.log` records the
focused seven-test comparison result. That integration-era full suite had
twenty-seven browser tests; the current recovery/compatibility suite has forty-one.

## Alternatives requiring a changed contract

Historical alternatives at the comparison review gate (Option 3 was subsequently
adopted for the bounded prototype; the remaining alternatives are unapproved):

1. React-managed remount with hoisted state and explicit focus/selection
   restoration. This gives up original DOM identity and has IME/accessibility
   consequences that need separate approval and tests. The bounded follow-up
   above now implements a disposable comparison, not an application fallback.
2. Separate initial DOM fallback from runtime renderer recovery; retain the
   native canvas-descendant topology and recover GPU failures to the owning
   native 2D canvas. This is not ordinary-DOM runtime fallback, does not solve
   the independent-staging ownership restriction, and needs separate approval.
3. Stable external root-container movement has now been adopted by the user for
   the bounded prototype below. A finished reusable authoring API is not approved.

No imperative reparenting of React-owned descendants, duplicated interactive
controls, hidden editable copies, reload-only recovery, global profile changes,
or later-phase API development was introduced. The follow-up moves only its
explicitly adapter-owned root container.

## Adopted stable-root GPU integration

**Verdict: admitted for this bounded Phase 1 specimen, not broad production
compatibility.** `/surface.html`, `src/surface.tsx` and `src/surface-renderer.ts` connect actual React
controls to native captures, public Lite/WebGPU textures and shader composition.
The original DOM baseline and prior probes remain available. No Phase 2 work,
upstream modification, engine-private access, raw GL mutation or dependency
change was needed.

### Working public transfer and visible topology

For each independently drawable React layer:

```js
const image = host.captureElementImage(layer);
try {
  owner2D.clearRect(0, 0, host.width, host.height);
  owner2D.drawElementImage(image, 0, 0, { preserveElementGeometry: true });
  pixels2D.drawImage(host, 0, 0, width, height, 0, 0, width, height);
  updateDynamicTexture(engine, texture, pixelsCanvas, {
    invertY: false, premultiplyAlpha: false
  });
} finally {
  image.close();
  owner2D.clearRect(0, 0, host.width, host.height);
}
```

The owning HTML canvas contains the one original root container and keeps native
control geometry. Two reusable staging canvases contain **pixels only**, not DOM
controls. Public textures sample straight-alpha RGBA. A separate, overlaid,
pointer-transparent GPU canvas supplies the sole visible image. The owning
canvas's bitmap is cleared while its geometry is retained; a full-frame opaque
GPU shader supplies the background. Tests read the owner bitmap as entirely
transparent and verify real pointer/keyboard input on the original controls.
This is not a hidden duplicate control tree.

The tested card is 300x220; the independent 100x60 badge overlaps it with 0.5
alpha. Screenshot pixels are red `[240,30,60,255]` and blended
`[130,115,75,255]`. A shader red/blue swap produces `[60,30,240,255]` and
`[75,115,130,255]`. A 40-pixel GPU translation moves native geometry by the same
amount; real clicks still increment both original buttons at the shifted
browser bounding boxes. Real typing and Enter update React state, submissions
and captured GPU pixels. This integrated test covers translation, not a new
integrated scale/rotation claim; the earlier native-only transform tests remain.

The same owner -> ordinary staging pixels -> public dynamic texture path also
passes the separate **Lite GL/WebGL2** native marker test, serially after WebGPU.
The integrated app prefers Lite/WebGPU, with ordinary DOM rather than automatic
GL backend substitution on failure. Direct owner-canvas uploads and raw native
GPUQueue element uploads were not needed or tested.

This is **not zero-copy**: there is native capture/drawing, an ordinary 2D pixel
copy, and a public texture upload per updated layer. It does not establish a
performance gain or eliminate browser/GPU copies.

### Recovery, ordering and lifetime evidence

The adapter owns both connected same-document destination parents and the
stable `appContainer` outside React. `createRoot(appContainer)` runs exactly once,
initially in ordinary DOM. Admission moves only that container with `moveBefore`.
On fallback, all layer geometry is cleared (identity verified), all snapshots
are already closed, and the container returns to ordinary DOM without remount,
focus restoration, cloning, append/remove substitution or a new root target.

**Important teardown finding:** disposing the GPU engine immediately after
shifted native/focused rendering crashed this Chrome renderer in the first
integration runs. Moving before teardown alone did not fix it. The corrected
sequence moves/clears geometry, hides the obsolete surfaces, awaits the public
`waitForGpuIdle(engine)` queue fence, then unregisters/disposes the renderer,
effect, textures, staging canvases and engine. The subsequent focused-input
recovery tests pass. This fence is transition-only, not steady-state pixel
readback or a claim of faster rendering.

Production and actual development StrictMode tests each complete eleven
GPU -> DOM -> GPU round trips (twelve serial engine admissions), then dispose.
They preserve the same container/input objects, controlled and uncontrolled
values, local nested hook state, focus/selection and submissions. Conditional
child removal/addition remains functional in DOM and after GPU transitions.
StrictMode records two effect mounts/one initial cleanup; final cleanups equal
mounts. There is always one authoritative control tree and at most one engine.

Ancestry is intentionally non-neutral: ordinary DOM changes card red/padding12
to blue/padding18. Reentry rebuilds captures, pixel sizes and geometry. This
does not solve general ancestor selectors, inheritance, scrolling or layout.

Failure tests retain usable original DOM for missing capture, missing WebGPU,
missing `moveBefore`, suppressed native paint timeout, rejected adapter
admission and injected native geometry rejection. A delayed **real** adapter
request exercises the five-second engine timeout: reentry is refused while
admission remains pending, then the late engine is disposed. An injected
runtime capture failure moves the same root to usable DOM with both input
values and identity retained. These are explicit faults, not natural device
loss. Runtime failure and ordinary recovery have rendered PNG evidence.

**The original integration did not establish actual device loss.** Its
effect-only recovery-strategy concern remains valid, but it did not rule out
standard browser loss observation. The subsequent bounded gate below resolves
ordinary-DOM loss recovery without an unrelated strategy or private access.

### Counts, measurements and reproducibility

React commits, native `paint.changedElements`/input invalidations and GPU frames
are separate triggers. The bounded specimen recaptures its two layers together
on an invalidation; per-layer dirty optimization is not implemented. A single
`Profiler` encloses the entire specimen tree, including nested local-state
updates. Its `onRender` callback counts actual committed updates, not render
attempts or effect mounts. `/surface.html` imports the supported
`react-dom/profiling` entry so callbacks run in the **production-profiling**
build as well as development; an ordinary production renderer with a Profiler
would not establish this measurement. The other pages retain their normal
renderer. The small declaration shim reuses the public `createRoot` type.

Both reports record one initial committed mount even though development
StrictMode replays the mount effect twice. A nested-only button update advances
the commit count from 3 to 4; normal controlled-input edits/submission advance
it to 22. These positive controls establish that the callback is active and
covers nested work. Each callback's phase and commit time are recorded in
`metrics.commitEvents`; no normal React/native invalidation is disabled.

After blur/settling and outside screenshot instrumentation, **300 GPU-only
translation/tint frames add zero React commits, zero native captures, zero
pixel copies and zero uploads** in both production-profiling and actual
development StrictMode. Geometry updates and GPU draws continue. The latest
reports have these interval counters; incidental paint totals differ:

| Counter | Production before -> after | Development StrictMode before -> after | Added in each |
| --- | --- | --- | ---: |
| React commits | 22 -> 22 | 22 -> 22 | 0 |
| Native captures | 22 -> 22 | 24 -> 24 | 0 |
| Ordinary pixel copies | 22 -> 22 | 24 -> 24 | 0 |
| Public texture uploads | 22 -> 22 | 24 -> 24 | 0 |
| GPU frames | 11 -> 311 | 12 -> 312 | 300 |

The complete production run records 63 React commits, 102 captures/copies/
uploads, 14,688,000 estimated RGBA upload bytes and 351 GPU frames. Development
StrictMode records 63 commits, 104 captures/copies/uploads, 14,976,000 bytes and
352 GPU frames.
These event-driven totals can vary with native paints; exact counters and timing
arrays are authoritative in the per-run JSON. CPU call-duration medians were
approximately 0.1 ms capture/draw/copy, 0 ms upload (timer quantization), 0.2
ms frame work, and 16.7 ms RAF intervals. Profiling adds measurement overhead;
these exclude native paint wait and are not GPU execution timings, total
latency or comparative benchmarks.

Final ledgers reach zero for roots, capture/output canvases, pending/active
engines, textures, effects, renderers, staging canvases, snapshots, listeners and
scheduled frames. Both page-owned canvases are removed on final disposal.
This accounts for application-owned resources, not driver memory or all
engine-internal buffers.

```sh
npm run build
npm run test:browser -- surface.test.mjs --reporter=list
# Or all original and new regressions:
npm test
```

Twenty-five focused surface tests pass. The complete suite has three unit tests,
TypeScript/production build and forty-one browser tests. It uses only the
same installed Chrome executable/build/revision and explicit flags documented
above, fresh automation profiles and DPR 1 for this integration. No browser was
installed or switched.

Evidence:

- [`surface/production.json` (archived raw)](archive-catalog.md) and
  [`surface/development-strict.json` (archived raw)](archive-catalog.md):
  actual CDP version/launch command, native pixels, GPU-only before/after counts,
  production-profiling/development build identity, commit events and positive
  commit-counter controls, state,
  geometry cleanup, cycles, final resources and empty page/console/resource
  error lists.
- `evidence/surface/{production,development-strict}-{initial,edited,shader-shift,ordinary-DOM,reentry}.png`.
- [`surface/native-public-backends.json` (archived raw)](archive-catalog.md)
  and `native-{webgpu,webgl2}.png`: real native transfer through both engines.
- `evidence/surface/*-unavailable.json`, `no-gpu.json`, `paint-timeout.json`,
  `gpu-admission-rejected.json`, `geometry-rejected.json`,
  `late-engine-timeout.json`, `runtime-capture-failure.json` and
  `runtime-failure-ordinary-DOM.png`: explicit negative/recovery evidence.
- [`surface-tests.log` (archived raw)](archive-catalog.md) and
  [`surface-build.log` (archived raw)](archive-catalog.md).

**Upside/next gate:** Option 3 now retains tested local/native state around an
actual GPU renderer, not only native 2D capture. It still requires an explicit
mount boundary and cannot be promised as a JSX-only wrapper over arbitrary
existing roots. Review the bounded loss/mount-boundary gate below before
any expansion. IME, accessibility, portals/dialogs/popovers, iframes, hydration,
framework-owned roots, React 18, headful Chrome, general CSS/layout and broader
browser support remain untested. No automatic Phase 2 is authorized.

## Public device-loss recovery and mount-boundary gate

**Pass for actual WebGPU `device.lost` delivery induced by explicit destruction,
not physical GPU-reset/driver-crash recovery.** Tests use the same installed
Chrome, clean automation profiles and explicit flags recorded above.
`src/device-lifecycle.ts` reads the standard
`GPUCanvasContext.getConfiguration().device.lost` promise. Admission refuses
unavailable observation or null configuration rather than assuming a device.
No reusable module destroys a device; only diagnostic fixtures induce loss.

The installed Lite public scene/sprite/text recovery enablers require each
registered context kind to have a strategy; its force-loss helper requires
registration. The shipped declarations and source-map entries are identified
in [the architecture/public-contract section](architecture.md#public-gpu-contracts-and-loss-mechanism).
There is no public effect-only enabler in this release. Browser observation
provides DOM recovery without claiming automatic in-engine restoration.
Explicit reentry admits a fresh engine and regenerates textures/geometry.

Four actual-loss cases cover idle and GPU-only motion, in production-profiling
and real development StrictMode. After real `"destroyed"` delivery, they verify:
same root/container/input objects and mount counts; nested hook state;
controlled/uncontrolled values, focus and selection; cleared identity geometry;
blue ordinary-DOM pixels; real pointer/keyboard/form behavior; GPU reentry
with red captured pixels; and idempotent final cleanup. The production motion
case additionally repeats two loss/reentry cycles. An admission fixture synthetically gates
paint until actual loss delivery, distinguishing pending destruction from
observable loss while serial enable/disable/reentry requests complete.

Every observer is released on disposal and scoped to its engine lifetime.
A synthetic delayed old-generation delivery after intentional disposal
leaves a replacement engine running and its controls functional.
Active motion is generation-checked and its pending RAF is cancelled on loss
or topology change. Native paint waits also abort and remove their timer/
listeners; normal native invalidation remains enabled. A synthetic capture/
disposal race verifies that a queued stale recovery cannot undo final unmount.

Healthy teardown retains the original crash-avoidance ordering: cancel/clear
geometry, move the root to DOM, hide surfaces, await a confirmed public idle
fence, then dispose GPU resources. The 1500 ms bounded wait distinguishes
completion, actual loss, rejection and timeout. **A healthy timeout/rejection
does not authorize unfenced destruction.** It leaves these owned GPU resources:

| Resource | Retained while cleanup is pending |
| --- | ---: |
| Engine | 1 |
| Dynamic textures | 2 |
| Effect / renderer | 1 each |
| Pixel staging canvases | 2 |
| Loss observer / pending cleanup | 1 each |
| Snapshots / paint waits / scheduled refresh or motion frames | 0 |

The root stays mounted and ordinary DOM remains interactive. Reentry and final
disposal explicitly refuse pending cleanup. Synthetic pending/rejected-fence
tests later deliver actual device destruction; a separate artificially delayed
healthy fence completes without any device loss. Both routes then serialize
safe release and permit reentry. No forced cleanup is used to fake zero
accounting. Without eventual fence completion or observable loss, retention
can remain pending indefinitely; diagnostics and the API expose that limit.
Final successful runs return every owned ledger entry to zero, including
observers, pending cleanup, motion/startup scheduling and demo listeners.

Typed mount ownership and public-device lifecycle code are now separate from
the React demo/profiling/fault fixtures. Guards reject disconnected,
cross-document, identical, nested or nonempty destinations before mounting,
without changing existing content. Missing `moveBefore` refuses GPU admission
while preserving ordinary DOM. Bounded motion arguments and disposed/pending
lifecycle states are rejected explicitly. Outside-root host ownership remains
the caller's contract; runtime checks do not inspect React internals.
Ancestry-induced styles/layout still change as documented above.

Evidence under `evidence/surface/`:

- `device-loss-{false,true}-{false,true}.json` and matching `-DOM.png` /
  `-reentry.png`: actual loss delivery, root/native state, rendered recovery,
  reentry and final resources; boolean positions are StrictMode and motion.
- `synthetic-fence-{pending,rejected}.json`: deliberately unhealthy fence
  responses on a still-healthy device, retained resources, later actual loss
  and safe cleanup.
- `synthetic-healthy-delayed-fence.json`: synthetic completion delay after a
  real healthy queue fence, no device loss, eventual safe cleanup.
- `synthetic-late-generation-loss.json`: synthetic delayed delivery of the old
  device's actual intentional-disposal loss.
- `synthetic-capture-disposal-race.json`: concurrent injected capture exception
  and final disposal; stale automatic recovery cannot resurrect the surface.
- `admission-loss-and-serialization.json`: actual loss delivery during admission
  and ordered queued lifecycle results.
- `mount-boundary-rejections.json`, `null-configuration.json`,
  `loss-observation-unavailable.json`: explicit ownership/admission refusal.
- `production.json`, `development-strict.json`: preserved 300-frame zero
  additional commit/capture/copy/upload assertions and prior transfer/input/
  fallback regressions.

The focused suite has twenty-five cases; the full regression has three unit
tests, TypeScript/production build and forty-one serial browser cases. Evidence
JSON/logs redact private workspace/home/temporary profile paths. This is not a
general secret detector or a release-readiness audit. Commands and review
guidance are maintained in [CONTRIBUTING.md](../CONTRIBUTING.md).

**Review gate:** public loss-to-DOM recovery and the narrow explicit mount
boundary are demonstrated. Broader React/framework/hydration, IME,
accessibility, portals/dialogs/popovers, iframe, CSS/layout, physical reset,
headful and device/browser compatibility remain untested. Package publication,
license choice and the typed API/CSS-animation roadmap remain separate; no
Phase 2, dependency expansion or upstream modification was performed.
