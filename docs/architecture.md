# Current architecture and lifecycle contract

This describes the supported **bounded Phase 2/3 runtime plus Phase 4/5
ownership/module/decorative additions, the bounded Phase 6 matrix and implemented
Phase7 integration**, not a released
library or arbitrary React application compatibility. The package remains
private. Historical alternatives and evidence are in [feasibility.md](feasibility.md);
contributor commands are in [CONTRIBUTING.md](../CONTRIBUTING.md).

## Module boundaries

| Module | Responsibility |
| --- | --- |
| `src/canvas-spa/index.ts`, `react.tsx` | Intentional typed API, explicit root bootstrap, context, enrollment and fixed native overlay portal |
| `src/canvas-spa/enrollment.ts` | Original-element ref enrollment options and typed pre-mutation refusal codes |
| `src/canvas-spa/runtime.ts` | Stable registry, per-layer controller motion, layout/environment policies and observer ownership |
| `src/canvas-spa/affine.ts`, `compiler.ts` | Canonical invertible transforms and narrow authoring-to-browser-style compilation |
| `src/canvas-spa/composition.ts` | Layer-count-generated shader bindings, inverse sampling and DOM-order alpha composition |
| `src/canvas-spa/mount-boundary.ts` | Destination validation, one mount callback, stable-container moves and final unmount |
| `src/canvas-spa/device-lifecycle.ts` | Public configured-device loss observation and bounded idle synchronization |
| `src/canvas-spa/renderer.ts` | Native capture, public texture/effect composition, independent dirty scheduling, serialized recovery and resource accounting |
| `src/canvas-spa/admission.ts` | Independent known-color probe DOM, pixel checks, applied geometry and native interior/exterior hit validation |
| `src/canvas-spa/motion.ts`, `timeline.ts`, `animation.ts`, `css-animation.ts` | Public numeric descriptor contracts, shared whole-effect compilation, per-property presentation ownership, separate CSS/WAAPI compatibility and bounded replacement tracking |
| `src/canvas-spa/module.ts`, `ripple.ts` | Trusted local mounting contract and decorative-only effect validation |
| `src/demo/paired-demo.tsx`, `paired.html` | Shared React behavior in existing-CSS and compiled typed examples; public source/pixel/profiling diagnostic fixture |
| `src/apps/todo/` | Reusable bounded TODO reducer, typed native-control UI and one replaceable action-transition timer; public CanvasSPA imports only |
| `src/demo/todo-demo.tsx`, `todo-probe.ts`, `todo.html` | External host/shell, profiling, deterministic/fault test facade and serialized HMR retirement |
| `src/demo/integration-demo.tsx`, `integration.css`, `integration.html` | App-owned CSS, original-element enrollment, public Radix Dialog portal and single-subtree Presence; external shell/profiling/HMR fixture |
| `src/demo/react-root.ts` | Matching public production profiling root/flush versus actual development client root/flush |
| `src/demo/performance-demo.tsx`, `scripts/measure.mjs` | Public-API 2/4/8-layer fixture, finite full-window collector and serial production measurement; not application/runtime policy |
| `fixtures/react18/`, `scripts/react-matrix.mjs` | Explicit independent dependency/type resolution, unchanged shared sources and actual React18/19 production/development behavior |
| `src/canvas-spa/native.ts` | Structural native capability guards, finite/applied geometry validation and abortable paint wait |
| `src/demo/runtime-demo.tsx` | Sample UI, production profiling, action/diagnostic fixture and HMR lifetime cleanup |
| `src/main.tsx` | Independent ordinary-DOM landing-page baseline |
| `src/probe.ts`, `src/backend-probe.ts`, `src/recovery-probe.tsx` | Historical native/backend/remount-versus-stable-container experiments; not production recovery code |
| `tests/runtime.test.mjs`, `tests/surface.test.mjs` | Current runtime and preserved historical acceptance/fault fixtures |

The renderer has no fixed specimen IDs, dimensions or shader slots. An
admitted registry generates one shader for its current layer count. Membership
changes intentionally recover to DOM before fresh admission; there is no live
shader rebinding. Root-level native/lifecycle/renderer files are compatibility
re-exports for historical probes. `window.runtimeProbe`/`surfaceProbe` are
diagnostic facades, not published APIs. No reusable module destroys a device.

