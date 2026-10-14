/**
 * Entry for `todo.html`: mounts the TODO pilot (`apps/todo/TodoApp.tsx`) with `mountCanvasApp`. The page has
 * Enable GPU / Use DOM / Dispose buttons, a status line showing the controller's diagnostics, and exposes
 * `window.todoProbe` (`todo-probe.ts`) to the browser tests. Task changes pulse a decorative GPU ripple
 * (`apps/todo/transition.ts`). `?strict` wraps the app in React StrictMode.
 */
import { Profiler } from "react";
import { createRoot, flushSync } from "./react-root";
import { mountCanvasApp, type CanvasController } from "@underglass/react";
import { TodoApp } from "../apps/todo/TodoApp";
import { taskTransitions } from "../apps/todo/transition";
import { todoProbe } from "./todo-probe";
import { rendererDiagnostic } from "../apps/todo/diagnostics";
import "../apps/todo/todo.css";

// Vite HMR: the previous module's `dispose()` may still be running when this module loads. Wait for it, then
// recreate the capture and output canvases if they are missing, before mounting again.
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
// Count of React Profiler commits, reported by the probe.
const commits = { count: 0 };
const removers: (() => void)[] = [];
let controller: CanvasController;
let transitions: ReturnType<typeof taskTransitions> | undefined;
const status = document.getElementById("status")!;
// Mount the app. The canvases and hosts come from `todo.html`; `createRoot`/`flushSync` are passed in so the
// runtime can render and re-parent the one React root itself. GPU is not enabled here; the "gpu" button does it.
// The controller is created before `transitions`, so TodoApp's callback reaches it through the later assignment.
controller = mountCanvasApp({
  captureHost: document.querySelector<HTMLCanvasElement>("#capture")!,
  outputCanvas: document.querySelector<HTMLCanvasElement>("#output")!,
  ordinaryHost: document.getElementById("ordinary")!,
  overlayHost: document.getElementById("overlay")!,
  strict: new URLSearchParams(location.search).has("strict"), createRoot, flushSync,
  // The runtime reports either a plain string or a JSON `{ mode, reason }` diagnostic; show the latter
  // categorized and keep the raw message in the ledger element. Stop the ripple timer once GPU is gone.
  onStatus(message) {
    const diagnostic: { mode: string; reason: string } | undefined = message.startsWith("{") ? JSON.parse(message) : undefined;
    status.textContent = diagnostic ? rendererDiagnostic(diagnostic.mode, diagnostic.reason) : message;
    document.getElementById("ledger")!.textContent = message;
    if (controller && controller.state().mode !== "gpu") transitions?.stop(false);
  },
}, <Profiler id="todo-pilot" onRender={() => { commits.count++; }}>
  <TodoApp onTransition={event => transitions!.pulse(event)} />
</Profiler>);
// Created after mount because it needs the controller.
transitions = taskTransitions(controller);
// Stops the ripple, disposes the controller, removes the button listeners and
// returns the final probe state.
async function dispose() {
  transitions!.stop();
  await controller.dispose();
  for (const remove of removers.splice(0)) remove();
  return window.todoProbe.state();
}
// Wire the page buttons. Actions run in a microtask and report rejections in the status line.
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
// Test hook; see `todo-probe.ts`.
window.todoProbe = todoProbe(controller, transitions, commits, () => removers.length, dispose);
// On a hot update, dispose the old mount and hand the pending promise to the replacement module.
if (import.meta.hot) {
  const hot = import.meta.hot;
  import.meta.hot.accept();
  hot.dispose(() => {
    const disposal = dispose();
    hot.data.disposal = disposal;
    void disposal.catch(error => console.error("TODO HMR cleanup retained resources or failed", error));
  });
}
