# CanvasSPA - experimental typed native/GPU runtime

## Interactive example showcase

The separate React example studio in `examples/showcase` presents native
layers, motion, decorative effects and the existing task app in one catalog.
Run `npm run dev:showcase` or `npm run build:showcase`; see the
[showcase and Pages preparation guide](docs/showcase.md).
**GPU demos require Chrome Canary with HTML-in-Canvas enabled**; ordinary DOM
mode works without experimental flags. See the guide for the launch switches.
GitHub Pages deployment is prepared, **not enabled or published**. - experimental typed native/GPU runtime

**CanvasSPA is a GPU-first framework.** Supported React layer, ref and content
updates must remain GPU-presented with fresh pixels, current original native
interaction geometry and no blank application frames. DOM fallback is reserved
for GPU errors or factual lack of required GPU/capture/geometry feature support;
explicit disable/disposal remains caller-owned lifecycle. Normal structure,
layout, DPR, visibility pauses and reduced motion must not themselves revoke
GPU. Every implemented transition, component add/remove/change and undo/redo
flow must run through the continuous-GPU core, not a DOM substitute.
Components should layer GPU visuals and a small typed declarative CSS/JS
fallback over the same standard native React controls/state. Complex GPU visual
apps retaining HTML semantics/input are the target, not certified support for
arbitrary libraries or an automatic CSS translator.
See the [GPU-first contract](docs/architecture.md#gpu-first-contract),
[current open-issues register](docs/open-issues.md)
and [contributor instructions](CONTRIBUTING.md).

**Phases1-9 are independently accepted within bounded prototype scope, not
production-ready or an unchanged-app loader.** Phase9 acceptance covers actual
installed Chrome155.0.8059.40, React18.3.1/19.3.0 and the declared examples.
The [independent verdict](evidence/phase9-independent/acceptance-v1.json),
[verification matrix](docs/verification.md) and [roadmap](docs/roadmap.md)
describe the scope and remaining gates.

Ordinary DOM is usable without experimental flags. GPU use requires explicit
adoption and functional admission: current native paint on its owning
`content="drawable"` GPU canvas, direct public Lite textures and one shared
WebGPU compositor. Owning2D/staging captures are historical, not this route.
React owns the original controls, descendants and application state. One
persistent root lives in an adapter-owned container; only that container can
move via same-document connected-sibling `moveBefore`. There are no cloned
interactive controls, hidden duplicate trees or silent root replacement.

## Repository layout

The private npm workspace root owns tooling, documentation and stable command
entrypoints, not the release identity. `packages/canvas-spa` owns the private
`canvas-spa-phase-one` package, its source, public ESM entry, declarations,
package README and prepack build. `examples/playground` owns the private demo
application and all ten HTML entries. `tests/unit`, `tests/browser` and
`tests/helpers` group the existing coverage; installed public consumers remain
in `fixtures/package-consumer`, and the exact React18 fixture retains its own lock.

Run `npm run dev`, `npm run build`, `npm run test:unit` or
`npm run pack:library` from the checkout root. Dev URLs remain `/runtime.html`,
`/todo.html` and the other existing page names; the playground is Vite's root.
The root Vite config is a compatibility entrypoint, not another application.
Library output is `packages/canvas-spa/dist/library`; playground output is
`examples/playground/dist`. Root `npm pack` is deliberately refused.
Historical acceptance records refer to their exact dated, pre-restructure
layouts and packages, not qualification of newly built workspace artifacts.

## Usability today

An opt-in [build-time CSS compiler](packages/css-compiler/README.md) now provides
JSON selection and production Vite/webpack adapters for a bounded animation
subset, including exported npm stylesheets and the application's Sass/PostCSS
pipeline. Generated WGSL and native-geometry samplers replace runtime animation
compilation on this route; original CSS and controls remain for fallback.
This is experimental implementation, not independent acceptance or a speedup
claim. The compiler is a separate private package in `packages/css-compiler`.

An opt-in [experimental worker compositor](docs/worker.md) now moves uploads,
shared WebGPU rendering and decorative animation scheduling off the main
thread. React, DOM/layout, capture and original controls stay on it; essential
geometry is fixed. The worker uses build-generated WGSL and an app-owned module
worker, not automatic CSS translation. Benchmarks measure clock/submission work,
not a demonstrated CSS speedup or production qualification.

The prototype supports native pointer/keyboard/input/form/focus/selection,
bounded affine motion, explicit CSS/WAAPI ownership, single-subtree `Presence`,
inert decorative effects and one real Radix Dialog integration using its public
portal-container API. It is useful for evaluating these deliberately adopted
small applications, not for loading arbitrary websites or libraries unchanged.

The independently accepted current-spec correction at `cfa9df73` keeps supported membership/ref/layout/
DPR changes in one GPU renderer and synchronously reconciles original native
geometry. Complete cached frames may recompose; new or extent-grown capture
slots retain last complete output until fresh owning native paint. Default
initial admission remains explicit. [Publication and cancellation](docs/api.md#opt-in-settled-readmission-phase12-engineering).
Phase12 **engineering is independently accepted with limits**
([verdict](evidence/phase12-independent/acceptance-summary.json)); full Phase12
production application/hardware and numeric budgets remain open.
That historical acceptance did not establish seamless structural presentation.
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

The later exact Chrome154.0.8037.98 gate remains **UNVERIFIED**. Historical autonomous coordinator
continuation on then-installed155 after user unavailability was not
explicit user155 approval or a154 waiver; browser transition cause/date is
unknown. OS IME, actual screen readers, everyday browser profiles, true
background throttling and physical display/device-reset gates remain manual
and unverified. No arbitrary-library/SSR/hydration or release-ready claim follows.
Five Phase6 original fixture reports remain lost (248/253 genuine originals);
regenerated samples and Git preservation do not repair that provenance gap,
and no explicit user supersession approval exists.
Exactly one Phase13 generated optimizer metadata file was subsequently damaged;
its old seal is not wholly intact and the original bytes are unavailable.
The fresh diagnostic repair was accepted with this explicit exception.
See [permanent integrity exceptions](docs/open-issues.md#permanent-evidence-integrity-exceptions).

**Phase13 selected adoption is qualified-accepted at**
[`12f13661`](https://github.com/RaananW/CSPA/commit/12f13661978a9329331bf881af6aca526402d4d0):
the bounded six-task list/detail workspace, original controlled edits/search,
Radix/native portals and actionable diagnostics. This is client-only adoption,
not arbitrary application or Phase14/release acceptance. Bounded
[Phase14 private release engineering](docs/private-release.md) is now started:
local task-pilot validation and a build-only CI definition, not publication or
production qualification.

## Run and examples

Use Node24 for repository validation (worker source units use Node24 hooks);
validation used Node24.19.0/npm11.17.0.
Dependencies are exact-pinned; the package remains private.

```sh
npm ci --ignore-scripts
npm run dev -- --port 5173 --strictPort
```

Open <http://127.0.0.1:5173/> for the default DOM baseline.

| Example | Purpose |
| --- | --- |
| `/runtime.html` or `/runtime.html?dom` | Typed runtime, enrolled layers, explicit admission/recovery |
| `/paired.html?example=css` or `?example=typed` | Existing CSS or numeric motion, ownership, inert refraction |
| `/todo.html` | Bounded list/detail task workspace, original native forms, portals and decorative artwork |
| `/integration.html` | Authored CSS, original-element refs, Radix Dialog, motion/presence |
| `/integration.html?auto` or `/runtime.html?auto` | Compatibility option specimen; initial enable is explicit, normal updates reconcile without readmission |
| `/effects.html` | Inert ripple/chromatic/dissolve/trusted color effects in one shared pass |
| `/probe.html`, `/recovery.html`, `/surface.html` | Historical feasibility and recovery specimens |

Start with the [API](docs/api.md), [architecture](docs/architecture.md),
[adoption checklist](docs/adoption.md), [integration](docs/integration.md),
[effects](docs/effects.md) and [TODO pilot](docs/todo-pilot.md).
Public exports live in `packages/canvas-spa/src/index.ts`. An explicit outside-root mount
adapter is required; a JSX wrapper never silently relocates React-created nodes.
Layout/styles remain browser CSS, not a replacement layout engine.

Phase10 adds an installable private ESM tarball and declarations, **independently
accepted with limits** ([verdict](evidence/phase10-independent/acceptance-summary.json)). It is prepared, not published or production-ready;
the existing `canvas-spa-phase-one@0.0.0` name/private status and unresolved
license remain. See the standalone [distribution/bootstrap/browser
contract](docs/distribution.md) for local packing, exact contents, matching
React18/19 peers, host CSS and actual installed-consumer verification.
That standalone contract ships in the tarball; other links in this README
describe the repository checkout and its historical evidence.

**Phase11 engineering is independently accepted with limits; human/physical
validation is pending** ([verdict](evidence/phase11-independent/acceptance-summary.json)).
Native editing-boundary admission is hardened and installed React18/19
interaction checks pass. Full Phase11 is incomplete: automated AX, synthetic
composition, emulated media and public-device loss do not certify human/device
behavior. See the [operator checklist](docs/adoption.md).

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
remaining manual gates; [current observation status](docs/adoption.md#user-observations-2026-10-10)
is separate from the automated proof.

## Validation and evidence policy

```sh
npm test
# Run matching-major gates serially, never beside another browser writer:
npm ci --prefix fixtures/react18 --ignore-scripts
npm run test:react18
npm run test:react19
# Actual packed installs, not source aliases; fresh ignored outputs:
CANVAS_EVIDENCE_ROOT=evidence/phase10/my-run npm run test:package
# Optional costly production measurements, not needed for routine changes:
npm run measure
# Before committing, validate the exact staged evidence:
node scripts/check-evidence.mjs
```

Accepted Phase9 gates were21 units/types/build plus94 shared React18 browser
cases and140 React19 cases. The current harness adds one evidence-policy unit.
Both major gates include production profiling and real development StrictMode.
Browser tests use only the installed macOS Google Chrome executable, clean
temporary automation profiles and explicit `CanvasDrawElement`,
`ElementCanvasTransform` and experimental-web-platform flags. They do not
install/download/switch browsers or change everyday profiles. Preview5174 and
dev5173 are started/stopped if owned, or existing responsive servers are reused.
The isolated React18 fixture owns5185/5186 without reuse.

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
measurements. [Bounded Phase12 envelope](docs/measurements.md#phase12-bounded-engineering-envelope).

The [archive catalog](docs/archive-catalog.md) records the genuine external
local byte archive, compact retained verdicts and user-authorized history
rewrite. Raw originals are not in this checkout or promised as a download;
reproduction creates new evidence, not historical originals. The historical
fixed-subtree/direct cross-owner probe remains `BLOCKED`; the supported runtime
uses a different explicit ownership/pixel-transfer path.

See [CONTRIBUTING.md](CONTRIBUTING.md) for focused tests, service ownership,
privacy review and source/docs/tests-plus-curated-verdict staging policy.
Open-source intent is confirmed, but license, publication and release decisions
remain separate.
