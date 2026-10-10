import { StrictMode, useEffect, useState, useSyncExternalStore } from "react";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { enableDrawable, isDrawableCanvas, isDrawableContext, waitForPaint, type DrawableCanvas } from "./native";

type Candidate = "remount" | "move";
type Destination = "canvas" | "dom";
const canvas = document.querySelector<HTMLCanvasElement>("#capture-host");
const domHost = document.getElementById("dom-host");
if (!canvas || !domHost || !isDrawableCanvas(canvas)) throw new Error("Recovery fixture requires native canvas capabilities");
const host: DrawableCanvas = canvas;
const ordinaryHost = domHost;
enableDrawable(host);
const context = host.getContext("2d");
if (!context || !isDrawableContext(context)) throw new Error("Recovery fixture requires drawElementImage");
const nativeContext = context;
const resources = { liveRoots: 0, liveSnapshots: 0, liveEffects: 0 };
const counts = { rootsCreated: 0, unmounts: 0, captures: 0, effectMounts: 0, effectCleanups: 0 };
const subscribers = new Set<() => void>();
let saved = { controlled: "controlled", submitted: "" };
let tokens = 0;
let root: Root | undefined;
let container: HTMLDivElement | undefined;
let candidate: Candidate | undefined;
let destination: Destination = "canvas";
let strict = false;
let disposed = false;

function NestedCounter() {
  const [token] = useState(() => ++tokens);
  const [count, setCount] = useState(0);
  useEffect(() => {
    resources.liveEffects++;
    counts.effectMounts++;
    return () => { resources.liveEffects--; counts.effectCleanups++; };
  }, []);
  return <div data-testid="nested" data-token={token}>
    <span data-testid="local-count">Local count: {count}</span>
    <button id="local-increment" onClick={() => setCount((value) => value + 1)}>Local increment</button>
  </div>;
}

function Specimen() {
  const state = useSyncExternalStore(
    (listener) => { subscribers.add(listener); return () => { subscribers.delete(listener); }; },
    () => saved,
  );
  const [show, setShow] = useState(true);
  function save(next: typeof saved) { saved = next; subscribers.forEach((listener) => listener()); }
  return <section className="specimen">
    <form onSubmit={(event) => { event.preventDefault(); save({ ...saved, submitted: saved.controlled }); }}>
      <label htmlFor="controlled">Controlled</label>
      <input id="controlled" value={state.controlled} onChange={(event) => save({ ...saved, controlled: event.target.value })} />
      <label htmlFor="uncontrolled">Uncontrolled</label>
      <input id="uncontrolled" defaultValue="native" />
      <button id="submit" type="submit">Submit specimen</button>
    </form>
    <output>{state.submitted || "not submitted"}</output>
    <button id="toggle" onClick={() => setShow((value) => !value)}>Toggle nested child</button>
    {show && <NestedCounter />}
  </section>;
}

function mounted() {
  if (disposed || !root || !container || !candidate) throw new Error("Recovery specimen is not mounted");
  return { root, container, candidate };
}

function mount(parent: Element) {
  const next = document.createElement("div");
  next.className = "app-container";
  next.setAttribute("drawable", "");
  parent.append(next);
  container = next;
  const nextRoot = createRoot(next);
  root = nextRoot;
  resources.liveRoots++;
  counts.rootsCreated++;
  flushSync(() => nextRoot.render(strict ? <StrictMode><Specimen /></StrictMode> : <Specimen />));
}

function clearGeometry() {
  if (container && destination === "canvas") host.clearElementGeometry(container);
  nativeContext.clearRect(0, 0, host.width, host.height);
}

function inputState(input: HTMLInputElement | null) {
  return input ? { value: input.value, selectionStart: input.selectionStart, selectionEnd: input.selectionEnd, focused: document.activeElement === input } : null;
}

