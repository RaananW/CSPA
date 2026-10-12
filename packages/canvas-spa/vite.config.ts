import { build, defineConfig } from "vite";

export default defineConfig({
  publicDir: false,
  root: import.meta.dirname,
  plugins: [{
    name: "canvas-spa-build-entry",
    async closeBundle() {
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
      external: id => /^(react|react-dom)(\/|$)/.test(id) || id === "@babylonjs/lite",
    },
  },
});
