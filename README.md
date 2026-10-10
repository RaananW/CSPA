# CanvasSPA - experimental typed native/GPU runtime

**Phases1-9 are independently accepted within bounded prototype scope, not
production-ready or an unchanged-app loader.** Phase9 acceptance covers actual
installed Chrome155.0.8059.40, React18.3.1/19.3.0 and the declared examples.
The [independent verdict](evidence/phase9-independent/acceptance-v1.json),
[verification matrix](docs/verification.md) and [roadmap](docs/roadmap.md)
describe the scope and remaining gates.

Ordinary DOM is usable without experimental flags. GPU use requires explicit
adoption and functional admission: native capture through its owning2D canvas,
ordinary pixel staging, public Lite textures and one shared WebGPU compositor.
React owns the original controls, descendants and application state. One
persistent root lives in an adapter-owned container; only that container can
move via same-document connected-sibling `moveBefore`. There are no cloned
interactive controls, hidden duplicate trees or silent root replacement.

## Usability today

The prototype supports native pointer/keyboard/input/form/focus/selection,
bounded affine motion, explicit CSS/WAAPI ownership, single-subtree `Presence`,
inert decorative effects and one real Radix Dialog integration using its public
portal-container API. It is useful for evaluating these deliberately adopted
small applications, not for loading arbitrary websites or libraries unchanged.

Membership/order/position/size/DPR changes hide unsafe output and recover the
original usable DOM. Fresh GPU admission is explicit. Unsupported scrolling,
clipping, nesting, capabilities and resource budgets produce diagnostics and
DOM fallback. Healthy pending GPU fences/readbacks retain resources until safe
completion; timeout is not permission to destroy a healthy device.

No capture-cost optimization or speedup has been established: conservative
root-wide capture/readback remains on native edits. Settled supported GPU motion
can run300 frames without additional React commits/capture/copy/readback/upload
or admission work, but that is not a claim about arbitrary content updates.
CPU submission measurements are not GPU execution or physical input latency.
The final-source DPR2 native/GPU text mismatch is baseline-identical
(23249pixels/68851bytes), **not text pixel equivalence**.

Exact Chrome154.0.8037.98 remains **UNVERIFIED**. Autonomous coordinator
continuation on currently installed155 after user unavailability was not
explicit user155 approval or a154 waiver; browser transition cause/date is
unknown. OS IME, actual screen readers, everyday browser profiles, true
background throttling and physical display/device-reset gates remain manual
and unverified. No arbitrary-library/SSR/hydration or release-ready claim follows.
Five Phase6 original fixture reports remain lost (248/253 genuine originals);
regenerated samples and Git preservation do not repair that provenance gap,
and no explicit user supersession approval exists.

## Run and examples

Requires Node20.19+ or22.12+; validation used Node24.19.0/npm11.17.0.
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
| `/todo.html` | Original native task controls with bounded task-triggered artwork |
| `/integration.html` | Authored CSS, original-element refs, Radix Dialog, motion/presence |
| `/effects.html` | Inert ripple/chromatic/dissolve/trusted color effects in one shared pass |
| `/probe.html`, `/recovery.html`, `/surface.html` | Historical feasibility and recovery specimens |

Start with the [API](docs/api.md), [architecture](docs/architecture.md),
[adoption checklist](docs/adoption.md), [integration](docs/integration.md),
[effects](docs/effects.md) and [TODO pilot](docs/todo-pilot.md).
Public exports live in `src/canvas-spa/index.ts`. An explicit outside-root mount
adapter is required; a JSX wrapper never silently relocates React-created nodes.
Layout/styles remain browser CSS, not a replacement layout engine.

## Validation and evidence policy

```sh
npm test
# Run matching-major gates serially, never beside another browser writer:
npm ci --prefix fixtures/react18 --ignore-scripts
npm run test:react18
npm run test:react19
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
