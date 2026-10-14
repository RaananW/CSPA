# Phase 6: compatibility and measured costs

**Evidence storage:** historical raw paths named below refer to the verified
external local archive, not files in this checkout. Only compact verdicts
remain tracked; [archive access, hashes and reproduction](archive-catalog.md).

**The bounded React 18/19 behavior matrix and production comparison pass.
The measurements do not demonstrate a performance improvement over DOM.**
The GPU path adds synchronous submission work, root-wide capture/comparison
costs on edits, startup and owned pixel storage. This is experimental-browser
evidence, not release, accessibility or physical-device certification.

## Reproduce without changing the primary dependencies

Use the installed Chrome and pinned main lockfile described in the README.
Keep browser/evidence writers serial. Do not run either matrix concurrently
with timing measurements.

Current reruns write explicitly regenerable outputs under
`evidence/regression/current/performance/`: the five browser fixtures use `fixtures/`,
and the full comparison/smoke runner writes `performance.json` or
`performance-smoke.json`. Selecting `CANVAS_EVIDENCE_ROOT=evidence/phase9/<distinct-run>`
routes all these writers to a fresh Phase9 destination instead, preserving
the already-versioned baseline regression samples too. These destinations apply inside the copied
React18 workspace. Normal tests, matrices and `measure` do not write into the
archived `evidence/phase6/` reports or independent acceptance reports.
Archived reports below describe the historical Phase6 run, not current reruns.
Browser/matrix reruns also now default to `evidence/regression/current` (or explicitly
`CANVAS_EVIDENCE_ROOT=evidence/phase9/<distinct-run>`); every old runtime/animation/TODO/
integration/surface/recovery writer follows this root. Phase8 incremental
effect CPU samples and resource budgets are reported separately in
[effects](../effects.md), not as a replacement full Phase6 benchmark or a speedup.

Current writers accept only `evidence/regression/current`, the Phase9/10/11/12
writer and matching `-independent` roots, and separator-aware resolved descendants.
Accepted Phase6/7/8, Phase8-independent and regression/performance are read-only.
The historical Phase8 report generator now refuses its archived destination
before writing. Never rerun a completed measurement into the same root.

## Phase12 bounded engineering envelope

**Engineering independently accepted with limits**
([verdict](../../evidence/phase12-independent/acceptance-summary.json)); full Phase12
production budgets remain open. **No speedup or capture optimization is established.** The explicit default
is compared with a genuine isolated build of accepted commit
`a6b038ce9a854eae9aed1d035c3dd4a2290aead6`, built before implementation.
Both use React19.3.0, Lite1.33.0, 900x750, DPR1/2 and identical operations.
Each launch records actual CDP Chrome155.0.8059.40, revision
`@cfaadc5a132d78e1828635aa8405a499f3e14864`, and ANGLE Metal Apple M2 Pro
(Apple26.7.1). This does not establish the previously requested Chrome154.

The workload includes ten real native input edits over two seconds, five
membership/order/origin/size/frame changes, three TODO add/edit/check/delete
cycles, and actual native scrolling (`scrollTop=100`) with diagnosed DOM
fallback. Original controls/state and resource retirement are asserted.
Screenshot checkbox latency uses the shared native interaction helper, three
trials per variant outside the timing window. All lower bounds were zero:
upper bounds include automation, screenshot and readback overhead, not physical
input-to-display latency.

| Observed metric (DPR1 / DPR2) | Accepted explicit baseline | Final explicit |
| --- | --- | --- |
| Input-window GPU capture delta | 34 / 36 | 35 / 34 |
| TODO-window GPU capture delta | 20 / 21 | 21 / 21 |
| Structural GPU operation median, ms | 112.2 / 115.5 | 114.4 / 112.8 |
| Structural DOM operation median, ms | 32.9 / 32.8 | 31.8 / 32.2 |
| Checkbox DOM upper-bound median, ms | 83.3 / 117.5 | 85.8 / 115.0 |
| Checkbox GPU upper-bound median, ms | 108.8 / 129.2 | 109.4 / 145.2 |

