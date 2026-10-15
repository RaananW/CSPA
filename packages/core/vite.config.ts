/**
 * Library build for `@underglass/core` (`npm run build` in this package, followed by `tsc` for
 * declarations). The main build emits the root entry `dist/library/index.js`; a plugin then runs
 * separate Vite library builds for the other package exports (`build`, `experimental-worker` and
 * `worker-thread`) into the same directory, so each entry is its own ES module file.
 */
import { build, defineConfig } from "vite";

// Lite is a regular dependency and resolves from the consumer. Nothing here imports a UI framework.
const external = (id: string) => id === "@babylonjs/lite";

export default defineConfig({
  publicDir: false,
  root: import.meta.dirname,
  plugins: [{
    name: "underglass-core-entries",
    // Runs after the root entry is written; `emptyOutDir: false` keeps that output.
    async closeBundle() {
      // The build-only entry declares no externals: its sources import only types from Lite, so the
      // emitted module is self-contained for Node build scripts.
      await build({
        configFile: false, root: import.meta.dirname, publicDir: false, logLevel: "warn",
        build: {
          outDir: "dist/library", emptyOutDir: false, sourcemap: false,
          lib: { entry: `${import.meta.dirname}/src/build.ts`, formats: ["es"], fileName: "build" },
        },
      });
      for (const [name, source] of [["experimental-worker", "experimental-worker.ts"], ["worker-thread", "worker-thread.ts"]] as const) {
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
