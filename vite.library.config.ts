import { defineConfig } from "vite";

export default defineConfig({
  publicDir: false,
  build: {
    outDir: "dist/library",
    lib: { entry: "src/canvas-spa/index.ts", formats: ["es"], fileName: "index" },
    sourcemap: false,
    rollupOptions: {
      external: id => /^(react|react-dom)(\/|$)/.test(id) || id === "@babylonjs/lite",
    },
  },
});
