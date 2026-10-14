/**
 * Vite adapter for the build-time CSS compiler.
 */
import type { Plugin } from "vite";
/**
 * Vite plugin that compiles the configured animations during a production build and serves the
 * `virtual:underglass/compiled` module. `configFile` defaults to `underglass.config.json` in the Vite root.
 * `vite dev`, HMR and watch builds are refused.
 */
export function underglass(options?: { configFile?: string }): Plugin;
