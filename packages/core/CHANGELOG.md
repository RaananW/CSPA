# @underglass/core

## 0.1.0

Baseline development version. Never published; recorded here so the first published release has a
starting point.

- The framework-neutral Underglass runtime: one shared WebGPU engine that presents original HTML
  controls through HTML-in-Canvas capture, while native hit testing, focus and input stay on those
  elements. Ordinary DOM is the fallback whenever the browser lacks the required support.
- An adapter-owned mount boundary that moves one persistent framework root between the page and the
  GPU canvas with `moveBefore`, keeping framework state.
- `CanvasRuntime`, `mountApplicationModule` and `createCanvasHosts`; layer registration and
  original-element enrollment; typed transforms with origins; transitions, coordinated motion,
  `Presence` support and ownership of existing CSS/WAAPI animations; decorative ripple and effect
  chains with application WGSL effects.
- `compileStyle` for typed `Layout` and `Appearance`, returning complete string values any
  framework can bind.
- `./build` (compositor and animation generators for build tooling), `./experimental-worker` and
  `./experimental-worker/thread` (the bounded experimental worker compositor).
