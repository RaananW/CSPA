import type { Compiler } from "webpack";
export class CanvasSPAPlugin {
  constructor(options?: { configFile?: string });
  apply(compiler: Compiler): void;
}
