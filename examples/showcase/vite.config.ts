import { defineConfig } from "vite";
import { showcaseBase } from "./site-policy.mjs";

export default defineConfig({
  root: import.meta.dirname,
  base: showcaseBase(process.env.CANVAS_SHOWCASE_BASE),
  cacheDir: "../../node_modules/.vite/showcase",
  resolve: { dedupe: ["react", "react-dom"] },
  build: { sourcemap: false, outDir: "dist" },
});
