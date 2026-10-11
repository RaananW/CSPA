# Current architecture and lifecycle contract

**Evidence storage:** historical raw paths named below refer to the verified
external local archive, not files in this checkout. Only compact verdicts
remain tracked; [archive access, hashes and reproduction](archive-catalog.md).

This describes the supported **bounded Phase 2/3 runtime plus Phase 4/5
ownership/module/decorative additions, the bounded Phase 6 matrix and implemented
Phase7 integration and Phase8 effects independently accepted with explicit limits**, not a released
library or arbitrary React application compatibility. The package remains
private. Historical alternatives and evidence are in [feasibility.md](feasibility.md);
contributor commands are in [CONTRIBUTING.md](../CONTRIBUTING.md).

## GPU-first contract

CanvasSPA is a GPU-first framework. Supported React layer, ref and content
updates must remain GPU-presented with fresh pixels, current original native
interaction geometry and no blank application frames. DOM fallback is reserved
for GPU errors or factual lack of required GPU/capture/geometry feature support,
not missing framework implementation. Explicit disable/disposal is caller-owned
lifecycle. Structure/layout/DPR updates, visibility pauses and reduced motion
must not themselves revoke GPU. Every implemented transition, component
add/remove/change and undo/redo flow must use continuous GPU presentation.
Components should layer GPU support and a small typed declarative CSS/JS
fallback over their standard native React implementation, sharing originals
and state. Complex GPU visual apps with HTML semantics/native input are the
target, not current certification or automatic third-party adaptation.

React owns the original descendants, controls and state; the adapter owns only
the stable external root-container boundary. Preserve one shared renderer and
public browser/engine APIs. The typed path requires no handwritten CSS; it
compiles browser styles rather than implementing a custom CSS/layout engine.
Cloned controls, stale screenshot covers, wrong native hits and cosmetic status
debouncing cannot satisfy the presentation contract.

**Current correction, not acceptance:** Runtime **Layer** and integration
**Replace ref** previously exposed readmission blank frames. The uncommitted
core now replaces that mechanism with same-owner membership/geometry and
complete-frame successors. Missing/new/extent-grown slots retain the last
complete output until prepared fresh native-paint uploads. Fresh independent
acceptance must verify this exact source. Neither decoded automated frames nor
queue completion prove physical-display continuity, text fidelity, accessibility
or performance budgets. Historical verdicts remain immutable and non-current.

### Capability versus implementation matrix

