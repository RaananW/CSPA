# Contributing to CanvasSPA

The intended direction is open-source software, but this folder is currently
an experimental private package, not a published library. License selection,
repository publication and release policy are unresolved. No maintainer or
security contact is designated here.

Start with [README.md](README.md), the maintained
[architecture/lifecycle/mount contract](docs/architecture.md), and the
[typed API](docs/api.md), [verification matrix](docs/verification.md), and
[feasibility/evidence report](docs/feasibility.md). Current supported behavior
is the bounded `/runtime.html` typed runtime and `/paired.html?example=css`
or `?example=typed` ownership/refraction examples; `/probe.html`, `/surface.html` and `/recovery.html`
retain historical experiments, not alternative production implementations.
The [TODO pilot](docs/todo-pilot.md), `/todo.html`, integrates the same public
API into a bounded application rather than another counter fixture.
The [Phase 6 report](docs/measurements.md) documents actual React18/19 behavior,
production comparisons, raw samples and still-unperformed manual gates.
The [Phase7 integration](docs/integration.md), `/integration.html`, adds
original-element refs, Radix Dialog and bounded motion/presence; the
[public roadmap](docs/roadmap.md) separates implemented contracts from planned
Phase9. The [Phase8 effects](docs/effects.md), `/effects.html`, use the same
shared compositor and add a trusted application color-function extension.
Phase8 is independently accepted with explicit limits; the
[final verdict](evidence/phase8-independent/acceptance-v3.json) preserves earlier
routing findings and does not close manual/device or release gates.

## Private phase history

