# CanvasSPA - experimental typed native/GPU runtime

**The bounded implementation includes typed motion, transactional CSS/WAAPI
ownership, decorative ripple and a real TODO pilot, now exercised against
React 18/19 with measured production costs. Phase7 adds original-element refs,
Radix Dialog integration and bounded declarative motion/presence. Phase8 adds
validated decorative effect chains and trusted application color effects,
independently accepted with explicit limits.**
This is an experimental private package, not a released toolkit or an
unchanged-app loader. Option 3 remains the recovery direction:
one host-owned stable container, one persistent React root, and `moveBefore`.
The ordinary DOM baseline remains the default landing page. Genuine WebGPU
device-loss delivery now recovers this specimen to DOM through a public browser
observer; tests induce loss by explicit device destruction, not a physical reset.

The baseline has text, a button, a controlled input, native form submission, and
visible capability/error diagnostics. React owns one original DOM tree. The
separate `/surface.html` implements the small integrated GPU specimen, with
ordinary DOM startup/failure recovery. `/runtime.html` is the current reusable
API demonstration; `/probe.html`, `/recovery.html` and `/surface.html` preserve
the historical gates.

Open <http://127.0.0.1:5173/paired.html?example=css> for the existing HTML/CSS
module, or <http://127.0.0.1:5173/paired.html?example=typed> for typed authoring.
Both use the same React text/button/controlled-input/form behavior, not
simultaneous duplicate controls. Own source + GPU, Play, Pause, Seek and Release
to DOM expose the explicit ownership boundary. Play advances both the native
source's logical timeline and a radial refraction of decorative colored bands;
essential controls retain canonical, undistorted native hit geometry.
The typed example authors motion through numeric `createMotion` descriptors,
without application `Element.animate` calls or transform strings. Layout/style
still compile to browser CSS, not a custom layout engine.

The [TODO application pilot](docs/todo-pilot.md) is runnable at
<http://127.0.0.1:5173/todo.html>. Add, complete, edit, filter and delete real
tasks using original native controls. Explicit GPU admission enables brief
task-triggered sampled-pixel distortion of separate inert artwork; ordinary
DOM remains useful without experimental flags. Compact accessible mode/reason
diagnostics stay visible; full resource JSON is in collapsed details.
[Phase 6 compatibility and measurements](docs/measurements.md) record actual
React-major behavior, scaling and input-to-visible-pixel bounds. GPU overhead
is reported; no performance improvement or full certification is claimed.

The [external-component pilot](docs/integration.md) runs at
<http://127.0.0.1:5173/integration.html>. App-owned CSS and original native forms
use `useSurfaceRef`; Radix Dialog uses its public portal-container prop and
the fixed external overlay host. `Presence` retains one exiting React subtree,
while bounded numeric transitions update native affine geometry and GPU
composition. This is one tested Dialog integration, not all-library support.
The [effects composer](docs/effects.md) runs at
<http://127.0.0.1:5173/effects.html>: original poster form/Dialog controls stay
undistorted while inert artwork combines motion, ripple, chromatic displacement,
dissolve and an application-defined color function. These reuse one shared
composition pass; they are added non-equivalent work, not a DOM speedup.
The [roadmap](docs/roadmap.md) distinguishes implemented Phases7/8 from planned
hardening and documents private phase-history tracking.

Start with the [typed API and example](docs/api.md), the maintained
[architecture](docs/architecture.md), and the honest
[verification matrix](docs/verification.md). The intentional entry point is
`src/canvas-spa/index.ts`: `mountCanvasApp`, `GPUHost`, `Surface`, `Box`,
`NativeScroll`, `NativeOverlay`, `useGPUHost` and their authoring/controller types.
It also exports `useSurfaceRef`, `useNativeOverlayHost`, `Presence`,
`mountApplicationModule` and the narrow numeric motion,
compatibility animation, ripple and `defineEffect`/`setEffects` contracts.
An explicit outside-root mount adapter remains required; a JSX wrapper does
not silently relocate React-created nodes.

## Run

Requires Node 20.19+ or 22.12+ and the installed macOS Google Chrome executable.
Validation used Node 24.19.0/npm 11.17.0. Dependencies are pinned in the lockfile.

```sh
npm ci --ignore-scripts
npm run dev -- --port 5173 --strictPort
```

Open <http://127.0.0.1:5173/>. No browser download, global browser setting change,
remote, or commit is required.

Open <http://127.0.0.1:5173/runtime.html> for the typed runtime, or
`/runtime.html?dom` for ordinary-DOM startup. Layout/appearance props compile
to browser styles; they do not eliminate HTML/CSS layout. The sample has
independent enrolled layers, native controls/form, conditional enrollment and
an external native modal/popover boundary. Scroll, unsupported clipping,
forced colors and unsafe capture dimensions use diagnosed DOM fallback.
Membership/layout/DPR changes require explicit fresh GPU admission.

