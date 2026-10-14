# Current verification and compatibility matrix

**New installed-browser qualification (2026-10-12):** exact CDP
Chrome157.0.8100.0 / `@799dbe91dfe8604f0327d070ecd6d2792a7d3d63` passed fresh
showcase and finite native/ordinary-DOM source-and-packed-package task pilots
on React18/19 at DPR1/2. [Results and exact scope](private-release.md#newly-installed-canary-qualification-2026-10-12)
include current owning pixels, original native interaction, rollback/reentry,
disposal and a short GPU-motion capture-reuse window. This new automated result
does not reinterpret prior8099 independent acceptance or qualify the full
browser suite, manual accessibility/IME, physical displays or performance budgets.

## Experimental build-time CSS compiler (2026-10-12)

Initial implementer snapshot (superseded for current compiler numerics by the
conformance proof below):
`evidence/compiler/run-1d1014ff-d40f-4dab-b65a-024f5663f284`
passes packed-component Vite and webpack production builds, including default
minification, local/package Sass partials, configured PostCSS and CSS Modules.
Both native fixtures use the exact 8100 browser/revision above on React19.3.0.
They verify original input/Save interaction, current glyph/motion pixels,
capture reuse, exclusive animation ownership, later-authored declarations,
rollback/reentry, reduced motion and zero owned resources on disposal.
Injected invalid WGSL and synthetic absent-WebGPU cases are labelled refusal
tests, not physical device-loss evidence. Each bundler's generated GPU/native
sampler comparison covers 24,068 cases with maximum absolute error
0.0000171661376953125.

The same fresh physical execution tree passes 49 existing units and 54 selected
animation/recovery/runtime browser cases. The frame assertion uses the runtime's
returned bounded interval, excluding its setup projection draw; recovery uses
the isolated development URL rather than the retained server. Earlier failed
runs remain failed evidence, not relabelled passes.

Separate frozen-input release run
`evidence/phase14/run-16cf8fd2-d760-4c3a-9bf2-5ba5b1d75452` passes all 30 commands
across actual React18.3.1/19.3.0: units, types, public consumers, all ten built
pages and source/packed native task lanes at DPR1/2. Both new library archives
are 54,496 bytes/28 members, SHA256
`8b84a05612bff3db51f1faf8f54b12d8c3d56b4f3a35d02d3a3357b43ff0309a`.
The added build-only outputs intentionally differ from the historical
25-member package; runtime root exports remain unchanged. This matrix does not
qualify a React18 compiled-component fixture.

WICG readback remains proposal revision
`5fb3df86d84de598c7f0fcfc5ee53de1df067e7d`, committed 2026-10-09.
The current explainer retains `content=drawable`, pre-transform snapshots and
separate native geometry synchronization. The Chromium hotlist's HTTP readback
exposes only its client shell; no new issue status or landed revision was
verified in this readback.

This is implemented experimental scope, **not independent technical acceptance**,
a full browser-suite rerun, universal CSS/preprocessor equivalence, a speedup,
manual accessibility/hardware qualification or publication.
[Compiler contract and reproduction](../../packages/css-compiler/README.md).

### Expanded CSS conformance proof

Final implementer run
`evidence/compiler/run-3d847357-8d71-4f15-9e1c-9b0c66992978` passes 124 compiler
tests: four original groups plus 48 accepted and 72 refused named stylesheet
cases. Each accepted case is compared against an actual ordinary CSSAnimation,
not just another generated sampler. Both minified production bundler fixtures
pass 3,080 browser matrix/opacity comparisons and 297,974 actual GPU/native
sampler samples each; maximum absolute GPU/native error is
0.00003814697265625. These are time samples of 48 synthetic stylesheets, not
297,974 distinct components or a broad third-party integration certification.

The corpus includes shorthand/longhand ordering, selectors/Modules, complete
multi-frame motion, timing/directions/iterations, segment easing and invalid or
unsupported constructs. It exposed invalid CSS number acceptance, long-delay
precision loss and sharp-endpoint GPU reciprocal/cubic precision differences.
The parser rejects invalid syntax; generated normalization removes delays and
whole cycles in double precision and uploads bounded phase; mirrored cubic
evaluation avoids endpoint cancellation. Sampling still executes in generated
WGSL, not authored-CSS parsing or runtime shader generation.

Native CSS tolerances remain 0.02 CSS pixels for translation and 0.0005 for
matrix coefficients/opacity. The tested browser snaps a 0.001ms start seek to
zero progress in the sharp cubic case; final reports retain requested time,
actual currentTime, computed progress, transform and opacity as clock
diagnostics. Independent interpolation assertions use 0.01ms boundary
neighborhoods, not a claim of one-microsecond CSS equivalence. GPU/native
sampler comparisons retain +/-0.001ms samples. Earlier mismatches remain failed
evidence; thresholds were not widened.

Both real React19 package/local Sass/PostCSS/Modules fixtures retain original
input/Save, exclusive ownership, 22,765 changed motion pixels and 2,492 changed
glyph pixels, capture reuse, reduced motion, restoration/reentry and zero owned
resources on disposal. The same final tree passes 49 runtime units and 54
selected existing browser regressions, plus public types and production builds.

Fresh frozen-input release run
`evidence/phase14/run-d13063d9-a887-4920-b483-7dabd6ce246a` passes all 30 commands
across physical React18.3.1/19.3.0 source/public-consumer/packed native task lanes
at DPR1/2, with `inputsUnchanged` and `sourceUnchanged` true. Both current
archives are 54,524 bytes/28 members, SHA256
`97e1b159429d17cca9641f9d2b15c664a103112cb7c76c6db47485bfed2ac8cb`.
The earlier 54,496-byte archive qualifies only its initial source snapshot.
The compiled-component fixture itself remains React19. Actual browser and
upstream access limits remain those stated above. Independent technical
acceptance, persistence and broader/manual/performance gates remain separate.

## Experimental worker compositor

**Final implementer proof (2026-10-12):** fresh physical React19 run
`evidence/worker/run-e6ad7500-4027-4336-9057-cc24eff7a715` passes functional,
fault/lifecycle and all 18 isolated benchmark cells. React18 functional run
`evidence/worker/run-0d130f15-70ee-450c-a20e-d35f5caa5969` passes the same
bounded functional/fault gates, without benchmark cells. Actual runtime peers
were read before application assertions: React/ReactDOM19.3.0 and React18.3.1 /
ReactDOM18.3.1-next-f1338f8080-20240426. Both reports retain 38 unchanged scoped
source/input hashes and closed owned browser/server helpers.

CDP identifies Chrome157.0.8100.0 /
`@799dbe91dfe8604f0327d070ecd6d2792a7d3d63`, launched with explicit
`CanvasDrawElement,ElementCanvasTransform`, experimental-web-platform and
automation flags. The host is macOS kernel25.6.0 / arm64 / Apple M2 Pro.
The final benchmark ran after the other owned validation helpers closed;
external machine activity was not controlled.

Both worker runs and the two physical release lanes built the same
66,830-byte / 33-member child archive, SHA256
`65119c3b19f46ee87e1a50f93cc1c9939199346fe6598db99ed236ad46193205`.
The literal capacity8 worker program is 22,572 bytes, SHA256
`4d1e72b4331844aec1211cb2aa9cc58a78e8e74710360aad785d78065d3fc2ae`.
It is generated before bundling, not synthesized by the worker runtime.
These package identities supersede earlier implementer snapshots only for the
current worker source; historical accepted package identities remain unchanged.

### Functional and regression scope

The worker retains GPU through supported React content/decorative updates,
reduced motion, forced colors and live CDP-emulated DPR changes. It verifies
owning input glyph changes of 961 / 3,141 pixels at DPR1/2, decorative motion
changes of 84,700 / 338,800 pixels and a 42,038-pixel ripple delta. Original
trusted input/Save, current native hits, value/focus/selection rollback and
reentry remain intact. Live DPR1 -> 2 and 2 -> 1 at an unchanged viewport produce
2,543 / 8,589 changed glyph pixels with current native interaction and GPU mode.
This is emulation, not physical-display qualification.

In the settled DPR1 animation window, worker draw submissions advance 7 -> 31
while captures remain 103 -> 103 and actual App renders 11 -> 11. Production
Profiler callbacks are not used as render evidence. Screenshots retain the
original caret rather than causing native invalidation through caret hiding.
All accounted main/worker resources reach zero after healthy disposal.
Source-boundary refusals, admission cancellation, concurrent disposal, synthetic
visibility/device loss and delayed stop/retry also pass. Genuine worker crashes,
never-returning GPU fences and hardware hangs remain unqualified; stop timeout
reports retained cleanup-pending resources, not successful restoration.

Current release run
`evidence/phase14/run-fa1bd7e6-df0b-43d0-b3f0-db56385ebe4c` passes all 22
build-only commands on physical React18/19: source units/types, all ten
production pages, library/declarations/actual pack, strict Bundler/NodeNext
public consumers, safe root import and production consumers. Inputs and source
remain unchanged; the runtime root still has 13 exports. This lane does not
claim native browser coverage.

Current compiler run
`evidence/compiler/run-88193d70-3a68-4b59-93ef-b2f785857575` passes 124 compiler
cases and actual minified Vite/webpack installed-package/local
Sass/PostCSS/Modules fixtures. Each bundler passes 48 accepted stylesheet
cases, 297,974 GPU/native samples (maximum error0.00003814697265625) and 3,080
browser CSS comparisons, with 2,492 glyph and 22,765 motion pixels.
The 54 selected existing animation/recovery/runtime browser regressions passed
in `evidence/compiler/run-120444fd-1f06-4544-a21f-73a37b4b69e7`; their main
runtime/compiler inputs remain unchanged by the final worker timing correction.
This is not a full browser-suite, React18 compiled-component or webpack-worker
qualification.

### Matched benchmark

The same eight-layer App with seven decorative opacity animations runs in
CSS/WAAPI CSPA DOM fallback, existing main-thread CSPA and worker CSPA.
The CSS baseline includes CSPA's DOM bookkeeping; it is not an independently
unadopted application. Three rotated repetitions use 500ms warmup and a
2-second measurement window. Contention adds a React update every80ms plus
45ms synchronous main-thread work.

Pooled median / p95 in milliseconds, rounded to one decimal:

| Route | Main-thread load | Main rAF | Worker rAF | JS draw-submission work |
| --- | --- | --- | --- | --- |
| CSS DOM fallback | No | 16.7 / 16.7 | N/A | N/A |
| Main CSPA | No | 16.7 / 16.7 | N/A | 0.2 / 0.3 |
| Worker CSPA | No | 16.7 / 16.7 | 16.7 / 16.7 | 0.1 / 0.2 |
| CSS DOM fallback | Yes | 16.7 / 33.4 | N/A | N/A |
| Main CSPA | Yes | 16.7 / 33.4 | N/A | 0.2 / 0.3 |
| Worker CSPA | Yes | 16.7 / 33.3 | 16.7 / 16.8 | 0.1 / 0.2 |

Worker intervals now measure actual rAF callbacks and retain gaps across
snapshot publication; they do not mix publication draws into rAF samples or
reset timing on each capture. Each worker cell verifies that its summed interval
span covers the measured duration within a 250ms boundary allowance; actual
span differences are below14ms. Earlier worker measurements, including
`run-0bde9bc6-7ecd-47db-a01e-5d25fa7e8af6`, omitted publication-crossing gaps
and are superseded for cadence conclusions, not relabelled current proof.

Idle captures/uploads are zero in every route. Contended main CSPA records
192 captures/192 uploads in each repetition; worker CSPA records 200 captures
and 192 uploads in each. CSS records neither. Before/after statistics are not
an atomic capture/upload transaction, so this difference is not evidence of
lost images or fewer captures. Dirty native paint currently captures all layers.
App render deltas are CSS24/24/25, main25/25/25 and worker25/25/25; timed windows
are not identical fixed-update-count experiments. Worker texture accounting is
540,800 bytes at benchmark DPR1, not browser/driver/RSS memory.

The supported conclusion is **worker scheduling continuity under this synthetic
main-thread load**. rAF is not physical presentation; CSS compositor animation
cadence was not measured. Draw counters include publication submissions, not
unique displayed frames. Coarse JS submission timings are not GPU execution or
strictly equivalent engine work. No input-to-photon latency, complex-CSS speedup,
general performance superiority or production budget is established.

The WICG proposal was rechecked at
`5fb3df86d84de598c7f0fcfc5ee53de1df067e7d`, committed
2026-10-09T22:49:17Z. The Chromium hotlist still exposes its client shell;
no new landed fix or current issue status was verified. Browser functional
proof, not proposal/issue labels, supports this bounded experiment.
[Setup, source boundaries and lifecycle](../worker.md).
The owner authorized commit/push after documentation on 2026-10-12. Persistence
does not confer independent acceptance. Manual accessibility/IME, physical
displays/loss, WebGL2, production budgets, hosting/license/publication and
historical integrity exceptions remain separate or open. Named raw runs above
are ignored local evidence, not committed or published downloads; the scripts
and this bounded summary provide the repository's reproduction contract.

**Current accepted checkpoints (2026-10-11):** bounded structural/native editing/
viewport/admission repair at `cfa9df73`, external axis-aligned scroll/native
content-origin correction at `ab598c00`, and selected Phase13 task workspace/
diagnostics at `12f13661`. These qualify the measured current Canary157 route,
not historical154, physical display, arbitrary CSS or release readiness.
The [open-issues register](../open-issues.md) records remaining gates and exceptions.
Historical phase results below retain their original source/browser scope.
Current Phase13 no-flags/default DOM cases leave GPU disabled; they do not prove
native methods absent on157. Intentional clip-dropping admission refusal is a
separate functional negative gate.

[Phase14 private engineering](private-release.md) is started, not independently
release-qualified. Its finite source/fresh-package production pilot and
build-only CI definition do not revise accepted Phase13 results, execute a
hosted browser gate or close the register's manual/performance/publication limits.

Phase13 native workflow/300-frame proof and the fresh diagnostic delta review
are distinct. The delta review independently checked actual React18.3.1/19.3.0
runtime preassertions, rendered categories, original state/focus/selection,
zero-GPU refusal, explicit visible reentry and disposal; it did not rerun every
unchanged workflow. Exactly one generated adoption-v1 optimizer metadata file
was damaged during an earlier retry; original bytes are unavailable and the
old seal is not wholly intact. Fresh isolated proof retained this exception.
See [INT-002](../open-issues.md#int-002---one-phase13-generated-metadata-corruption).

**Evidence storage:** historical raw paths named below refer to the verified
external local archive, not files in this checkout. Only compact verdicts
remain tracked; [archive access, hashes and reproduction](archive-catalog.md).

This includes the bounded Phase 6 compatibility/production measurements,
TODO pilot, accepted Phase 4/5 and preserved Phase 2/3 regressions,
not release or comprehensive manual/device certification.
Accepted Phase6/7/8 tests used installed Google Chrome154.0.8037.98 with explicit
`CanvasDrawElement,ElementCanvasTransform` and experimental-web-platform flags,
clean profiles and headless automation. Exact CDP build and sanitized full
launch arguments are recorded in the independent-layer reports.
The separate parent-owned report below is bounded **headful** automation.
Dependencies are pinned in `package.json`/lockfile; the original registry
verification is retained in `evidence/package-versions.json`.

## Phase9 hardening (accepted-with-limits on actual installed155)

[Independent acceptance](../../evidence/phase9-independent/acceptance-v1.json)
reran React18:21 units/types/build/94 browsers and React19:21 units/types/build/
140 browsers, with zero failures/skips/flaky results. It independently audited
90/40 baseline and90/40 final measurements,20 exact300-GPU-frame effect windows,
four natural-clock300-RAF windows,80 retired lifetimes across both majors,
native/routing/HMR/loss/healthy-retention and final-source raster proof.
This acceptance is bounded, not release readiness or arbitrary compatibility.

**Browser-version gate blocked:** the final raw CDP audit reports installed
Chrome155.0.8059.40 for both genuine Phase8-baseline comparisons and Phase9
runs, including the raster proof. The configured executable path was unchanged;
this writer did not install, download or switch browsers. Observed155 passes
below do not certify the authorized154.0.8037.98 gate. Further browser runs
are stopped after independent acceptance. The coordinator permitted
independent bounded155 checks after the user was unavailable; this is autonomous
continuation, **not explicit user155 approval or154 certification**. No
environment downgrade/profile change was performed. The transition reason/date
is unknown. Baseline/new/final gates record CDP revision
`@cfaadc5a132d78e1828635aa8405a499f3e14864`.

`tests/hardening.test.mjs` adds sixteen serial DPR1/2 cases: keyed membership/
order/position/resize continuity, actual CDP DPR replacement with normal
controller stale-bitmap refusal, pending capture/admission generation races,
rapid replacements/budget refusal, cancellation after a queued public screenshot
with bounded hidden-frame draining, native hover/selection/font/style/rapid
edits and unknown-attribution conservative captures, TODO native task/form
behavior and effects/Dialog/media/layout recovery. CDP DPR can omit native
resolution/resize events; the fixture explicitly invokes ordinary drawing
after that emulation and does not claim a physical-display event.

Final serial implementer gates pass **21 units, types/build and94 shared browser
cases on React18.3.1**, and **21 units, types/build and140 browser cases on
React19.3.0**. Actual mounted production/development versions and identical
shared-source hashes are in the [React18 matrix (archived raw)](archive-catalog.md)
and [React19 matrix (archived raw)](archive-catalog.md).
The first React18 final attempt and focused failures remain preserved: an
admission-cancellation cleanup regression was corrected with bounded hidden
public-frame draining, not resource destruction or relaxed assertions.
Separate independent technical acceptance passed within the actual155 limits above.
Actual known-color/native geometry,
300-frame normal-invalidation intervals followed by changed output, StrictMode/
HMR, twenty retired lifetimes, compile/atomic ownership refusal and healthy
fence/readback tests are preserved, not weakened. The
[baseline-identical DPR2 raster comparison (archived raw)](archive-catalog.md)
was repeated against FINAL source in the
[independent raster proof (archived raw)](archive-catalog.md):
zero differing pixels atDPR1;23249pixels/68851bytes atDPR2, with corresponding
baseline/final PNGs byte-identical. It does not establish text pixel equivalence.
[Adoption](adoption.md) lists exact
unperformed human/device gates. All2469 accepted Git evidence files were
genuinely byte-backed-up before runners; new output uses fresh Phase9 roots.
The [corrected implementation report (archived raw)](archive-catalog.md)
links raw matched measurements and records protected hashes.
The [first report (archived raw)](archive-catalog.md) remains
immutable and predates discovery of the browser-version mismatch; its
unqualified completion label is not an acceptance verdict.

## Phase7 original components and declarative presence

Independently accepted within its bounded scope, with the permanent five-fixture
provenance exception in [measurements](measurements.md); see
[integration.md](integration.md) for exact API/library rationale, reproduction,
pixel/native/lifecycle proof and limitations. Final serial implementer matrices
pass React19's15 units/type/build/114 browser cases and React18's matching
types/build/68 shared cases, including15 integration cases. Actual mounted
versions, resolved Dialog1.2.0/MIT/React18/19 peers and identical shared sources
are recorded under `evidence/phase7/react{18,19}/matrix.json`.

`evidence/phase7/integration/` holds primary actual enter/exit PNGs, native
form/selection/focus/overlay and changed-output reports, atomic enrollment/ref
replacement and20 retired lifetimes, nonidentity affine pointer/keyboard hits,
interruption/cancel/reduced-motion/recovery, group timing/refusal, later CSS/
attribute preservation and parent unmount, genuine diagnostic loss, real HMR
and no-flags native DOM. React18 copies these under
`evidence/phase7/react18/reports/phase7/integration/`.
All four300-frame transition intervals have zero additional committed React
updates/captures/copies/readbacks/uploads and unchanged admission counters;
later content edits still change actual output. Normal invalidation is enabled.
Healthy fence/readback retention regressions pass without unsafe destruction.

This is the listed Radix Dialog pilot, not arbitrary library/CSS compatibility.
Historical Phase6 evidence below is preserved, not overwritten by the new
matrix. No speedup or manual screen-reader/OS IME/physical-device/background-tab
closure is claimed; planned hardening remains [roadmap](roadmap.md) work.

## Phase8 bounded effects

Independently accepted with explicit limits; see the
[Phase8 acceptance summary](../../evidence/phase8-acceptance-summary.json).
Final independent React19 passed21 units/types/build/124 browsers; retained
source-identical React18 passed matching types/build/78 shared browsers.
Direct decoded/native/policy/300-real-RAF proof and bounded smoke passed.
Earlier P8-A1/A2 findings remain immutable. The
[effect contract](../effects.md) describes bounds/order/media/static fallback and
trusted authoring. Ten effect cases extend the matching shared suite to78
browser cases and the full primary suite to124, with21 current units (18 in the
recorded implementation gate plus three subsequent P8-A1 routing units). Selected
Historical Phase8 output is `evidence/phase8/`; default reruns use `evidence/regression/current/`,
never the accepted historical paths below.

Decoded PNGs prove all four preset/custom identities, distinct time, full
dissolve transparency, clipped bounds, both supported sampling/color orders
and exact equality in the essential native-control region. Each build records
five300-frame neutral/effect intervals and one natural RAF motion/effect
interval with no additional commits/captures/copies/readbacks/uploads/
compilation/admission work. Actual content edits remain visible. Compiler
failure is genuine WGSL rejection; missing capability, first-pipeline error
scope, delayed healthy fence and visibility are explicitly synthetic fixtures.
Configured-device destruction is actual loss delivery, not physical reset.
Twenty retired StrictMode lifetimes and actual HMR end with zero ledgers.

Matching-major metadata and reports are linked in [effects](../effects.md).
All955 versioned baseline evidence bytes are protected against new writers,
including the five already-regenerated Phase6 files; that is preservation of
the accepted Git bytes, **not** restoration of their lost original provenance.

## Phase 6 comparison and compatibility

See [measurements.md](measurements.md) for definitions, environment, raw data,
reproduction, unfavorable overhead and all seven original milestone links.
The final primary run passes 15 units, TypeScript/production build and all 99
serial browser cases, including five focused measurement-fixture cases.
The isolated matching React18.3.1/DOM/type fixture passes build/types and the
same53 runtime/animation/TODO browser cases, without source substitutions.
Both majors execute actual production and development StrictMode.

The coordinator independently repeated both matrices and the measurement
smoke, and checked the full comparison's raw counters, samples, statistics
and retired lifetimes. See [independent acceptance](measurements.md#independent-acceptance).
Manual screen-reader, OS IME and physical-device gates remain unverified.

| Requirement | Evidence |
| --- | --- |
| Actual React18/19 versions and behavior | `evidence/phase6/react{18,19}/matrix.json`, React18 `build.log`/`behavior.log`/copied reports, React19 `full.log` |
| Matched production comparison/scaling | `evidence/phase6/performance.json`: 90 settled +90 separate input windows,2/4/8 surfaces,DPR1/2, five variants, three repetitions; full samples/RAF intervals, separate startup/admission |
| Native input to actual changed pixels | Same raw report: 40 original-checkbox trials, screenshot uncertainty intervals; all first-poll lower bounds0, not precise display latency |
| Every measurement retirement | All90 fixture and four TODO latency lifetimes persist zero ledgers; TODO timer/listeners zero |
| Automated headful native/accessible structure | `evidence/phase6-parent-headful.json`: original named textbox/checkbox AX nodes, keyboard Enter/Space, preserved root/input/focus/selection/title after disable, reentry,46,988 art-pixel changes and zero cleanup |
| Compact TODO diagnostics | Existing no-flags case asserts visible input at900x750, status under100px, initially collapsed details with accessible full ledger and visible refusal reason; public probe API unchanged |

No timing interval uses deterministic advance, overlapping browser writers or
suppressed content invalidation. The comparison demonstrates no speedup;
root-wide capture/readback, synchronous CPU work, startup and estimated pixel
storage remain explicit costs. Genuine screen-reader/OS IME/physical-device
checks are unperformed manual gates, not passed synthetic tests.

## TODO application pilot evidence

See [the integration report](todo-pilot.md) for scope, findings and reproduction.
`tests/todo.test.mjs` has seven installed-Chrome browser cases; two reducer
units accompany them. `evidence/todo/` contains ordinary no-flags workflow,
production/StrictMode native workflow/continuity, real-action decorative PNGs
and counters, synthetic capture failure plus real resize/reentry, six-task
capacity and actual Vite HMR retirement reports. The action-induced effect is
held diagnostically for 300 real RAF frames; ordinary 900ms completion is
asserted separately. Every final/retired ledger, app timer and shell listener
must be zero. `evidence/todo-full-regression.log` records the full pilot run;
`evidence/phase45-full-regression.log` retains the prior 13-unit/87-browser gate.

## Phase 4/5 ownership/effect evidence

The new focused suite is `tests/animation.test.mjs`; reports/screenshots below
are under `evidence/animation/`. Existing installed Chrome/flags and pinned
packages are unchanged. The suite directly samples native WAAPI in that
browser before GPU transfer; it does not claim the separate 1,248-sample
reference matrix or unsupported timing/fill modes.

| Requirement | Evidence and bounded claim |
| --- | --- |
| Original CSS and explicit WAAPI ownership | `source-{css,typed}.json` and deterministic PNGs: actual original effect identity, paused detached target/time, neutral captured presentation and red alpha-blended GPU pixels at 100/600/1100/1600ms |
| Native behavior and continuity | Real pointer counter/label, controlled edits and Enter form; same original root/input and hook state after release; exact declarations including important origin restored |
| Easing/phase parity | `native-easing-oracle.json`: 126 direct native/GPU samples, seven easings including valid overshoot, normal/alternate, before-delay/start/iteration/end boundaries, finite two-iteration fill-both; matrices within 0.001 coefficient units, opacity within 0.00005 and GPU RGB within two channels |
| Per-keyframe interpolation | `per-keyframe-easing.json`: six additional actual native/GPU positions across three frames, global ease-in-out plus individual standard/overshooting cubic easing |
| Atomic refusal | `atomic-rejections.json`: unsupported property/percentage/steps/singular path/additive/important opacity/origin/individual transform/overlap; source styles/time/state unchanged; raw CSS variable and precedence rejection, including stylesheet-important overrides identical to the initial phase and conservative imported/scoped-sheet refusal |
| Live exclusive ownership | `owned-conflicts.json`, `changed-css-rule.json`, `owned-visibility-mutation.json`: controller/ripple conflicts preserve state; changed source rules/effect timing restore DOM rather than partially translate |
| Later application writes | `later-declarations-{css,typed}.json`: 75 release/disable/failure subcases preserve values/priorities/removals on both animation-owned controls and GPU-only decoration, unrelated color and actual React-authored opacity; changed priority and live individual translate/rotate/scale diagnose usable same-root DOM; real click/edit/Enter form and final zero ledgers for every subcase |
| Admission-time React update | `later-react-admission-failure.json`: real React opacity update during real native draw rejects admission, preserves the authored value and usable original controls, final zero ledgers |
| Public numeric motion | `numeric-motion.json` and GPU/DOM PNGs: numeric descriptor produces actual alpha-blended pixels and native clicks, same-phase source restoration; invalid descriptor has no source/style/resource side effects, default native timing works, pre-admission repeated recovery preserves later opacity, stale disposal cannot cancel replacement, managed source counts 1 until disposal then 0 |
| Decorative pixels | `ripple-motion-{css,typed}-{false,true}.json` and PNGs: amplitude-zero equals original DOM art pixels, distinct deterministic times change >3000 art pixels; essential-region pixels and both layer matrices remain identical |
| 300 settled frames | Four independent intervals (CSS/typed, production/development StrictMode); exactly 300 added GPU frames, +5000ms source/+5s effect, zero additional actual React commits/captures/copies/native readbacks/uploads, unchanged probe counters |
| Invalidation remains active | Native counter update after measured interval increases content capture work while unchanged decorative upload/texture is retained |
| Repeated transactions | `ownership-cycles-{css,typed}.json`: twenty releases per example, same source/effect/time/exact declarations, each retired GPU ledger zero, owners/effects/replacement references/clock zero; one source association remains |
| Admission failure | `owned-admission-refusal.json`: real no-op capture refuses GPU; original source/declarations/root/input restored, real click/edit/Enter form and zero final resources |
| Actual device loss | `playback-loss.json`: diagnostic explicit public configured-device destruction delivers loss, restores playing source at logical phase and usable DOM; not physical-reset evidence |
| Healthy retained queue | `owned-pending-cleanup.json`: synthetic indefinitely pending healthy fence retains GPU engine, restores source and zero owners/effects before waiting, usable native click, blocked ownership/reentry/disposal; actual destruction later permits cleanup/reentry |
| Policy clock behavior | Play/pause/seek, emulated reduced motion and synthetic `document.hidden` pause; no hidden elapsed catch-up; no physical-background-tab claim |
| Effect-only reduced motion | `effect-only-reduced-motion.json`: no timeline owner, a media change still submits a frame immediately, and decorative pixels exactly equal original DOM identity |
| Cleanup | All focused final disposals assert every core/runtime count and demo listener is zero; previous twenty independent StrictMode lifetime/HMR regressions remain separate |
| Paired development HMR | `paired-hmr.json`: real timestamp-only Vite replacement restores/retires old ownership before mounting the next root; both old ledgers and final resources/listeners zero; HMR resets state |

Frame timing/paint notifications are separately recorded, with bounded samples
and cumulative counts. Admission probe work is not content work; deterministic
screenshots/native oracle reads are verification, outside measured steady-state
intervals. Resource ledgers are not heap or physical-driver profiling.
The refraction has no conventional-DOM equivalent in these demos; essential
React/native behavior is paired, while DOM shows original undistorted decoration.
No performance improvement is inferred.

Final full-run Phase 4/5 settled intervals:

| Example / build | GPU frames | Actual commits | Captures / copies / native readbacks | Uploads |
| --- | --- | --- | --- | --- |
| CSS / production profiling | 18 -> 318 | 1 -> 1 | 22 -> 22 each | 2 -> 2 |
| CSS / development StrictMode | 18 -> 318 | 1 -> 1 | 22 -> 22 each | 2 -> 2 |
| Typed / production profiling | 18 -> 318 | 1 -> 1 | 22 -> 22 each | 2 -> 2 |
| Typed / development StrictMode | 18 -> 318 | 1 -> 1 | 22 -> 22 each | 2 -> 2 |

All four cases observed 10,980 changed decorative pixels from identity to
time zero, and 17,888 between times zero and 0.7 seconds. Essential-region
pixels/geometry stayed unchanged. Each final disposal has zero core/runtime
resources and demo listeners. These totals describe this run, not fixed paint
requirements; the assertions require the full interval's zero-work deltas.

## Preserved Phase 2/3 runtime evidence

| Requirement | Observed result and evidence |
| --- | --- |
| Shared typed runtime | Two/three dynamic enrolled textures, one engine, generated shader bindings; `independent-*.json`, `registry-dirty-races.json` |
| Functional positive admission | Exact known native/GPU marker colors, applied nonidentity native matrix and two interior hits/one exterior miss, before output reveal; `independent-*.json` |
| Nonworking native/GPU methods | Eight no-op/wrong-result capture/upload/geometry/clear fixtures refuse GPU, restore usable original DOM/native edits/form, clean resources and pass restored reentry; `admission-{capture-noop,capture-wrong,gpu-upload-noop,geometry-noop,geometry-wrong,geometry-forged,content-geometry-noop,clear-noop}.json` and PNGs |
| Transparent content | Independent marker passes while actual application capture pixels are all transparent; `admission-transparent.json` |
| Admission readback timing | Synthetic healthy delivery hold retains engine/texture/effect/staging/request until delivered and fenced; `admission-readback-timeout.json`; actual public device destruction during readback recovers without revealing unverified output and settles cleanup; `admission-device-loss.json` |
| Independent motion | Primary translates/scales/rotates while stationary matrix and rendered green marker stay unchanged |
| Actual commits | Public production profiling renderer and subtree Profiler callbacks; positive nested update before measured interval; genuine development root StrictMode |
| Settled 300 frames | Zero additional commits/captures/copies/readbacks/uploads in both builds; before/after and legitimate initial one-frame warm-up recorded |
| Selective content updates | Broad native root paint remains enabled; unchanged stationary pixels retain texture/upload; unaffected captures may still occur |
| Bounded telemetry | Last 256 timing/event samples plus cumulative timing/count aggregates; one retained pixel buffer per live layer |
| Geometry/pixels | Translation, scale, rotation at DPR 1 and 2; native affine/AABB agreement <=1 CSS px and red/white samples 1 CSS px either side of layer edge; `geometry-{1,2}.json` and PNGs |
| Native hit precision | Actual interior button clicks and misses 2 CSS px beyond button edge; Chrome subpixel hit rounding within the one-pixel band is not claimed exact |
| Resize/DPR | Same root, DOM recovery, explicit fresh admission, subsequent native hits; `geometry-*.json`, `opacity-dpr.json` |
| Opacity | Actual shader RGBA pixels against white; stationary pixels unchanged; `opacity.png`, `opacity-dpr.json` |
| Native semantics | Pointer, labels, controlled edits, selection, Tab/Shift+Tab, Enter form submission, Space activation, uncontrolled state and DOM order; `native-semantics.json` |
| Overlay boundary | Native modal/dialog and automatic popover opened/edited/closed through real pointer/keyboard; one fixed external portal target, no duplicate controls |
| Scroll/clipping | Real DOM wheel scrolling; explicit refusal of root/child clipping, nested enrollment, budgets, oversized scaled source and zero size; `conservative-policies.json` |
| Dirty race | Mutation injected after a real snapshot acquisition; later capture observes changed content; explicitly synthetic timing in `registry-dirty-races.json` |
| Extreme finite transforms | Safely normalized huge rotation; rejected overflowing determinant/inverse/origin arithmetic; pure units and unchanged complete prior layer state in `registry-dirty-races.json` |
| Media/visibility | Emulated reduced motion and forced colors; synthetic hidden-state/held-paint fixture aborts paint waits, retains dirty work and pauses/resumes frame-counted motion |
| Actual loss | Public configured device is diagnostically destroyed during motion; real `"destroyed"` loss delivers usable original DOM and fresh reentry; `environment-loss-cycles.json` |
| Healthy retention | Indefinitely pending queue is synthetic; usable native DOM and refusal of unsafe dispose/reentry, released on subsequent actual loss; `typed-pending-cleanup.json` |
| Late initialization | Public adapter result delayed past deadline; serialized disposal unmounts, abandoned engine later released; `typed-late-admission.json` |
| Twenty StrictMode cycles | All twenty retired controller states individually have zero core/runtime resources and demo listeners; replacements separately retain one engine/two layers/stable listeners; final lifetime zero; `environment-loss-cycles.json` |
| Real development HMR | Timestamp-only source touch/restoration drives Vite module replacement; old adapter fully disposed before next mount; `development-hmr.json` |

All paths in this table are under `evidence/runtime/`. Ledgers demonstrate
owned-resource accounting, not a heap profile or physical driver-allocation
measurement. HMR starts a new root lifetime and resets state; runtime recovery
does not remount.

Accepted Phase 2/3 full-run settled intervals (incidental totals can vary with browser
paint; assertions check the deltas):

| Build | GPU frames | Actual React commits | Captures | Pixel copies | Pixel readbacks | Uploads |
| --- | --- | --- | --- | --- | --- | --- |
| Production profiling | 11 -> 311 | 2 -> 2 | 16 -> 16 | 16 -> 16 | 16 -> 16 | 5 -> 5 |
| Development StrictMode | 11 -> 311 | 2 -> 2 | 16 -> 16 | 16 -> 16 | 16 -> 16 | 5 -> 5 |

The preceding initial motion warm-up legitimately added two captures/copies/
readbacks and one subsequent refresh frame before the settled interval began.
Frame sample storage ends at 256 while cumulative frame timing counts reach
311. Both independent cases finish with every core/runtime resource count zero.
The independent functional probe counters in both builds are one capture,
copy, native pixel readback and upload; two GPU frames, one public GPU readback
and one successful geometry check. They remain unchanged across the settled
interval. Native and GPU samples both equal `[207,37,83,255]` and
`[31,179,113,255]`; native hits are `[true,true,false]`. Probe elements/readbacks
and temporary resources are already released before content admission.
These are admission costs, not steady-state content work.

CDP may alter DPR without emitting native resolution events. Those tests also
perform a normal controller operation, proving the stale-dimension guard before
drawing. This is not physical screen migration. Visibility tests intentionally
override `document.hidden` and hold a public paint request; actual
background-tab throttling is unverified.

The public SDK readback has no supported cancellation API. Confirmed device
loss permits GPU release, not a false request completion; a never-settling
readback can remain explicitly owned and block reentry/final disposal. The
actual readback-loss fixture proves the delivery timing it exercises settles,
not every possible pre-service loss timing. Probe hit checks outside the
viewport are explicitly skipped; occluded in-viewport probes refuse admission.

## Preserved historical regressions

`surface.test.mjs` retains twenty-five checks for actual pixels/controls,
300-frame profiling intervals, initial failure, aborted paints, null
configuration, admission/late loss, queued disposal, stale generation and
healthy pending/rejected/delayed fences. Actual loss is covered in production
and development StrictMode, idle and active motion. Native/backend/recovery
probe tests preserve the earlier API and Option 2/3 comparisons.

The historical fixed-subtree fallback and direct cross-owner ElementImage draw
remain failed paths. Neither is used by the typed runtime. The public
owning-canvas -> staging pixels -> dynamic texture bridge was copy-based and is
historical, not the current implementation. The current bounded WebGPU route
uses owning native-paint `GPUQueue.drawElementImageToTexture` uploads to public
dynamic `Texture2D` resources without an owning 2D/staging bridge. Neither this
API change nor the historical measurements establish zero-copy operation or
performance improvement.

## Not established / deliberately deferred

- Other browser builds/devices, everyday-profile flags, broader headful behavior,
  physical GPU reset/driver/browser crashes.
- Actual OS IME and screen-reader/accessibility review. The bounded synthetic
  compositionstart/update/end listener tests preserve eligible original
  INPUT/TEXTAREA GPU capture refresh and existing motion ownership; they are
  untrusted synthetic events, not OS IME/candidate-window completeness evidence.
- Arbitrary framework/hydrated roots, arbitrary portal targets,
  iframe continuity, broad ancestor CSS/stacking/clipping behavior.
- General transformed GPU scrolling/scissoring and universal high-DPR native
  text/capture quality. Recorded bounded same-engine resize/DPR/membership,
  complete-frame publication and original Layer/Replace-ref source tests pass;
  physical seamless presentation and universal layout/device qualification remain
  open. The current bounded viewport implementation measures actual native
  wheel/key/programmatic scroll, original hits and explicit GPU visual clipping
  for adapter-root/enrolled `NativeScroll` at DPR1/2, plus scrolled ref/DPR
  successors. Before GPU exposure admission requires functional native hit
  clipping and matching clipped GPU pixels, not method names alone. An offscreen
  probe refuses admission as explicitly unproven until visible and explicitly
  enabled again; applied matrices cannot substitute for a skipped hit witness.
  Occluded interior witnesses also refuse admission. The accepted bounded
  root/enrolled viewport checkpoint is distinct from the external extension,
  independently accepted at `ab598c00` within its bounded axis-aligned scope.
  Its finite source tests cover the exact
  formerly failing offscreen-to-visible locator workflow, document axes/native
  keyboard/wheel/focus scrolling, one/two-level bordered axis-aligned external
  viewports, live GPU pixels/native clip hits, same-engine internal/ref/DPR/add
  successors while externally scrolled and capture-independent settled motion.
  External projection does not duplicate inherited whole-owner clipping or add
  window offsets. Native border-box registration and GPU bitmap content origin
  are separately measured. Actual Chrome157 replaced-canvas `overflow:auto`
  clips with zero scroll offsets; the failed nonzero-owner attempts and their
  blocked trial freeze remain immutable. `ContentsProperties` ancestry alone
  did not establish that the canvas itself scrolls. Broader transformed chains,
  RTL/writing-mode/zoom and mixed visible/clip axes remain framework boundaries,
  not demonstrated missing Chrome157 functionality
  or unrestricted GPU-first acceptance.
- General CSS/WAAPI translation, arbitrary selectors/cascade/dependencies,
  unbounded effects, animation libraries, motion/layout toolkit, library
  packaging, licensing, publishing or release support.
- Reverse/alternate-reverse, fill modes other than both, negative delay,
  fractional iterations, additive composition and steps/springs.
- Broad browser/device/manual certification, GPU execution timestamps,
  dedicated-host/energy profiling or precise physical presentation latency.

## Reproduce

```sh
npm run test:unit
npm run build
npm run test:browser -- runtime.test.mjs --reporter=list
npm run test:browser -- surface.test.mjs --reporter=list
npm run test:browser -- animation.test.mjs --reporter=list
npm test
npm ci --prefix fixtures/react18 --ignore-scripts
npm run test:react18
npm run test:react19
npm run measure
```

The sanitizing runner preserves failure status and removes private
workspace/profile paths. Retain a responsive existing 5173 dev server; the
runner only stops servers it starts. `evidence/phase45-full-regression.log`
contains the Phase 4/5 full run; `evidence/full-regression.log` preserves the
accepted Phase 2/3 gate, not a substitute for inspecting individual artifacts.
That earlier corrected full run passed seven unit tests, TypeScript/production build
and all sixty-four serial browser cases: twenty-three current runtime,
twenty-five historical surface and sixteen native/backend/recovery cases.
The corrected Phase 4/5 expanded suite had thirteen units and eighty-seven browser
cases, including twenty-three focused Phase 4/5 tests.
The pilot subsequently passed15 units/94 browsers; Phase6's current full
result is [React19 full.log (archived raw)](archive-catalog.md),15 units/99 browsers.
