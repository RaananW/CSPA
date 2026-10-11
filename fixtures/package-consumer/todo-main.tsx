/// <reference types="vite/client" />
import { Profiler, version } from "react";
import { mountCanvasApp, type CanvasController } from "canvas-spa-phase-one";
import { TodoApp } from "./task/TodoApp.js";
import { taskTransitions } from "./task/transition.js";
import { rendererDiagnostic } from "./task/diagnostics.js";
import "./task/todo.css";

let commits = 0;
let controller: CanvasController;
let transitions: ReturnType<typeof taskTransitions> | undefined;
const host = (id: string) => document.getElementById(id)!;
controller = mountCanvasApp({
  captureHost: host("capture") as HTMLCanvasElement, outputCanvas: host("output") as HTMLCanvasElement,
  ordinaryHost: host("ordinary"), overlayHost: host("overlay"), strict: true,
  onStatus(message) {
    const diagnostic = message.startsWith("{") ? JSON.parse(message) as { mode: string; reason: string } : undefined;
    host("status").textContent = diagnostic ? rendererDiagnostic(diagnostic.mode, diagnostic.reason) : message;
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
const state = () => ({ ...controller.state(), version, commits, sameRoot: controller.container === root,
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
