// Vite config for the playground. Every `*.html` file in this directory is a page and a build input,
// and `@underglass/react` and `@underglass/core` resolve to the library sources so the pages run against
// the working tree without a build, sharing one copy of the core runtime with the engineering deep imports.
import { defineConfig } from "vite";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";

const root = import.meta.dirname;
export default defineConfig({
  root,
  // Keep the Vite dependency cache in the repository root's `node_modules`.
  cacheDir: resolve(root, "../../node_modules/.vite/playground"),
  resolve: {
    // Exact matches: a bare string key would also rewrite the subpath entries.
    alias: [
      { find: /^@underglass\/react$/, replacement: resolve(root, "../../packages/underglass/src/index.ts") },
      { find: /^@underglass\/core$/, replacement: resolve(root, "../../packages/core/src/index.ts") },
      { find: /^@underglass\/core\/experimental-worker$/, replacement: resolve(root, "../../packages/core/src/experimental-worker.ts") },
    ],
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
