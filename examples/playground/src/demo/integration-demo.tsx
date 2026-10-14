import { Profiler, version, useState, useEffect, type ProfilerOnRenderCallback, type CSSProperties } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { createRoot, flushSync } from "./react-root";
import { mountCanvasApp, Surface, Presence, useSurfaceRef, useNativeOverlayHost, type CanvasController, type MotionDescriptor, type TransitionResult, type TransitionHandle } from "canvas-spa-phase-one";
import "./integration.css";

const params = new URLSearchParams(location.search);
const commits = { count: 0, mounts: 0, cleanups: 0 };
const profile: ProfilerOnRenderCallback = () => { commits.count++; };
const results: TransitionResult[] = [];
const enter: MotionDescriptor = { keyframes: [{ offset: 0, x: 60, opacity: 0 }, { offset: 1 }], timing: { duration: 800 } };
const exit: MotionDescriptor = { keyframes: [{ offset: 0 }, { offset: 1, x: 60, opacity: 0 }], timing: { duration: 800 } };
let controller!: CanvasController;
let show!: (present: boolean) => void;
let replace!: () => void;
let render!: () => void;
let unmountPresence!: () => void;
let reorder!: () => void;
let layout!: (value: CSSProperties) => void;
let extra!: (count: number) => void;
let refs: unknown[] = [];
const listeners: (() => void)[] = [];

