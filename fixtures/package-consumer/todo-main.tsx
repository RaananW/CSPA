/**
 * Entry for the installed-package TODO case (`scripts/package-consumer.mjs --todo-case`, and the consumer app
 * built by `scripts/release-validation.mjs`). It replaces `main.tsx` in the scratch project and mounts the
 * playground TODO app, whose sources are copied to `./task`, through the packed `@underglass/react`. Tests
 * drive it through `window.packageTask`.
 */
/// <reference types="vite/client" />
import { Profiler, version } from "react";
import { version as reactDOMVersion } from "react-dom";
import { mountCanvasApp, type CanvasController } from "@underglass/react";
import { TodoApp } from "./task/TodoApp.js";
import { taskTransitions } from "./task/transition.js";
import { rendererDiagnostic } from "./task/diagnostics.js";
import "./task/todo.css";

// `commits` counts React commits through the Profiler below.
let commits = 0;
let controller: CanvasController;
let transitions: ReturnType<typeof taskTransitions> | undefined;
const host = (id: string) => document.getElementById(id)!;
controller = mountCanvasApp({
  captureHost: host("capture") as HTMLCanvasElement, outputCanvas: host("output") as HTMLCanvasElement,
  ordinaryHost: host("ordinary"), overlayHost: host("overlay"), strict: true,
  // Status is either plain text or a JSON diagnostic; JSON is rewritten into the readable form shown on the page.
  onStatus(message) {
    const diagnostic = message.startsWith("{") ? JSON.parse(message) as { mode: string; reason: string } : undefined;
    host("status").textContent = diagnostic ? rendererDiagnostic(diagnostic.mode, diagnostic.reason) : message;
    // Task transitions run only while GPU is presenting; stop them in any other mode.
    if (controller && controller.state().mode !== "gpu") transitions?.stop(false);
  },
}, <Profiler id="installed-task-app" onRender={() => { commits++; }}>
  <TodoApp onTransition={event => transitions!.pulse(event)} />
</Profiler>);
transitions = taskTransitions(controller);
const root = controller.container;
const input = host("new-task");
const removers: (() => void)[] = [];
async function dispose() {
  transitions!.stop();
  await controller.dispose();
  for (const remove of removers.splice(0)) remove();
}
// Snapshot for tests: identity checks show that the React root and input survived mode changes.
const state = () => ({ ...controller.state(), version, reactDOMVersion, commits, sameRoot: controller.container === root,
  sameInput: document.getElementById("new-task") === input, timers: transitions!.state().timers, listeners: removers.length });
window.packageTask = { controller, state, dispose };
for (const [id, action] of [["gpu", () => controller.enable()], ["dom", () => controller.disable()], ["dispose", dispose]] as const) {
  const listener = () => { void action().catch(error => { host("status").textContent = String(error); console.error(error); }); };
  host(id).addEventListener("click", listener);
  removers.push(() => host(id).removeEventListener("click", listener));
}
declare global {
  interface Window { packageTask: { controller: CanvasController; state: typeof state; dispose: typeof dispose } }
}