The user-authorized history remote is private
[`RaananW/CSPA`](https://github.com/RaananW/CSPA), `origin`
`https://github.com/RaananW/CSPA.git`, on `main`. Commit and normally push each
phase **after separate technical acceptance**, not during an unfinished phase.
The first accepted commit
includes the preexisting accepted Phases1-6 baseline plus Phase7; do not
fabricate retrospective phase commits. Later accepted phases get individual
commits. Inspect the exact staging set for secrets, private local paths and
generated artifacts; retain intentional sanitized evidence, keep dependencies,
caches and browser profiles ignored, include the standard Copilot coauthor
trailer, verify the remote stays private and verify matching local/remote main
SHAs after push. Do not advance phases until this verification. This is private
history tracking, not authorization to select a license, publish a package,
make the repository public or modify upstream engines.

## Setup

Use Node 20.19+ or 22.12+; validation used Node 24.19.0/npm 11.17.0.
Install the exact lockfile versions:

```sh
npm ci --ignore-scripts
npm run dev -- --port 5173 --strictPort
```

The landing page is usable ordinary DOM. `/runtime.html?dom` starts the
typed specimen in ordinary DOM; `/runtime.html` requests GPU admission.
Unsupported features must give an explicit diagnostic and usable DOM, not
fake GPU success.

Browser validation is intentionally restricted to the installed executable
`/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`, currently tested
at 154.0.8037.98. **Do not install/download a Playwright browser or switch builds
to make tests pass.** Tests launch clean temporary profiles with explicit
`CanvasDrawElement,ElementCanvasTransform` and experimental-web-platform flags.
They neither modify nor establish the flags of an everyday user profile.
The configuration uses one worker and DPR 1, except native-only and integrated-runtime geometry tests that also exercise
DPR 2. CDP DPR/visibility/fence fixtures are labelled, not physical-device or
actual background-tab evidence.

## Validation

```sh
# Small independent geometry/ledger tests:
npm run test:unit
# TypeScript plus production build:
npm run build
# Integrated capture, 300-frame caching, loss and mount-boundary gates:
npm run test:browser -- runtime.test.mjs --reporter=list
# Preserved historical surface regressions:
npm run test:browser -- surface.test.mjs --reporter=list
# Transactional source, actual easing/pixel parity and decorative effect gates:
npm run test:browser -- animation.test.mjs --reporter=list
# Real TODO workflows, task-triggered pixels, fallback and HMR cleanup:
npm run test:browser -- todo.test.mjs --reporter=list
# Original refs, Radix overlay, affine motion/presence and retired lifetimes:
npm run test:browser -- integration.test.mjs --reporter=list
# Bounded effects, trusted compilation, decoded pixels and healthy fencing:
npm run test:browser -- effects.test.mjs --reporter=list
# Matched production fixture pixels, public operation sink and cleanup:
npm run test:browser -- performance.test.mjs
# Deterministic synthetic cleanup cases only:
npm run test:browser -- surface.test.mjs --grep 'fence|old-generation'
# Entire current regression suite:
npm test
```

Build before production browser tests. Playwright starts a preview on 5174 and
development server on 5173, or reuses existing responsive servers. It stops
servers it started, not a user's existing development server. Do not run
competing suites/server starts against these ports; evidence filenames are
shared and runs are serial.

The full suite currently has twenty-one unit tests and 124 browser tests;
the current runtime suite has twenty-three and the historical surface suite
twenty-five; twenty-three exercise the paired Phase 4/5 contract. Production-profiling and real
development StrictMode both assert at least 300 GPU-only frames with zero
additional committed React updates, captures, pixel copies and uploads.
Ordinary input/paint invalidation is not disabled to satisfy the assertion.
Positive commit controls and recorded initial geometry warm-up precede the
settled interval. Root-wide native paint is not suppressed; pixel comparisons
retain unchanged uploads while captures/readbacks remain visible.
Functional admission has its own probe counters; assert those also remain
unchanged during settled motion. Method names or opaque first application
pixels are not acceptance substitutes. No-op/wrong-result native and GPU
fixtures must restore the original usable DOM and clean their resources.
Twenty-lifetime assertions inspect each **retired** controller's ledgers/demo
listeners, separately from the new controller's constant active counts.
Ownership tests inspect actual original Animation/KeyframeEffect references,
detached source states, canonical matrices, native WAAPI samples and rendered
GPU pixels; mocks of a translation result are not substitutes. Keep unsupported
raw CSS dependencies, important precedence, additive effects and overlapping
owners atomic. Canonicalize harmless browser transform serialization differences,
not variable dependencies. Repeated CSS transactions must retire their bounded
replacement references. Decorative tests must prove identity, distinct time
pixels, undistorted essential controls and zero extra work over 300 frames.
Test restored native source behavior even while healthy GPU cleanup is pending.
Test later direct and actual React presentation updates, removals and priority
changes through release, disable, failure and repeated recovery: only
still-owned properties may be restored. Live individual transform changes
must diagnose usable DOM while preserving the authored declaration. Numeric
motion descriptors must prove default timing, atomic compiler rejection,
actual GPU/DOM pixels and source accounting independently of CSS/WAAPI
compatibility fixtures; stale handles must not cancel replacement sources.

The TODO pilot adds two reducer units and seven browser cases. Its 300-frame
measurement deliberately holds a real action-triggered effect through a
diagnostic facade; a separate subsequent action must finish naturally after
900ms. Keep that distinction explicit. Application code belongs in
`src/apps/todo/`; profiling, deterministic clocks and fault injection do not.
Phase7 adds fifteen browser cases, including actual nonidentity native input
hits, enter/exit pixels, interrupted exits, shared epochs/stagger, later authored
declarations, parent unmount, real HMR and diagnostic public device loss. Its
60000ms transition is held for a measured 300-frame interval, not presented
as a natural 800ms exit. Keep the independent completion/pixel cases separate.
Phase8 adds ten browser cases. Effect identity, time, bounds, alpha and both
sampling/color orders use decoded PNG pixels. Each production/development build
measures five300-frame neutral/effect intervals plus one actual motion/effect
interval, with normal invalidation and unchanged compilation/admission counters.
Content updates must still change actual output. Label synthetic missing
capability/error-scope/visibility/fence timing distinctly from genuine shader
compile failure and diagnostic device loss.

### Compatibility and measurement writers

```sh
npm ci --prefix fixtures/react18 --ignore-scripts
npm run test:react18
npm run test:react19
npm run measure
```

Do not change main dependency pins to run the isolated React18 fixture.
Matching React/DOM18.3.1 and types18.3.31/18.3.7 are declared in its own
manifest/lockfile; ignored copied source resolves these dependencies without
implementation substitutions. Its fresh services5185/5186 refuse reuse.
The exact-pinned `@radix-ui/react-dialog`1.2.0 dependency is also declared and
resolved in both fixtures; matching types/React do not come from the primary.
`test:react19` runs the complete primary suite and records actual mounted
production/development versions; it retains the existing dev5173 ownership.
Injected root factories must use their matching public `flushSync`; see
[API bootstrap](docs/api.md#explicit-bootstrap).

The production runner owns free preview5287 (configurable with
`CANVAS_MEASURE_PORT`),90 settled and90 native-input windows plus40 TODO
pixel-detection trials. Keep all writers serial and close bounded helpers.
Use full-window opt-in samples, not last256 p95; preserve admission/startup
separation, native-readback costs, per-retirement ledgers and loose screenshot
latency bounds. Public CPU timing is not GPU execution or total browser paint;
estimated RGBA capacities are not heap/driver memory.

The browser runner forwards selectors/options to Playwright and preserves its
exit status. It then runs `scripts/sanitize-evidence.mjs`, including on test
failure, to redact workspace/home/temporary profile paths in JSON and log
evidence, plus unrelated private-registry URLs in local npm warnings.
If sanitization fails, that is a runner failure, not a passing suite.
After an outer redirected log writer exits, sanitize once more; it can append
an error tail after the inner runner's cleanup. New browser/matrix reports
default to `evidence/regression/current`; use `CANVAS_EVIDENCE_ROOT=evidence/phase8`
for implementation evidence or `CANVAS_EVIDENCE_ROOT=evidence/phase8-independent`
for the isolated acceptance window. Both exact roots and their descendants are
supported by test/matrix/reporter/sanitizer and probe routing. Use a fresh
destination and never point a writer at evidence being protected.
Only the named roots are writable. Probe output defaults to the selected root's
`chrome/` directory; performance fixtures/full/smoke follow the selected
root's `performance/` directory (`evidence/regression/current/performance` by default).
The sanitizer visits only the selected root.
All versioned historical evidence, including Phase6/7 and independent findings,
is read-only: byte-backup/hash before runs and audit afterward. The permanent
five-original-fixture gap disclosed in [measurements](docs/measurements.md)
is not repaired or waived by this routing.
Inspect generated artifacts before sharing: this path redactor is **not** a
general secret detector. Do not publish raw user profiles, local absolute
paths, credentials or unrelated machine configuration.

## Reproduction and evidence

Historical accepted API evidence is under `evidence/runtime/`; new reruns use
`evidence/regression/current/runtime/` or the selected phase root: independent production/
StrictMode intervals, geometry at DPR 1/2, opacity/emulated DPR changes,
native semantics/overlays, conservative policy refusal, registry/dirty races,
environment/loss/twenty-cycle accounting, typed pending cleanup, abandoned
admission, functional `admission-*.json` cases and real Vite HMR. Inspect the
native/GPU marker samples, geometry/hit checks and temporary probe ledgers,
as well as content counters. Readback holds are synthetic timing; diagnostic
device destruction delivers genuine WebGPU loss, not a physical GPU reset.
Pending SDK readbacks must not be relabeled completed after loss just to make
cleanup zero. See [verification.md](docs/verification.md) for
which fixtures are synthetic. HMR tests touch/restore only the demo source
timestamp; they verify actual module replacement rather than a full reload.
HMR deliberately starts a new root lifetime and resets demo state.

The following reports preserve the earlier integration gate:

`evidence/surface/production.json` and `development-strict.json` record actual
CDP build/launch information, before/after counters, errors and cleanup.
Event-driven capture totals may vary; assert interval deltas and consult the
actual report rather than hardcoding incidental total paint counts.
`device-loss-{false,true}-{false,true}.json` and matching DOM/reentry PNGs
record genuine `device.lost` delivery after diagnostic-only public destruction.
`synthetic-fence-*.json`, `synthetic-healthy-delayed-fence.json` and
`synthetic-late-generation-loss.json` explicitly label synthetic fault timing.
The latter deliberately delays an old lifetime's actual disposal-loss delivery.
`admission-loss-and-serialization.json` and `mount-boundary-rejections.json`
record the remaining admission/ownership gates.

For historical native API, fixed-subtree fallback and serial public-backend
probes, build/start preview5174, then run:

```sh
npm run probe
NO_NATIVE_FLAGS=1 EVIDENCE_DIR=evidence/regression/current/chrome-no-flags npm run probe
node scripts/sanitize-evidence.mjs
```

Stop a manually started preview when finished. The old probe's `BLOCKED`
verdict is expected for its fixed-subtree recovery/direct cross-owner snapshot
path; it does not supersede the new owning-canvas pixel-copy/stable-root path.

## Change boundaries

Preserve one authoritative React control tree and one shared GPU engine.
Keep reusable lifecycle/ownership code separate from demo profiling and fault
injection. Use public engine/browser APIs, typed capability checks, explicit
errors and bounded waits. Never replace healthy timed-out fencing with unsafe
destruction merely to report zero resources. Exercise real rendered pixels
and native pointer/keyboard input for behavior claims, not `element.click()`.

Keep source changes scoped, update maintained contracts and distinguish actual
loss from synthetic failures. No new reconciler, CSS normalization engine,
generic toolkit, package proliferation, private device access or broad
compatibility claim belongs to this gate. Do not infer release readiness from
passing headless specimen tests.
