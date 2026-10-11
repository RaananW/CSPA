# CanvasSPA agent instructions

CanvasSPA is a **GPU-first framework**. Read [README.md](README.md),
[CONTRIBUTING.md](CONTRIBUTING.md) and the
[GPU-first contract](docs/architecture.md#gpu-first-contract) before changing it.

Supported React layer, ref and content updates must remain GPU-presented with
fresh pixels, current original native interaction geometry and no blank
application frames. Permanent DOM fallback for normal supported updates is not
a fix. DOM fallback is for genuine unsupported capabilities, unsafe conditions,
failures or explicit disable.

Preserve React's original control tree/state, adapter-owned root-container
boundary, one shared renderer, public APIs and the typed no-handwritten-CSS
authoring goal. Do not clone controls, cover updates with stale pixels, debounce
diagnostics to mask flicker or weaken hit-geometry safety.

The current structural re-admission flicker is unresolved. Prove the needed
public capture/presentation mechanism before claiming a fix; do not assume a
browser API or React patch is available or required. Acceptance must verify GPU
remains active through supported updates, fresh rendered pixels and correct
original native hits. Fallback-only tests cannot satisfy that gate.
