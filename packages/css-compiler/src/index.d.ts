/**
 * Public types and functions of the build-time CSS compiler core (`index.mjs`). The bundler adapters are
 * in `./vite` and `./webpack`.
 */
import type { Root, Plugin, ProcessOptions } from "postcss";
import type { CompiledAnimation } from "@underglass/react";
/**
 * One enrolled animation in `underglass.config.json`: the `selector` rule in `stylesheet` whose single
 * named animation is compiled.
 */
export interface CompilerEntry {
  /** Identifier used at runtime; the compiled animation id is `${id}/${animations[0]}`. */
  id: string;
  /** Package export specifier or an explicit local path; resolved by the application's bundler. */
  stylesheet: string;
  /** One simple class (`.card`) or ID (`#card`) selector. */
  selector: string;
  /** Exactly one `@keyframes` name. */
  animations: [string];
}
/**
 * The parsed and validated `underglass.config.json`.
 */
export interface CompilerConfig {
  version: 1;
  target: "webgpu";
  unsupported: "error";
  /** Accepted for compatibility; has no effect since one per-layer program serves any layer count. */
  maxLayers?: number;
  entries: CompilerEntry[];
}
/**
 * Validates a parsed configuration and returns it with defaults applied. Throws on the first violation.
 */
export function validateConfig(value: unknown): Required<CompilerConfig>;
/**
 * Reads and validates a configuration file. `path` is the absolute file location, to be registered as a
 * build dependency.
 */
export function readConfig(root: string, filename?: string): Promise<{ path: string; config: Required<CompilerConfig> }>;
/**
 * A selected animation after analysis: the public `CompiledAnimation` fields plus the build-only
 * `values`, one record per keyframe with the parsed transform components.
 */
export interface ParsedAnimation extends Pick<CompiledAnimation, "id" | "selector" | "name" | "frames" | "timing"> {
  values: {
    offset: number; transform: string; opacity: number; easing: string;
    x: number; y: number; scaleX: number; scaleY: number; rotation: number;
  }[];
}
/**
 * Analyzes the selected animations in `css` (or in an already-parsed `root`). `modules` maps CSS Modules
 * source names to hashed names. Throws a PostCSS `CssSyntaxError` for unsupported CSS.
 */
export function compileStylesheet(css: string, entries: CompilerEntry[], options?: {
  filename?: string; modules?: Record<string, string>; root?: Root;
}): ParsedAnimation[];
/**
 * Creates a compiler for one build. `consume` or the `postcss` plugin record each processed stylesheet,
 * and `generate` returns the source of the `virtual:underglass/compiled` module. `generate` throws if a
 * configured entry was never processed.
 */
export function createCompiler(config: CompilerConfig): {
  consume(filename: string, root: Root, entries: CompilerEntry[], modules?: Record<string, string>): void;
  generate(): string;
  postcss(select: (filename: ProcessOptions["from"]) => CompilerEntry[] | undefined): Plugin;
};
