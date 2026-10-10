# Bounded adoption and migration

**Evidence storage:** historical raw paths named below refer to the verified
external local archive, not files in this checkout. Only compact verdicts
remain tracked; [archive access, hashes and reproduction](archive-catalog.md).

Phase9 is [independently accepted-with-limits](../evidence/phase9-independent/acceptance-v1.json)
for bounded actual155 specimens; exact154 remains unverified.
This is private experimental software, not a release-ready unchanged
website loader. Existing React18/19 and the single Radix Dialog integration
are bounded examples, not arbitrary library/SSR/hydration compatibility.
The Phase10 [private tarball/distribution contract](distribution.md) is
independently accepted with limits; start from an actual tarball install,
not demo facades or a source alias. Publication/licensing remain separate.

**Phase11 engineering is independently accepted with limits; human/physical
validation is pending** ([verdict](../evidence/phase11-independent/acceptance-summary.json)).
Full Phase11 remains incomplete; the human/device checklist below is open.

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

For a reusable local operator specimen, run the Phase11 installed-consumer
command in [distribution](distribution.md), then serve either generated
React18/19 consumer with its installed Vite (`node node_modules/vite/bin/vite.js
preview --host 127.0.0.1 --port <free-port> --strictPort`). Use only an already
installed, authorized browser. The page starts in DOM and has **Request GPU**,
**Recover DOM** and **Dispose** buttons, original labelled controlled and
uncontrolled inputs, checkbox, form and native external Dialog/Popover.
The status displays explicit admission/recovery reasons. Values are synthetic,
local and not persisted. Do not put real personal data in the specimen.

Use short text for supported GPU editing. Separately type a long value, press
Home/Shift+ArrowRight, and confirm that an actual horizontal input scroll can
recover useful DOM: the same control/value/selection remains usable and GPU
output is hidden. Shorten the value and request explicit fresh admission.
For effects/motion and task semantics, use the existing `/effects.html` and
`/todo.html` specimens; for `NativeScroll`, use `/runtime.html?scroll&dom`.
Tab/Shift+Tab through originals, use Enter to submit and Space to toggle, open
the external overlays, test modal sequential focus, Escape and focus return.
Repeat across useful DOM, admitted GPU where available and recovered DOM.

Phase11's bounded installed React18.3.1/19.3.0 Chrome155 audit exercises
trusted pointer/keyboard/form/input-scroll events, original control identity,
selection, checkbox state, CDP AX control counts, native Dialog/Popover,
emulated reduced-motion/forced-colors, and public-device-destroy recovery.
These are automation results, not spoken screen-reader or OS IME proof.
Enrolled editable roots (including inherited editing) and descendant
`contenteditable` boundaries now refuse GPU explicitly instead of admitting
unsupported editing. Live plaintext editing recovers useful original DOM.
Native Dialog sequential focus can visit browser UI; it is not Radix's strict
JavaScript focus trap. Fresh GPU admission with an open modal can be refused
by the occluded native hit probe without losing overlay focus/value; close the
modal before explicitly retrying. Long input horizontal scrolling similarly
recovers DOM rather than forcing unsupported GPU geometry.

The opt-in clean-profile headful background check uses actual page switching,
removes Playwright's background-throttling-disable flags, and records CDP
browser metadata. This environment did not make the original document hidden,
so it records an explicit unverified result and skips pause/catch-up assertions:

```sh
CANVAS_HEADFUL_INTERACTION=1 CANVAS_EVIDENCE_ROOT=evidence/phase11/background-local \
  npm run test:browser -- tests/interaction.test.mjs --grep headful
```

No synthetic visibility event substitutes for this gate. Even a passing
clean-profile check would not certify everyday profiles or app/OS throttling.

Screen-reader work must use actual spoken navigation/name/role/state and
duplicate-control checks; an accessibility tree is only an automated semantic
audit. IME work must use the OS composition/candidate UI, including recovery
during composition; a dispatched composition event is only a recovery fixture.
Record results outside this checkout only with consent: date, browser/build/
flags/profile class, OS/device/display, steps, expected/observed behavior and
pass/fail/recovery. No automatic tester identity, private profile or spoken/
composed text collection is implemented.

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
