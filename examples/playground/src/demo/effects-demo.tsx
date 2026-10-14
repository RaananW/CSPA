/**
 * Entry for `effects.html` (poster composer): shows decorative effects on a non-interactive artwork layer next to
 * a native form and dialog. It uses `useSurfaceRef` to enrol existing DOM, `controller.setEffects` with the built-in
 * ripple, chromatic and dissolve effects plus a custom WGSL effect (`apps/effects/color-cycle.ts`), and a Radix
 * dialog in the native overlay host. `window.effectsProbe` is the hook for the browser tests; `?dom` starts without
 * GPU and `?strict` enables React StrictMode.
 */
import { Profiler, version, useState, useEffect, useCallback, type ProfilerOnRenderCallback } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { createRoot, flushSync } from "./react-root";
import { mountCanvasApp, useSurfaceRef, useNativeOverlayHost, defineEffect, type CanvasController, type EffectDescriptor, type EffectHandle } from "@underglass/react";
import { colorCycle } from "../apps/effects/color-cycle";
import "./effects.css";

const params = new URLSearchParams(location.search);
// Profiler/effect counters: reported by `state()` (Profiler commits, effect mounts and cleanups).
const commits = { count: 0, mounts: 0, cleanups: 0 };
const profile: ProfilerOnRenderCallback = () => { commits.count++; };
let controller!: CanvasController;
let handle: EffectHandle | undefined;
let update!: (value: string) => void;
const listeners: (() => void)[] = [];
// Ring buffer of the runtime's `onMeasure` samples (capped at 4096 in `mount`).
const samples: { kind: string; at: number; durationMs: number; phase: string }[] = [];
// Effect policy shared by every descriptor: layer-sized bounds, no pointer interaction, `media: "identity"`
// and a static fallback.
const policy = { bounds: "layer", interaction: "decorative", media: "identity", fallback: "static" } as const;
// Builds an effect descriptor of the given kind with the shared policy and clock; `custom` carries the WGSL
// definition.
function descriptor(kind: "ripple" | "chromatic" | "dissolve" | "custom", seconds = 0, playing = false): EffectDescriptor {
  const common = { ...policy, time: { seconds, playing } };
  switch (kind) {
    case "ripple": return { ...common, kind, parameters: { amplitude: 8 } };
    case "chromatic": return { ...common, kind, parameters: { displacement: 8 } };
    case "dissolve": return { ...common, kind, parameters: { amount: .5, speed: 1 } };
    case "custom": return { ...common, kind, definition: colorCycle, parameters: { strength: 1, rate: 2 } };
  }
}
// Replaces the effect chain on the `art` layer and keeps the returned handle.
function apply(values: readonly EffectDescriptor[]) { handle = controller.setEffects("art", values); return handle; }
function report(error: unknown) { document.querySelector("#status")!.textContent = String(error); console.error(error); }
// Applies a playing effect and also starts a short motion transition on the artwork layer.
function choose(kind: "ripple" | "chromatic" | "dissolve" | "custom") {
  try {
    apply([descriptor(kind, 0, true)]);
    controller.transition("art", { keyframes: [{ offset: 0 }, { offset: 1, x: 15, rotation: 2 }], timing: { duration: 800 } });
  } catch (error) { report(error); }
}
// Two enrolled layers: `panel` holds the native controls, `art` is decorative (the only layer that takes effects).
function App() {
  const panel = useSurfaceRef<HTMLElement>({ id: "panel" });
  const art = useSurfaceRef<HTMLElement>({ id: "art", decorative: true });
  // Decorative layers must be inert; set that on the node before handing it to the runtime ref.
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
// Mount the app and start with the custom effect applied (effects only render in GPU mode).
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
// After a dispose the capture/output canvases are gone; recreate them so a new mount can run.
function restoreCanvases() {
  for (const id of ["capture", "output"]) if (!document.getElementById(id)) {
    const canvas = document.createElement("canvas"); canvas.id = id; canvas.hidden = true;
    document.querySelector("#frame")!.insertBefore(canvas, document.querySelector("#ordinary"));
  }
}
// HMR: wait for the previous module's disposal before mounting again.
const prior: unknown = import.meta.hot?.data.disposal;
if (prior instanceof Promise) { await prior; restoreCanvases(); }
mount();
// Wire the Enable / Disable / Dispose buttons.
function install() {
  for (const [id, operation] of [["enable", () => controller.enable()], ["disable", () => controller.disable()], ["dispose", dispose]] as const) {
    const element = document.getElementById(id)!;
    const listener = () => { void operation().catch(report); };
    element.addEventListener("click", listener); listeners.push(() => element.removeEventListener("click", listener));
  }
}
install();
let liveSerial = 0;
// Test hook. `compile` and `live` exercise custom WGSL: `compile` goes through disable and enable, `live` swaps the
// effect while GPU stays active. `cycle` disposes and remounts the whole page.
window.effectsProbe = {
  state, dispose, descriptor, apply, controller: () => controller, handle: () => handle!,
  update: value => flushSync(() => update(value)), samples: () => [...samples], clearSamples: () => { samples.length = 0; },
  async compile(wgsl: string) {
    await controller.disable();
    const definition = defineEffect({ ...colorCycle, name: "compile-fixture", wgsl });
    apply([{ ...descriptor("custom"), kind: "custom", definition, parameters: { strength: 1, rate: 2 } }]);
    return controller.enable();
  },
  /** Defines a brand-new custom effect and applies it while GPU keeps presenting. */
  live(wgsl: string) {
    const definition = defineEffect({ ...colorCycle, name: `live-${++liveSerial}`, wgsl });
    apply([{ ...descriptor("custom"), kind: "custom", definition, parameters: { strength: 1, rate: 0 } }]);
    return state();
  },
  async cycle() { const retired = await dispose(); restoreCanvases(); mount(); install(); await controller.enable(); return { retired, active: state() }; },
};
// GPU is on by default; `?dom` leaves the ordinary DOM.
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
    live(wgsl: string): ReturnType<typeof state>;
    cycle(): Promise<{ retired: ReturnType<typeof state>; active: ReturnType<typeof state> }>;
  } }
}
