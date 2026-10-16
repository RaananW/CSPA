/**
 * Library build for `@underglass/ui` (`npm run build` in this package, followed by `tsc` for declarations and
 * `scripts/build-css.mjs` for the stylesheets): one ES module per subpath, `dist/<subpath>/index.js`. The token JSON
 * is bundled into the tokens module. React and Vue are optional peers and are never bundled.
 */
import { defineConfig } from "vite";

const entry = (name: string) => `${import.meta.dirname}/src/${name}/index.ts`;

export default defineConfig({
  publicDir: false,
  root: import.meta.dirname,
  build: {
    outDir: "dist",
    emptyOutDir: true,
    lib: { entry: { tokens: entry("tokens"), dom: entry("dom"), react: entry("react"), vue: entry("vue") }, formats: ["es"], fileName: (_format, name) => `${name}/index.js` },
    sourcemap: false,
    // Framework peers resolve from the consumer and are never bundled.
    rollupOptions: { external: id => /^(react|react-dom|vue)(\/|$)/.test(id) },
  },
});
