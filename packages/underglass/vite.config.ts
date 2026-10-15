/**
 * Library build for `@underglass/react` (`npm run build` in this package, followed by `tsc` for
 * declarations). The main build emits the root entry `dist/library/index.js`; a plugin then runs
 * separate Vite library builds for the other package exports (`build`, `experimental-worker` and
 * `worker-thread`) into the same directory, so each entry is its own ES module file. The
 * framework-neutral runtime stays in `@underglass/core` and is never bundled here.
 */
import { build, defineConfig } from "vite";

// React is a peer dependency and `@underglass/core` a regular dependency: both resolve from the
// consumer, so every adapter on a page shares one core and one engine.
const external = (id: string) => /^(react|react-dom|@underglass\/core)(\/|$)/.test(id);

export default defineConfig({
  publicDir: false,
  root: import.meta.dirname,
  plugins: [{
    name: "underglass-build-entry",
    // Runs after the root entry is written; `emptyOutDir: false` keeps that output.
    async closeBundle() {
      for (const [name, source] of [["build", "build.ts"], ["experimental-worker", "experimental-worker.tsx"], ["worker-thread", "worker-thread.ts"]] as const) {
        await build({
          configFile: false, root: import.meta.dirname, publicDir: false, logLevel: "warn",
          build: {
            outDir: "dist/library", emptyOutDir: false, sourcemap: false,
            lib: { entry: `${import.meta.dirname}/src/${source}`, formats: ["es"], fileName: name },
            rollupOptions: { external },
          },
        });
      }
    },
  }],
  build: {
    outDir: "dist/library",
    lib: { entry: `${import.meta.dirname}/src/index.ts`, formats: ["es"], fileName: "index" },
    sourcemap: false,
    rollupOptions: { external },
  },
});
