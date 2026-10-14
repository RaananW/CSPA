# Project history and provenance

This page holds the phase-acceptance narrative, historical browser-gate notes,
evidence/integrity exceptions and user observations that previously made up most
of the [README](../../README.md). The wording is preserved from that README. It is
provenance, not a usage guide. Current open items live in the
[open-issues register](../open-issues.md); test and evidence detail is in
[verification](verification.md) and the [archive catalog](archive-catalog.md).

## Phases 1-9

**Phases1-9 are independently accepted within bounded prototype scope, not
production-ready or an unchanged-app loader.** Phase9 acceptance covers actual
installed Chrome155.0.8059.40, React18.3.1/19.3.0 and the declared examples.
The [independent verdict](../../evidence/phase9-independent/acceptance-v1.json),
[verification matrix](verification.md) and [roadmap](roadmap.md)
describe the scope and remaining gates.

Accepted Phase9 gates were21 units/types/build plus94 shared React18 browser
cases and140 React19 cases. The harness added one evidence-policy unit.
Both major gates include production profiling and real development StrictMode.

## Phase 10 - private distribution

Phase10 adds an installable private ESM tarball and declarations, **independently
accepted with limits** ([verdict](../../evidence/phase10-independent/acceptance-summary.json)). It is prepared, not published or production-ready;
the existing `canvas-spa-phase-one@0.0.0` name/private status and unresolved
license remain. See the standalone [distribution/bootstrap/browser
contract](../distribution.md) for local packing, exact contents, matching
React18/19 peers, host CSS and actual installed-consumer verification.
That standalone contract ships in the tarball; other links describe the
repository checkout and its historical evidence.

Rename (2026-10-14): the private library workspace `canvas-spa-phase-one@0.0.0`
is now `@canvas-spa/react@0.1.0` (still `private`, unpublished); older entries and
evidence keep the name used at the time.

## Phase 11 - native editing hardening

**Phase11 engineering is independently accepted with limits; human/physical
validation is pending** ([verdict](../../evidence/phase11-independent/acceptance-summary.json)).
Native editing-boundary admission is hardened and installed React18/19
interaction checks pass. Full Phase11 is incomplete: automated AX, synthetic
composition, emulated media and public-device loss do not certify human/device
behavior. See the [operator checklist](adoption.md).

## Phase 12 - opt-in settled readmission

