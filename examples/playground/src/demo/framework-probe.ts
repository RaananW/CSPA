/**
 * The `window.frameworkProbe` contract every framework-adapter demo page (`vanilla.html`, ...) exposes to
 * `tests/helpers/framework-contract.mjs`. Each page renders the same small app in its own framework.
 */
import type { CanvasController } from "@underglass/core";

/** The app state each page reports next to the runtime state. */
export interface FrameworkState {
  /** Which adapter rendered the page, for example "vanilla". */
  framework: string;
  count: number;
  name: string;
  swatch: "blue" | "yellow";
  /** How many times the framework root mounted and unmounted. */
  mounts: number;
  cleanups: number;
  /** Whether the runtime container and the `#name` input are still the original elements. */
  sameRoot: boolean;
  sameInput: boolean;
}
export interface FrameworkProbe {
  controller: CanvasController;
  state(): ReturnType<CanvasController["state"]> & FrameworkState;
  /** Adds layer `extra` through the framework; resolves once it is in the DOM. */
  addLayer(): Promise<void>;
  /** Removes layer `extra` through the framework; resolves once it is gone. */
  removeLayer(): Promise<void>;
  /** Disposes the controller and returns the final state. */
  dispose(): Promise<ReturnType<FrameworkProbe["state"]>>;
}
declare global { interface Window { frameworkProbe: FrameworkProbe } }