Open <http://127.0.0.1:5173/surface.html> for the native GPU prototype, or add
`?dom` to start in ordinary DOM without automatic GPU admission. Use its buttons
to enable GPU, change the shader, move GPU geometry, return to DOM, and dispose.
Unsupported capabilities retain working original controls with explicit reasons.

## Reproduce the evidence

```sh
npm test
```

This runs twenty-one unit tests, a TypeScript/production build, and 124 serial
Playwright browser tests. The browser tests start/stop a production preview at
port 5174 and a development server at 5173, or reuse existing servers there.
The recovery cases use production React and real development StrictMode.
They use only
`/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`.

For the isolated matching React18 dependency/type fixture and final production
comparison, run these **serially**, never while another browser writer is active:

```sh
npm ci --prefix fixtures/react18 --ignore-scripts
npm run test:react18
npm run test:react19 # Full primary regression plus actual React19 metadata
npm run measure    # Builds, owns free preview5287, measures, then closes it
```

React18 runs the same 78 runtime/animation/TODO/integration/effects cases, types and build;
React19's full 124-case suite includes those same cases. Both run production and
genuine development StrictMode. The [measurement report](docs/measurements.md)
links all seven original milestone outcomes, raw full-window samples and the
independent headful accessible-tree check. Real OS IME/screen-reader and
physical-device checks remain manual/unverified.

For screenshots, exact browser command line, native capture/fallback results,
and 300-frame public-engine smoke measurements:

```sh
npm run build
npm run preview -- --port 5174 --strictPort
# In another terminal:
npm run probe
NO_NATIVE_FLAGS=1 EVIDENCE_DIR=evidence/regression/current/chrome-no-flags npm run probe
```

Stop the preview with Ctrl+C when finished. `PROBE_URL` overrides its URL.
The screenshot evidence command uses DPR 1; the browser tests separately
exercise native geometry at DPR 1 and 2.
The original `npm run probe` still reports `BLOCKED` for its historical
fixed-subtree fallback and direct cross-owner snapshot transfer. Those failures
remain real; the new surface uses a different, explicitly adopted ownership
boundary and ordinary pixel-copy transfer. Its evidence is separate.

Automation uses fresh profiles and explicit
`--enable-blink-features=CanvasDrawElement,ElementCanvasTransform` and
`--enable-experimental-web-platform-features` flags. These are not a read of
your everyday Chrome profile's settings. Playwright also supplies its own
launch flags; `evidence/regression/current/chrome/report.json` records the actual command line.