Input GPU CPU-frame p95 was approximately0.2ms and capture p950.3ms in both
builds; real rAF p95 was approximately16.7-16.8ms. These are CPU/submission
samples, not GPU execution (unavailable). DOM capture counts were zero.
Small samples and root-wide paint noise cannot establish improvement or a
general absence of performance regression. DPR1 input rasters have zero
differing bytes; DPR2 has21956 differing bytes in both builds for this two-layer
workload, not pixel-equivalent text. The older eight-layer23249pixel/68851byte
result remains a separate historical limit.

The additional final `"automatic"` experiment is not a matched baseline
speedup comparison: structural medians were147.6/147.4ms, followed by one
12-rAF invalidation burst during motion. Readmission settled safely, cancelled
motion was not replayed, and native state remained intact. rAF-sampled owned
peaks were one engine/effect/renderer, up to five textures/staging canvases/
comparison buffers including admission probes, versus four in explicit
structural runs. These counters are not heap or driver byte measurements.
Every tested completed lifetime retired to zero; unconfirmed healthy fences
still deliberately retain resources rather than force destruction.

Reproduce serially with `npm run build`, then
`CANVAS_EVIDENCE_ROOT=evidence/phase12/<fresh-run> node scripts/archive/phase12-measure.mjs`.
For the genuine archived baseline build also set `CANVAS_MEASURE_BUILD` and
`CANVAS_MEASURE_LABEL=baseline`; for the additional final experiment set
`CANVAS_MEASURE_POLICY=automatic`. Private proof retains the baseline,
intermediate runs, failed assertions and the corrected final explicit/automatic
reports. An earlier automatic run accidentally included the burst inside each
operation duration; it is retained but excluded from the table above.

Fresh independent reruns passed all48 workload/DPR/mode entries, alongside23
units/build,55 focused browser passes/one human skip,eight actual installed
React18/19 package contracts and supplemental direct-root cancellation/fence/
native-hit cases. Independent structural GPU medians were114.5/113.7ms baseline
versus122.2/133.6ms final (DPR1/2): **observed increases**, not a speedup or
universal performance-nonregression claim. DOM medians were32.1/32.3 versus
32.6/34.7ms. Automatic medians147.9/146.7ms exclude the separate12-rAF
burst333.4/332.4ms. Input captures were34/34 baseline,34/35 explicit-final,
34/36 automatic; TODO captures18/20,20/20,19/19 respectively.

The actual writer final raw routes are
`evidence/phase12/final-explicit-v4/dynamic-measure/final/report.json` and
`evidence/phase12/final-auto-v3/dynamic-measure/final/report.json`;
fresh independent proof uses `evidence/phase12-independent/sol61-20261011/`.
These raw files are ignored/private proof, not shipped repository artifacts.
The preserved private `measurement-summary-final.json` still names older
final-explicit-v3/final-auto-v2: an administrative label discrepancy, not
final-source evidence. It remains unchanged; acceptance rests on audited actual
final raw reports and fresh independent observations, not that older summary.

**Proposed evaluation targets, not accepted budgets:** retain exact DPR1 output
and native state/hit continuity, zero capture while content is unchanged,
coalesced settled readmission without replay or unsupported retries, and zero
owned counters after confirmed retirement. The observed two-second input
window, structural medians and resource peaks are starting points for a
deployment-specific repeated comparison, not universal numeric caps. Selected
production applications, hardware, frame/input/capture/resource budgets,
spoken screen-reader/OS IME checks, everyday-profile GPU admission, genuine
background return and physical display/device-loss certification remain open.

## Phase9 investigation (accepted-with-limits on actual installed155)

[Independent acceptance](../../evidence/phase9-independent/acceptance-v1.json)
recomputed all90/40 baseline and90/40 final coverage/counts/distributions/
per-layer sums and retirements, and reran bounded native smoke and final-source
raster/attribution proof. No safe selective capture optimization or speedup
was established; conservative root-wide work remains.

