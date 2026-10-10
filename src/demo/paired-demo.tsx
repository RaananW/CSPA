import { Profiler, StrictMode, useState, useEffect, type ReactNode } from "react";
import { createRoot, flushSync } from "./react-root";
import { mountApplicationModule, mountCanvasApp, Surface, type CanvasController, type AnimationPlayback, type MotionHandle } from "../canvas-spa";

const parameters = new URLSearchParams(location.search);
const existing = parameters.get("example") === "css";
const id = existing ? "legacy" : "authored";
const artId = existing ? "legacy-art" : "authored-art";
const commits = { count: 0, mounts: 0, cleanups: 0 };
let controller: CanvasController;
let source: Animation;
let originalEffect: AnimationEffect | null;
let playback: AnimationPlayback | undefined;
let motion: MotionHandle | undefined;
let reactPresentation: (opacity: number | undefined) => void;
const removers: (() => void)[] = [];
function Content() {
  const [name, setName] = useState("original");
  const [count, setCount] = useState(0);
  const [saved, setSaved] = useState("");
  useEffect(() => { commits.mounts++; return () => { commits.cleanups++; }; }, []);
  return <>
    <strong>One original native control tree</strong>
    <button id="counter" onClick={() => setCount(value => value + 1)}>Count {count}</button>
    <form onSubmit={event => { event.preventDefault(); setSaved(name); }}>
      <label htmlFor="name">Name</label><input id="name" value={name} onChange={event => setName(event.target.value)} />
      <button id="save">Save</button>
    </form>
    <output id="saved">{saved || "Not saved"}</output>
  </>;
}
function Art() {
  return <svg width="200" height="200" viewBox="0 0 200 200" aria-hidden="true">
    {Array.from({ length: 20 }, (_, index) => <rect key={index} x={index * 10} y="0" width="10" height="200"
      fill={index % 2 ? "rgb(25,100,220)" : "rgb(240,200,20)"} />)}
  </svg>;
}
function App() {
  const [opacity, setOpacity] = useState<number>();
  reactPresentation = value => flushSync(() => setOpacity(value));
  if (existing) return <>
    <section id={id} {...{ drawable: "" }} style={{ transform: "none", opacity: opacity ?? 1, transformOrigin: "0 0" }}><Content /></section>
    <section id={artId} {...{ drawable: "" }} ref={element => { if (element) element.inert = true; }} aria-hidden="true"><Art /></section>
  </>;
  return <>
    <Surface id={id} layout={{ x: 40, y: 50, width: 240, height: 240, padding: 12, direction: "column", gap: 6 }}
      appearance={{ background: "rgb(240,30,60)" }}><Content /></Surface>
    <Surface id={artId} decorative layout={{ x: 380, y: 60, width: 200, height: 200, direction: "column" }}><Art /></Surface>
  </>;
}
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
const options = {
  captureHost: document.querySelector<HTMLCanvasElement>("#capture")!,
  outputCanvas: document.querySelector<HTMLCanvasElement>("#output")!,
  ordinaryHost: document.querySelector<HTMLElement>("#ordinary")!,
  onStatus(message: string) { document.querySelector<HTMLElement>("#status")!.textContent = message; },
};
const tree: ReactNode = <Profiler id="paired-behavior" onRender={() => { commits.count++; }}><App /></Profiler>;
if (existing) {
  controller = mountApplicationModule(options, { mount({ container, enroll }) {
    const root = createRoot(container);
    const enrolled: (() => void)[] = [];
    try {
      flushSync(() => root.render(parameters.has("strict") ? <StrictMode>{tree}</StrictMode> : tree));
      for (const layerId of [id, artId]) enrolled.push(enroll({
        id: layerId, element: document.getElementById(layerId)!, layout: {}, transform: {}, preserveStyles: true, decorative: layerId === artId,
      }));
    } catch (error) { for (const release of enrolled) release(); root.unmount(); throw error; }
    return () => { for (const release of enrolled) release(); root.unmount(); };
  } });
} else controller = mountCanvasApp({ ...options, createRoot, flushSync, strict: parameters.has("strict") }, tree);
const element = document.getElementById(id)!;
if (existing) source = element.getAnimations()[0]!;
else {
  motion = controller.createMotion(id, {
    keyframes: [{ offset: 0 }, { offset: 1, x: 70, y: 20, rotation: 10, scaleX: 0.85, scaleY: 0.85, opacity: 0.5 }],
    timing: { duration: 1000, delay: 100, iterations: Infinity, direction: "alternate", fill: "both", easing: "linear" },
  });
  motion.seek(100);
  source = motion.nativeAnimation;
}
source.pause();
source.currentTime = 100;
originalEffect = source.effect;
function cssProvenance() {
  const rules = Array.from((document.getElementById("paired-styles") as HTMLStyleElement).sheet!.cssRules);
  const rule = rules.find(rule => rule instanceof CSSStyleRule && rule.selectorText === "#legacy");
  const frames = rules.find(rule => rule instanceof CSSKeyframesRule && rule.name === "paired-motion");
  if (!(rule instanceof CSSStyleRule) || !(frames instanceof CSSKeyframesRule)) throw new Error("Explicit CSS fixture provenance missing");
  return { rule, keyframes: frames };
}
function state() {
  return { ...controller.state(), commits: { ...commits }, example: existing ? "css" : "typed", id, artId,
    source: { time: source.currentTime, state: source.playState, detached: source.effect instanceof KeyframeEffect && source.effect.target === null, sameEffect: source.effect === originalEffect,
      transform: getComputedStyle(element).transform, opacity: getComputedStyle(element).opacity, declarations: element.style.cssText },
    playback: playback?.state(), demoListeners: removers.length };
}
async function enable() {
  if (controller.state().mode !== "dom") throw new Error("Release before a new ownership transaction");
  playback = existing ? controller.ownCSSAnimation(id, cssProvenance()) : motion!.own();
  playback.pause();
  controller.setRipple(artId, { amplitude: 8, seconds: 0 });
  await controller.enable();
  return state();
}
async function disable() { await controller.disable(); return state(); }
async function dispose() {
  await controller.dispose();
  source.cancel();
  for (const remove of removers.splice(0)) remove();
  return state();
}
async function advance(frames = 300, delta = 1000 / 60) {
  await controller.settle();
  const before = state();
  await controller.advance(frames, delta);
  return { before, after: state() };
}
function playing(value: boolean) {
  if (value) playback!.play(); else playback!.pause();
  const effect = controller.state().decorativeEffects[0];
  if (effect) controller.setRipple(artId, { amplitude: effect.amplitude, seconds: effect.seconds, playing: value });
}
window.pairedProbe = { state, enable, disable, dispose, advance, source: () => source, controller: () => controller,
  cssProvenance, playback: () => playback, motion: () => motion,
  reactPresentation: value => reactPresentation(value),
  async seek(time: number) { playback!.seek(time); await controller.settle(); return state(); } };