The [TODO pilot](todo-pilot.md) keeps two stable enrolled surfaces as task rows
change inside React. Task membership is not renderer enrollment membership:
there are no per-task engines/textures. Controls remain undistorted; only the
inert artwork has an action-driven sampled-pixel effect. The ordinary host is
the initial topology and GPU admission/reentry are deliberate user actions.

The [Phase7 pilot](integration.md) enrolls original direct-root elements using
`useSurfaceRef` without a typed wrapper or CSS normalization. Null/replacement,
effect/ref StrictMode replay and unmount release registration and restore only
still-owned presentation/attributes. Radix Dialog mounts through its public
`Portal.container` in the fixed native overlay host, never through moving
React/library descendants. App styles and native control behavior remain.

Declarative transitions reuse the numeric compiler/timeline but do not create
a second WAAPI source: owned DOM declarations or canonical GPU/native affine
samples are driven by bounded RAF handles. Group descriptors are prepared
before starting at a shared epoch; stagger is a bounded delay offset, not a
new scheduler. Replacement resolves the old handle separately and samples its
current state. `Presence` lets React retain one original exiting subtree inside
a stable boundary, removing it after completion/cancellation; parent unmount
suppresses stale callbacks. Ref-authored CSS remains the settled DOM state.
Membership, capture bounds and relevant resize/DPR still recover conservatively;
Phase9 hot membership is not implemented. Healthy queue/readback retention
remains unchanged. See [API](api.md) and [roadmap](roadmap.md).

## Explicit mount boundary

The caller provides empty, distinct, connected, same-document sibling hosts:
an ordinary DOM host, a native 2D capture canvas and a GPU output canvas. The
adapter creates its `app-container` before calling `mount(container)` once.
The callback creates one root with `createRoot(container)` and returns that
root's unmount function. React owns everything **inside** this persistent root;
the adapter owns the container and its destinations outside every React root.
Runtime checks validate topology, not React ownership: outside-root ownership
is an explicit caller obligation, not something inferred from private Fibers.

After mounting, only `destination.moveBefore(container, null)` changes the
container's parent. No JSX-created descendant is imperatively relocated;
there is no second control tree, replacement root/portal target, remount,
implicit focus restoration or append/remove substitute. Missing `moveBefore`
refuses GPU admission but leaves the initial ordinary DOM usable. Invalid
destinations are rejected before the mount callback, preserving existing host
content. The caller must not detach, replace, populate or take over the hosts
while the adapter owns them. Final boundary disposal requires DOM recovery and
unmounts exactly once.

This API shape requires an explicit host/mount adapter. An ordinary JSX-only
wrapper cannot silently assume the same ownership boundary. Framework-owned roots and hydration remain unsupported. `NativeOverlay` is
the narrow proven portal boundary: an empty, fixed, connected outside-root
sibling supplied by the adapter. It never changes portal target or captures/
duplicates portal controls. Native modal/dialog and automatic-popover behavior
is tested only there.

## Pixel and input topology

One shared Lite/WebGPU engine renders the enrolled public dynamic textures through one
registered fullscreen effect renderer:

```text
Original React layer -> native ElementImage -> owning 2D capture canvas
                    -> reusable pixel-only 2D staging canvas
                    -> public dynamic-texture upload -> shared GPU shader
```

Each snapshot closes in `finally`. `drawElementImage` uses
`preserveElementGeometry: true`; the capture canvas bitmap is then cleared so
there is no second visible painted image. The pointer-transparent GPU overlay
is the sole visual output. Explicit `updateElementGeometry` on the original
layers uses the same canonical affine matrix as inverse shader sampling and
keeps native hits on the original
controls. Reentry rebuilds capture sizes and geometry.