**Environment limitation:** raw CDP metadata records Chrome155.0.8059.40
in both the committed Phase8-baseline and current comparisons. This differs
from required154.0.8037.98 despite using the unchanged installed executable;
no browser install/download/switch was performed by this writer. Comparisons
are matched on actual155 with CDP revision
`@cfaadc5a132d78e1828635aa8405a499f3e14864`, not evidence of154 compliance.
Transition reason/date is unknown. Implementation browser runs are stopped;
the coordinator permits renewed independent bounded155 checks after the user
was unavailable, **not explicit user155 approval or154 certification**.

The genuine unchanged Phase8 runtime baseline is
[`phase9/baseline/performance/performance.json` (archived raw)](archive-catalog.md):
90 runs, 40 screenshot-poll latency trials, five native edits/window,
2/4/8 layers, DPR1/2, three repetitions. Root-wide paint reproduces roughly
17/29/53 captures rather than five. No proven public native attribution supports
selective suppression; conservative capture/readback remains a retained limit.
Per-layer captures/copies/readbacks/uploads, CPU samples, real RAF intervals,
owned RGBA/uniform estimates and actual changed output are retained. CPU
submission is not GPU execution; unavailable GPU timestamps remain null.

The [final corrected-runtime comparison (archived raw)](archive-catalog.md)
also completed90 runs and40 latency trials with the same timed workloads.
The earlier [new run (archived raw)](archive-catalog.md)
is retained verbatim but predates the final admission-cancellation correction;
it is not relabeled as final source. New blur/settle/static raster checks and
uniform estimates are outside measurement windows. The
[corrected implementation comparison report (archived raw)](archive-catalog.md)
contains per-group raw counts/median/p95, per-layer work and retirement results.
No affected-path speedup is claimed: root-wide native paint/readback cost
remains, and noisy CPU/RAF samples are not GPU-execution measurements.
The earlier handoff report is preserved, not rewritten after discovery of
the version discrepancy.

The controlled [raster comparison (archived raw)](archive-catalog.md)
used an isolated genuine `git archive` build of pre-rewrite Phase8 `84ac72ca`
(archived provenance; corresponding current-history commit `8f0ba6b9`)
and current source, identical native edits/font/style/blur, eight layers and
900x750 viewport. Both have zero differing pixels at DPR1 and exactly23249
differing pixels/68851 differing bytes at DPR2. Paired decoded PNGs/settings
are preserved. Thus DPR2 text rasterization is baseline-identical, not a new
Phase9 native state/layout/hit regression or pixel-equivalent text claim.
The [independent FINAL-source comparison (archived raw)](archive-catalog.md)
repeats this exact23249pixels/68851bytes mismatch with byte-identical corresponding
baseline/final PNGs. The earlier intermediate source is not relabeled final.
Static presentation comparisons report actual differences; animated variants
are not compared at distinct times. This does not certify physical display
movement, browser font behavior generally or display latency.

Phase7 acceptance identified an earlier regression-writer collision in five
`evidence/phase6/fixtures/*.json` files. Their exact original bytes have not
been recovered; the files currently contain regenerated samples, not the
original Phase6 fixture measurements. The coordinator continued the authorized
work autonomously after the user was unavailable, accepting Phase7 with this
permanent provenance exception; there was **no explicit user supersession
approval**. Exactly248/253 original historical hashes are preserved, not253/253.
The full Phase6 benchmark, smoke, matrix and parent reports remain untouched.
Required original/current hashes are in the
[P7-2 recovery/isolation audit (archived raw)](archive-catalog.md);
the [independent continuation disposition (archived raw)](archive-catalog.md)
records the exception. Earlier held verdicts remain historical findings.

```sh
# Explicit independent dependency/type fixture; no browser download:
npm ci --prefix fixtures/react18 --ignore-scripts
npm run test:react18
# Full primary unit/type/build/browser run plus React19 matrix metadata:
npm run test:react19
# Focused production measurement-fixture behavior (build first):
npm run build
npm run test:browser -- performance.test.mjs
# Production build, serial real wall-clock comparison, cleanup:
npm run measure
# Final sanitation after redirected outer log writers have exited:
node scripts/sanitize-evidence.mjs
```