const api = {
  resources, counts,
  start(kind: Candidate, strictMode = false) {
    if (root || disposed) throw new Error("Start requires a fresh fixture");
    if (kind !== "remount" && kind !== "move") throw new Error("Unknown recovery candidate");
    if (kind === "move" && (typeof host.moveBefore !== "function" || typeof ordinaryHost.moveBefore !== "function")) {
      throw new Error("Element.moveBefore unsupported; appendChild fallback is forbidden");
    }
    candidate = kind;
    strict = strictMode;
    mount(host);
    return api.state();
  },
  state() {
    const { container } = mounted();
    const style = getComputedStyle(container.querySelector(".specimen")!);
    return {
      candidate, destination, strict, connected: container.isConnected,
      controlled: inputState(container.querySelector<HTMLInputElement>("#controlled")),
      uncontrolled: inputState(container.querySelector<HTMLInputElement>("#uncontrolled")),
      localCount: container.querySelector('[data-testid="local-count"]')?.textContent ?? null,
      hookToken: container.querySelector<HTMLElement>('[data-testid="nested"]')?.dataset.token ?? null,
      submitted: container.querySelector("output")?.textContent,
      background: getComputedStyle(container).backgroundColor, padding: style.padding,
      controls: document.querySelectorAll("#controlled").length,
      resources: { ...resources }, counts: { ...counts },
    };
  },
  async capture() {
    const { container } = mounted();
    if (destination !== "canvas") throw new Error("Capture requires canvas destination");
    await waitForPaint(host);
    const snapshot = host.captureElementImage(container);
    resources.liveSnapshots++;
    counts.captures++;
    try {
      nativeContext.clearRect(0, 0, host.width, host.height);
      nativeContext.drawElementImage(snapshot, 30, 30, { preserveElementGeometry: true });
      host.updateElementGeometry(container, { canvasTransform: new DOMMatrix().translate(30, 30) });
      return { sample: [...nativeContext.getImageData(35, 35, 1, 1).data], transform: host.getElementTransform(container).toJSON(), state: api.state() };
    } finally { snapshot.close(); resources.liveSnapshots--; }
  },
  async transition(next: Destination, restoreFocus = false) {
    const current = mounted();
    if (next !== "canvas" && next !== "dom") throw new Error("Unknown destination");
    if (next === destination) throw new Error("Transition must change destination");
    if (current.candidate === "move" && restoreFocus) throw new Error("Move case must not implicitly restore browser state");
    const focused = current.container.contains(document.activeElement) && document.activeElement instanceof HTMLInputElement
      ? { id: document.activeElement.id, start: document.activeElement.selectionStart, end: document.activeElement.selectionEnd }
      : null;
    const before = api.state();
    clearGeometry();
    const afterClear = destination === "canvas" ? host.getElementTransform(current.container).toJSON() : null;
    const parent = next === "canvas" ? host : ordinaryHost;
    if (current.candidate === "move") {
      parent.moveBefore(current.container, null);
    } else {
      flushSync(() => current.root.unmount());
      resources.liveRoots--;
      counts.unmounts++;
      root = undefined;
      current.container.remove();
      mount(parent);
      if (restoreFocus && focused) {
        const input = container?.querySelector<HTMLInputElement>(`#${focused.id}`);
        input?.focus({ preventScroll: true });
        if (focused.start !== null && focused.end !== null) input?.setSelectionRange(focused.start, focused.end);
      }
    }
    destination = next;
    const after = api.state();
    return {
      before, after, afterClear, restoredFocus: restoreFocus && focused !== null,
      sameContainer: current.container === container,
      oldContainerConnected: current.container.isConnected,
    };
  },
  dispose() {
    if (!disposed) {
      clearGeometry();
      flushSync(() => root?.unmount());
      if (root) { resources.liveRoots--; counts.unmounts++; }
      root = undefined;
      container?.remove();
      disposed = true;
    }
    return { resources: { ...resources }, subscribers: subscribers.size, counts: { ...counts }, controls: document.querySelectorAll("#controlled").length };
  },
};

declare global { interface Window { recoveryProbe: typeof api } }
window.recoveryProbe = api;
