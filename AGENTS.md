# CanvasSPA agent instructions

CanvasSPA is a **GPU-first framework**. Read [README.md](README.md),
[CONTRIBUTING.md](CONTRIBUTING.md) and the
[GPU-first contract](docs/architecture.md#gpu-first-contract) before changing it.

The root is private tooling, not the release package. Library source/manifest/
build belong to `packages/canvas-spa`; engineering HTML/app/demo/probe sources
belong to `examples/playground`, and the public-facing React gallery belongs to
the private `examples/showcase` workspace. Tests are grouped under `tests/unit`, `tests/browser`
and `tests/helpers`; exact React18 remains a separately locked fixture.
Keep root scripts and canonical page URLs stable, and pack only the child
library workspace. Historical accepted seals identify their original layouts,
not newly built workspace artifacts.

Before every capture, geometry or presentation change, ALWAYS check the latest
[WICG HTML-in-Canvas proposal](https://github.com/WICG/html-in-canvas) and
[Chromium feature/bug hotlist](https://issues.chromium.org/hotlists/6783002),
including relevant ElementCanvasTransform issues. Record the proposal SHA/date,
tracker access limits, landed fixes and actual queried browser build separately.
Historical evidence and a fixed issue status do not qualify the installed
browser. Verify current APIs with functional pixel/native-hit probes; do not
silently substitute deprecated syntax or infer support from property presence.

Supported React layer, ref and content updates must remain GPU-presented with
fresh pixels, current original native interaction geometry and no blank
application frames. Permanent DOM fallback for normal supported updates is not
a fix. Once GPU is enabled, only a GPU error or factual lack of required
GPU/capture/geometry feature support justifies diagnosed fallback. Explicit
disable/disposal remains caller-owned lifecycle. Normal structure/layout/DPR
updates, visibility pauses and reduced motion must not themselves revoke GPU.
Every implemented transition, component add/remove/change and undo/redo flow
must use the continuous-GPU core. Do not relabel missing framework
implementation as unsupported browser capability.

Preserve React's original control tree/state, adapter-owned root-container
boundary, one shared renderer, public APIs and the typed no-handwritten-CSS
authoring goal. Do not clone controls, cover updates with stale pixels, debounce
diagnostics to mask flicker or weaken hit-geometry safety.

The bounded structural/native viewport correction is independently accepted at
`cfa9df73`, external axis-aligned scroll at `ab598c00`, and the selected Phase13
task workspace/diagnostic repair at `12f13661`. Preserve those qualified
contracts; [open issues](docs/open-issues.md) records broader and historical gates.
For new capture/presentation changes, prove the needed public mechanism;
do not assume a browser API or React patch is available or required. Acceptance must verify GPU
remains active through supported updates, fresh rendered pixels and correct
original native hits. Fallback-only tests cannot satisfy that gate.
Components should layer GPU support and a small typed declarative CSS/JS
fallback over their standard native React implementation, sharing the same
original controls/state. Complex GPU visual apps with native HTML advantages
are the target, not a currently certified capability or automatic library adapter.