This is copy-based, not zero-copy. Native paint/input/committed React updates
schedule captures; GPU transforms/effects draw without intentionally requesting
React updates, captures, pixel copies or uploads. Invalidation remains enabled.
Dirty IDs are removed before starting capture, so new invalidation during a
capture remains scheduled afterward. Native root-wide paint still dirties all
affected layers; retained staging pixel comparisons skip unchanged uploads.
Readbacks/copies are explicit costs, separately counted. Samples are bounded
to 256; aggregate counts/timings remain cumulative. One comparison buffer per
live layer is released with its texture.
Optional `onMeasure` emits per-operation phase/layer/byte samples without
runtime retention, including a distinct native-readback/comparison span.
Only the diagnostic fixture collects all events in finite windows; its full
histograms do not infer p95 from truncated runtime history.

The 300-frame interval is measured after focus/caret and initial motion paint
have settled, with normal invalidation enabled. A recorded one-frame motion
warm-up is outside that interval; live editing still causes captures/uploads.

Moving across ancestors changes real CSS/layout. The historical specimen deliberately changes ancestry-dependent colors/padding.
The typed demo uses the same compiled authoring in both destinations. Neither
copies/normalizes arbitrary styles. The owner bitmap must contain every layer's
untransformed capture extent, even if GPU scaling makes that layer fit visually.
Admission rejects oversized, zero, detached, nested, over-budget or
out-of-frame layers; capture rechecks stale sizes before transfer. Captured
pixel budgets and a four-times-budget output-pixel safety limit are explicit,
and output dimensions respect the configured public device limit.

Output bitmap size is CSS frame size times DPR; native captures/staging are
currently CSS-resolution. Integrated geometry/pixels pass at DPR 1 and 2,
not a high-resolution capture-quality claim. Resize/DPR changes recover to DOM
and need explicit reentry. Resolution listeners rearm per generation; controller,
capture and draw paths also reject stale dimensions when an event is absent.
CDP can omit resolution-change events; emulated DPR tests exercise that guard,
not physical display migration.

Native scroll, unsupported clipped/nested enrollment, overflowing captured
content, composition editing and forced colors conservatively use ordinary DOM.
Reduced motion refuses/cancels motion. Hidden-state policy pauses scheduling,
aborts paint waits while retaining dirty work and resumes frame-counted motion
without elapsed-time catch-up. Actual background-tab and OS IME behavior are
not established by synthetic policy tests.

## Functional admission, separate from content work

Method presence is only a structural precondition. An admission generation
enters `admitting` with output hidden, observes its configured device, and
temporarily adds two adapter-owned, noninteractive DIVs directly under the
native canvas, **outside** the persistent React root. No controls are cloned or
React descendants mutated. A 4..16 CSS-pixel marker contains opaque RGBA
`[207,37,83,255]` and `[31,179,113,255]`; the owner must be at least 16 CSS pixels
per axis. Its independent colors avoid mistaking transparent application
content for missing capture support.

The marker traverses the actual owning-native-canvas -> pixel-only staging ->
public dynamic texture -> generated shared compositor path. Native pixel
samples must match within two channel values. Public Lite
`captureScreenshot(engine.surfaces[0])`, serviced with bounded public
`renderFrame` calls, verifies those colors in actual GPU output at the canonical
transformed positions/DPR. No private engine/device access, second engine, or
steady-state GPU readback is introduced.

Native geometry applies translation, 11-degree rotation and 0.75 scale.
`getElementTransform` must match all six requested affine coefficients within
1e-5. In-viewport `elementFromPoint` checks two transformed interiors and one
exterior without synthesizing control interaction. In-viewport occlusion
conservatively refuses admission; offscreen hit checks are recorded as skipped,
not passed. Probe geometry must clear to identity before removing its DOM.
After a confirmed idle/readback completion, temporary texture/composition/
staging resources are released. Actual content layers are then captured and
their applied geometry checked before declaring `gpu` or revealing output.
Subsequent geometry updates validate the applied matrix too; draw failures
request same-generation DOM recovery. Enrollment, dimensions/DPR and policy
are rechecked across asynchronous admission, and hidden-state admission is
refused rather than revealing an undrawn surface.

`metrics.admission` separates attempts, passes, probe captures/copies/native
readbacks/uploads, GPU frames/readbacks and successful probe geometry checks
from content counters. Only the last successful pixel/matrix/hit proof is
stored. `probeElements` and `probeReadbacks` make temporary/outstanding resources
explicit; RAF and abort listeners use existing ledgers. Native paint
notifications remain independently recorded, including probe-induced paint.
Tests cover no-op/wrong native capture, public upload no-op, no-op/wrong/forged
geometry, content-only geometry failure and clearing failure, then assert
usable original DOM pixels, pointer/editing/form behavior and positive reentry.

