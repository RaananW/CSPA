import type { Compiler } from "webpack";
export class UnderglassPlugin {
  constructor(options?: { configFile?: string });
  apply(compiler: Compiler): void;
}
