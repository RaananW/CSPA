import type { Root, Plugin, ProcessOptions } from "postcss";
import type { CompiledAnimation } from "@canvas-spa/react";
export interface CompilerEntry {
  id: string;
  stylesheet: string;
  selector: string;
  animations: [string];
}
export interface CompilerConfig {
  version: 1;
  target: "webgpu";
  unsupported: "error";
  /** Accepted for compatibility; has no effect since one per-layer program serves any layer count. */
  maxLayers?: number;
  entries: CompilerEntry[];
}
export function validateConfig(value: unknown): Required<CompilerConfig>;
export function readConfig(root: string, filename?: string): Promise<{ path: string; config: Required<CompilerConfig> }>;
export interface ParsedAnimation extends Pick<CompiledAnimation, "id" | "selector" | "name" | "frames" | "timing"> {
  values: {
    offset: number; transform: string; opacity: number; easing: string;
    x: number; y: number; scaleX: number; scaleY: number; rotation: number;
  }[];
}
export function compileStylesheet(css: string, entries: CompilerEntry[], options?: {
  filename?: string; modules?: Record<string, string>; root?: Root;
}): ParsedAnimation[];
export function createCompiler(config: CompilerConfig): {
  consume(filename: string, root: Root, entries: CompilerEntry[], modules?: Record<string, string>): void;
  generate(): string;
  postcss(select: (filename: ProcessOptions["from"]) => CompilerEntry[] | undefined): Plugin;
};