## Animation and decorative ownership

New applications call `createMotion` with numeric keyframes and timing,
without constructing native transform strings or calling `Element.animate`.
The entire copied descriptor is compiled through the existing affine/timeline
validators first. One managed native `Animation`/`KeyframeEffect` then supplies
ordinary-DOM playback and the same ownership bridge; timing defaults are
normalized identically for native and GPU sampling. Explicit handle disposal,
unenrollment and runtime disposal cancel the exact source; stale handles cannot
cancel a replacement. Release leaves it alive for same-phase DOM/reentry.
`nativeMotions` accounts for sources independently of active GPU owners.
CSS/WAAPI adapters remain separate, not automatic animation-library support.

Acquisition validates all timing/keyframes/easing/channel extrema and actual
source presentation before pausing or detaching anything. Source effect/target
references and exact transform/opacity/origin declarations/priorities are
retained. The original `KeyframeEffect.target = null` transfers presentation;
setting `Animation.effect = null` alone is not the supported CSS path. Captures
are neutral, not transformed/opacity-baked, and uniform/native geometry changes
use the same logical timeline sample.

CSS acquisition additionally validates explicit top-level exact-ID/same-sheet
rules against raw literal frames and the applied timing cascade. Variable
dependencies cannot be inferred from resolved frames. The tested drawable
migration can regenerate one matching CSSAnimation and cancel its detached
original association. Exact matching, one retained reference and logical-time
restoration handle that browser behavior; repeated/conflicting regeneration
is refused. Serialized transform spellings are canonicalized for comparison,
without relaxing dependency/property validation. WAAPI source modifications
are checked against original frames/timing/composition/rate/target and expected
current time.

One `DeclarationOwnership` ledger per transferred presentation records
original declarations and the exact last runtime-written value/priority.
Animation ownership and GPU neutralization share that ledger instead of
nesting snapshots. A changed value, removed declaration or changed priority
relinquishes that property; restoration only touches still-owned writes.
Live individual translate/rotate/scale and origin dependencies are also
diagnosed before continuing GPU output. Unrelated styles remain untouched.
Per-enrolled-layer relinquishment survives repeated recovery callbacks, even
before admission, so the typed DOM compiler cannot overwrite a later React
or direct application write. Explicit controller/React transform changes
clear this preservation record; unregister/disposal remove it. The bounded
map's size is exposed as `presentationOverrides`, not hidden GPU allocation.
Identical value-and-priority rewrites cannot be observed as a new owner.

DOM recovery cancels the clock, clears native geometry, moves the persistent
root back, restores still-owned source declarations/effect/phase and discards ripple
ownership **before** waiting for safe GPU retirement. A healthy timed-out
fence therefore retains GPU resources, not animation ownership or unusable
DOM. Explicit fresh admission remains blocked until cleanup/readback safety
permits it. Unregistered owned layers retain restoration references until that
DOM transition rather than resurrecting source presentation in a live GPU tree.

One RAF clock advances independent logical owners and decorative time; neither
requires React reconciliation or capture/upload. Normal dirty invalidation
remains enabled. Visibility resets the elapsed clock instead of catching up;
reduced motion pauses sources/effects. The deterministic real-RAF driver forces
paused logical advancement for pixel tests. It is not a steady-state readback.
The source/counter/lifecycle facade belongs only to the demo.

The radial ripple changes decorative texture sampling only, with bounded
amplitude and an edge envelope; alpha, DOM order and essential controls'
matrices/hits are unchanged. Identity uses amplitude zero. Decorative enrollment
is explicit and inert/aria-hidden with no interactive/editable descendants.
These constraints are checked again at runtime. There is no second engine,
extra effect texture/capture, raw GL or private device access.

The module adapter accepts only already-imported trusted local code with a
mount/enroll/unmount contract. The adapter still owns only the stable external
container/destinations; React still owns original descendants. The module must
clean partial initialization it creates. Existing CSS is preserved except the
specific reversible presentation contribution; arbitrary application loading,
cascade normalization and animation-library compatibility are not implied.