`test:react18` copies shared application/runtime/test sources, without
substitutions, into ignored `fixtures/react18/workspace/`. The matching fixture
dependencies resolve from its declared ancestor `node_modules`; compiler,
engine and browser tooling stay at the primary pins. Its bounded development/
preview services use 5185/5186 and refuse existing services. `test:react19`
runs the entire primary regression, which includes the same declared
runtime/animation/TODO suite. Main tests retain responsive dev5173 and own
preview5174 only when needed.

`measure` builds production and owns preview5287, refusing any already-running
service there. `CANVAS_MEASURE_PORT` selects another free port.
`node scripts/measure.mjs --smoke` uses the already-built production bundle for
a shorter harness check, not the final comparison. Browser contexts, browser
and the owned preview are closed after the bounded runner, including failures.
Application use remains <http://127.0.0.1:5173/todo.html>.

## Actual React-major behavior and types

| Fixture | React / DOM | Matching React / DOM types | Executed coverage |
| --- | --- | --- | --- |
| Isolated React18 | 18.3.1 / 18.3.1 | 18.3.31 / 18.3.7 | TypeScript + production build; all 53 shared runtime/animation/TODO browser cases |
| Primary React19 | 19.3.0 / 19.3.0 | 19.3.0 / 19.3.0 | 15 units, TypeScript + production build; all 99 browser cases, including the same 53 shared cases |

Both exercise mounted production **profiling** roots and actual Vite
development **StrictMode**, not import/typecheck proxies. Reports assert
`React.version` in both executed builds. GPU flags, original native workflows,
source/pixel ownership, no-flags useful DOM, fallback, HMR and retirement
behavior remain enabled. No fixture disables normal invalidation.

React18 exposed two concrete compatibility issues, now fixed in shared code:
its JSX types lack native `inert`/`popover`; inert is initialized through the
native property and popover through a string attribute. Also, React18's
standard `react-dom.flushSync` cannot synchronously flush an injected
`react-dom/profiling.createRoot`: these are distinct renderer instances.
The explicit adapter accepts the matching optional `flushSync` along with
`createRoot`. Demo roots use the public profiling pair in production and the
ordinary public client/flush pair in actual development, avoiding unsupported
development `react-dom.createRoot` imports. Default application mounting
continues to use ordinary `react-dom/client`.

The shared narrow profiling declaration describes verified public exports
using the matching installed React DOM types; there is no fixture-specific
type workaround. No primary dependency upgrade was made.

Evidence: [React18 metadata (archived raw)](archive-catalog.md),
[build (archived raw)](archive-catalog.md),
[53-case behavior (archived raw)](archive-catalog.md) and copied
`evidence/phase6/react18/reports/`; [React19 metadata (archived raw)](archive-catalog.md)
and [full primary result (archived raw)](archive-catalog.md).
Metadata records source and unchanged primary-lock hashes. This is compatibility
for the declared bounded suite, not all frameworks, hydration or arbitrary CSS.

## Environment and comparable workloads

The final [raw report (archived raw)](archive-catalog.md) records every run,
full operation samples, RAF intervals, before/after counters, per-layer
frequencies/bytes, estimates, retired ledgers, CDP build/launch arguments and
dependency manifest. It uses installed macOS Chrome **154.0.8037.98**, revision
`b859317bf11f6be47f9b7799ec690a0a42a1fb33`, executable
`/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`, with
`CanvasDrawElement,ElementCanvasTransform` and experimental-web-platform flags
plus recorded Playwright launch arguments. GPU renderer: **ANGLE Metal,
Apple M2 Pro**. Node/npm: 24.19.0/11.17.0; React19/DOM/types: 19.3.0;
TypeScript 7.0.2, Vite 8.3.4, Lite 1.33.0, Lite GL 1.15.0,
Playwright 1.64.0, pngjs 7.0.0. Performance uses **Lite/WebGPU**, not Lite GL.

