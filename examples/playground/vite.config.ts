// Vite config for the playground. Every `*.html` file in this directory is a page and a build input,
// and `@underglass/react` resolves to the library source so the pages run against the working tree without a build.
import { defineConfig } from "vite";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";

const root = import.meta.dirname;
export default defineConfig({
  root,
  // Keep the Vite dependency cache in the repository root's `node_modules`.
  cacheDir: resolve(root, "../../node_modules/.vite/playground"),
  resolve: {
    alias: { "@underglass/react": resolve(root, "../../packages/underglass/src/index.ts") },
    // Force a single copy of React so the library and the pages share hooks and context.
    dedupe: ["react", "react-dom"],
  },
  build: {
    outDir: "dist",
    rollupOptions: {
      // Every page in the playground root; adding a page needs no edit to a shared list.
      input: readdirSync(root).filter(name => name.endsWith(".html")).sort().map(name => resolve(root, name)),
    },
  },
});
