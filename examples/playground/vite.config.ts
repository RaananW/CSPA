import { defineConfig } from "vite";
import { resolve } from "node:path";

const root = import.meta.dirname;
export default defineConfig({
  root,
  cacheDir: resolve(root, "../../node_modules/.vite/playground"),
  resolve: {
    alias: { "canvas-spa-phase-one": resolve(root, "../../packages/canvas-spa/src/index.ts") },
    dedupe: ["react", "react-dom"],
  },
  build: {
    outDir: "dist",
    rollupOptions: {
      input: ["index.html", "probe.html", "recovery.html", "surface.html", "runtime.html", "paired.html", "todo.html", "performance.html", "integration.html", "effects.html"]
        .map(path => resolve(root, path)),
    },
  },
});