Each fresh serial lifetime has viewport900x750, DPR1 or2, a fixed820x560
surface and 2/4/8 separately enrolled110x110 cards with identical content.
Card zero has the same native controlled input; other cards have inert striped
artwork. The unchanged runtime budget is **at most eight layers**. This is
fixture-only scaling, not eight TODO surfaces; TODO retains its two surfaces.

| Variant | Compared work |
| --- | --- |
| `dom-static` | Original ordinary DOM; no motion |
| `gpu-static` | Same content, admitted capture/composition; no effect |
| `dom-affine` | Public numeric descriptor played by its native DOM source |
| `gpu-affine` | Identical descriptor owned by the shared GPU/native-geometry path |
| `gpu-ripple` | Static essential controls plus sampled-pixel decorative refraction; **non-equivalent added effect cost**, not a CSS speedup comparator |

Affine motion is linear, alternate,1000ms x10, translation(0,0)->(12,5),
rotation0->5deg, scale1->0.94, opacity1->0.9. All motion fits the fixed frame.
Variant order rotates across three repetitions, with500ms warm-up and a
requested2000ms settled window. No deterministic advance is used for
performance. Startup and functional-admission work are recorded separately.

## Settled wall-clock results

The final report has **90 steady windows totaling180.9504s**, and **90
separate native-input windows totaling90.8932s**, excluding warm-up/startup.
Across all steady windows: zero extra captures, pixel copies, native
readbacks, uploads, upload bytes, native paint notifications and actual React commits; **4,356 public
GPU submissions** across moving GPU variants. Static GPU naturally submits
zero new frames after settling; invalidation is not disabled.

All five variants at all six DPR/count combinations had external RAF
median/p95 **16.7/16.7ms**, maximum16.8ms, and zero estimated missed refresh
slots. These are callback intervals, **not GPU execution, displayed-frame
latency or compositor drop counts**. GPU startup across variants was
median85.4ms/p95193.1ms/max312.4ms, separate from steady work and not full
page-navigation latency.

Synchronous public GPU frame work, pooled over the three repetitions:

| DPR / layers | Affine CPU median / p95 ms | Ripple CPU median / p95 ms |
| --- | --- | --- |
| 1 / 2 | 0.1 / 0.2 | 0.1 / 0.2 |
| 1 / 4 | 0.2 / 0.2 | 0.2 / 0.2 |
| 1 / 8 | 0.2 / 0.3 | 0.2 / 0.3 |
| 2 / 2 | 0.1 / 0.2 | 0.1 / 0.2 |
| 2 / 4 | 0.2 / 0.3 | 0.2 / 0.3 |
| 2 / 8 | 0.2 / 0.3 | 0.2 / 0.4 |

Ripple's largest observed sample was1ms. DOM has no CanvasSPA submission
sample, not zero total browser layout/paint work. There is no public GPU
timestamp measurement in this path: unavailable GPU execution is **null**,
never a fabricated zero. Equal RAF delivery did not establish a GPU benefit.

## Content-edit costs and per-layer frequency

Separate1000ms windows perform five real native controlled-input replacements,
80ms apart; every variant records exactly five React commits. These windows
include automation/wait time and are not maximum-throughput measurements.
GPU uploads are at least five; focus/caret/native paint can add work.
Pooled GPU static/affine/ripple input windows:

| DPR / layers | Captures per window median / p95 | Uploads median / p95 | Capture CPU ms median / p95 | Native readback + compare ms median / p95 | Upload CPU ms median / p95 |
| --- | --- | --- | --- | --- | --- |
| 1 / 2 | 17 / 18 | 6 / 6 | 0.2 / 0.4 | 1.9 / 3.6 | 0 / 0.1 |
| 1 / 4 | 29 / 33 | 6 / 7 | 0.1 / 0.3 | 1.7 / 3.5 | 0 / 0.1 |
| 1 / 8 | 53 / 61 | 6 / 7 | 0.1 / 0.3 | 1.7 / 3.5 | 0 / 0.1 |
| 2 / 2 | 17 / 17 | 6 / 6 | 0.2 / 0.4 | 2.0 / 3.6 | 0 / 0.2 |
| 2 / 4 | 29 / 32 | 6 / 6 | 0.1 / 0.4 | 1.9 / 3.3 | 0.1 / 0.2 |
| 2 / 8 | 53 / 61 | 6 / 7 | 0.1 / 0.3 | 1.8 / 3.2 | 0 / 0.1 |

