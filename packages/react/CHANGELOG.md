# @underglass/react

## 0.1.0

Baseline development version. Never published; recorded here so the first published release has a
starting point.

- React 18.3.1 and 19 adapter over `@underglass/core`: `mountCanvasApp`, `GPUHost`, `Surface`,
  `Box`, `NativeScroll`, `NativeOverlay`, `Presence`, `useSurfaceRef`, `useGPUHost` and
  `useNativeOverlayHost`, with React state and the original controls kept across GPU admission,
  recovery and disposal.
- Re-exports the framework-neutral helpers and types of `@underglass/core`, plus its `./build` and
  `./experimental-worker/thread` entries; `./experimental-worker` adds the React worker controller.