## Public GPU contracts and loss mechanism

Composition uses public Lite `createEngine`, `setEngineSize`,
`createDynamicTexture`, `updateDynamicTexture`, effect binding/renderer APIs and
`renderFrame`; admission additionally uses public `captureScreenshot`.
Cleanup uses public unregister/dispose/release APIs.
`waitForGpuIdle` synchronizes previously submitted work; it is not a
steady-state readback or proof of all driver/internal allocation releases.

Installed Lite 1.33.0's `index.d.ts` exposes scene/sprite/text recovery enablers
and `forceWebGpuDeviceLossForTesting`. Its public contract requires a recovery
strategy for every registered context kind. The shipped
`dist/index.js.map` includes:

- `src/engine/device-lost-recovery.ts`: generic strategy registration is
  explicitly internal (`_enableDeviceLostRecovery`), and unsupported context
  kinds cannot recover through an unrelated strategy.
- `src/engine/device-lost-recovery-testing.ts`: the force-loss helper refuses
  engines without recovery registration.
- `src/engine/engine.ts`: public `waitForGpuIdle` delegates to submitted-work
  completion; the effect renderer's context kind is `"effect-renderer"`.

There is no public effect-only strategy enabler in this release. That limits
automatic **engine** restoration, not ordinary-DOM recovery. The adapter uses
the standard browser contract instead:

```ts
const context = outputCanvas.getContext("webgpu");
if (typeof GPUCanvasContext === "undefined" || !(context instanceof GPUCanvasContext)
  || typeof context.getConfiguration !== "function") throw new Error("Loss observation unavailable");
const configuration = context.getConfiguration();
if (!configuration) throw new Error("WebGPU output is not configured");
const lost = configuration.device.lost;
```

No private engine/device access or raw GL-state mutation is used. Each observer
has an explicit release flag and captures its admitted engine identity.
Both immediate delivery and queued recovery check that identity. Intentional
disposal or delayed old-generation promises cannot recover a replacement.

## Serialized lifecycle and safe cleanup

`enable`, `disable`, automatic recovery and `dispose` share a serialized
promise chain. Operation failures reach callers without poisoning subsequent
queued operations. Drawing/capture have separate scheduling and generation
checks; loss cancels pending refresh, aborts native paint waits (removing their
timer and listeners), and interrupts active GPU-only motion. Queued capture
failure recovery is generation-checked too, so it cannot undo final disposal.
Queued policy recovery binds the generation/mode when requested; a stale
ordinary-DOM event cannot tear down a subsequently admitted replacement.

| Transition | Behavior |
| --- | --- |
| Initial admission failure | Keep/recover the same usable DOM root with a visible reason; fence any created engine before healthy destruction |
| Successful admission | Observe device, move container, prove/release temporary native/GPU probe, capture/validate content, then reveal verified output |
| Explicit disable or capture failure | Cancel refresh, clear owned geometry/bitmap, move to DOM, hide obsolete surfaces, synchronize, then destroy |
| Confirmed device loss | Same DOM transition; actual loss authorizes destruction even if the healthy idle fence rejects or cannot complete |
| Healthy idle timeout/rejection | Keep DOM usable and **retain** GPU resources, observer and staging pixels; report `pendingCleanups: 1` |
| Retained cleanup completion | Serialized release only after a confirmed fence or confirmed loss; then permit fresh admission |
| Explicit reentry | Create a fresh engine, observer, textures and geometry; preserve the existing root/control objects |
| Final disposal | Refuse while cleanup is pending; otherwise recover, unmount, remove owned canvases/listeners and release ledgers |

Healthy teardown preserves the observed Chrome crash-avoidance order:
**cancel -> clear geometry -> move root -> hide surfaces -> confirmed GPU idle
-> unregister/dispose/release GPU resources**. Immediate unfenced destruction
previously crashed this browser after focused/transformed native rendering.
Timeout is **not** treated as loss.