for (const [button, action] of [["gpu", enable], ["dom", disable], ["play", () => playing(true)], ["pause", () => playing(false)],
  ["seek", () => window.pairedProbe.seek(600)], ["dispose", dispose]] as const) {
  const node = document.getElementById(button)!;
  const listener = () => { void Promise.resolve().then(async () => {
    await action();
    const current = state();
    options.onStatus(`${current.reason}\n${current.example}: ${current.mode}; original source ${current.source.detached ? "target detached, GPU owned" : "native DOM"} at ${current.source.time}ms\nOwned timelines: ${current.runtimeResources.animationOwners}; decorative effects: ${current.runtimeResources.decorativeEffects}; CSS replacement sources: ${current.runtimeResources.cssReplacementSources}`);
  }).catch(error => {
    options.onStatus(`Action rejected: ${String(error)}`); console.error(error);
  }); };
  node.addEventListener("click", listener);
  removers.push(() => node.removeEventListener("click", listener));
}
if (import.meta.hot) {
  const hot = import.meta.hot;
  import.meta.hot.accept();
  hot.dispose(() => {
    const disposal = dispose();
    hot.data.disposal = disposal;
    void disposal.catch(error => console.error("Paired HMR cleanup retained resources or failed", error));
  });
}
declare global { interface Window { pairedProbe: {
  state: typeof state; enable: typeof enable; disable: typeof disable; dispose: typeof dispose; advance: typeof advance;
  source(): Animation; controller(): CanvasController; cssProvenance: typeof cssProvenance;
  playback(): AnimationPlayback | undefined; seek(time: number): Promise<ReturnType<typeof state>>;
  motion(): MotionHandle | undefined; reactPresentation(opacity: number | undefined): void;
} } }
