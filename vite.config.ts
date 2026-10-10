import { defineConfig } from "vite";

export default defineConfig({
  build: { rollupOptions: { input: ["index.html", "probe.html", "recovery.html", "surface.html", "runtime.html", "paired.html", "todo.html", "performance.html", "integration.html", "effects.html"] } },
});
