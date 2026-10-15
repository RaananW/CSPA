## 2026-10-15 — Vue adapter `@underglass/vue`

- New private package `@underglass/vue` (`packages/vue`), the Vue 3 adapter over `@underglass/core`
  with a `vue@^3.5` peer: `mountCanvasApp(options, RootComponent, rootProps?)`, `Surface`, `Box`,
  `NativeScroll`, `NativeOverlay` (a `Teleport` to the overlay host), `Presence` (emits `complete`),
  `useSurfaceRef`, `useGPUHost` and `useNativeOverlayHost`. It depends on core and never bundles it.
- Vue re-applies every key of a style object on each patch, so the Vue `Surface` leaves
  `transform-origin` to the runtime instead of binding it. Binding `transform`, `opacity` or
  `transform-origin` on any layer element turns GPU off; the guide says so.
- New playground page `vue.html`, the shared framework-adapter app in Vue with a ref-enrolled
  section, `Presence` and a `NativeOverlay` dialog. `tests/browser/vue.test.mjs` runs the shared
  contract at DPR 1 and 2 and checks `Presence` and `NativeOverlay` under GPU presentation.
- `npm run build:library`, `pack:library` and `typecheck` cover the Vue package; its archive has
  an exact allowlist. Vue 3.5.43 is pinned for the playground and tests.
- Not yet covered: an installed-tarball Vue consumer gate like `test:package`, Vue SSR/hydration, and
  Nuxt. See the open issues.
