/**
 * Instrument probe I0.1, the mesh pass (docs/ui-library/instrument.md, Phase I0): can a Lite mesh pass per layer run
 * inside the shared engine next to the relief passes, keep painter's order across panels and hold 60 fps with 250
 * controls (about 1,500 parts) at 1920 × 1080?
 *
 * Two enrolled panels of real native controls fill the window: `#lower` (with core's relief material) and `#upper`, a
 * plain layer that overlaps it, its left edge across one of the lower panel's knobs. Every control is the base of its
 * parts, drawn by `instrument-harness.ts` in a mesh scene per layer right after that layer's own pass:
 * - knob (`<input type="range">`): a collar, a skirt and a chamfered cap revolved from profiles, and a pointer line;
 *   the cap, skirt and pointer turn through `sweep` with the value;
 * - fader (vertical `<input type="range">`): a slot, a cap that slides with the value, and a grip line on the cap;
 * - key (`<button>`): a tapered body, a screen-locked top that loads the layer's capture (the label stays texel-exact)
 *   and an LED; the key travels on press;
 * - switch (`<input type="checkbox" role="switch">`): a track and a thumb that slides when the checkbox changes;
 * - meter (`<meter>`): a window and `segments` LED segments, lit up to the value.
 * Each part kind is one mesh with thin instances per layer. Controls follow a repeating pattern of 25 (5 meters,
 * 7 knobs, 4 faders, 5 keys, 4 switches: 148 parts), so 250 controls carry 1,480 parts and 50 meters.
 *
 * `window.instrumentProbe` drives the browser test (`tests/browser/ui-probe-instrument.test.mjs`): `settle`, `pixels`,
 * `project`, `tokens`, `setDensity(n)`, `animate(frames, options)`, `captureCount`, `frameTimes`, `gpuTimings`, and the
 * pixel analyses `meshDiff` and `labels`. `?density=n` sets the starting density (60), `?relief=0` drops the relief
 * material.
 */
import { createPbrMaterial, setPbrEmissive, type Material, type PbrMaterialProps, type Screenshot } from "@babylonjs/lite";
import { sceneSettings, strataTokens } from "@underglass/ui/tokens";
import { frustum, plate, revolve, bar, type PartData } from "./instrument-parts.ts";
import { startInstrument, type InstrumentLayer, type PartKind, type Rect } from "./instrument-harness.ts";
import type { Point } from "./common.ts";

const params = new URLSearchParams(location.search);
const status = document.getElementById("status")!;
const frame = document.getElementById("frame")!;
const settings = sceneSettings(strataTokens, { theme: "light", depth: 0.5 });
document.body.style.setProperty("--stage", settings.backdrop);

/** Probe tokens (Phase I1 sets the real values), in CSS px. */
const tokens = {
  light: settings.light,
  knob: { collar: 1.8, skirt: 8, cap: 14.2, pointer: 14.8, sweep: (270 * Math.PI) / 180, collarInset: 1, skirtInset: 4.5, capInset: 9 },
  fader: { rise: 9, taper: 2.5, inset: 2, length: 14 },
  key: { rise: 6, taper: 3, travel: 4 },
  switch: { track: 2.5, thumb: 7, thumbTaper: 2.5 },
  meter: { segments: 16, window: 1.2, segment: 1.4 },
  pattern: ["meter", "knob", "key", "knob", "fader", "meter", "switch", "knob", "key", "meter", "knob", "fader", "key",
    "switch", "meter", "knob", "key", "fader", "knob", "switch", "meter", "key", "fader", "switch", "knob"] as const,
  partsPerKind: { meter: 17, knob: 4, fader: 3, key: 3, switch: 2 },
};
type ControlKind = (typeof tokens.pattern)[number];
// Tallest point of each part and its inset from the control's box: the camera distance follows from these.
const envelopes = [
  { height: tokens.knob.collar, inset: tokens.knob.collarInset }, { height: tokens.knob.skirt, inset: tokens.knob.skirtInset },
  { height: tokens.knob.pointer, inset: tokens.knob.capInset }, { height: tokens.key.rise, inset: tokens.key.taper },
  { height: tokens.fader.rise + 0.5, inset: tokens.fader.inset + tokens.fader.taper }, { height: tokens.switch.thumb, inset: 2 + tokens.switch.thumbTaper },
  { height: tokens.meter.window + tokens.meter.segment, inset: 3 },
];