**Upstream review (2026-10-11):** the current
[WICG explainer](https://github.com/WICG/html-in-canvas/blob/5fb3df86d84de598c7f0fcfc5ee53de1df067e7d/README.md)
was checked at main commit `5fb3df86d84de598c7f0fcfc5ee53de1df067e7d`
(2026-10-09). It requires canvas `content="drawable"` AND descendant
`drawable`; these are distinct opt-ins. It also specifies direct WebGPU
`GPUQueue.drawElementImageToTexture`, not only 2D capture/staging. Drawing in
`paint` belongs to the current rendering update; DOM changes belong to the next.
Offscreen geometry batching prevents task interleaving, not a proven shared
GPU/native presentation transaction. Current core rejects silent legacy
`layoutSubtree` qualification and uses public `DynamicTexture2D.texture` with
direct owning-paint upload, not Lite's older inert HTML-texture helper.
Anonymous browser review of the
[Chromium hotlist](https://issues.chromium.org/hotlists/6783002) reports
[content drawable](https://issues.chromium.org/issues/561849343),
[legacy layoutsubtree removal](https://issues.chromium.org/issues/568010578),
[ElementCanvasTransform default enablement](https://issues.chromium.org/issues/565840013)
and [legacy transform getter removal](https://issues.chromium.org/issues/571496925)
as Fixed. The explainer still lists that getter, so neither source alone
establishes the shipped API. Landed revisions/release availability were not
verified in this assessment. Actual secure-localhost Chrome155 inspection
found no reflected `content` property, legacy `layoutSubtree` present and both
direct-GPU upload names present; property inspection is not functional
qualification. Current source qualification targets actual Canary157.0.8098.0; its reflected
content and transform getter are functionally tested despite tracker divergence.
Default native grids are read inside owning paint because new originals do not
yet have a cached paint record. WebGL2 direct capture remains explicitly
unqualified. Future changes must repeat current proposal/tracker review and
distinguish it from actual browser functional qualification.

| Area | Current bounded evidence | Remaining boundary |
| --- | --- | --- |
| Initial native capture, public texture upload, shared GPU composition and affine native hits | Working on the recorded experimental Chrome155 path and bounded React18/19 specimens | Required experimental capture/geometry APIs are not general browser support |
| Content invalidation and numeric GPU motion | Existing capture/uniform/native-geometry paths and bounded tests | Continuous fresh-pixel/current-hit publication through all present updates still needs compositor-level proof |
| Layer/ref/membership/layout/DPR updates | Same renderer/root, synchronous current geometry, prepared textures and complete-frame publication | Uncommitted correction requires fresh independent acceptance; decoded source frames are not physical refresh proof |
| Visibility/reduced motion | Current scheduling/cancellation policies | Pause/resume and reduced motion must preserve GPU ownership rather than treat the preference as missing capability |
| Editing, scroll/clipping, overlays and effects | Specific conservative guards and native overlays exist | Establish actual capture/geometry limits separately from unimplemented GPU support; ordinary mutation is not a capability failure |
| Component CSS/JS fallback | Original DOM, typed browser styles, numeric native motion and explicit disable exist | No unified per-component declarative GPU/fallback contract yet; implement without duplicate controls/state |
| Complex apps and undo/redo | Framework target | Not currently certified; future application flows depend on the same continuous-GPU core |

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
| `src/canvas-spa/admission.ts` | Independent known-color probe DOM, pixel checks, applied geometry and native interior/clipped-exterior hit validation |
| `src/canvas-spa/motion.ts`, `timeline.ts`, `animation.ts`, `css-animation.ts` | Public numeric descriptor contracts, shared whole-effect compilation, per-property presentation ownership, separate CSS/WAAPI compatibility and bounded replacement tracking |
| `src/canvas-spa/module.ts`, `ripple.ts` | Trusted local mounting contract and decorative-only effect validation |
| `src/canvas-spa/effects.ts` | Whole-chain descriptor/schema validation, trusted application definitions and shared uniform packing |
| `src/apps/effects/color-cycle.ts`, `src/demo/effects-demo.tsx`, `effects.html` | Public-API custom effect outside runtime, native poster composer and external measurement/HMR fixture |
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
changes prepare public bindings in the same engine and fence retired resources;
they do not restore DOM or create another root. Root-level native/lifecycle/renderer files are compatibility
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
Membership and relevant resize/DPR now reconcile without healthy DOM recovery.
Factual clipping/content-coverage restrictions remain diagnosed.
Phase9 hardening, [accepted-with-limits on actual155](../evidence/phase9-independent/acceptance-v1.json)
with exact154 still unverified, historically added a synchronous hidden-output/DOM presentation barrier,
registry revision/order/origin signature and post-await admission generation
checks. Resource retirement is serialized after outstanding native work, then
healthy public queue/readback completion; immediate fallback does not forcibly
destroy those retained resources. That historical barrier is not the current
healthy-update route. Native `paint.changedElements` in that browser reported the root
for native edits; malformed/absent attribution captures all enrolled layers.
React/MutationObserver information is not used to suppress native paint.
See [API](api.md), [adoption](adoption.md) and [roadmap](roadmap.md).

[Phase8 effects](effects.md) reuse the same clock, compositor, native capture
and owned-resource lifecycle. The one shared pass supports three unique
operations per layer: bounded sampling (ripple/chromatic) followed by
color/alpha (custom/dissolve). Uniform storage is160bytes per layer versus
the earlier64; no extra textures or intermediate targets are allocated.
The shader performs three channel samples even for neutral composition; this
is additional work, not an optimization claim. Effect shaders never enter the
native capture path, so snapshots retain neutral original content.

Trusted application functions receive color/local coordinates/extent/time/
parameters, not engine/device objects. New definitions compile through public
configured-device diagnostics during prepared admission/successor creation; the actual application
draw also checks a public validation error scope. Compilation
failure recovers to original DOM using the same healthy-fence rules. Parameter
or admitted-chain replacement does not recompile or recapture. Only authored
inert, aria-hidden noninteractive decoration may disappear or distort;
essential native geometry stays affine and unchanged by effects.

## Explicit mount boundary

The caller provides empty, distinct, connected, same-document sibling hosts:
an ordinary DOM host, a compatibility capture canvas and the owning GPU output canvas. The
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
Original drawable React layer under owning content="drawable" GPU output canvas
  -> synchronous native paint -> GPUQueue.drawElementImageToTexture
  -> public per-layer DynamicTexture2D.texture -> shared GPU shader
```

There is no owning 2D context, staging canvas, application flat texture or
snapshot cover. The original stable adapter root initially moves under the
same output owner; React descendants never relocate or clone. Public
`updateElementGeometry`/verified getter reconcile connected current originals
before paint, and `clearElementGeometry` clears retired originals even after
React removal. Order changes rebuild hit order. One canonical affine matrix
drives native hits and inverse shader sampling.

Direct upload is not a zero-copy or performance claim. Native paint uploads
all current originals conservatively; no stale React attribution suppresses it.
GPU motion updates uniforms/current geometry without React renders or requested
recapture. Complete cached coverage is required for every submitted composition,
including motion while membership is pending. Native CSS extent, captured pixel
grid and allocated texture dimensions remain distinct. Actual default grids use
DPR without CSS downsampling; resize/growth prepares successors and preserves
last output until complete. Queue fences retain superseded resources; unexpected
errors are reported. Samples remain bounded, counts cumulative.
Complete cached reorder/removal reuses the validated pipeline capacity
synchronously: inactive lanes have zero extent, and already compiled custom
functions are selected independently of lane order. Bound textures remain
retained until that composition is fenced. Successor validation has a bounded
deadline; healthy retirement waits do not block ordinary GPU motion, and
explicit disable reports pending cleanup instead of awaiting a fence forever.
Optional `onMeasure` emits per-operation phase/layer/byte samples without
runtime retention, including a distinct native-readback/comparison span.
Only the diagnostic fixture collects all events in finite windows; its full
histograms do not infer p95 from truncated runtime history.

The 300-frame interval is measured after focus/caret and initial motion paint
have settled, with normal invalidation enabled. A recorded one-frame motion
warm-up is outside that interval; live editing still causes captures/uploads.

Moving across ancestors changes real CSS/layout. The historical specimen deliberately changes ancestry-dependent colors/padding.
The typed demo uses the same compiled authoring in both destinations. Neither
copies/normalizes arbitrary styles. Per-layer native textures contain each layer's valid
untransformed capture extent independently of the output bitmap.
Admission rejects zero, detached, nested, over-budget or
out-of-frame layers; capture rechecks current sizes before transfer. Captured
pixel budgets and a four-times-budget output-pixel safety limit are explicit,
and output dimensions respect the configured public device limit.

Output bitmap size is CSS frame size times DPR. Direct native captures use
`getElementImageDefaultSize` and omit a downsampling `size` argument. Allocation
and valid content grid are distinct; resize/DPR reconcile prepared successors
without healthy DOM recovery. Actual grid metadata is obtained inside native
paint and can reflect prior backing during resize, requiring subsequent fresh
paint. Emulated DPR tests do not prove physical display migration/text parity.

Eligible original INPUT/TEXTAREA internal caret scrolling and composition
start/update/end invalidate their enrolled capture for fresh owning native paint
without revoking GPU or existing motion ownership. Bounded descendant, enrolled
and adapter-root viewports (including `NativeScroll`) reconcile actual scroll
positions and matching native/GPU clips, then refresh native pixels and hits.
Same-engine membership/ref/layout/DPR preparation and complete-frame gating
remain active while scrolled. Ordinary document and untransformed external
axis-aligned scroll ancestors move the owner and original root together:
event/resize/style reconciliation refreshes cached local geometry without window
offsets, external texture cropping, membership generations or motion cancellation.
The browser's inherited external clip is not reapplied to individual captures.
Actual owner border/padding offsets apply only to native border-box registration;
GPU composition remains bitmap-content-local. Explicit owner overflow has matching
native/GPU local clipping. Chrome157's replaced canvas cannot itself scroll:
actual offsets remain zero, so no unverified owner-scroll bridge is used.
Unsupported transformed chains, RTL/writing-mode/zoom or mixed visible/clip axes,
nested enrollment and unbounded capture overflow remain framework boundaries,
not demonstrated missing Chrome157 features or unrestricted qualification.
Synthetic composition listeners do not establish actual OS IME completeness.
Forced colors refreshes content in GPU; reduced motion uses canonical
endpoint/identity behavior. Hidden-state policy pauses scheduling,
aborts paint waits while retaining dirty work and resumes frame-counted motion
without elapsed-time catch-up. Actual background-tab and OS IME behavior are
not established by synthetic policy tests.

## Functional admission, separate from content work

Method presence is only a structural precondition. An admission generation
enters `admitting`, observes its configured device, and
temporarily adds two adapter-owned, noninteractive DIVs directly under the
native canvas, **outside** the persistent React root. No controls are cloned or
React descendants mutated. A 4..16 CSS-pixel marker contains opaque RGBA
`[207,37,83,255]` and `[31,179,113,255]`; the owner must be at least 16 CSS pixels
per axis. Its independent colors avoid mistaking transparent application
content for missing capture support.

The owning native canvas is laid out and visible during this initial probe;
hidden native owners cannot provide the current capture record. Initial
admission is not a hidden-output publication guarantee. The marker traverses
owning native paint -> direct public dynamic texture -> generated shared
compositor, without a 2D owner or staging. Public Lite
`captureScreenshot(engine.surfaces[0])`, serviced with bounded public
`renderFrame` calls, verifies those colors in actual GPU output at the canonical
transformed positions/DPR. No private engine/device access, second engine, or
steady-state GPU readback is introduced.

Native geometry applies translation, 11-degree rotation and 0.75 scale.
`getElementTransform` must match all six requested affine coefficients within
1e-5. In-viewport `elementFromPoint` checks two transformed interiors and one
clipped exterior without synthesizing control interaction. Occlusion refuses
admission; offscreen witnesses defer admission as explicitly unproven, with
useful original DOM and explicit visible `enable()` reentry. Applied matrices
never substitute for a skipped functional native clip witness. This initial
admission bound does not revoke already-qualified GPU on ordinary visibility
changes. Probe geometry must clear to identity before removing its DOM.
After a confirmed idle/readback completion, temporary texture/composition/
resources are released. Actual content layers are then captured and
their applied geometry checked before declaring `gpu`.
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
| Successful admission | Observe device, move container once beneath the visible owning canvas, prove/release temporary native/GPU probe, then capture and publish complete application content; initial admitting output is not a seamless-display guarantee |
| Explicit disable or capture failure | Cancel refresh, clear owned geometry/bitmap, move to DOM, hide obsolete surfaces, synchronize, then destroy |
| Confirmed device loss | Same DOM transition; actual loss authorizes destruction even if the healthy idle fence rejects or cannot complete |
| Healthy teardown idle timeout/rejection | Keep DOM usable and **retain** GPU resources, observer and native capture textures; report pending cleanup |
| Healthy successor pending preparation/capture/fence | Keep the last complete GPU output and retained textures; current original geometry remains registered, and complete cached commits may reuse validated pipeline capacity |
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
effects/renderers, retained native capture textures, listeners, native paint waits, scheduled refresh,
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
