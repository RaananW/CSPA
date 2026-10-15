# @underglass/vue

## 0.1.0

Baseline development version. Never published; recorded here so the first published release has a
starting point.

- Vue 3.5 adapter over `@underglass/core`: `mountCanvasApp`, `Surface`, `Box`, `NativeScroll`,
  `NativeOverlay`, `Presence` (emits `complete`), `useSurfaceRef`, `useGPUHost` and
  `useNativeOverlayHost`, with Vue state and the original controls kept across GPU admission,
  recovery and disposal.
- Re-exports the framework-neutral helpers and types of `@underglass/core`.