The idle wait returns a bounded outcome after 1500 ms while retaining an
eventual safe-completion promise. A rejected healthy fence waits for actual loss
rather than pretending the queue is idle. Pending cleanup blocks admission and
final unmount; repeated disable is harmless and leaves working DOM. If an
unexpected synchronization exception occurs, resources are retained and
diagnostics are explicit; a loss observer, if available, can authorize later
cleanup. With neither a fence completion nor observable loss, cleanup can stay
pending indefinitely. No unsafe force-to-zero action is exposed.

The functional probe's public SDK screenshot request is pending work for the
healthy idle fence. A readback delivery timeout retains its GPU dependencies;
later request completion plus confirmed idle permits release. Confirmed loss
authorizes GPU release but does **not** falsely cancel/decrement an outstanding
SDK readback. Its own completion settles its ledger exactly once; reentry and
final disposal remain blocked until then. The tested Lite release exposes no
screenshot cancellation API. Loss before its lazily serviced screenshot hook
can leave that request pending indefinitely, even after GPU resources have
been safely released. This limitation is explicit, not a claimed zero ledger.
The healthy held-delivery fixture and destruction-during-readback fixture
exercise separate outcomes; the latter settles in the observed browser run.

Admission times out after 5000 ms. An abandoned, late-created engine is
disposed, and new admission is refused while its promise remains outstanding.
Native paint waits are bounded at 1500 ms. These limits do not guarantee timely
browser/driver recovery from a physical crash.

## Evidence boundaries

Actual loss fixtures obtain the configured public device, call `destroy()` and
await its real `lost` promise. This proves genuine WebGPU loss delivery induced
by explicit destruction (`reason: "destroyed"`), **not** physical GPU-reset,
driver-crash or browser-process-crash recovery. Tests cover idle and active
motion in production-profiling and actual development StrictMode, admission
delivery, fresh reentry and repeated loss/cleanup. Rendered DOM pixels, real
pointer/keyboard input, hook state, control/container identity, values, focus
and selection are asserted.

Healthy pending/rejected/delayed fence and delayed old-generation delivery
tests are explicitly synthetic timing/failure fixtures. Subsequent device
destruction in the pending/rejected cases still delivers actual loss.
No mocks are substituted for the four main actual-loss tests.

Resource ledgers count owned roots, canvases, pending/active engines, textures,
effects/renderers, snapshots, staging pixels, listeners, native paint waits, scheduled refresh,
loss observers, probe DOM/readbacks and pending cleanup. Motion RAF waits and demo startup RAF are
also cancelled/accounted on recovery/disposal. Retention is visible, not a leak-free
claim. Final successful cleanup reaches zero; this is not a heap or driver
memory measurement. The demo's production commit measurement uses the public
`react-dom/profiling` renderer and subtree `Profiler.onRender`, not effect
counts or ordinary production Profiler callbacks.
The injected root and `flushSync` must be a matching public renderer pair;
React18's standard and profiling entries have independent batching state.
Actual development uses the ordinary client pair, with real StrictMode.
The bounded [React18/19 matrix and measured costs](measurements.md) retain
normal invalidation and main dependency pins.

Twenty StrictMode mount/GPU/unmount cycles persist **every retired controller
state**, asserting zero old core/runtime resources and demo action listeners
after each disposal. Each replacement separately has one engine/two layers,
stable environment/observer counts and four installed demo action listeners.
The final lifetime also reaches zero. This is not inferred from constant new
instance counts, nor a browser heap or driver-memory measurement.
The demo HMR handler waits for old disposal before creating a new adapter/root
lifetime; it deliberately resets demo state, unlike state-preserving runtime
fallback. A retained healthy cleanup prevents replacement rather than forcing
unsafe teardown.

See the [verification matrix](verification.md) for precise evidence and fixture
boundaries. Bounded headful TODO/native keyboard/pixels and original control
AX-tree evidence are recorded separately in the parent-owned Phase 6 report;
they do not establish screen-reader or OS IME behavior.
Untested: physical resets, OS IME,
screen readers, arbitrary portal targets, iframe continuity, framework/hydrated
roots, arbitrary CSS/layout and wider browser/device coverage.
General CSS/WAAPI translation and unrestricted decorative shader APIs remain
unsupported beyond the bounded contracts above. License choice and publication
are separate decisions; nothing here promises a release.
