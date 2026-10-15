/**
 * Library build for `@underglass/ui` (`npm run build` in this package, followed by `tsc` for declarations and
 * `scripts/build-css.mjs` for the token stylesheet): one ES module per subpath, `dist/<subpath>/index.js`. The
 * token JSON is bundled into `dist/tokens/index.js`.
 */
import { defineConfig } from "vite";

export default defineConfig({
  publicDir: false,
  root: import.meta.dirname,
  build: {
    outDir: "dist",
    emptyOutDir: true,
    lib: { entry: { tokens: `${import.meta.dirname}/src/tokens/index.ts` }, formats: ["es"], fileName: (_format, name) => `${name}/index.js` },
    sourcemap: false,
  },
});
