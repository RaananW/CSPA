// Vite config for building the worker fixture inside the installed-package scratch tree.
import { defineConfig } from "vite";
export default defineConfig({ publicDir: false, worker: { format: "es" }, build: { sourcemap: false, target: "es2022" } });
