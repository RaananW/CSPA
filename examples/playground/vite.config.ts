import { defineConfig } from "vite";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";

const root = import.meta.dirname;
export default defineConfig({
  root,
  cacheDir: resolve(root, "../../node_modules/.vite/playground"),
  resolve: {
    alias: { "@underglass/react": resolve(root, "../../packages/underglass/src/index.ts") },
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