Every capture here has one owning draw/staging copy and one native pixel
readback. Median upload payload is290,400 RGBA bytes per input window;
seven-upload p95 payload is338,800 where observed.
Native paint-notification deltas are median12/p9513 per input window at every
DPR/count combination except DPR2/two layers (12/12). These are approximately
12 notifications/s in the recorded roughly one-second windows; exact
per-run counts/durations are in the raw before/after metrics. DOM windows have
no CanvasSPA native-capture listener, not zero ordinary browser paint.
For example, DPR2/eight-layer static GPU's changed card captured12 times
(11.96Hz), uploaded7 times(6.98Hz,338,800 bytes); each of seven unchanged
cards captured7 times(6.98Hz) but uploaded zero. **Root-wide invalidation
and comparison are real scaling overhead**; avoiding unchanged uploads
does not avoid captures/readbacks.

`captureMs` measures synchronous capture, owning draw and staging copy after
the awaited native paint; paint-wait time is excluded. The sink's
`readbackCompareMs` separately measures `getImageData` plus byte comparison.
Upload timing measures the synchronous public call, not upload completion.
Values of0 can reflect timer precision. Timings do not account for all browser
layout/paint, driver work, energy or retained native copies.

## Actual input-to-visible-pixel bounds

Forty separate TODO trials click the **original checkbox**, record its native
change event time and poll screenshots until the task-row pixels change.
Polling/readback is outside all performance windows. Every trial changed the
row:13,072 pixels at DPR1;52,213 DOM/52,288 GPU at DPR2.

| DPR / mode | Trials | Detected upper-bound median / p95 ms |
| --- | --- | --- |
| 1 / DOM | 10 | 83.9 / 96.6 |
| 1 / GPU | 10 | 108.0 / 124.9 |
| 2 / DOM | 10 | 114.7 / 131.9 |
| 2 / GPU | 10 | 145.5 / 163.3 |

All changes were detected by the first screenshot, so **all lower bounds are
zero**. The report preserves event/capture-start/capture-end timestamps,
poll counts and uncertainty widths. These are loose observed intervals
`[0, upper]`, including automation and screenshot latency, **not precise
presentation latency or a controlled statistical claim that GPU is slower**.
The unfavorable GPU upper bounds are reported rather than omitted.

## Resources, estimated bytes and statistics

At each active GPU lifetime: one engine, one effect/renderer,2/4/8 textures,
matching staging canvases/comparison buffers; public GPU frame count is the
fullscreen draw-submission count, not a driver-internal draw-call trace.
Each group's RGBA capacities are96,800/193,600/387,200 bytes for2/4/8 layers.
The native capture bitmap capacity is1,836,800 bytes; output is1,836,800 at
DPR1 or7,347,200 at DPR2. Native textures remain CSS-resolution at both DPRs.
These are separate **capacity estimates**, not measured resident memory:
they exclude browser/engine overhead, driver allocations, MSAA, swapchain,
native copies and physical heap retention.

All90 fixture retirements and four TODO latency-lifetime retirements persist
zero core/runtime ledgers; TODO also has zero transition timers/demo listeners.
This does not turn an indefinitely pending healthy fence/readback into safe
cleanup; existing refusal/retention tests still apply.

Median and p95 use nearest-rank sorted observations. The opt-in operation sink
collects **every** operation in each finite window, including windows with
275 samples; runtime's retained last256 history is not used as a full-run p95.
All external RAF intervals are retained. Estimated missed slots are
`sum(max(0, round(interval / warmupMedianInterval) - 1))`, not observed drops.
Shared-host load, headless delivery cadence, short windows, three repetitions,
timer precision and profiling/collection overhead limit generalization.
There is no physical-refresh, GPU timestamp, energy or dedicated-host result.

