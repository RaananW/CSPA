/**
 * Library build for `@underglass/vue` (`npm run build` in this package, followed by `tsc` for
 * declarations): one ES module, `dist/library/index.js`. Vue is a peer dependency and
 * `@underglass/core` a regular dependency; both resolve from the consumer and are never bundled, so
 * every adapter on a page shares one core and one engine.
 */
import { defineConfig } from "vite";

export default defineConfig({
  publicDir: false,
  root: import.meta.dirname,
  build: {
    outDir: "dist/library",
    lib: { entry: `${import.meta.dirname}/src/index.ts`, formats: ["es"], fileName: "index" },
    sourcemap: false,
    rollupOptions: { external: id => /^(vue|@underglass\/core)(\/|$)/.test(id) },
  },
});