function App() {
  const panel = useSurfaceRef<HTMLElement>({ id: "library" });
  const stage = useSurfaceRef<HTMLElement>({ id: "stage" });
  const replacement = useSurfaceRef<HTMLDivElement>({ id: "replacement" });
  const overlay = useNativeOverlayHost();
  const [name, setName] = useState("original");
  const [saved, setSaved] = useState("");
  const [present, setPresent] = useState(true);
  const [generation, setGeneration] = useState(0);
  const [count, setCount] = useState(0);
  const [presenceMounted, setPresenceMounted] = useState(true);
  const [reversed, setReversed] = useState(false);
  const [panelLayout, setPanelLayout] = useState<CSSProperties>({});
  const [extraCount, setExtraCount] = useState(0);
  show = setPresent;
  replace = () => setGeneration(value => value + 1);
  render = () => setCount(value => value + 1);
  unmountPresence = () => setPresenceMounted(false);
  reorder = () => setReversed(value => !value);
  layout = setPanelLayout;
  extra = setExtraCount;
  refs = [panel, stage, replacement];
  useEffect(() => { commits.mounts++; return () => { commits.cleanups++; }; }, []);
  return <>
    <Dialog.Root>
      <section ref={panel} id="library" className="library-panel" style={panelLayout}>
        <strong>Library and app-owned CSS</strong>
        <form onSubmit={event => { event.preventDefault(); setSaved(name); }}>
          <label id="name-label" htmlFor="name">Name</label>
          <input id="name" name="name" value={name} onChange={event => setName(event.target.value)} />
          <button id="save">Save</button>
        </form>
        <output id="saved">{saved || "Not saved"}</output>
        <div><Dialog.Trigger id="dialog-open">Open dialog</Dialog.Trigger></div>
        <button id="toggle-presence" onClick={() => setPresent(value => !value)}>Toggle card</button>
        <button id="replace" onClick={replace}>Replace ref</button>
        <button id="count" onClick={render}>Count {count}</button>
      </section>
      <Dialog.Portal container={overlay}>
        <Dialog.Overlay className="dialog-backdrop" />
        <Dialog.Content className="dialog-content" id="dialog">
          <Dialog.Title>Original library overlay</Dialog.Title>
          <Dialog.Description>Public portal container outside capture and root.</Dialog.Description>
          <label htmlFor="dialog-input">Overlay value</label>
          <input id="dialog-input" defaultValue="overlay" />
          <Dialog.Close id="dialog-close">Close</Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
    {[
    <section key="stage" ref={stage} id="stage" className="presence-stage">
      {presenceMounted && <Presence id="stage" present={present} enter={enter} exit={exit} onComplete={result => { results.push(result); if (results.length > 32) results.shift(); }}>
        <div className="presence-card" id="card"><strong>One retained subtree</strong><input id="card-input" aria-label="Card value" defaultValue="retained" /></div>
      </Presence>}
    </section>,
    <div key={`replacement-${generation}`} ref={replacement} id="replacement" className="replacement">Original ref {generation}</div>,
    ].map((_, index, nodes) => nodes[reversed ? nodes.length - index - 1 : index])}
    {Array.from({ length: extraCount }, (_, index) => <Surface key={index} id={`extra-${index}`}
      layout={{ x: 570, y: 10 + index * 30, width: 50, height: 25 }} appearance={{ background: "rgb(38,104,215)" }}>Extra</Surface>)}
  </>;
}
function mount() {
  controller = mountCanvasApp({
    captureHost: document.querySelector<HTMLCanvasElement>("#capture")!,
    outputCanvas: document.querySelector<HTMLCanvasElement>("#output")!,
    ordinaryHost: document.querySelector<HTMLElement>("#ordinary")!,
    overlayHost: document.querySelector<HTMLElement>("#overlay")!,
    createRoot, flushSync, strict: params.has("strict"),
    // Explicit budget: the hardening suite exceeds it with extra layers to test enforcement.
    budgets: { layers: 8, pixels: 2_000_000 },
    admissionPolicy: params.has("auto") ? "automatic" : "explicit",
    onStatus: message => { document.querySelector<HTMLElement>("#status")!.textContent = message; },
  }, <Profiler id="integration" onRender={profile}><App /></Profiler>);
}
function state() { return { ...controller.state(), reactVersion: version, commits: { ...commits }, results: [...results], demoListeners: listeners.length }; }
async function dispose() {
  await controller.dispose();
  for (const remove of listeners.splice(0)) remove();
  return state();
}
function restoreCanvases() {
  for (const id of ["capture", "output"]) if (!document.getElementById(id)) {
    const canvas = document.createElement("canvas");
    canvas.id = id; canvas.hidden = true;
    document.querySelector("#frame")!.insertBefore(canvas, document.querySelector("#ordinary"));
  }
}
const prior: unknown = import.meta.hot?.data.disposal;
if (prior instanceof Promise) { await prior; restoreCanvases(); }
mount();
function install() {
  for (const [id, operation] of [["enable", () => controller.enable()], ["disable", () => controller.disable()], ["dispose", dispose],
    ["reorder", () => { flushSync(reorder); }], ["layout-move", () => { flushSync(() => layout({ left: 50 })); }],
    ["layout-resize", () => { flushSync(() => layout({ width: 310 })); }]] as const) {
    const element = document.getElementById(id)!;
    const listener = () => { void Promise.resolve().then(async () => { await operation(); }).catch(error => { document.querySelector("#status")!.textContent = String(error); console.error(error); }); };
    element.addEventListener("click", listener);
    listeners.push(() => element.removeEventListener("click", listener));
  }
}
install();
window.integrationProbe = {
  state, dispose, show: value => flushSync(() => show(value)), replace: () => flushSync(replace), render: () => flushSync(render),
  refs: () => refs, enable: () => controller.enable(), disable: () => controller.disable(), settle: () => controller.settle(),
  unmountPresence: () => flushSync(unmountPresence),
  reorder: () => flushSync(reorder), layout: value => flushSync(() => layout(value)),
  extra: count => flushSync(() => extra(count)),
  transition: (descriptor: MotionDescriptor) => controller.transition("stage", descriptor),
  group: (items, stagger) => controller.transitionGroup(items, stagger),
  enroll: (element: HTMLElement, id: string) => controller.enroll(element, { id }),
  async cycle() { const retired = await dispose(); restoreCanvases(); mount(); install(); await controller.enable(); return { retired, active: state() }; },
};
if (!params.has("dom")) void controller.enable().catch(error => { document.querySelector("#status")!.textContent = String(error); console.error(error); });
if (import.meta.hot) {
  import.meta.hot.accept();
  import.meta.hot.dispose(() => {
    const disposal = dispose();
    import.meta.hot!.data.disposal = disposal;
    void disposal.catch(error => console.error("Integration HMR disposal failed", error));
  });
}
declare global {
  interface Window { integrationProbe: {
    state: typeof state; dispose: typeof dispose; refs(): unknown[]; show(value: boolean): void; replace(): void; render(): void; unmountPresence(): void;
    reorder(): void; layout(value: CSSProperties): void; extra(count: number): void;
    enable(): ReturnType<CanvasController["enable"]>; disable(): ReturnType<CanvasController["disable"]>; settle(): Promise<void>;
    transition(descriptor: MotionDescriptor): TransitionHandle; group: CanvasController["transitionGroup"];
    enroll(element: HTMLElement, id: string): () => void; cycle(): Promise<{ retired: ReturnType<typeof state>; active: ReturnType<typeof state> }>;
  } }
}