The independently accepted current-spec correction at `cfa9df73` keeps supported membership/ref/layout/
DPR changes in one GPU renderer and synchronously reconciles original native
geometry. Complete cached frames may recompose; new or extent-grown capture
slots retain last complete output until fresh owning native paint. Default
initial admission remains explicit. [Publication and cancellation](../api.md#opt-in-settled-readmission-phase12-engineering).
Phase12 **engineering is independently accepted with limits**
([verdict](../../evidence/phase12-independent/acceptance-summary.json)); full Phase12
production application/hardware and numeric budgets remain open.
That historical acceptance did not establish seamless structural presentation.

### Historical flicker narrative

The historical automatic readmission path visibly flickered on runtime **Layer**
and integration **Replace ref**. Its bounded replacement and native editing/
viewport proof were independently accepted at `cfa9df73`; ordinary external
axis-aligned scroll was accepted at `ab598c00`. Physical display/text/
accessibility and performance budgets remain open.
The proposed permanent-DOM restriction was rejected and never merged.
Out-of-contract scrolling,
clipping, nesting, missing capabilities and declared resource bounds produce diagnostics and
DOM fallback. Healthy pending GPU fences/readbacks retain resources until safe
completion; timeout is not permission to destroy a healthy device.

No capture-cost optimization or speedup has been established: conservative
root-wide direct native uploads remain on native edits. Settled supported GPU motion
can run300 frames without additional React commits/capture/copy/readback/upload
or admission work, but that is not a claim about arbitrary content updates.
CPU submission measurements are not GPU execution or physical input latency.
The historical final-source DPR2 native/GPU text mismatch was baseline-identical
(23249pixels/68851bytes), **not text pixel equivalence**.

## Phase 13 - selected task workspace

**Phase13 selected adoption is qualified-accepted at**
[`12f13661`](https://github.com/RaananW/CSPA/commit/12f13661978a9329331bf881af6aca526402d4d0):
the bounded six-task list/detail workspace, original controlled edits/search,
Radix/native portals and actionable diagnostics. This is client-only adoption,
not arbitrary application or Phase14/release acceptance.

## Phase 14 - private release engineering

Bounded [Phase14 private release engineering](private-release.md) is started:
local task-pilot validation and a build-only CI definition, not publication or
production qualification.

## Accepted commit references

| Commit | Scope |
| --- | --- |
| `cfa9df73` | Bounded structural/native viewport correction (same-owner membership/geometry, complete-frame successors, native editing) |
| `ab598c00` | Ordinary external axis-aligned scroll projection and native content-origin correction |
| `12f13661` | Selected Phase13 task workspace and diagnostic repair |

## Historical browser gates

The later exact Chrome154.0.8037.98 gate remains **UNVERIFIED**. Historical autonomous coordinator
continuation on then-installed155 after user unavailability was not
explicit user155 approval or a154 waiver; browser transition cause/date is
unknown. OS IME, actual screen readers, everyday browser profiles, true
background throttling and physical display/device-reset gates remain manual
and unverified. No arbitrary-library/SSR/hydration or release-ready claim follows.

Earlier test-harness notes: browser tests then used only the installed macOS
Google Chrome executable, with clean temporary automation profiles and
explicit `CanvasDrawElement`, `ElementCanvasTransform` and
experimental-web-platform flags. Current launch behavior is described in
[CONTRIBUTING](../../CONTRIBUTING.md#setup).

## Evidence integrity exceptions

Five Phase6 original fixture reports remain lost (248/253 genuine originals);
regenerated samples and Git preservation do not repair that provenance gap,
and no explicit user supersession approval exists.
Exactly one Phase13 generated optimizer metadata file was subsequently damaged;
its old seal is not wholly intact and the original bytes are unavailable.
The fresh diagnostic repair was accepted with this explicit exception.
See [permanent integrity exceptions](../open-issues.md#permanent-evidence-integrity-exceptions).

## User observations, 2026-10-10

User observations on 2026-10-10 report working keyboard interaction, useful
everyday-profile DOM with an error on requesting GPU, and usability after
leaving the application and returning. Moving between displays reportedly
returns to DOM and stops animations/effects: layout/DPR recovery intentionally
required explicit fresh GPU admission in the observed Phase11 build, not
automatic restart. Phase12's new opt-in does not retroactively change this
observation or certify physical display behavior. Retention of
application values during that physical move is still unconfirmed.
Screen-reader and OS IME checks could not be performed on the Mac.
These reports lack exact browser/mode/timing/DPR details and do not close the
remaining manual gates; [current observation status](adoption.md#user-observations-2026-10-10)
is separate from the automated proof.

## Evidence policy

Raw screenshots, logs, per-run reports and full performance samples are
**ignored, not committed**. Writers still default to
`evidence/regression/current`; explicitly select fresh
`CANVAS_EVIDENCE_ROOT=evidence/phase9/<distinct-run>` or
`evidence/phase9-independent/<distinct-run>` when needed. Named-root/traversal
protection and selected-root sanitization remain intact. Never overwrite
completed evidence or sanitize historical archives.
Phase10 package/acceptance writers also share the same validator for
`evidence/phase10/<distinct-run>` and `evidence/phase10-independent/<distinct-run>`.
Phase11/12 and their `-independent` counterparts use that same validator;
use fresh Phase12 roots for `dynamic.test.mjs` and `CANVAS_DYNAMIC_AUDIT=1`
installed-consumer checks. Never run browser/package checks beside timing
measurements. [Bounded Phase12 envelope](measurements.md#phase12-bounded-engineering-envelope).

The [archive catalog](archive-catalog.md) records the genuine external
local byte archive, compact retained verdicts and user-authorized history
rewrite. Raw originals are not in this checkout or promised as a download;
reproduction creates new evidence, not historical originals. The historical
fixed-subtree/direct cross-owner probe remains `BLOCKED`; the supported runtime
uses a different explicit ownership/pixel-transfer path.

Optional validation commands that write evidence:

```sh
npm ci --prefix fixtures/react18 --ignore-scripts
npm run test:react18
npm run test:react19
CANVAS_EVIDENCE_ROOT=evidence/phase10/my-run npm run test:package
npm run measure
node scripts/check-evidence.mjs   # validate exact staged evidence before committing
```

## Experiments recorded 2026-10-12

The opt-in [build-time CSS compiler](../../packages/css-compiler/README.md) and
[experimental worker compositor](../worker.md) are implementer-verified, not
independently accepted, and not a measured CSS speedup. Details are in
[open-issues](../open-issues.md) and [verification](verification.md#experimental-worker-compositor).
