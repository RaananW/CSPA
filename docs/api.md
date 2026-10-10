# Initial typed API

**Evidence storage:** historical raw paths named below refer to the verified
external local archive, not files in this checkout. Only compact verdicts
remain tracked; [archive access, hashes and reproduction](archive-catalog.md).

The intentional source entry point is `src/canvas-spa/index.ts`. This private
experimental package has no published package name or stability promise.
Do not import demo facades or internal renderer classes into application code.
The private prepared tarball now exports the same API at
`canvas-spa-phase-one` with declarations, independently accepted with Phase10
limits. See [distribution](distribution.md) for actual install commands,
host CSS, public dependency/type boundaries and the bounded browser contract.

For an actual bounded application using these exports, see the
[TODO pilot](todo-pilot.md) and `src/apps/todo/`. Its numeric layout/appearance
compile to browser CSS; real task events invoke public `setRipple` on a separate
decorative surface. No additional TODO-specific renderer API is introduced.
The [bounded effects contract](effects.md) documents `setEffects`, effect
handles and trusted `defineEffect` authoring; `/effects.html` composes these
with motion while keeping essential native controls separate.

## Explicit bootstrap

Create empty capture/output canvases and ordinary/overlay hosts as connected,
same-document siblings **outside all React roots**. Put them inside a sized,
positioned frame. The capture/output canvases must fill that frame at the same
origin; GPU output must be pointer-transparent. Supply the ordinary host at the
same layout origin. See `runtime.html` for the minimal host scaffolding.
Those styles are host integration, not layer authoring.

```tsx
import { useState } from "react";
import { mountCanvasApp, Surface, Box, NativeOverlay } from "canvas-spa-phase-one";

function App() {
  const [name, setName] = useState("");
  const [saved, setSaved] = useState("");
  return <>
    <Surface id="editor" layout={{ x: 20, y: 20, width: 260, height: 200, padding: 12 }}
      appearance={{ background: "white", color: "black" }}>
      <Box layout={{ direction: "column", gap: 8 }}>
        <strong>Native controls</strong>
        <form onSubmit={event => { event.preventDefault(); setSaved(name); }}>
          <label htmlFor="name">Name</label>
          <input id="name" value={name} onChange={event => setName(event.target.value)} />
          <button>Save</button>
        </form>
        <output>{saved}</output>
      </Box>
    </Surface>
    <NativeOverlay><dialog>Original native dialog content</dialog></NativeOverlay>
  </>;
}

const controller = mountCanvasApp({
  captureHost, outputCanvas, ordinaryHost, overlayHost,
  onStatus: message => { statusElement.textContent = message; },
  strict: true,
}, <App />);
await controller.enable();
```

The identifiers in the bootstrap are typed host references from your
outside-root setup, not JSX refs whose descendants the runtime may move.
`mountCanvasApp` creates the stable container, mounts one root and supplies
`GPUHost` context automatically. The root always starts in usable ordinary DOM.
Admission failure resolves to a state with `mode: "dom"` and an explicit reason;
invalid topology/API/lifecycle calls throw before unsafe mutation.

Phase9 hardening ([accepted-with-limits on actual155](../evidence/phase9-independent/acceptance-v1.json);
exact154 remains unverified) hides unsafe output and clears
native presentation geometry synchronously when a supported structural policy
changes. Membership revision/order, layer origin/size and frame size/DPR are
revalidated across asynchronous admission. Old captures cannot upload into a
new generation. Resource retirement still waits for pending native work and
healthy public GPU fences/readbacks. `enable()` remains explicit fresh admission;
there is no automatic refresh option or hot shader rebinding. See
[adoption/migration](adoption.md) for original-control continuity and limits.