/** Deterministic values, so every run lays out the same states. */
function seeded(seed: number) { let state = seed >>> 0; return () => { state = (state + 0x6d2b79f5) >>> 0; let t = state; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

let lower!: HTMLElement, upper!: HTMLElement;
let density = Math.max(1, Number(params.get("density") ?? 60));
const srgbToLinear = (value: number) => { const c = value / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const linear = (r: number, g: number, b: number): [number, number, number, number] => [srgbToLinear(r), srgbToLinear(g), srgbToLinear(b), 1];
const pbr = (colour: [number, number, number, number], metallic: number, roughness: number, emissive?: [number, number, number]) => {
  const material = createPbrMaterial({ baseColorFactor: colour, metallicFactor: metallic, roughnessFactor: roughness, doubleSided: true });
  if (emissive) setPbrEmissive(material as unknown as PbrMaterialProps, emissive);
  return material as unknown as Material;
};

/** The largest cell edge that fits `count` cells in a `width` × `height` area. */
function fitCell(width: number, height: number, count: number) {
  let cell = Math.max(8, Math.floor(Math.sqrt((width * height) / Math.max(1, count))));
  while (cell > 8 && Math.floor(width / cell) * Math.floor(height / cell) < count) cell--;
  return cell;
}
/** Fills `panel` with `count` controls of the pattern, starting at pattern index `first`. */
function fill(panel: HTMLElement, count: number, first: number, title: string, random: () => number) {
  panel.replaceChildren();
  const heading = document.createElement("h2");
  heading.textContent = title;
  const grid = document.createElement("div");
  grid.className = "instrument-grid";
  panel.append(heading, grid);
  const width = panel.clientWidth - 32, height = panel.clientHeight - 24 - 26;
  const cell = fitCell(width, height, count);
  grid.style.gridTemplateColumns = `repeat(${Math.floor(width / cell)}, ${cell}px)`;
  grid.style.gridAutoRows = `${cell}px`;
  for (let index = 0; index < count; index++) {
    const kind = tokens.pattern[(first + index) % tokens.pattern.length]!;
    const id = `${panel.id}-${kind}-${index}`;
    const wrapper = document.createElement("div");
    wrapper.className = "instrument-cell";
    let control: HTMLElement;
    if (kind === "knob" || kind === "fader") {
      const input = document.createElement("input");
      Object.assign(input, { type: "range", min: "0", max: "100", value: String(Math.round(10 + random() * 80)) });
      input.setAttribute("aria-label", `${kind === "knob" ? "Knob" : "Fader"} ${index + 1}`);
      const size = kind === "knob" ? Math.round(cell * 0.78) : 0;
      Object.assign(input.style, kind === "knob" ? { width: `${size}px`, height: `${size}px` } : { width: `${Math.max(16, Math.round(cell * 0.34))}px`, height: `${Math.round(cell * 0.9)}px` });
      if (kind === "fader") input.setAttribute("aria-orientation", "vertical");
      control = input;
    } else if (kind === "key") {
      const button = document.createElement("button");
      button.type = "button";
      const label = document.createElement("span");
      label.className = "instrument-label";
      label.textContent = `K${index + 1}`;
      button.append(label);
      Object.assign(button.style, { width: `${Math.round(cell * 0.84)}px`, height: `${Math.round(cell * 0.56)}px`, fontSize: `${Math.max(9, Math.round(cell * 0.2))}px` });
      button.dataset.presses = "0";
      button.addEventListener("click", () => { button.dataset.presses = String(Number(button.dataset.presses) + 1); });
      control = button;
    } else if (kind === "switch") {
      const input = document.createElement("input");
      Object.assign(input, { type: "checkbox", checked: random() < 0.5 });
      input.setAttribute("role", "switch");
      input.setAttribute("aria-label", `Switch ${index + 1}`);
      const w = Math.max(32, Math.round(cell * 0.6)), h = Math.max(16, Math.round(cell * 0.3));
      Object.assign(input.style, { width: `${w}px`, height: `${h}px`, borderRadius: `${h / 2}px` });
      control = input;
    } else {
      const meter = document.createElement("meter");
      Object.assign(meter, { min: 0, max: 1, value: Math.round(random() * 100) / 100 });
      meter.setAttribute("aria-label", `Level ${index + 1}`);
      Object.assign(meter.style, { width: `${Math.max(10, Math.round(cell * 0.24))}px`, height: `${Math.round(cell * 0.9)}px` });
      control = meter;
    }
    control.id = id;
    control.dataset.part = kind;
    wrapper.append(control);
    grid.append(wrapper);
  }
  return cell;
}
/** Lays out `count` controls over both panels; the upper panel's left edge crosses one of the lower panel's knobs. */
function layout(count: number) {
  const width = frame.clientWidth, height = frame.clientHeight;
  Object.assign(lower.style, { left: "16px", top: "16px", width: `${width - 32}px`, height: `${height - 32}px` });
  const upperSize = { width: Math.round(width * 0.34), height: Math.round(height * 0.42) };
  const areaLower = (width - 64) * (height - 82), areaUpper = (upperSize.width - 32) * (upperSize.height - 50);
  const upperCount = Math.max(5, Math.round((count * areaUpper) / (areaLower + areaUpper))), lowerCount = Math.max(1, count - upperCount);
  const random = seeded(17);
  fill(lower, lowerCount, 0, "Lower panel: relief face, mesh pass after it", random);
  // The knob nearest a point right of the centre decides where the upper panel starts: it covers that knob's right half.
  const knobs = [...lower.querySelectorAll<HTMLElement>("[data-part=knob]")];
  const target = { x: width * 0.5, y: height * 0.32 };
  const centre = (element: HTMLElement) => { const box = element.getBoundingClientRect(); return { x: box.left + box.width / 2, y: box.top + box.height / 2, top: box.top }; };
  const straddled = knobs.reduce((best, knob) => (Math.hypot(centre(knob).x - target.x, centre(knob).y - target.y) < Math.hypot(centre(best).x - target.x, centre(best).y - target.y) ? knob : best), knobs[0]!);
  const at = centre(straddled);
  const frameBox = frame.getBoundingClientRect();
  const left = Math.round(at.x - frameBox.left), top = Math.max(24, Math.round(at.top - frameBox.top - 36));
  Object.assign(upper.style, { left: `${left}px`, top: `${top}px`, width: `${Math.min(upperSize.width, width - left - 24)}px`, height: `${Math.min(upperSize.height, height - top - 24)}px` });
  upper.dataset.straddles = straddled.id;
  fill(upper, upperCount, lowerCount, "Upper panel: plain face", random);
}

/** The relief material's scene for the lower panel: its face, raised, lit by the same key light as the meshes. */
const reliefScene = () => ({
  format: "strata-scene" as const, version: 1 as const, extent: { width: lower.offsetWidth, height: lower.offsetHeight },
  outset: { top: 14, right: 14, bottom: 14, left: 14 }, ...settings,
  primitives: [{ face: "raised" as const, rect: [0, 0, lower.offsetWidth, lower.offsetHeight] as [number, number, number, number], radius: 14, height: 8, material: "matte" }],
});
const reliefMaterial = () => ({ kind: "relief" as const, scene: reliefScene(), bounds: "layer" as const, interaction: "material" as const, media: "identity" as const, fallback: "static" as const });

// Per-layer part kinds and the controls they draw, rebuilt with each scene.
interface Built { layer: InstrumentLayer; parts: Record<string, PartKind>; controls: Map<HTMLElement, { kind: ControlKind; index: number; rect: Rect }> }
const built = new Map<string, Built>();
const shifted = (data: PartData, dy: number): PartData => ({ ...data, positions: data.positions.map((value, index) => (index % 3 === 1 ? value + dy : value)) });
const pressed = new Set<HTMLElement>();
/** Current pose inputs of a control: knob and fader value 0..1, switch on, meter level 0..1, key pressed. */
const valueOf = (control: HTMLElement) => control instanceof HTMLMeterElement ? control.value : control instanceof HTMLInputElement
  ? control.type === "checkbox" ? Number(control.checked) : (Number(control.value) - Number(control.min)) / (Number(control.max) - Number(control.min)) : Number(pressed.has(control));

/** Adds the part kinds of one layer and poses every control's parts. */
function build(layer: InstrumentLayer) {
  const controls = new Map<HTMLElement, { kind: ControlKind; index: number; rect: Rect }>();
  const counts: Record<ControlKind, number> = { meter: 0, knob: 0, fader: 0, key: 0, switch: 0 };
  for (const element of layer.element.querySelectorAll<HTMLElement>("[data-part]")) {
    const kind = element.dataset.part as ControlKind;
    controls.set(element, { kind, index: counts[kind]++, rect: layer.rectOf(element) });
  }
  const first = (kind: ControlKind) => [...controls.values()].find(control => control.kind === kind)?.rect;
  const upperLayer = layer.id === "upper";
  const parts: Record<string, PartKind> = {};
  // One mesh per kind and layer, sized from the layer's first control of that kind (all are laid out alike).
  const knob = first("knob");
  if (knob) {
    const r = knob.width / 2, k = tokens.knob, rc = Math.max(3, r - k.capInset);
    parts.collar = layer.kind("collar", revolve([[r - k.collarInset, 0], [r - k.collarInset, k.collar - 0.6], [r - k.collarInset - 0.6, k.collar], [r - k.skirtInset, k.collar]]), pbr(linear(150, 152, 158), 0.3, 0.5), counts.knob);
    parts.skirt = layer.kind("skirt", revolve([[r - k.skirtInset, k.collar], [r - k.skirtInset, k.skirt - 1], [r - k.skirtInset - 1, k.skirt], [rc + 0.5, k.skirt]]), pbr(linear(28, 29, 32), 0.2, 0.45), counts.knob);
    parts.cap = layer.kind("cap", revolve([[rc, k.skirt], [rc, k.cap - 1.2], [rc - 1.2, k.cap], [0, k.cap]]), pbr(linear(200, 202, 207), 0.25, 0.32), counts.knob);
    parts.pointer = layer.kind("pointer", shifted(bar(1.6, rc * 0.55, k.cap, k.pointer), rc * 0.4), pbr(linear(250, 250, 250), 0, 0.6, [0.35, 0.35, 0.35]), counts.knob);
  }
  const fader = first("fader");
  if (fader) {
    const f = tokens.fader, w = fader.width - 2 * f.inset;
    parts.slot = layer.kind("slot", frustum(3, fader.height - f.length, 1.5, 0.4, 0), pbr(linear(8, 8, 10), 0, 0.9), counts.fader);
    parts.faderCap = layer.kind("fader-cap", frustum(w, f.length, 2.5, f.rise, f.taper), pbr(linear(52, 54, 60), 0.2, 0.4), counts.fader);
    parts.grip = layer.kind("grip", bar(Math.max(2, w - 2 * f.taper - 4), 1.4, f.rise, f.rise + 0.5), pbr(linear(245, 245, 245), 0, 0.5, [0.3, 0.3, 0.3]), counts.fader);
  }
  const key = first("key");
  if (key) {
    const t = tokens.key, radius = 6;
    const body = upperLayer ? linear(196, 202, 212) : linear(30, 80, 200);
    parts.keyBody = layer.kind("key-body", frustum(key.width, key.height, radius, t.rise, t.taper, 0, true), pbr(body, 0.1, 0.4), counts.key);
    parts.keyTop = layer.kind("key-top", plate(key.width - 2 * t.taper, key.height - 2 * t.taper, Math.max(0.5, radius - t.taper), t.rise), layer.capture("key-top"), counts.key);
    parts.led = layer.kind("led", revolve([[2.2, t.rise], [2.2, t.rise + 0.4], [1.2, t.rise + 1.1], [0, t.rise + 1.2]], 16), pbr(linear(20, 60, 30), 0, 0.3, [0.1, 0.9, 0.3]), counts.key);
  }
  const toggle = first("switch");
  if (toggle) {
    const s = tokens.switch, d = toggle.height - 4;
    parts.track = layer.kind("track", frustum(toggle.width - 2, toggle.height - 2, (toggle.height - 2) / 2, s.track, 0.8), pbr(linear(110, 114, 122), 0, 0.7), counts.switch);
    parts.thumb = layer.kind("thumb", frustum(d, d, d / 2, s.thumb, s.thumbTaper), pbr(linear(236, 238, 242), 0.1, 0.35), counts.switch);
  }
  const meter = first("meter");
  if (meter) {
    const m = tokens.meter, segment = (meter.height - 6) / m.segments;
    const segmentData = frustum(meter.width - 6, segment - 1.2, 0.8, m.segment, 0.3, m.window);
    parts.window = layer.kind("window", frustum(meter.width, meter.height, 2, m.window, 0.6), pbr(linear(10, 10, 12), 0, 0.3), counts.meter);
    parts.lit = layer.kind("segment-lit", segmentData, pbr(linear(30, 160, 70), 0, 0.35, [0.1, 0.85, 0.3]), counts.meter * m.segments);
    parts.dark = layer.kind("segment-dark", segmentData, pbr(linear(18, 30, 22), 0, 0.4), counts.meter * m.segments);
  }
  const entry: Built = { layer, parts, controls };
  for (const [element] of controls) pose(entry, element);
  built.set(layer.id, entry);
}
/** Writes one control's parts from its native state; `level` and `turn` override the meter and knob (animation). */
function pose(entry: Built, element: HTMLElement, override?: { level?: number; turn?: number }) {
  const control = entry.controls.get(element);
  if (!control) return;
  const { kind, index, rect } = control, parts = entry.parts;
  const cx = rect.x + rect.width / 2, cy = rect.y + rect.height / 2, value = valueOf(element);
  if (kind === "knob") {
    const angle = (0.5 - (override?.turn ?? value)) * tokens.knob.sweep;
    parts.collar!.pose(index, { x: cx, y: cy });
    for (const part of [parts.skirt!, parts.cap!, parts.pointer!]) part.pose(index, { x: cx, y: cy, angle });
  } else if (kind === "fader") {
    const f = tokens.fader, travel = rect.height - f.length;
    parts.slot!.pose(index, { x: cx, y: cy });
    const y = rect.y + f.length / 2 + (1 - value) * travel;
    parts.faderCap!.pose(index, { x: cx, y });
    parts.grip!.pose(index, { x: cx, y });
  } else if (kind === "key") {
    const t = tokens.key, lift = value ? -t.travel : 0;
    parts.keyBody!.pose(index, { x: cx, y: cy, lift });
    parts.keyTop!.pose(index, { x: cx, y: cy, lift, locked: t.rise });
    parts.led!.pose(index, { x: rect.x + rect.width - t.taper - 5, y: rect.y + t.taper + 5, lift });
  } else if (kind === "switch") {
    const d = rect.height - 4;
    parts.track!.pose(index, { x: cx, y: cy });
    parts.thumb!.pose(index, { x: rect.x + 2 + d / 2 + value * (rect.width - 4 - d), y: cy });
  } else {
    const m = tokens.meter, segment = (rect.height - 6) / m.segments, lit = Math.round((override?.level ?? value) * m.segments);
    parts.window!.pose(index, { x: cx, y: cy });
    for (let step = 0; step < m.segments; step++) {
      const slot = index * m.segments + step, at = { x: cx, y: rect.y + 3 + (m.segments - 1 - step + 0.5) * segment };
      if (step < lit) { parts.lit!.pose(slot, at); parts.dark!.hide(slot); } else { parts.dark!.pose(slot, at); parts.lit!.hide(slot); }
    }
  }
}
const flushAll = () => { for (const entry of built.values()) for (const part of Object.values(entry.parts)) part.flush(); };
const entryOf = (element: HTMLElement) => [...built.values()].find(entry => entry.controls.has(element));

// The test waits for `window.instrumentProbe` and then for `ready`, which rejects with the reason if the probe cannot start.
let resolveReady!: (api: InstrumentProbeApi) => void;
let readyFailed!: (error: unknown) => void;
window.instrumentProbe = { ready: new Promise<InstrumentProbeApi>((resolve, reject) => { resolveReady = resolve; readyFailed = reject; }) };
const harness = await startInstrument({
  frame, light: tokens.light, envelopes, budgets: { layers: 8, pixels: 4_000_000 },
  onStatus: message => { status.dataset.core = message; },
  mount(root) {
    lower = document.createElement("section");
    upper = document.createElement("section");
    lower.id = "lower"; upper.id = "upper";
    for (const panel of [lower, upper]) { panel.className = "instrument-panel"; panel.setAttribute("aria-label", panel.id === "lower" ? "Lower panel" : "Upper panel"); }
    root.append(lower, upper);
    layout(density);
    return [lower, upper];
  },
  build,
}).catch(error => {
  status.textContent = `Probe unavailable: ${error}`;
  window.instrumentProbe.error = String(error);
  readyFailed(error);
  throw error;
});

let relief = params.get("relief") !== "0" ? harness.controller.setMaterial("lower", reliefMaterial()) : undefined;
// Native state drives the parts: a value, a check or a press changes poses only, never the capture (the native change
// itself is what core captures).
for (const panel of [lower, upper]) {
  const refresh = (event: Event) => { const element = event.target as HTMLElement, entry = entryOf(element); if (entry) { pose(entry, element); flushAll(); harness.draw(); } };
  panel.addEventListener("input", refresh);
  panel.addEventListener("change", refresh);
  panel.addEventListener("pointerdown", event => { const key = (event.target as HTMLElement).closest("button"); if (key) { pressed.add(key); refresh({ target: key } as unknown as Event); } });
  for (const type of ["pointerup", "pointerleave", "pointercancel"]) panel.addEventListener(type, event => {
    const key = (event.target as HTMLElement).closest("button");
    if (key && pressed.delete(key)) refresh({ target: key } as unknown as Event);
  }, true);
}

let shot: Screenshot | undefined;
let lastFrames: Awaited<ReturnType<typeof harness.measure>> | undefined;
const canvasBox = () => harness.hosts.outputCanvas.getBoundingClientRect();
const describe = () => {
  const camera = harness.camera(), parts = [...built.values()].reduce((sum, entry) => sum + [...entry.controls.values()].reduce((total, control) => total + tokens.partsPerKind[control.kind], 0), 0);
  status.textContent = `I0.1 mesh pass: ${controlCount()} controls, ${parts} parts, camera ${camera.distance} px, drift at ${tokens.knob.pointer} px: ${harness.drift(tokens.knob.pointer).toFixed(2)} px\n${status.dataset.core ?? ""}`;
};
const controlCount = () => [...built.values()].reduce((sum, entry) => sum + entry.controls.size, 0);
/** Client-space box and corner radius of every control, and of the panels. */
const controls = () => [...built.values()].flatMap(entry => [...entry.controls].map(([element, control]) => {
  const box = element.getBoundingClientRect();
  return { id: element.id, kind: control.kind, layer: entry.layer.id, x: box.left, y: box.top, width: box.width, height: box.height, radius: parseFloat(getComputedStyle(element).borderTopLeftRadius) || 0 };
}));
const panelBoxes = () => Object.fromEntries([lower, upper].map(panel => { const box = panel.getBoundingClientRect(); return [panel.id, { x: box.left, y: box.top, width: box.width, height: box.height, radius: 14 }]; }));
/** Signed distance from a point to a rounded rectangle, negative inside. */
const rounded = (point: Point, box: { x: number; y: number; width: number; height: number; radius: number }) => {
  const radius = Math.min(box.radius, box.width / 2, box.height / 2);
  const qx = Math.abs(point.x - box.x - box.width / 2) - box.width / 2 + radius, qy = Math.abs(point.y - box.y - box.height / 2) - box.height / 2 + radius;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - radius;
};

async function settle() {
  await harness.idle();
  for (let index = 0; index < 3; index++) { harness.draw(); await new Promise(resolve => requestAnimationFrame(resolve)); }
  shot = await harness.readback();
  describe();
}
/** Mesh pass on and off, compared pixel for pixel: where meshes drew, and whether each drawn pixel is inside its control. */
async function meshDiff(samples = 4000) {
  harness.setMeshes(true);
  await settle();
  const on = shot!;
  harness.setMeshes(false);
  await settle();
  const off = shot!;
  harness.setMeshes(true);
  await settle();
  const box = canvasBox(), dpr = harness.dpr, list = controls(), panels = panelBoxes(), upperBox = panels.upper!;
  const straddled = list.find(control => control.id === upper.dataset.straddles)!;
  const result = { changed: 0, outside: 0, outsideSamples: [] as { x: number; y: number; distance: number; on: number[]; off: number[] }[], maxDistance: -Infinity, tolerance: 0, lowerUnderUpper: 0, lowerUnderUpperSamples: [] as { x: number; y: number; edge: number; on: number[]; off: number[] }[], upperOwn: 0,
    straddled: { id: straddled.id, uncovered: 0, covered: 0 }, perKind: {} as Record<string, number>, hitSamples: [] as { x: number; y: number; id: string; expected: string }[] };
  const changedPoints: { x: number; y: number; id: string }[] = [];
  // Strict containment: a drawn pixel's centre must lie inside its control's rounded box or on its edge.
  const tolerance = 0;
  result.tolerance = tolerance;
  // Controls by row band, so each changed pixel checks only nearby boxes.
  const band = 64, rows = new Map<number, typeof list>();
  for (const control of list) for (let row = Math.floor(control.y / band); row <= Math.floor((control.y + control.height) / band); row++) { if (!rows.has(row)) rows.set(row, []); rows.get(row)!.push(control); }
  for (let y = 0; y < on.height; y++) for (let x = 0; x < on.width; x++) {
    const offset = (y * on.width + x) * 4;
    if (on.data[offset] === off.data[offset] && on.data[offset + 1] === off.data[offset + 1] && on.data[offset + 2] === off.data[offset + 2]) continue;
    result.changed++;
    const point = { x: box.left + (x + 0.5) / dpr, y: box.top + (y + 0.5) / dpr };
    // A pixel belongs to the control whose rounded box holds its centre (`tolerance` beyond its edge at most).
    // More than a pixel inside the upper panel, only the upper panel's controls may draw.
    const edge = rounded(point, upperBox), candidates = rows.get(Math.floor(point.y / band)) ?? [];
    let owner: (typeof list)[number] | undefined, distance = Infinity;
    for (const control of candidates) {
      if (edge < -1 && control.layer !== "upper") continue;
      const d = rounded(point, control);
      if (d < distance) { distance = d; owner = control; }
    }
    if (!owner || distance > tolerance) {
      result.outside++;
      if (result.outsideSamples.length < 20) result.outsideSamples.push({ ...point, distance, on: [...on.data.subarray(offset, offset + 4)], off: [...off.data.subarray(offset, offset + 4)] });
      // A lower control's mesh showing through the upper panel is an occlusion failure, counted separately.
      if (edge < -1 && candidates.some(control => control.layer === "lower" && rounded(point, control) <= tolerance)) {
        result.lowerUnderUpper++;
        if (result.lowerUnderUpperSamples.length < 20) result.lowerUnderUpperSamples.push({ ...point, edge, on: [...on.data.subarray(offset, offset + 4)], off: [...off.data.subarray(offset, offset + 4)] });
      }
      continue;
    }
    result.maxDistance = Math.max(result.maxDistance, distance);
    if (edge < -1) result.upperOwn++;
    result.perKind[owner.kind] = (result.perKind[owner.kind] ?? 0) + 1;
    if (owner.id === straddled.id && Math.abs(edge) > 1) result.straddled[edge < 0 ? "covered" : "uncovered"]++;
    // Native hits are judged a pixel or more inside the control and away from the upper panel's edge (P0.4's rule).
    if (distance <= -1 && Math.abs(edge) > 1) changedPoints.push({ ...point, id: owner.id });
  }
  // Native hits on drawn mesh pixels: an even sample over every changed pixel.
  const step = Math.max(1, Math.floor(changedPoints.length / samples));
  for (let index = 0; index < changedPoints.length; index += step) {
    const point = changedPoints[index]!, hit = document.elementFromPoint(point.x, point.y);
    // A hit on a control's own descendant (a key's label) is a hit on the control.
    result.hitSamples.push({ ...point, id: hit?.closest<HTMLElement>("[data-part]")?.id ?? hit?.id ?? "", expected: point.id });
  }
  const mismatches = result.hitSamples.filter(sample => sample.id !== sample.expected);
  return { ...result, hitMismatches: mismatches.length, hitMismatchSamples: mismatches.slice(0, 10), hitSampleCount: result.hitSamples.length, hitSamples: result.hitSamples.slice(0, 10) };
}
/**
 * Pixels of each key's label rect with the mesh pass on, against a reference: the same layer drawn by core's plain
 * pass with the mesh pass off (and the lower panel's relief material removed), which presents the capture texel for
 * texel.
 */
async function labels(ids: string[]) {
  harness.setMeshes(true);
  await settle();
  const on = shot!;
  relief?.cancel();
  harness.setMeshes(false);
  await settle();
  const reference = shot!;
  if (relief) relief = harness.controller.setMaterial("lower", reliefMaterial());
  harness.setMeshes(true);
  await settle();
  const box = canvasBox(), dpr = harness.dpr;
  return ids.map(id => {
    const label = document.getElementById(id)!.querySelector(".instrument-label")!.getBoundingClientRect();
    let compared = 0, mismatched = 0;
    const samples: { x: number; y: number; on: number[]; reference: number[] }[] = [];
    const colours = new Set<string>();
    for (let y = Math.ceil((label.top - box.top) * dpr); y < Math.floor((label.bottom - box.top) * dpr); y++) {
      for (let x = Math.ceil((label.left - box.left) * dpr); x < Math.floor((label.right - box.left) * dpr); x++) {
        const offset = (y * on.width + x) * 4;
        compared++;
        if (on.data[offset] !== reference.data[offset] || on.data[offset + 1] !== reference.data[offset + 1] || on.data[offset + 2] !== reference.data[offset + 2]) {
          mismatched++;
          if (samples.length < 6) samples.push({ x: box.left + (x + 0.5) / dpr, y: box.top + (y + 0.5) / dpr, on: [...on.data.subarray(offset, offset + 4)], reference: [...reference.data.subarray(offset, offset + 4)] });
        }
        colours.add(`${on.data[offset]},${on.data[offset + 1]},${on.data[offset + 2]}`);
      }
    }
    return { id, compared, mismatched, colours: colours.size, samples };
  });
}
/**
 * Animates `meters` meters and `knobs` knobs for `frames` frames as pose changes only (or, with `dom`, by writing the
 * meters' native values too), and returns frame timing and the capture, upload and geometry counts over the run.
 */
async function animate(frames: number, options: { meters?: number; knobs?: number; dom?: boolean } = {}) {
  const all = [...built.values()].flatMap(entry => [...entry.controls].map(([element, control]) => ({ entry, element, kind: control.kind })));
  const meters = all.filter(control => control.kind === "meter").slice(0, options.meters ?? 50);
  const knobs = all.filter(control => control.kind === "knob").slice(0, options.knobs ?? 20);
  await harness.idle();
  const before = harness.counts();
  const result = await harness.measure(frames, index => {
    meters.forEach((meter, which) => {
      const level = 0.5 + 0.45 * Math.sin(index / 6 + which);
      if (options.dom) (meter.element as HTMLMeterElement).value = Math.round(level * 100) / 100;
      pose(meter.entry, meter.element, { level });
    });
    knobs.forEach((knob, which) => pose(knob.entry, knob.element, { turn: 0.5 + 0.45 * Math.sin(index / 20 + which) }));
    flushAll();
  });
  const after = harness.counts();
  lastFrames = result;
  // Back to the native state.
  for (const control of [...meters, ...knobs]) pose(control.entry, control.element);
  flushAll();
  harness.draw();
  return { frames, meters: meters.length, knobs: knobs.length, dom: !!options.dom, controls: controlCount(),
    captures: after.captures - before.captures, uploads: after.uploads - before.uploads, geometryUpdates: after.geometryUpdates - before.geometryUpdates,
    gpuFrames: after.gpuFrames - before.gpuFrames, mode: after.mode, reason: after.reason, ...result };
}
async function setDensity(count: number) {
  density = count;
  // A new layout replaces every control: the old parts leave the surface first, so no frame draws them over the new
  // layout (the prototype rebuilds scenes; Phase I2 updates instances with the layout in the same frame).
  harness.setMeshes(false);
  layout(count);
  if (relief) relief.update(reliefScene());
  await harness.controller.settle();
  await harness.rebuild();
  harness.setMeshes(true);
  await settle();
  const parts = [...built.values()].reduce((sum, entry) => sum + [...entry.controls.values()].reduce((total, control) => total + tokens.partsPerKind[control.kind], 0), 0);
  const kinds = [...built.values()].reduce((sum, entry) => sum + Object.keys(entry.parts).length, 0);
  return { controls: controlCount(), parts, kinds, perKind: Object.fromEntries(tokens.pattern.map(kind => [kind, [...built.values()].reduce((sum, entry) => sum + [...entry.controls.values()].filter(control => control.kind === kind).length, 0)])),
    camera: harness.camera(), counts: harness.counts() };
}

await settle();
const api = {
  dpr: harness.dpr,
  tokens: () => ({ ...tokens, envelopes, camera: harness.camera() }),
  settle,
  /** RGBA at client points from the last settled frame. */
  pixels: (points: Point[]) => points.map(point => harness.pixel(shot!, point)),
  /** Client point of a layer-local point of panel `id`. */
  project: (id: string, point: Point): Point => { const box = document.getElementById(id)!.getBoundingClientRect(); return { x: box.left + point.x, y: box.top + point.y }; },
  /** The control (or, outside every control, the element id) native hit testing finds at each client point. */
  hits: (points: Point[]) => points.map(point => { const hit = document.elementFromPoint(point.x, point.y); return hit?.closest<HTMLElement>("[data-part]")?.id ?? hit?.id ?? ""; }),
  controls, panels: panelBoxes, straddled: () => upper.dataset.straddles,
  state: (id: string) => { const element = document.getElementById(id) as HTMLInputElement; return { value: element.value, checked: element.checked, presses: Number(element.dataset.presses ?? 0) }; },
  setDensity, animate, meshDiff, labels,
  setMeshes: (on: boolean) => harness.setMeshes(on),
  captureCount: () => harness.counts().captures,
  counts: () => harness.counts(),
  frameTimes: () => lastFrames,
  gpuTimings: () => harness.gpuTimings(),
  diagnostics: () => [...harness.diagnostics],
  camera: () => harness.camera(), drift: (h: number) => harness.drift(h),
  browser: () => navigator.userAgent,
};
type InstrumentProbeApi = typeof api;
declare global { interface Window { instrumentProbe: { ready: Promise<InstrumentProbeApi>; error?: string } } }
resolveReady(api);
