import { Profiler } from "react";
import { createRoot, flushSync } from "./react-root";
import { mountCanvasApp, type CanvasController } from "../canvas-spa";
import { TodoApp } from "../apps/todo/TodoApp";
import { taskTransitions } from "../apps/todo/transition";
import { todoProbe } from "./todo-probe";
import { rendererDiagnostic } from "../apps/todo/diagnostics";
import "../apps/todo/todo.css";

const priorDisposal: unknown = import.meta.hot?.data.disposal;
if (priorDisposal instanceof Promise) {
  await priorDisposal;
  const frame = document.getElementById("frame")!;
  for (const id of ["capture", "output"]) if (!document.getElementById(id)) {
    const canvas = document.createElement("canvas");
    canvas.id = id;
    canvas.hidden = true;
    frame.insertBefore(canvas, document.getElementById("ordinary"));
  }
}
const commits = { count: 0 };
const removers: (() => void)[] = [];
let controller: CanvasController;
let transitions: ReturnType<typeof taskTransitions> | undefined;
const status = document.getElementById("status")!;
controller = mountCanvasApp({
  captureHost: document.querySelector<HTMLCanvasElement>("#capture")!,
  outputCanvas: document.querySelector<HTMLCanvasElement>("#output")!,
  ordinaryHost: document.getElementById("ordinary")!,
  overlayHost: document.getElementById("overlay")!,
  strict: new URLSearchParams(location.search).has("strict"), createRoot, flushSync,
  onStatus(message) {
    const diagnostic: { mode: string; reason: string } | undefined = message.startsWith("{") ? JSON.parse(message) : undefined;
    status.textContent = diagnostic ? rendererDiagnostic(diagnostic.mode, diagnostic.reason) : message;
    document.getElementById("ledger")!.textContent = message;
    if (controller && controller.state().mode !== "gpu") transitions?.stop(false);
  },
}, <Profiler id="todo-pilot" onRender={() => { commits.count++; }}>
  <TodoApp onTransition={event => transitions!.pulse(event)} />
</Profiler>);
transitions = taskTransitions(controller);
async function dispose() {
  transitions!.stop();
  await controller.dispose();
  for (const remove of removers.splice(0)) remove();
  return window.todoProbe.state();
}
for (const [id, action] of [
  ["gpu", async () => { await controller.enable(); }],
  ["dom", async () => { transitions!.stop(); await controller.disable(); }],
  ["dispose", dispose],
] as const) {
  const button = document.getElementById(id)!;
  const listener = () => { void Promise.resolve().then(async () => { await action(); }).catch(error => {
    status.textContent = `Action rejected: ${String(error)}`;
    console.error("TODO app action rejected", error);
  }); };
  button.addEventListener("click", listener);
  removers.push(() => button.removeEventListener("click", listener));
}
window.todoProbe = todoProbe(controller, transitions, commits, () => removers.length, dispose);
if (import.meta.hot) {
  const hot = import.meta.hot;
  import.meta.hot.accept();
  hot.dispose(() => {
    const disposal = dispose();
    hot.data.disposal = disposal;
    void disposal.catch(error => console.error("TODO HMR cleanup retained resources or failed", error));
  });
}
