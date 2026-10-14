/**
 * Vite config for the public showcase (`npm run dev:showcase`, `build:showcase`, `preview:showcase`).
 * The build output in `dist` is what the Pages workflow deploys; `scripts/check-showcase-assets.mjs`
 * then rejects anything but `index.html` and `assets/*.js|css|jpg`. See `docs/showcase.md`.
 */
import { defineConfig } from "vite";
import { showcaseBase } from "./site-policy.mjs";

export default defineConfig({
  root: import.meta.dirname,
  // `/underglass/` by default; `CANVAS_SHOWCASE_BASE=/` builds for a domain root.
  base: showcaseBase(process.env.CANVAS_SHOWCASE_BASE),
  cacheDir: "../../node_modules/.vite/showcase",
  // The tasks example imports `TodoApp` from the playground sources; dedupe keeps one React copy
  // for it, the library and this app.
  resolve: { dedupe: ["react", "react-dom"] },
  // No source maps in the public build; the asset check refuses source-map references.
  build: { sourcemap: false, outDir: "dist" },
});
