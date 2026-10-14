## 2026-10-14 — CanvasSPA is now Underglass

- Packages: `@underglass/react` (was `@canvas-spa/react`) and `@underglass/css-compiler`
  (was `@canvas-spa/css-compiler`); the library lives in `packages/underglass`.
- Compiler: the config file is `underglass.config.json`, the virtual module
  `virtual:underglass/compiled`, the Vite plugin export `underglass()`, the webpack plugin
  `UnderglassPlugin`.
- `Box` clipping and scrolling markers are `data-underglass-clipped` and `data-underglass-scroll`.
- The Pages workflow derives its base path from the repository name.
- History in `evidence/` and `docs/archive/` keeps the old name.
