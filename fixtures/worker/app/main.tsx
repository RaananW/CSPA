/**
 * Fixture app for the worker compositor validation (`scripts/worker-validation.mjs`). One page serves
 * several variants chosen by `?variant=`: `css` (plain CSS animation), `main` and `main-ripple` (main-thread
 * GPU), `worker` and `worker-ripple` (experimental worker). Tests use `window.workerFixture`; `?fault=`
 * injects a worker construction failure (`factory`) or a delayed shutdown reply (`stop-delay`).
 */
import { Profiler, useState, version } from "react";
import { flushSync, version as domVersion } from "react-dom";
import { mountCanvasApp, Surface, Box } from "@underglass/react";
import { mountWorkerCanvasApp, WorkerSurface, type WorkerProgram } from "@underglass/react/experimental-worker";
import program from "./program.json";

// Variant and fault are read from the page URL so one build covers every case.
const params = new URLSearchParams(location.search);
const variant = params.get("variant") ?? "css";
if (!["css", "main", "worker", "main-ripple", "worker-ripple"].includes(variant)) throw new Error("Unknown worker fixture variant");
const isWorker = variant.startsWith("worker"), ripple = variant.endsWith("ripple");
let commits = 0, renders = 0, changeStructure: () => void, changeLayout: () => void;
const operations: { kind: string; durationMs: number }[] = [];
function App() {
  renders++;
  const [value, setValue] = useState("original");
  const [saved, setSaved] = useState("original");
  const [present, setPresent] = useState(true);
  const [offset, setOffset] = useState(0);
  const [busy, setBusy] = useState(0);
  changeStructure = () => setPresent(previous => !previous);
  changeLayout = () => setOffset(previous => previous ? 0 : 8);
  // Eight similar layers; layer 0 holds the native controls, the others are decorative.
  const Layer = isWorker ? WorkerSurface : Surface;
  // Lets `collect` trigger React commits from outside to create main-thread contention.
  (window as unknown as { updateBusy: () => void }).updateBusy = () => setBusy(previous => previous + 1);
  return <>{Array.from({ length: 8 }, (_, index) => index === 7 && !present ? null : <Layer key={index}
    id={`layer-${index}`} decorative={index > 0}
    {...(isWorker ? { animation: index > 0 ? ripple ? "ripple" as const : "opacity" as const : "none" as const } : {})}
    layout={{ x: 20 + index % 4 * 150 + (index === 6 ? offset : 0), y: 20 + Math.floor(index / 4) * 150, width: 130, height: 130, padding: 4 }}
    appearance={{ background: index === 0 ? "rgb(245,196,41)" : "rgb(38,104,215)", fontSize: 12 }}>
    <Box>Layer {index + 1}: same content</Box>
    {index === 0 ? <Box layout={{ direction: "column", gap: 3 }}>
      <label htmlFor="native-input">Original native input</label>
      <input id="native-input" size={10} value={value} onChange={event => setValue(event.target.value)} />
      <button id="save" onClick={() => setSaved(value)}>Save</button>
      <Box id="saved">{saved}</Box><Box id="busy">React commits: {busy}</Box>
    </Box> : <svg width="120" height="80" aria-hidden="true">{Array.from({ length: 12 }, (_, stripe) =>
      <rect key={stripe} x={stripe * 10} width="5" height="80" fill="white" />)}</svg>}
  </Layer>)}</>;
}
const status = (message: string) => { document.getElementById("status")!.textContent = message; };
const originalHost = document.getElementById("ordinary")!;
// Worker variants mount through the experimental worker entry; the others use the regular main-thread mount.
const controller = isWorker ? mountWorkerCanvasApp({
  ordinaryHost: originalHost, canvasHost: document.getElementById("worker-host")!,
  width: 640, height: 320, program: program as WorkerProgram, strict: true, onStatus: status,
  createWorker: () => {
    if (params.get("fault") === "factory") throw new Error("Injected worker construction failure");
    const worker = new Worker(new URL("./thread.ts", import.meta.url), { type: "module" });
    // Fault injection: hold back the first `stop` message for 11 seconds, longer than the controller's 10 second
    // reply timeout (`request` in `experimental-worker.tsx`), so the first disable() fails with a timeout.
    if (params.get("fault") === "stop-delay") {
      const post = worker.postMessage.bind(worker);
      let delayed = false;
      worker.postMessage = (message: unknown, transfer?: StructuredSerializeOptions | Transferable[]) => {
        const send = () => { if (Array.isArray(transfer)) post(message, transfer); else post(message, transfer); };
        if (!delayed && message && typeof message === "object" && Reflect.get(message, "type") === "stop") {
          delayed = true; setTimeout(send, 11_000);
        } else send();
      };
    }
    return worker;
  },
}, <Profiler id="worker" onRender={() => commits++}><App /></Profiler>) : mountCanvasApp({
  ordinaryHost: originalHost, captureHost: document.querySelector<HTMLCanvasElement>("#capture")!,
  outputCanvas: document.querySelector<HTMLCanvasElement>("#output")!, strict: true,
  onStatus: status, budgets: { layers: 8, pixels: 2_000_000 },
  onMeasure: sample => {
    if (operations.length < 100_000) operations.push({ kind: sample.kind, durationMs: sample.durationMs });
  },
}, <Profiler id="main" onRender={() => commits++}><App /></Profiler>);
// Only the main-thread controller has `createMotion`; it starts the decorative layers' ripple or opacity motion.
if ("createMotion" in controller) for (let slot = 1; slot < 8; slot++) {
  if (ripple) controller.setRipple(`layer-${slot}`, { amplitude: 6, seconds: 0, playing: true });
  else {
    const motion = controller.createMotion(`layer-${slot}`, {
      keyframes: [{ offset: 0, opacity: 1 }, { offset: 1, opacity: 0.35 }],
      timing: { duration: 1000, direction: "alternate", iterations: 1000, easing: "linear" },
    });
    if (variant === "main") motion.own();
    motion.play();
  }
}
// Worker controllers report `statistics()` asynchronously; the main-thread controller reports `state()`.
const getState = async () => ({ ...("statistics" in controller ? await controller.statistics() : controller.state()), commits, renders,
  focused: document.activeElement?.id });
