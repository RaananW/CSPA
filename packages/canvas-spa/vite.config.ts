import { defineConfig } from "vite";

export default defineConfig({
  publicDir: false,
  root: import.meta.dirname,
  build: {
    outDir: "dist/library",
    lib: { entry: `${import.meta.dirname}/src/index.ts`, formats: ["es"], fileName: "index" },
    sourcemap: false,
    rollupOptions: {
      external: id => /^(react|react-dom)(\/|$)/.test(id) || id === "@babylonjs/lite",
    },
  },
});