## Accessibility and manual gates

The maintained suites use real native labels, keyboard/Tab/Shift+Tab/Space/
Enter, focus, selection and editing; reduced motion/forced colors are explicitly
emulated. TODO diagnostics now keep accessible mode/reason visible and full
JSON in collapsed details, placing New task inside a900x750 viewport.
This shell correction does not change measurement-card geometry.

Independent [parent headful/AX evidence (archived raw)](archive-catalog.md)
uses installed Chrome, headless:false, CDP `Accessibility.getFullAXTree`,
real keyboard and rendered pixels:19 relevant nodes in DOM/GPU,23 after add,
original named textbox/checkbox, same root/input/focus/selection/title after
disable, successful reentry,46,988 changed art pixels and zero final ledgers.
That browser closed before timing runs; its parent-owned report is preserved.

**Unperformed manual gates:** actual screen reader, OS IME, everyday-profile
behavior, physical devices/displays, background-tab throttling and physical
GPU reset/driver/browser crash. Headful automation/AX snapshots and synthetic
composition/visibility events are not replacements. No full certification,
arbitrary application compatibility or publication readiness is claimed.

## All seven original milestone outcomes

These link the original vertical-slice requirements, not seven new promises:

| Original outcome | Current executable evidence |
| --- | --- |
| 1. React text/button/controlled input | [Native semantics (archived raw)](archive-catalog.md), [no-flags real TODO workflow (archived raw)](archive-catalog.md) |
| 2. GPU host with live rendered content | [Actual admission colors/pixels and React19 production (archived raw)](archive-catalog.md), [content edits/captures/uploads (archived raw)](archive-catalog.md) |
| 3. Independent transformed surfaces/native interaction | [DPR1 geometry (archived raw)](archive-catalog.md), [DPR2 geometry (archived raw)](archive-catalog.md), [React18 behavior (archived raw)](archive-catalog.md) |
| 4. CSS keyframes transferred to sole GPU owner | [Original CSS source/time/presentation (archived raw)](archive-catalog.md), [twenty restoration transactions (archived raw)](archive-catalog.md) |
| 5. Nontrivial sampled-pixel shader effect | [Real task transition (archived raw)](archive-catalog.md), [headful distinct phases (archived raw)](archive-catalog.md); decorative only |
| 6. Same sample without handwritten application CSS | [Typed paired source (archived raw)](archive-catalog.md), [public numeric motion (archived raw)](archive-catalog.md), [TODO application](todo-pilot.md) |
| 7. Visible fallback diagnostics/clean disposal | [No-flags TODO refusal (archived raw)](archive-catalog.md), [every retired StrictMode controller (archived raw)](archive-catalog.md), [90+4 measurement retirements (archived raw)](archive-catalog.md) |

Preserve historical [Phase2/3 (archived raw)](archive-catalog.md),
[Phase4/5 (archived raw)](archive-catalog.md) and
[TODO pilot (archived raw)](archive-catalog.md) logs as their own gates.
The historical fixed-subtree fallback/cross-owner ElementImage failures
remain failures; current success uses the explicitly adopted stable-container/
owning-canvas pixel-copy contract.

## Independent acceptance

The coordinator independently repeated the React19 full regression and
React18 shared behavior/type/build matrix, then ran the abbreviated measurement
harness. [Acceptance evidence](../../evidence/phase6-parent-acceptance.json)
records the matching source/lock hashes, recomputed statistics and checks of
all 90 settled/input windows, 40 pixel-latency trials and 94 retired lifetimes.
Every recorded capture, readback, upload and frame-work sample count agrees
with its window's counters. The original full comparison is preserved;
[the separate smoke report (archived raw)](archive-catalog.md) is not a
second 90-window benchmark.

The compact TODO shell was also checked at 900x750 without native flags:
New task is initially within the viewport, details are collapsed, native
task creation remains usable and disposal returns all owned ledgers to zero.
The automated Phase 6 scope is accepted. The manual gates above remain open;
this is not release approval or authorization for broader toolkit work.
