# Bounded adoption and migration

Phase9 is [independently accepted-with-limits](../evidence/phase9-independent/acceptance-v1.json)
for bounded actual155 specimens; exact154 remains unverified.
This is private experimental software, not a release-ready unchanged
website loader. Existing React18/19 and the single Radix Dialog integration
are bounded examples, not arbitrary library/SSR/hydration compatibility.

## Integrate incrementally

1. Keep original React state, native inputs/forms and authored CSS. Bootstrap
   one persistent root in the adapter-owned container, with connected sibling
   ordinary/capture/output/native-overlay hosts outside every React root.
2. Start in useful DOM. Enroll at most eight bounded direct-root layers using
   `Surface` or `useSurfaceRef`. Use an external public portal-container API
   for overlays; do not relocate existing library/React descendants.
3. Request `enable()` and inspect its explicit result/reason. GPU output stays
   hidden until actual known-color pixels and applied native geometry pass.
   Missing capabilities, incompatible layout or compilation errors retain DOM.
4. Give supported motion properties one owner. Prepare numeric/native-animation
   ownership in idle DOM; diagnose competing CSS/WAAPI properties rather than
   running both. Nonaffine/disappearing effects require inert, aria-hidden,
   noninteractive decoration separate from essential native controls.
5. After add/remove/reorder, same-size position change, resize or DPR change,
   expect immediate hidden GPU presentation and original DOM recovery.
   Await settled retirement, then explicitly request fresh admission. Old
   generation capture/validation cannot reveal or upload into the replacement.
   Original keyed controls/root/state remain; resources await healthy fences
   and pending readbacks rather than force destruction.
6. Keep normal native invalidation. Root-attributed hover/focus/caret/style/font
   paint cannot safely be narrowed using React state or MutationObserver alone.
   Test actual decoded changed output, native hits and final retirement.

No automatic refresh, route/shared-element transitions, springs, virtualization,
remote shader loading, general plugin/resource allocator or upstream engine
modification is introduced. Unsupported scrolling/clipping/nested/foreign
enrollment and budget excess remain diagnosed DOM cases.

## Known comparison limits

The [measurements](measurements.md) retain full baseline/new raw samples.
Five edits can still capture every layer repeatedly; there is no speedup claim.
GPU shader work is added non-equivalent work. CPU submit/RAF timing is not GPU
execution or physical input latency; capacity estimates are not driver memory.
At DPR2 the native capture's text rasterization differs from ordinary DOM on
both genuine committed Phase8 and Phase9; paired decoded comparisons are
preserved. Native control value, selection, geometry and hit proof are separate
from a false pixel-equivalence claim.
Current baseline/new comparisons and final majors ran on actual installed
Chrome155.0.8059.40 at the unchanged executable path. Environment transition
reason/date is unknown. Autonomous coordinator continuation permits bounded
independent155 checks, not explicit user155 approval; the original exact154
requirement remains unverified. No installation/download/switch/profile change
is authorized by these results.

## Human/device checklist

All rows below are **unverified** until a human records actual execution.
For each row record date, tester, browser/build/profile/flags, OS/device/GPU/
driver, DPR/display, exact steps, expected versus actual result, pass/fail,
diagnostic/evidence link and any recovery action. Automated CDP/AX/visibility/
destroyed-device proxies do not close these gates. Do not change a user's
profile, global settings or hardware solely to manufacture a passing result.

| Gate | Exact bounded steps and results to record |
| --- | --- |
| Screen reader | In DOM and admitted GPU, navigate named input/form/checkbox/Dialog by actual screen-reader commands; type/save, open/trap/close overlay, recover/reenter. Record spoken name/role/state, focus order and duplicate-control absence. |
| OS IME | With an actual OS IME, compose multi-stage text in TODO/integration input, select/replace, submit, recover during composition and reenter. Record composition preservation, candidate-window position and committed value. |
| Everyday profile | Open the normal profile without changing flags; record capabilities and whether original DOM remains useful. If the profile already supports flags, exercise admission/refusal explicitly. |
| Real background throttling | Play bounded motion/effect, switch to a different app/tab for measured time, return; record actual visibility/timing, pause/no catch-up, control state and changed output after a native edit. |
| Physical display/DPR | Move the window between actual displays/scale factors during edit/motion/admission; record output hiding, correct native hits/caret, fresh admission and retained state. CDP DPR alone is insufficient. |
| Physical device/reset | On an explicitly authorized physical device/reset event, record actual loss notification, useful DOM, healthy resource retirement, explicit fresh engine and original control continuity. `device.destroy()` is not this gate. |

The permanent five-original Phase6 fixture provenance gap remains disclosed
in [measurements](measurements.md); no explicit user supersession approval or
restoration of those missing originals is implied by later evidence.
