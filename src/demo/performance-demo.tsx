import { Profiler, version, useState } from "react";
import { createRoot, flushSync } from "./react-root";
import { mountCanvasApp, Surface, Box, type MountCanvasOptions, type MotionHandle } from "../canvas-spa";

type Sample = Parameters<NonNullable<MountCanvasOptions["onMeasure"]>>[0];
const parameters = new URLSearchParams(location.search);
const count = Number(parameters.get("layers") ?? 2);
const variant = parameters.get("variant") ?? "dom-static";
if (![2, 4, 8].includes(count) || !["dom-static", "gpu-static", "dom-affine", "gpu-affine", "gpu-ripple"].includes(variant)) {
  throw new Error("Invalid bounded performance fixture");
}
let commits = 0, collecting = false;
let samples: Sample[] = [];
function Cards() {
  const [value, setValue] = useState("");
  return <>{Array.from({ length: count }, (_, index) => <Surface key={index} id={`card-${index}`}
    decorative={index > 0}
    layout={{ x: 20 + index % 6 * 130, y: 20 + Math.floor(index / 6) * 130, width: 110, height: 110, padding: 4, direction: "column", gap: 2 }}
    appearance={{ background: index % 2 ? "rgb(38,104,215)" : "rgb(245,196,41)", fontSize: 12 }}>
    <Box>Layer {index + 1}</Box>
    <Box>Identical content</Box>
    {index === 0 ? <><label htmlFor="measurement-input">Native input</label><input id="measurement-input" size={8}
      value={value} onChange={event => setValue(event.target.value)} /></> :
      <svg width="100" height="60" aria-hidden="true">{Array.from({ length: 10 }, (_, stripe) =>
        <rect key={stripe} x={stripe * 10} width="5" height="60" fill="white" />)}</svg>}
  </Surface>)}</>;
}
const controller = mountCanvasApp({
  captureHost: document.querySelector<HTMLCanvasElement>("#capture")!,
  outputCanvas: document.querySelector<HTMLCanvasElement>("#output")!,
  ordinaryHost: document.getElementById("ordinary")!, createRoot, flushSync,
  budgets: { layers: 8, pixels: 2_000_000 },
  onStatus: message => { document.getElementById("status")!.textContent = message.startsWith("{") ? JSON.parse(message).mode : message; },
  onMeasure: sample => {
    if (!collecting) return;
    if (samples.length >= 100000) throw new Error("Bounded measurement sample capacity exceeded");
    samples.push(sample);
  },
}, <Profiler id="measurement" onRender={() => { commits++; }}><Cards /></Profiler>);
const motions: MotionHandle[] = [];
const startup = performance.now();
if (variant.endsWith("affine")) {
  for (let index = 0; index < count; index++) {
    const motion = controller.createMotion(`card-${index}`, {
      keyframes: [{ offset: 0, x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, opacity: 1 },
        { offset: 1, x: 12, y: 5, rotation: 5, scaleX: 0.94, scaleY: 0.94, opacity: 0.9 }],
      timing: { duration: 1000, iterations: 10, direction: "alternate", easing: "linear" },
    });
    motions.push(motion);
    if (variant.startsWith("gpu")) motion.own();
  }
}
if (variant.startsWith("gpu")) {
  const admitted = await controller.enable();
  if (admitted.mode !== "gpu") throw new Error(`Measurement admission failed: ${admitted.reason}`);
}
for (const motion of motions) motion.play();
if (variant === "gpu-ripple") {
  for (let index = 1; index < count; index++) controller.setRipple(`card-${index}`, { amplitude: 7, seconds: 0, playing: true });
}
await controller.settle();
const startupMs = performance.now() - startup;
window.measurement = {
  version, count, variant, startupMs,
  state: () => ({ ...controller.state(), commits }),
  settle: () => controller.settle(),
  disable: () => controller.disable(),
  async collect(milliseconds: number) {
    if (!Number.isFinite(milliseconds) || milliseconds < 500 || milliseconds > 5000 || collecting) throw new Error("Invalid finite measurement window");
    const before = this.state(), intervals: number[] = [];
    samples = [];
    collecting = true;
    const start = performance.now();
    let previous: number | undefined;
    await new Promise<void>(resolve => {
      const tick = (time: number) => {
        if (previous !== undefined) intervals.push(time - previous);
        previous = time;
        if (performance.now() - start >= milliseconds) resolve(); else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    const durationMs = performance.now() - start;
    collecting = false;
    const after = this.state(), recorded = samples;
    samples = [];
    return { start, durationMs, before, after, samples: recorded, intervals };
  },
  async dispose() { await controller.dispose(); return this.state(); },
};
declare global { interface Window { measurement: {
  version: string; count: number; variant: string; startupMs: number;
  state(): ReturnType<typeof controller.state> & { commits: number };
  settle(): Promise<void>;
  disable(): ReturnType<typeof controller.disable>;
  collect(milliseconds: number): Promise<{ start: number; durationMs: number; before: ReturnType<Window["measurement"]["state"]>;
    after: ReturnType<Window["measurement"]["state"]>; samples: Sample[]; intervals: number[] }>;
  dispose(): Promise<ReturnType<Window["measurement"]["state"]>>;
} } }
