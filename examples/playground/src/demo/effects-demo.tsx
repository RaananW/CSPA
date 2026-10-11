import { Profiler, version, useState, useEffect, useCallback, type ProfilerOnRenderCallback } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { createRoot, flushSync } from "./react-root";
import { mountCanvasApp, useSurfaceRef, useNativeOverlayHost, defineEffect, type CanvasController, type EffectDescriptor, type EffectHandle } from "canvas-spa-phase-one";
import { colorCycle } from "../apps/effects/color-cycle";
import "./effects.css";

const params = new URLSearchParams(location.search);
const commits = { count: 0, mounts: 0, cleanups: 0 };
const profile: ProfilerOnRenderCallback = () => { commits.count++; };
let controller!: CanvasController;
let handle: EffectHandle | undefined;
let update!: (value: string) => void;
const listeners: (() => void)[] = [];
const samples: { kind: string; at: number; durationMs: number; phase: string }[] = [];
const policy = { bounds: "layer", interaction: "decorative", media: "identity", fallback: "static" } as const;
function descriptor(kind: "ripple" | "chromatic" | "dissolve" | "custom", seconds = 0, playing = false): EffectDescriptor {
  const common = { ...policy, time: { seconds, playing } };
  switch (kind) {
    case "ripple": return { ...common, kind, parameters: { amplitude: 8 } };
    case "chromatic": return { ...common, kind, parameters: { displacement: 8 } };
    case "dissolve": return { ...common, kind, parameters: { amount: .5, speed: 1 } };
    case "custom": return { ...common, kind, definition: colorCycle, parameters: { strength: 1, rate: 2 } };
  }
}
function apply(values: readonly EffectDescriptor[]) { handle = controller.setEffects("art", values); return handle; }
function report(error: unknown) { document.querySelector("#status")!.textContent = String(error); console.error(error); }
function choose(kind: "ripple" | "chromatic" | "dissolve" | "custom") {
  try {
    apply([descriptor(kind, 0, true)]);
    controller.transition("art", { keyframes: [{ offset: 0 }, { offset: 1, x: 15, rotation: 2 }], timing: { duration: 800 } });
  } catch (error) { report(error); }
}
function App() {
  const panel = useSurfaceRef<HTMLElement>({ id: "panel" });
  const art = useSurfaceRef<HTMLElement>({ id: "art", decorative: true });
  const artRef = useCallback((element: HTMLElement | null) => {
    if (element) element.inert = true;
    art(element);
  }, [art]);
  const overlay = useNativeOverlayHost();
  const [title, setTitle] = useState("Original poster");
  const [saved, setSaved] = useState("Not saved");
  update = setTitle;
  useEffect(() => { commits.mounts++; return () => { commits.cleanups++; }; }, []);
  return <Dialog.Root>
    <section ref={panel} id="panel" className="composer">
      <form onSubmit={event => { event.preventDefault(); setSaved(title); }}>
        <label htmlFor="title">Poster title</label>
        <input id="title" value={title} onChange={event => setTitle(event.target.value)} />
        <button id="save">Save</button>
      </form>
      <output id="saved">{saved}</output>
      <div className="choices">{(["ripple", "chromatic", "dissolve", "custom"] as const).map(kind =>
        <button key={kind} id={`effect-${kind}`} onClick={() => choose(kind)}>{kind}</button>)}</div>
      <button id="effect-clear" onClick={() => handle?.cancel()}>Clear effect</button>
      <Dialog.Trigger id="dialog-open">Preview details</Dialog.Trigger>
    </section>
    <section ref={artRef} id="art" className="poster" aria-hidden="true">
      <div className="bands" /><strong id="poster-title">{title}</strong><div className="marker" />
    </section>
    <Dialog.Portal container={overlay}>
      <Dialog.Overlay className="dialog-backdrop" />
      <Dialog.Content className="dialog-content" id="dialog">
        <Dialog.Title>Native poster details</Dialog.Title>
        <Dialog.Description>The original dialog remains outside the effects.</Dialog.Description>
        <input id="dialog-input" aria-label="Description" defaultValue="Original library input" />
        <Dialog.Close id="dialog-close">Close</Dialog.Close>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
function mount() {
  controller = mountCanvasApp({
    captureHost: document.querySelector<HTMLCanvasElement>("#capture")!, outputCanvas: document.querySelector<HTMLCanvasElement>("#output")!,
    ordinaryHost: document.querySelector<HTMLElement>("#ordinary")!, overlayHost: document.querySelector<HTMLElement>("#overlay")!,
    createRoot, flushSync, strict: params.has("strict"), onStatus: message => { document.querySelector("#status")!.textContent = message; },
    onMeasure: sample => { samples.push(sample); if (samples.length > 4096) samples.shift(); },
  }, <Profiler id="effects" onRender={profile}><App /></Profiler>);
  apply([descriptor("custom")]);
}
function state() { return { ...controller.state(), reactVersion: version, commits: { ...commits }, demoListeners: listeners.length }; }
async function dispose() { await controller.dispose(); for (const remove of listeners.splice(0)) remove(); return state(); }
function restoreCanvases() {
  for (const id of ["capture", "output"]) if (!document.getElementById(id)) {
    const canvas = document.createElement("canvas"); canvas.id = id; canvas.hidden = true;
    document.querySelector("#frame")!.insertBefore(canvas, document.querySelector("#ordinary"));
  }
}
const prior: unknown = import.meta.hot?.data.disposal;
if (prior instanceof Promise) { await prior; restoreCanvases(); }
mount();
function install() {
  for (const [id, operation] of [["enable", () => controller.enable()], ["disable", () => controller.disable()], ["dispose", dispose]] as const) {
    const element = document.getElementById(id)!;
    const listener = () => { void operation().catch(report); };
    element.addEventListener("click", listener); listeners.push(() => element.removeEventListener("click", listener));
  }
}
install();
window.effectsProbe = {
  state, dispose, descriptor, apply, controller: () => controller, handle: () => handle!,
  update: value => flushSync(() => update(value)), samples: () => [...samples], clearSamples: () => { samples.length = 0; },
  async compile(wgsl: string) {
    await controller.disable();
    const definition = defineEffect({ ...colorCycle, name: "compile-fixture", wgsl });
    apply([{ ...descriptor("custom"), kind: "custom", definition, parameters: { strength: 1, rate: 2 } }]);
    return controller.enable();
  },
  async cycle() { const retired = await dispose(); restoreCanvases(); mount(); install(); await controller.enable(); return { retired, active: state() }; },
};
if (!params.has("dom")) void controller.enable().catch(report);
if (import.meta.hot) {
  import.meta.hot.accept();
  import.meta.hot.dispose(() => { const disposal = dispose(); import.meta.hot!.data.disposal = disposal; void disposal.catch(report); });
}
declare global {
  interface Window { effectsProbe: {
    state: typeof state; dispose: typeof dispose; descriptor: typeof descriptor; apply: typeof apply; handle(): EffectHandle; controller(): CanvasController;
    update(value: string): void; samples(): typeof samples; clearSamples(): void;
    compile(wgsl: string): ReturnType<CanvasController["enable"]>;
    cycle(): Promise<{ retired: ReturnType<typeof state>; active: ReturnType<typeof state> }>;
  } }
}