const api = {
  version, domVersion, variant, controller,
  state: getState,
  enable: () => controller.enable(),
  disable: () => controller.disable(),
  dispose: () => controller.dispose(),
  structure: () => flushSync(() => changeStructure()),
  layout: () => flushSync(() => changeLayout()),
  settle: () => controller.settle(),
  // Asks the controller to validate a moved surface and returns the error text plus layout before and after, to show nothing moved.
  fixedGeometryGuard() {
    if (!("validateSurface" in controller)) throw new Error("Worker fixture required");
    const before = document.getElementById("layer-0")!.getBoundingClientRect().toJSON();
    let reason: string | undefined;
    try { controller.validateSurface("layer-0", { x: 21, y: 20, width: 130, height: 130 }, false, "none"); }
    catch (error) { reason = String(error); }
    return { reason, before, after: document.getElementById("layer-0")!.getBoundingClientRect().toJSON() };
  },
  // Injects content the worker path must refuse (running animation, new control, picker, shifted geometry or unenrolled node).
  sourceFault(kind: string) {
    const decoration = document.getElementById("layer-1")!;
    if (kind === "animation") decoration.firstElementChild!.animate([{ opacity: 1 }, { opacity: 0.4 }], { duration: 1000, iterations: Infinity });
    else if (kind === "interactive") decoration.append(document.createElement("button"));
    else if (kind === "picker") {
      const input = document.createElement("input"); input.type = "color";
      document.getElementById("layer-0")!.append(input);
    } else if (kind === "geometry") document.getElementById("native-input")!.style.marginTop = "8px";
    else if (kind === "unenrolled") controller.container.append(document.createElement("div"));
    else throw new Error("Unknown synthetic worker source fault");
    controller.invalidate();
  },
  // Simulates a tab becoming hidden or visible by overriding `document.hidden` and firing `visibilitychange`.
  visibility(hidden: boolean) {
    if (hidden) Object.defineProperty(document, "hidden", { configurable: true, value: true });
    else Reflect.deleteProperty(document, "hidden");
    document.dispatchEvent(new Event("visibilitychange"));
  },
  // Measures frame intervals, long tasks and controller operations for a fixed window; `contention` adds busy React commits.
  async collect(milliseconds: number, contention: boolean) {
    if (!Number.isFinite(milliseconds) || milliseconds < 500 || milliseconds > 5000) throw new Error("Invalid benchmark duration");
    const before = await getState(), intervals: number[] = [];
    const longTasks: number[] = [];
    const observer = new PerformanceObserver(list => { for (const entry of list.getEntries()) longTasks.push(entry.duration); });
    observer.observe({ type: "longtask", buffered: false });
    operations.length = 0;
    let previous: number | undefined, timer: ReturnType<typeof setInterval> | undefined;
    const start = performance.now();
    // Every 80 ms commit a React update and block the main thread for 45 ms.
    if (contention) timer = setInterval(() => {
      flushSync(() => (window as unknown as { updateBusy(): void }).updateBusy());
      const until = performance.now() + 45;
      while (performance.now() < until) Math.sqrt(performance.now());
    }, 80);
    await new Promise<void>(resolve => {
      const frame = (now: number) => {
        if (previous !== undefined) intervals.push(now - previous);
        previous = now;
        if (performance.now() - start >= milliseconds) resolve(); else requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    });
    clearInterval(timer); observer.disconnect();
    return { before, after: await getState(), milliseconds: performance.now() - start, intervals, longTasks, operations: [...operations] };
  },
};
(window as unknown as { workerFixture: typeof api }).workerFixture = api;
// Wire the page's buttons to the same operations the tests call.
for (const key of ["enable", "disable", "dispose", "structure", "layout"] as const) {
  document.getElementById(key)!.onclick = () => { void api[key](); };
}
