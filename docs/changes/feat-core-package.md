## 2026-10-15 — Framework-neutral `@underglass/core`

- The runtime moved into a new private package, `@underglass/core` (`packages/core`): the shared
  GPU engine, renderer, mount boundary, enrollment, motion, effects, typed style compiler, build
  generators and the worker protocol and thread. It imports no UI framework and has no peer
  dependencies, so Vue, Svelte, Astro islands or plain DOM can build on it.
- `@underglass/react` is now the React adapter over core. It depends on `@underglass/core` and
  never bundles it, so every adapter on a page shares one core and one engine. Its public API is
  unchanged: the same root exports, `/build`, `/experimental-worker` and
  `/experimental-worker/thread`, re-exported from core where they are framework-neutral.
- Installing from tarballs now needs both archives (`npm run pack:library` packs both).
- `@underglass/core` adds what framework adapters need: `CanvasRuntime`, `compileStyle`,
  `affine` and `pivot`, and the `CompiledStyle` type.
- `compileStyle` now returns complete string values (`"120px"`, not `120`) and omits unset
  properties, so any framework's style binding or `Object.assign(element.style, style)` applies
  it unchanged. React renders the same CSS as before.
- `@underglass/css-compiler` depends on `@underglass/core` instead of `@underglass/react`.
- No capture, geometry or presentation behaviour changed; the runtime source moved unchanged
  apart from comments and the controller type's new home.
