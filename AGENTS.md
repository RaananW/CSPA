# CanvasSPA agent instructions

CanvasSPA is a **GPU-first framework**. Read [README.md](README.md),
[CONTRIBUTING.md](CONTRIBUTING.md) and the
[GPU-first contract](docs/architecture.md#gpu-first-contract) before changing it.

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

The current structural re-admission flicker is unresolved. Prove the needed
public capture/presentation mechanism before claiming a fix; do not assume a
browser API or React patch is available or required. Acceptance must verify GPU
remains active through supported updates, fresh rendered pixels and correct
original native hits. Fallback-only tests cannot satisfy that gate.
Components should layer GPU support and a small typed declarative CSS/JS
fallback over their standard native React implementation, sharing the same
original controls/state. Complex GPU visual apps with native HTML advantages
are the target, not a currently certified capability or automatic library adapter.