New browser/matrix/probe reports default to regenerable `evidence/regression/current`,
not the historical paths linked below. Use
`CANVAS_EVIDENCE_ROOT=evidence/phase8` for Phase8 browser/matrix outputs.
Other archive roots are refused, and sanitization touches only the selected
root. Performance fixtures/comparison/smoke also follow the selected root
(`evidence/regression/current/performance` by default). Back up/hash versioned evidence before
runs and audit afterward; see [effects routing](docs/effects.md#evidence-routing).

See [the feasibility decision](docs/feasibility.md) for the API correction,
failed fallback transitions, native snapshot ownership restriction, backend
comparison, evidence paths, and limitations. The application's diagnostic
buttons request messages while retaining DOM; they are **not** claims of
recovery from a running GPU renderer. `/surface.html` exercises actual
active-renderer disable/reentry and runtime capture-failure recovery.
Maintained [architecture, lifecycle and mount contracts](docs/architecture.md)
and [contributor setup/validation guidance](CONTRIBUTING.md) describe the current
module boundaries, public loss mechanism and pending-cleanup semantics.
Open-source intent is confirmed, but the package stays private; license and
publishing decisions remain separate.

For only the new integration:

```sh
npm run build
npm run test:browser -- runtime.test.mjs --reporter=list
npm run test:browser -- animation.test.mjs --reporter=list
```

`evidence/animation/` records source identity/phase, still-owned declaration
restoration and preservation of later React/direct writes, numeric motion
pixels/source lifetime, and 126 actual native/GPU easing samples (including unclamped transform
overshoot and clamped opacity), decorative identity/distinct-time pixels,
twenty ownership/release transactions per example and failure/loss/retention.
Four production/StrictMode CSS/typed intervals each assert 300 added GPU frames
with zero extra commits/captures/copies/native readbacks/uploads; admission
probe counters remain unchanged. Their screenshots/oracle reads are validation,
not steady-state work. `evidence/phase45-full-regression.log` is the expanded
full result; the earlier `evidence/full-regression.log` remains historical.
See the [API contract](docs/api.md) for the deliberately narrow easing/timing/
CSS provenance/module/effect subset and rejection rules. General animation
libraries, arbitrary existing applications and broad browser/device certification remain
out of scope. No performance-improvement claim is made.

This writes `evidence/regression/current/runtime/*.json` and PNGs. Twenty-three tests cover independent
transforms/opacity, native geometry and rendered edges at DPR 1/2, input/form/
tab/selection, native dialog/popover portals, conservative scroll/clipping
policies, capture-dirty races, real device loss, healthy pending cleanup,
late admission, twenty individually verified StrictMode retirements and real
Vite HMR cleanup, plus functional admission and its failure/retention cases.
Real native captures reach public
Lite/WebGPU textures through the owning 2D canvas and pixel-only staging copies;
the same transfer also passes the historical Lite GL test. The older surface
tests native pointer/keyboard/state, alpha layering, shader tint, 300 GPU-only
frames without additional React commits/captures/pixel copies/uploads, eleven
GPU/DOM round trips, and real development StrictMode. The specimen uses the
supported `react-dom/profiling` renderer and a subtree `Profiler.onRender`
counter, including in the production build; ordinary production Profiler
callbacks alone would not suffice. Tests verify commits on mount, a nested-only
update and normal edits before checking the settled GPU-only interval.

The current typed specimen asserts **300 settled GPU-only frames with zero
additional actual React commits, captures, pixel copies, pixel readbacks or
uploads**, in production-profiling and genuine development StrictMode.
`evidence/runtime/independent-{false,true}.json` records every before/after
counter, warm-up, browser build/launch flags and final cleanup. Initial geometry
motion can legitimately invalidate native paint: the test records a one-frame
warm-up, allows normal capture work to settle, then measures the full 300-frame
interval. It does not suppress invalidation.
In the accepted Phase 2/3 full run, both builds measured frames **11 -> 311**, React commits
**2 -> 2**, captures/copies/readbacks **16 -> 16** each, and uploads **5 -> 5**.
These are observed totals, not hardcoded expected paint counts.

GPU admission verifies working behavior, not merely method names. While mode is
`admitting`, output stays hidden. Adapter-owned, noninteractive two-color probe
DOM outside the persistent React root passes through the real native capture/
staging/public upload/shader path. Public Lite `captureScreenshot` validates
actual GPU pixels, and applied native geometry plus in-viewport interior/
exterior hit checks validate the same nonidentity transform. Application
geometry is checked before reveal too. The probe does not infer capability
from application opacity: a fully transparent layer passes its own regression.
`metrics.admission` records this extra work separately from content counters:
the final positive runs each used one probe capture/copy/native readback/upload,
two probe GPU frames and one public GPU readback. All probe counters stayed
unchanged over the 300-frame interval, and temporary resources reached zero.
`evidence/runtime/admission-*.json` records no-op/wrong-result failures, usable
same-root DOM and native edits/submission, positive reentry, readback timeout
and actual destroyed-device loss during admission.

Chrome sometimes reports root-wide paint changes. Those still cause captures;
byte comparison retains an unaffected layer's existing texture/upload.
This is not a claim of strictly per-layer native capture invalidation. Timing
and event samples are bounded to 256 entries, with cumulative timing/count
aggregates. Opt-in `onMeasure` emits operation samples without retaining them;
the production runner collects every sample in finite windows rather than
using the last 256 as full-run p95. Event-driven totals vary; JSON is authoritative.
Profiling has measurement overhead. This is copy-based, not zero-copy or a
demonstrated performance improvement.

The historical focused `surface.test.mjs` suite retains twenty-five tests. Public
`GPUCanvasContext.getConfiguration().device.lost` triggers ordinary-DOM recovery,
preserving the root, original controls, hook/input state and focus/selection.
Four real-loss cases cover idle/motion in production and development StrictMode,
plus admission loss and repeated reentry/cleanup. Only diagnostic fixtures call
`device.destroy()`. Synthetic fence and stale-generation tests are labelled
separately. Healthy fence timeout/rejection leaves DOM usable but retains GPU
resources explicitly; reentry/final disposal are refused until confirmed fence
completion or loss permits GPU cleanup. An outstanding public admission
readback is separately retained until its promise settles, even after loss;
there is no public cancellation API in the tested Lite release. Such a request
can block reentry/final disposal indefinitely. Tests exercise healthy delayed
delivery and an actual admission-loss delivery that does settle; they do not
claim all loss timings settle. This is not physical GPU-reset/driver-crash
recovery evidence. Every one of the twenty retired controller states has zero
core/runtime resources and demo listeners, not just the last/new controller.

For just the option 2/3 recovery comparison:

```sh
npm run build
npm run test:browser -- recovery.test.mjs
```

This writes six per-case JSON reports and DOM/reentry PNGs under
`evidence/regression/current/recovery/`, plus an unsupported-`moveBefore` test. Each comparison
case exercises eleven round trips. See the
[comparison and upside recommendation](docs/feasibility.md#follow-up-options-2-and-3).
