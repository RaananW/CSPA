/**
 * Library build for `@underglass/react` (`npm run build` in this package, followed by `tsc` for
 * declarations). The main build emits the root entry `dist/library/index.js`; a plugin then runs
 * separate Vite library builds for the other package exports (`build`, `experimental-worker` and
 * `worker-thread`) into the same directory, so each entry is its own ES module file.
 */
import { build, defineConfig } from "vite";

export default defineConfig({
  publicDir: false,
  root: import.meta.dirname,
  plugins: [{
    name: "underglass-build-entry",
    // Runs after the root entry is written; `emptyOutDir: false` keeps that output.
    async closeBundle() {
      // The build-only entry declares no externals: its sources import nothing from React and
      // only types from Lite, so the emitted module is self-contained for Node build scripts.
      await build({
        configFile: false, root: import.meta.dirname, publicDir: false, logLevel: "warn",
        build: {
          outDir: "dist/library", emptyOutDir: false, sourcemap: false,
          lib: { entry: `${import.meta.dirname}/src/build.ts`, formats: ["es"], fileName: "build" },
        },
      });
      for (const [name, source] of [["experimental-worker", "experimental-worker.tsx"], ["worker-thread", "worker-thread.ts"]] as const) {
        await build({
          configFile: false, root: import.meta.dirname, publicDir: false, logLevel: "warn",
          build: {
            outDir: "dist/library", emptyOutDir: false, sourcemap: false,
            lib: { entry: `${import.meta.dirname}/src/${source}`, formats: ["es"], fileName: name },
            rollupOptions: { external: id => /^(react|react-dom)(\/|$)/.test(id) || id === "@babylonjs/lite" },
          },
        });
      }
    },
  }],
  build: {
    outDir: "dist/library",
    lib: { entry: `${import.meta.dirname}/src/index.ts`, formats: ["es"], fileName: "index" },
    sourcemap: false,
    rollupOptions: {
      // React is a peer dependency and Lite a regular dependency: both resolve from the consumer.
      external: id => /^(react|react-dom)(\/|$)/.test(id) || id === "@babylonjs/lite",
    },
  },
});