`GPUHost` is the context boundary, **not** a JSX-only canvas/reparenting
component. Its runtime is established by the explicit adapter. Do not wrap a
framework-owned existing root and assume unchanged-app compatibility.
Optional `createRoot` injection is for a supported React root factory. Supply
the matching optional `flushSync` from the same renderer entry point:
React18's standard flush does not flush its separate profiling root.
The demos pair public `react-dom/profiling` exports in production and ordinary
client/flush exports in actual development. The default adapter remains
ordinary `react-dom/client` plus standard flush, without demo profiling.
Matching React18/19 types/builds and actual mounted behavior are recorded in
[the compatibility matrix](measurements.md#actual-react-major-behavior-and-types).

## Authoring and controller

| API | Contract |
| --- | --- |
| `Surface` | Original native `<section>`, unique nonempty ID, enrolled through layout effects; registration is StrictMode-safe |
| `Box` | Ordinary native `<div>` with compiled layout/appearance; no engine or extra capture |
| `NativeScroll` | Ordinary browser scroll container; intentionally forces DOM policy when inside an enrolled layer |
| `NativeOverlay` | Portal to one fixed adapter-owned external host; original native dialog/popover controls, not GPU-painted clones |
| `useGPUHost()` | Returns the narrow controller inside the adapter tree |
| `useSurfaceRef<T>({id, decorative?})` / `enroll(element, options)` | Enroll an original direct-root element, preserve authored layout/CSS; callback stable for stable options, release on replacement/null; imperative form returns an idempotent release |
| `useNativeOverlayHost()` | Fixed external native host for a library's public portal-container prop |
| `transition(id, descriptor)` | Bounded declarative numeric motion; explicit completion/cancellation handle, no separate native animation source |
| `transitionGroup(items, stagger?)` | Prepare 1..8 distinct boundaries, one start epoch, index-based0..1000ms stagger; invalid descriptors/groups have no enrollment/motion side effects |
| `Presence` | Retain one React child subtree through enter/exit inside a stable enrolled boundary; no wrapper, clone or portal relocation |
| `setEffects(id, descriptors)` | Atomically validate 1..3 decorative-only ripple/chromatic/dissolve/custom operations before replacing ownership; explicit seconds/playback/cancel/dispose handles; static original DOM fallback |
| `defineEffect(definition)` | Frozen trusted local WGSL color-function schema, 1..4 bounded numeric parameters, layer bounds and WebGPU capability; compile during fresh hidden admission, never a remote loader/sandbox |
| `enable()` | Serialized structural and functional admission; hidden `admitting` output until probe pixels and native geometry pass; explicitly fresh after recovery/topology change |
| `disable()` | Same-root DOM recovery, geometry clearing and safe fenced GPU release; repeated calls are harmless |
| `setTransform(id, transform)` | Replaces a layer's transform; GPU mode updates uniforms/native geometry without React reconciliation |
| `animate(id, target, frames)` | Frame-counted interpolation of specified fields; unspecified fields stay at their starting values; 1..10000 frames |
| `createMotion(id, descriptor)` | Numeric keyframes/timing for new applications; creates one managed native source in idle DOM and returns explicit ownership/playback/disposal controls |
| `invalidate(id?)` | Explicit dirty enrollment(s), with normal native paint/input/mutation invalidation still enabled |
| `settle()` | Bounded completion of already scheduled capture/draw work; not a promise that future browser paint cannot occur |
| `state()` | Current capability/mode/reason, registry matrices, bounded telemetry and owned-resource ledgers |
| `dispose()` | Serialized final unmount/observer/listener/canvas release; refuses while healthy GPU cleanup remains pending |

`Layout` supports x/y positioning, width/height, padding, gap, row/column
direction and visible/hidden/scroll overflow. `Appearance` supports background,
color, border color/width, radius and font size. Numeric fields are validated;
colors use the browser's `CSS.supports`. These types compile to HTML/CSS layout,
not a new layout engine or an absence of browser styles. `style` is intentionally
excluded from authored Surface/Box props. Existing arbitrary classes/ancestor
selectors are not normalized or proven compatible.
The positioned x/y origin applies to Surface; Box remains ordinary flow layout.

`Transform` supports x/y, scaleX/scaleY, rotation in degrees and opacity.
Origin is the enrolled layer's top-left. Rotation is normalized modulo 360
before conversion to radians. Computed coefficients, determinant and inverse
must remain finite and invertible (determinant magnitude >= 1e-8); opacity is
0..1. Huge finite scale inputs can therefore be rejected. Registration/update/
`setTransform` validate the origin-aware result before mutation, preserving
the prior valid layer state on rejection. Reflections are mathematically
representable but not broadly validated. One canonical affine matrix drives
CSS in DOM mode, inverse sampling in GPU mode and public native hit geometry.
Opacity follows normal DOM semantics: transparency does not disable hit testing.

React transform prop updates are ordinary commits and may capture; use the
controller for GPU-only motion. Browser hover/focus/caret and initial geometry
motion can still legitimately dirty pixels. The measured 300-frame guarantee
is a settled specimen interval, not an assertion that every arbitrary animation
will avoid capture work.

### Original-element refs and library overlays

`useSurfaceRef` is an alternative to `Surface`, not a second registration of
the same element. Place the element directly inside the adapter's persistent
root (context/fragment/library providers may surround it without adding DOM).
React owns the element and all descendants; neither the hook nor controller
moves, clones or creates controls. Keep ID/decorative options stable during an
enrollment lifetime. The callback identity survives ordinary rerenders; null,
replacement and StrictMode replay restore the old enrollment before reuse.

`enroll` validates before mutation and throws `EnrollmentError` with
`invalid-id` (blank/duplicate ID), `foreign-element` (not an original connected
same-document root element), `duplicate-element`, `nested-element` or
`decorative-element`. Decorative enrollment requires authored inert,
aria-hidden noninteractive content. It temporarily adds `drawable=""`;
release restores the prior attribute only when the runtime's value still
remains. It does not compile/normalize authored layout or CSS. GPU presentation
temporarily owns transform/origin/opacity; later app-written values/priorities
are diagnosed and retained instead of overwritten on release/recovery.

```tsx
import * as Dialog from "@radix-ui/react-dialog";
import { useSurfaceRef, useNativeOverlayHost } from "../canvas-spa";

function App() {
  const panel = useSurfaceRef<HTMLElement>({ id: "panel" });
  const overlay = useNativeOverlayHost();
  return <Dialog.Root>
    <section ref={panel} className="app-panel">
      <label htmlFor="value">Value</label>
      <input id="value" defaultValue="Original native input" />
      <Dialog.Trigger>Open</Dialog.Trigger>
    </section>
    <Dialog.Portal container={overlay}>
      <Dialog.Overlay className="app-backdrop" />
      <Dialog.Content className="app-dialog">
        <Dialog.Title>Original dialog</Dialog.Title>
        <Dialog.Description>Outside capture, in the fixed native host.</Dialog.Description>
        <Dialog.Close>Close</Dialog.Close>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
```

App CSS must still size/position/style these elements. Neutral authored
transform/opacity and existing stacking/clipping/bounds restrictions apply
at GPU admission; arbitrary CSS/animation-library roots are not certified.
Use the library's **public** container API before its portal mounts; never
move existing library DOM. Only Radix Dialog1.2.0 Root/Trigger/Portal/Overlay/
Content/Title/Description/Close in this pilot are verified. See [integration](integration.md).

### Declarative numeric motion and presence

```tsx
const enter = {
  keyframes: [{ offset: 0, x: 60, opacity: 0 }, { offset: 1 }],
  timing: { duration: 800 },
};
const exit = {
  keyframes: [{ offset: 0 }, { offset: 1, x: 60, opacity: 0 }],
  timing: { duration: 800 },
};

// Inside the adapter tree, within one stable enrolled boundary:
<section ref={useSurfaceRef<HTMLElement>({ id: "card" })} className="card-boundary">
  <Presence id="card" present={visible} enter={enter} exit={exit}
    onComplete={result => record(result)}>
    <Card />
  </Presence>
</section>;

const handle = controller.transition("card", exit);
const result = await handle.finished; // {status: "completed" | "cancelled", reason}
// handle.cancel() is idempotent and cannot cancel a later replacement.
const group = controller.transitionGroup([
  { id: "card", motion: enter }, { id: "other", motion: enter },
], 100);
await Promise.all(group.map(handle => handle.finished));
```

Use the hook at the top level of the containing component as usual; the JSX
above abbreviates that declaration. Descriptors reuse `MotionDescriptor` and
the existing compiler/easings, with one normal iteration, finite duration/delay
and total duration+delay at most60000ms (including group stagger).
Unspecified keyframe channels mean identity defaults, not inherited CSS.
Each supported numeric sample updates the canonical affine/opacity used for
native geometry and GPU composition; DOM mode temporarily writes owned CSS
and checks that it actually applies. There is no WAAPI source to double-run.
An idle enrolled boundary is required; admission/recovery/pending cleanup,
frame-count motion or competing managed/external animations refuse calls.

A group stages every presentation and revalidates the complete staged group
before starting or replacing any member. Failed preparation restores still-owned
declarations/priorities and preserves existing handles, start times and canonical
transforms. This includes style-dependent CSS failures and reduced-motion endpoints.
A replacement validates before cancellation and starts from the prior
currently sampled transform. The old handle resolves cancelled/Replaced.
Explicit cancellation restores its starting transform and still-owned DOM
declarations; completion keeps the GPU endpoint. Typed `Surface` DOM completion
keeps its canonical endpoint; ref-enrolled DOM completion restores authored
CSS, so author that CSS for the desired settled state. GPU-to-DOM recovery also
restores ref-authored CSS, not an unrequested permanent transform rewrite.
Reduced motion completes immediately at the endpoint, including active
transitions; disable/recovery/loss/hidden document/unenrollment/disposal cancel.
There is no hidden-time catch-up. Reasons distinguish these outcomes.

`Presence` is controlled by `present`; initially present content is already
settled and does not enter-animate. False retains the **same** React subtree
during exit; completion or cancellation removes it. True during exit reverses
from the sampled state without remounting that subtree. True after removal
mounts one new React subtree and enters. A parent unmount cancels motion and
suppresses stale completion callbacks. Keep its ID/runtime stable; changing
descriptors alone does not restart a transition. Content remains native
interactive DOM until React removes it; opacity0 does not disable focus/hits.
Presence animates the enrolled boundary, so place only the intended subtree
inside it and do not run a second transition owner on that same boundary.

Content mutation can dirty capture; capture bounds, enrollment membership,
scrolling/clipping and DPR changes retain conservative DOM recovery and explicit
fresh admission. This is not the planned hot-membership/route/shared-element/
spring API. No controls are hidden or duplicated to simulate exit retention.

### Opt-in operation measurements

`MountCanvasOptions.onMeasure` receives synchronous samples with
`kind`, `at` (`performance.now` milliseconds), `durationMs`, `phase`
(`admission` or `content`) and optional `layerId`/RGBA `bytes`.
Kinds are `captureMs`, `readbackCompareMs`, `uploadMs`, `frameWorkMs` and
`frameIntervalsMs`. The runtime retains no extra event array; its normal
last256 histories/cumulative counters remain bounded.

Use a cheap, nonthrowing callback and bound any external collection. Throwing
is not silently swallowed and can trigger the renderer's explicit failure
path. Callback/profiling overhead can perturb timing. Capture timing excludes
the native paint wait; readback plus comparison is measured separately;
upload/frame timing is synchronous public CPU work, not completion/GPU
execution. `phase` separates admission work from content work.
See [measurement definitions and raw evidence](measurements.md).

## Supported boundary, budgets and failure

One engine serves the application surface; there is no per-component engine.
Default limits are eight layers and 2,000,000 captured pixels. Layer budget is
1..8; GPU output is additionally limited to four times the captured-pixel
budget and the public configured device's dimension limit.
Functional admission requires at least 16 CSS pixels on each surface axis for
its independent known-color marker. It uses the same single engine and legal
capture/upload path as content, plus one bounded public GPU readback.
Transparent application pixels are not a failure heuristic. In-viewport probe
occlusion/hit disagreement conservatively refuses admission; offscreen probe
hit checks are explicitly marked skipped while applied-matrix checks still run.
The output is not revealed until application geometry validates too.
An oversized source is refused even if scaling would fit its visual rectangle:
the owning capture bitmap must contain the untransformed source.

Nested/zero/detached/foreign layers, overflowing capture content, unsupported
clipping/scrolling/top-layer descendants, custom stacking and out-of-frame
transforms use refusal or diagnosed DOM recovery. Dynamic membership, size and
DPR changes recover to DOM and require explicit reentry. No hot GPU rebind,
GPU scissor system or transformed scroll implementation is implied. Animation
translation is restricted to the explicit contract below.

The adapter alone may move its stable container with `moveBefore`. Never move
React-created descendants, change the root/portal target, detach/populate the
destinations or use an append/remove fallback. Final disposal removes the
owned capture/output canvases; ordinary/overlay destinations remain.

Healthy timeout is not device loss: retained cleanup keeps the original DOM
usable and blocks reentry/final disposal until a confirmed fence or actual loss
permits GPU release. Admission readback promises must also settle: loss does
not falsely cancel an outstanding SDK request. `state()` exposes
`resources.probeElements`, `resources.probeReadbacks` and separate
`metrics.admission` counters/last successful proof. Normal content counters
exclude probe captures, copies, uploads and frames. A never-settling readback
can keep reentry/final disposal blocked; no unsafe forced cleanup is exposed.
See [architecture.md](architecture.md) for ordering and
[verification.md](verification.md) for tested versus untested behavior.

## Transactional animation ownership (Phase 4)

Prepare ownership in **idle DOM**, before fresh admission. A layer must have
neutral controller transform/opacity and explicit inline `transform: none`,
`opacity: 1`, with a computed top-left origin. The adapter rejects important
transform/opacity overrides, individual translate/rotate/scale, overlapping
subtree effects and a source whose computed presentation disagrees with the
compiled effect. CSS requires explicit raw-rule provenance; resolved
`getKeyframes()` alone cannot establish dependency freedom.
Matching stylesheet important transform/opacity overrides are also rejected,
even when the current phase coincidentally matches the static override.
Initial validation inspects readable document/adopted sheets with a 4096-rule,
eight-level budget; inaccessible/imported sheets, nested selector rules,
scoped/dependent groups and matching important rules inside media/supports/layer
groups conservatively reject ownership rather than
pretending precedence is proven.

### Numeric motion for new applications

```ts
import type { MotionDescriptor } from "../canvas-spa";

const descriptor: MotionDescriptor = {
  keyframes: [
    { offset: 0 },
    { offset: 1, x: 70, y: 20, rotation: 10, scaleX: 0.85, scaleY: 0.85, opacity: 0.5 },
  ],
  timing: { duration: 1000, delay: 100, iterations: Infinity,
    direction: "alternate", easing: "ease-in-out" },
};
const motion = controller.createMotion("editor", descriptor);
motion.seek(100);
motion.own();
await controller.enable();
motion.play();
motion.pause();
motion.seek(600);
await motion.release(); // Same-phase native DOM source remains available.
await motion.dispose(); // Cancels this managed source, not a later replacement.
```

`MotionKeyframe` uses numeric CSS pixels/degrees/scales/opacity and explicit
offsets; omitted channels mean identity, not inheritance or previous-frame
values. `MotionTiming` uses milliseconds and the bounded subset below.
Defaults are delay 0, one iteration, normal direction, linear easing and fill
both, including the internal native source. The descriptor is copied and
entirely compiled before any source is created. No `Element.animate` call or
transform-string authoring is required in the application.

`MotionHandle` delegates play/pause/seek to the GPU owner while owned and the
native source otherwise. `own()` acquires or returns the current ownership;
after release it may acquire again through idle-DOM validation. Its
`state().released` means ownership is inactive, not that the source is canceled.
`release()` restores DOM without deleting the source; `dispose()` cancels the
specific managed source. Enrollment removal/runtime disposal also cancel it,
after safe source restoration when GPU-owned. `runtimeResources.nativeMotions`
counts these live sources. The explicit `nativeAnimation` reference is an
interoperability/diagnostic escape hatch; external mutations while owned are
subject to the same conservative conflict policy. It is not necessary for
numeric motion authoring.

### Separate existing CSS/WAAPI compatibility adapters

```ts
const source = originalElement.animate([
  { transform: "translate(0px, 0px) rotate(0deg) scale(1)", opacity: 1 },
  { transform: "translate(70px, 20px) rotate(10deg) scale(0.85)", opacity: 0.5 },
], { duration: 1000, delay: 100, iterations: Infinity,
  direction: "alternate", fill: "both", easing: "ease-in-out" });
source.pause();
source.currentTime = 100;
const playback = controller.ownAnimation("editor", source);
await controller.enable();
playback.play();
playback.pause();
playback.seek(600);
await playback.release(); // Entire shared surface returns to DOM.
```

`AnimationPlayback.state()` exposes logical milliseconds/playing/released and
actual retained source time/state/target detachment. During ownership the
original effect's target is null and the source is paused; no second animation
or duplicate control tree runs. GPU capture uses neutral transform/opacity,
so source opacity is not baked and then applied a second time. One canonical
transform drives GPU pixels/native geometry. Releasing, disabling, admission
failure, runtime recovery or disposal returns to DOM and restores the same
source/effect at the logical phase. Inline values/priorities/removals are
restored only for properties whose last runtime write is still present.
Later direct or React-authored changes are preserved, including removal or
priority-only changes and unrelated declarations. Live translate/rotate/scale
dependencies, origin and declaration ownership are checked too; they recover
to diagnosed usable DOM without overwriting the external author.
Relinquished typed presentation properties stay preserved across repeated DOM
recovery callbacks. `runtimeResources.presentationOverrides` counts enrolled
layers with these retained property records; explicit controller/React
transform changes or unenrollment clear them, and final disposal clears all.
Writing the exact same value and priority is not distinguishable from no
change and does not transfer ownership.
Playing sources resume; paused sources remain paused. An ownership handle
cannot be reused after release. Ownership requires no retained cleanup,
outstanding admission readback or initialization/transition.

Supported timing is positive duration <=3,600,000ms, delay 0..3,600,000ms,
integer iterations 1..10000 or Infinity, normal/alternate direction, fill both,
playback rate 1 and document timeline. Two to 32 complete transform+opacity
frames strictly span offsets 0..1. Transform lists are literal
`translate(px[, px]) rotate(deg) scale(number[, number])`, or neutral `none`;
positive scales are 1e-4..1e6, translations <=1e6 and authored rotation
<=36000 degrees. Missing translate Y is zero; missing scale Y equals X.
Global/per-keyframe easing supports linear, ease/ease-in/ease-out/ease-in-out
and valid cubic-bezier with X controls 0..1 and control magnitudes <=1e6.
Overshoot extrapolates transforms; only opacity clamps to 0..1. The entire
channel envelope is checked for finite bounds and singular scales before
source mutation. Seeking accepts finite 0..1e12ms.

Reject percentage/calc/var/environment/inherited dependencies, unsupported
properties, skew/perspective, additive/iteration composition, steps/springs,
reverse/alternate-reverse, other fill modes, iterationStart/endDelay, scroll
timelines and overlapping ownership. Existing animation libraries are **not**
automatic adapters. Controller/React transform changes conflict with an owned
layer. Source target/effect, frames, timing, composition, rate and externally
changed current time are monitored; an observed live conflict uses conservative
DOM recovery instead of partial translation.

`ownCSSAnimation(id, { rule, keyframes })` accepts one top-level CSSStyleRule
with exact `#id` selector and one same-sheet CSSKeyframesRule in the same
document. Timing longhands must match the applied cascade, with time units
normalized; inline animation overrides and dependent/overridden raw frames
are rejected. Media/nested rules, arbitrary selector resolution and general
CSS cascade translation are not supported. The caller passes actual trusted
CSSOM references, as `/paired.html?example=css` does.
In the tested browser, drawable migration can regenerate one exact matching
CSS association and cancel the detached original. The adapter retains that
replacement explicitly, pauses/detaches it, preserves original logical time
and cancels it on restoration. Repeated or incompatible regeneration refuses
GPU. `runtimeResources.cssReplacementSources` counts this bounded exception.

`advance(frames, milliseconds)` is a bounded real-RAF deterministic timeline
driver (1..10000 frames, step 0..1000ms), not a GPU readback or performance
benchmark. It advances even paused owned timelines/effects for deterministic
positions; ordinary Play uses elapsed visible RAF time, capped at 100ms per
frame, with no hidden-time catch-up. Reduced motion pauses owners/effects and
refuses deterministic motion; forced colors returns to DOM.

## Trusted local module adapter

`mountApplicationModule(options, module)` mounts an **already imported,
trusted local** `LocalApplicationModule`. There is no URL loader, sandbox,
arbitrary unchanged-app compatibility, hydration or animation-library adapter.

```tsx
const controller = mountApplicationModule(options, {
  mount({ container, enroll }) {
    const root = createRoot(container);
    flushSync(() => root.render(<ExistingLocalApp />));
    const unregister = enroll({
      id: "existing", element: container.querySelector("#existing")!,
      layout: {}, transform: {}, preserveStyles: true,
    });
    return () => { unregister(); root.unmount(); };
  },
});
```

The module owns one root and must return its synchronous unmount callback;
it must clean its own partially created root if mount throws. `enroll` accepts
original connected direct-root layers, not cloned/reparented controls.
`preserveStyles` leaves existing declarations intact in DOM; GPU temporarily
transfers only transform/opacity/origin and restores still-owned
values/priorities/removals without overwriting later application writes.
Other existing styles are not normalized. Nonneutral existing presentation
requires supported explicit ownership, not silent duplication. Layout,
stacking, clipping and capture-budget policies still apply.

## Decorative ripple (Phase 5)

`Surface decorative` supplies inert, aria-hidden and pointer-transparent
semantics. Local-module enrollment instead sets `decorative: true` and must
already provide equivalent native semantics. `setRipple(id, { amplitude,
seconds, playing? })` accepts amplitude 0..12 CSS px and seconds 0..1e6.
`setRipple(id, null)` removes the effect. Amplitude zero is identity.
Running time wraps at 1000 seconds; explicit values remain deterministic.

The shader radially displaces **texture sampling**, attenuating near the
decorative layer's border. It changes no native geometry. Interactive/editable/
focusable/link/dialog/popover descendants are rejected; live loss of decorative
eligibility uses diagnosed DOM recovery. Essential controls must be separate
unenhanced layers. Effects/resources clear on DOM return/disposal. Reduced
motion uses identity and pauses effect time. This is one bounded demonstration,
not an arbitrary postprocessing or motion toolkit.
