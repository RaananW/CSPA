import { defineConfig } from "vite";
export default defineConfig({ publicDir: false, worker: { format: "es" }, build: { sourcemap: false, target: "es2022" } });
