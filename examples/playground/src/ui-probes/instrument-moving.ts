/**
 * Instrument probe I0.2, moving parts and hits (docs/ui-library/instrument.md, Phase I0): do levers, rockers and
 * fader caps stay inside their control's box through their whole travel, and do native hits land on the control at
 * every pose?
 *
 * One enrolled panel fills the stage, so controls reach its corners and edges, where perspective drift is largest. Six
 * kinds of real native control, each drawn by meshes in the panel's layer scene (`instrument-harness.ts`):
 * - rocker (`<input type="checkbox" role="switch">`): a bezel and two plates in a shallow V on a pivot, tipping ±13°;
 * - bat (checkbox switch): a washer, a hex nut, and a lever with a ball on top, swinging ±25° over centre;
 * - wall (checkbox switch): a wall plate with a paddle tipping ±12°;
 * - slide (checkbox switch): a track and a round thumb sliding across it;
 * - fader (vertical `<input type="range">`): a slot and a cap with a grip line sliding the full slot;
 * - knob (`<input type="range">`): a collar, and a skirt, a cap and a pointer turning through the 270° sweep.
 * Parts move with the native state only (`checked`, `value`): a change of state is a pose, never a recapture. A switch
 * snaps to its new state over `snapMs` with an easing that never overshoots, so the extreme poses bound every pose.
 *
 * **Box sizing rule** (the plan: "the box covers the whole travel of every moving part"): a control's box is the
 * orthographic footprint of its moving parts over their whole travel, plus a margin on every side of
 * `ceil(drift(h) + 1)`, where `h` is the part's highest point over the travel and `drift(h) = r · h / (D − h)` at the
 * reference stage (1920 × 1080, `r` its half diagonal) and the harness's minimum distance `D` = 2400. A form may ask for
 * a larger box (a wall plate is wider than its paddle); never a smaller one. Static parts (bezel, plate, track, slot,
 * collar) are sized from the box and follow the taper rule. The envelopes passed to the harness are each part's
 * highest point and its actual margin, so on a larger stage the harness raises `D` instead of shrinking anything.
 *
 * The harness's `Pose` turns parts about their own z axis only; tipping needs a turn about an in-plane axis through a
 * pivot above the face, so the parts here are thin-instanced on the layer scene with full pose matrices (same meshes,
 * `partMesh`), and the CPU projection below uses the same matrices for the analytic containment check.
 *
 * `window.movingProbe` drives the browser test (`tests/browser/ui-probe-instrument-moving.test.mjs`): `setLayout`,
 * `setPose`, `containment` (decoded pixels, meshes on and off, per part in isolation), `gridHits`, `meshHits`,
 * `analytic` and `worstCorner` (the CPU projection), `anchor` (where a moving part is drawn now, for real pointer
 * input), `animate`, `transforms`, `counts` and `diagnostics`.
 */
import { addToScene, createPbrMaterial, flushThinInstances, setPbrEmissive, setThinInstances, type Material, type PbrMaterialProps, type Screenshot } from "@babylonjs/lite";
import { sceneSettings, strataTokens } from "@underglass/ui/tokens";
import { bar, frustum, merge, offset, partMesh, revolve, sphere, turnX, type PartData } from "./instrument-parts.ts";
import { startInstrument, type Envelope, type InstrumentLayer, type PartKind, type Rect } from "./instrument-harness.ts";
import type { DrawableCanvas, Point } from "./common.ts";

const params = new URLSearchParams(location.search);
const status = document.getElementById("status")!;
const frame = document.getElementById("frame")!;
const settings = sceneSettings(strataTokens, { theme: "light", depth: 0.5 });
document.body.style.setProperty("--stage", settings.backdrop);
const deg = Math.PI / 180;

/** Probe tokens (Phase I1 sets the real values), in CSS px and radians. */
const tokens = {
  light: settings.light,
  /** The stage and camera distance the box margins are sized for. */
  reference: { width: 1920, height: 1080, distance: 2400 },
  rocker: { width: 20, length: 30, thickness: 3, valley: 6 * deg, throw: 13 * deg, pivot: 4.5, bezelRise: 2.5, bezelTaper: 1.5, radius: 5 },
  bat: { lever: 17, rodBase: 2, rodTip: 1.4, ball: 4.2, throw: 25 * deg, pivot: 4, nut: 6.5, washer: 10, washerRise: 1, radius: 6 },
  wall: { paddleWidth: 10, paddleLength: 20, paddleRise: 6, paddleTaper: 1.2, throw: 12 * deg, pivot: 2, plateRise: 2, plateTaper: 1.5, radius: 3, plateWidth: 2.8, plateLength: 2.1 },
  slide: { thumb: 14, thumbRise: 6, thumbTaper: 2, travel: 14, trackRise: 1.2, trackTaper: 0.6 },
  fader: { capWidth: 16, capLength: 12, rise: 9, taper: 2.5, grip: 0.5, travel: 80, radius: 4 },
  knob: { box: 48, collar: 1.8, skirt: 8, cap: 14.2, pointer: 14.8, sweep: 270 * deg, collarInset: 1, skirtInset: 4.5, capInset: 9 },
  /** Gap between controls in a cluster, distance of the outermost boxes from the stage edge, snap time, travel samples. */
  gap: 16, edge: 8, snapMs: 140, samples: 33,
};
const kinds = ["rocker", "bat", "wall", "slide", "fader", "knob"] as const;
type Kind = (typeof kinds)[number];
const switches = new Set<Kind>(["rocker", "bat", "wall", "slide"]);
/** How a part moves with travel `t` (0 off or minimum, 1 on or maximum). */
type Motion = "fixed" | "tilt" | "slideX" | "slideY" | "turn";
interface PartSpec { name: string; data: PartData; colour: [number, number, number]; metallic: number; roughness: number; emissive?: [number, number, number]; motion: Motion; pivot: number; reach: number }
interface KindSpec { kind: Kind; box: { width: number; height: number; radius: number }; parts: PartSpec[]; rule: { width: number; height: number }; margins: Record<string, number> }

const reference = { radius: Math.hypot(tokens.reference.width, tokens.reference.height) / 2, distance: tokens.reference.distance };
const referenceDrift = (h: number) => (reference.radius * h) / (reference.distance - h);
const marginFor = (h: number) => Math.ceil(referenceDrift(h) + 1);

/** Column-major 4 × 4 pose of a part at travel `t`, relative to its control's centre (world axes: y up, z = −h). */
function local(spec: PartSpec, t: number): number[] {
  const amount = spec.reach * (spec.motion === "turn" ? 0.5 - t : spec.motion === "slideY" ? t - 0.5 : 2 * t - 1);
  if (spec.motion === "tilt") {
    const c = Math.cos(amount), s = Math.sin(amount), pv = spec.pivot;
    return [1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, -s * pv, (c - 1) * pv, 1];
  }
  if (spec.motion === "turn") { const c = Math.cos(amount), s = Math.sin(amount); return [c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; }
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, spec.motion === "slideX" ? amount : 0, spec.motion === "slideY" ? amount : 0, 0, 1];
}
const apply = (m: number[], x: number, y: number, z: number): [number, number, number] =>
  [m[0]! * x + m[4]! * y + m[8]! * z + m[12]!, m[1]! * x + m[5]! * y + m[9]! * z + m[13]!, m[2]! * x + m[6]! * y + m[10]! * z + m[14]!];
const travels = (count = tokens.samples) => Array.from({ length: count }, (_, index) => index / (count - 1));

/** Orthographic footprint (half extents) and highest point of a part over its whole travel. */
function footprint(spec: PartSpec) {
  let x = 0, y = 0, h = 0;
  for (const t of travels()) {
    const m = local(spec, t);
    for (let index = 0; index < spec.data.positions.length; index += 3) {
      const [px, py, pz] = apply(m, spec.data.positions[index]!, spec.data.positions[index + 1]!, spec.data.positions[index + 2]!);
      x = Math.max(x, Math.abs(px)); y = Math.max(y, Math.abs(py)); h = Math.max(h, -pz);
    }
  }
  return { x, y, h };
}
const part = (name: string, data: PartData, motion: Motion, colour: [number, number, number], metallic: number, roughness: number, extra: Partial<PartSpec> = {}): PartSpec =>
  ({ name, data, motion, colour, metallic, roughness, pivot: 0, reach: 0, ...extra });

/** Builds one kind: its moving parts from tokens, its box by the sizing rule (or the form's minimum), its static parts from the box. */
function kindSpec(kind: Kind): KindSpec {
  let moving: PartSpec[] = [], form = { width: 0, height: 0 }, radius = 4;
  let fixed: (box: { width: number; height: number; radius: number }) => PartSpec[];
  if (kind === "rocker") {
    const r = tokens.rocker, half = (sign: number) => turnX(offset(frustum(r.width, r.length / 2, 2, r.thickness, 0.8, r.pivot), 0, (sign * r.length) / 4), -sign * r.valley, r.pivot);
    moving = [part("plates", merge(half(1), half(-1)), "tilt", [26, 27, 30], 0.15, 0.3, { pivot: r.pivot, reach: r.throw })];
    radius = r.radius;
    fixed = box => [part("bezel", frustum(box.width - 2, box.height - 2, box.radius - 1, r.bezelRise, r.bezelTaper), "fixed", [168, 170, 176], 0.3, 0.45)];
  } else if (kind === "bat") {
    const b = tokens.bat;
    moving = [
      part("lever", revolve([[b.rodBase, b.pivot], [b.rodTip, b.pivot + b.lever]], 24), "tilt", [214, 216, 222], 0.4, 0.22, { pivot: b.pivot, reach: b.throw }),
      part("ball", sphere(b.ball, b.pivot + b.lever), "tilt", [232, 234, 238], 0.4, 0.18, { pivot: b.pivot, reach: b.throw }),
    ];
    radius = b.radius;
    fixed = () => [
      part("washer", revolve([[b.washer, 0], [b.washer, b.washerRise - 0.4], [b.washer - 0.4, b.washerRise], [b.nut + 0.5, b.washerRise]]), "fixed", [70, 72, 78], 0.3, 0.5),
      part("nut", revolve([[b.nut, b.washerRise], [b.nut, b.pivot - 0.6], [b.nut - 0.8, b.pivot], [0, b.pivot]], 6), "fixed", [150, 152, 158], 0.35, 0.4),
    ];
  } else if (kind === "wall") {
    const w = tokens.wall;
    moving = [part("paddle", frustum(w.paddleWidth, w.paddleLength, 2, w.paddleRise, w.paddleTaper, w.pivot), "tilt", [246, 245, 240], 0.05, 0.35, { pivot: w.pivot, reach: w.throw })];
    form = { width: Math.ceil(w.plateWidth * w.paddleWidth), height: Math.ceil(w.plateLength * w.paddleLength) };
    radius = w.radius;
    fixed = box => [part("plate", frustum(box.width - 2, box.height - 2, box.radius - 1, w.plateRise, w.plateTaper), "fixed", [236, 235, 228], 0.05, 0.5)];
  } else if (kind === "slide") {
    const s = tokens.slide;
    moving = [part("thumb", frustum(s.thumb, s.thumb, s.thumb / 2, s.thumbRise, s.thumbTaper, s.trackRise), "slideX", [240, 242, 246], 0.1, 0.35, { reach: s.travel / 2 })];
    fixed = box => [part("track", frustum(box.width - 2, box.height - 2, box.radius - 1, s.trackRise, s.trackTaper), "fixed", [96, 100, 108], 0, 0.7)];
  } else if (kind === "fader") {
    const f = tokens.fader;
    moving = [
      part("cap", frustum(f.capWidth, f.capLength, 2.5, f.rise, f.taper), "slideY", [52, 54, 60], 0.2, 0.4, { reach: f.travel }),
      part("grip", bar(f.capWidth - 2 * f.taper - 4, 1.4, f.rise, f.rise + f.grip), "slideY", [245, 245, 245], 0, 0.5, { emissive: [0.3, 0.3, 0.3], reach: f.travel }),
    ];
    radius = f.radius;
    fixed = () => [part("slot", frustum(3, f.travel + f.capLength, 1.5, 0.4, 0), "fixed", [8, 8, 10], 0, 0.9)];
  } else {
    // The knob keeps I0.1's proportions, all derived from its box; the rule only checks them.
    const k = tokens.knob, r = k.box / 2, rc = r - k.capInset;
    moving = [
      part("skirt", revolve([[r - k.skirtInset, k.collar], [r - k.skirtInset, k.skirt - 1], [r - k.skirtInset - 1, k.skirt], [rc + 0.5, k.skirt]]), "turn", [28, 29, 32], 0.2, 0.45, { reach: k.sweep }),
      part("cap", revolve([[rc, k.skirt], [rc, k.cap - 1.2], [rc - 1.2, k.cap], [0, k.cap]]), "turn", [200, 202, 207], 0.25, 0.32, { reach: k.sweep }),
      part("pointer", offset(bar(1.6, rc * 0.55, k.cap, k.pointer), 0, rc * 0.4), "turn", [250, 250, 250], 0, 0.6, { emissive: [0.35, 0.35, 0.35], reach: k.sweep }),
    ];
    form = { width: k.box, height: k.box };
    radius = r;
    fixed = () => [part("collar", revolve([[r - k.collarInset, 0], [r - k.collarInset, k.collar - 0.6], [r - k.collarInset - 0.6, k.collar], [r - k.skirtInset, k.collar]]), "fixed", [150, 152, 158], 0.3, 0.5)];
  }
  // The rule: footprint over the travel plus the drift margin of the part's highest point, on every side.
  let halfWidth = 0, halfHeight = 0;
  const margins: Record<string, number> = {};
  for (const spec of moving) {
    const { x, y, h } = footprint(spec), margin = marginFor(h);
    margins[spec.name] = margin;
    halfWidth = Math.max(halfWidth, x + margin); halfHeight = Math.max(halfHeight, y + margin);
  }
  const rule = { width: Math.ceil(2 * halfWidth), height: Math.ceil(2 * halfHeight) };
  const width = Math.max(rule.width, form.width), height = Math.max(rule.height, form.height);
  const box = { width, height, radius: kind === "slide" ? height / 2 : radius };
  return { kind, box, rule, margins, parts: [...fixed(box), ...moving] };
}
const specs = Object.fromEntries(kinds.map(kind => [kind, kindSpec(kind)])) as Record<Kind, KindSpec>;

/**
 * Each part's binding point: of every vertex over the whole travel, the one whose height over its inset from the box
 * (per axis) is largest. The camera distance follows from these, so a larger stage raises `D`, never moves a part.
 */
const envelopes: Envelope[] = kinds.flatMap(kind => specs[kind].parts.map(spec => {
  const box = specs[kind].box;
  let binding: Envelope = { height: 0, inset: 1 };
  for (const t of travels()) {
    const m = local(spec, t);
    for (let index = 0; index < spec.data.positions.length; index += 3) {
      const [x, y, z] = apply(m, spec.data.positions[index]!, spec.data.positions[index + 1]!, spec.data.positions[index + 2]!);
      const inset = Math.max(0.25, Math.min(box.width / 2 - Math.abs(x), box.height / 2 - Math.abs(y)));
      if (-z / inset > binding.height / binding.inset) binding = { height: -z, inset };
    }
  }
  return binding;
}));

// Layout: one panel filling the stage. `main` puts a cluster of all six kinds at each corner, each edge's middle and
// the centre; `corner-<kind>` puts one control of that kind in each corner of the stage.
const clusters = ["tl", "tc", "tr", "ml", "mc", "mr", "bl", "bc", "br"] as const;
let panel!: HTMLElement;
let layoutName = params.get("layout") ?? "main";
function control(kind: Kind, id: string, left: number, top: number) {
  const input = document.createElement("input"), box = specs[kind].box;
  if (switches.has(kind)) {
    Object.assign(input, { type: "checkbox", checked: false });
    input.setAttribute("role", "switch");
  } else {
    Object.assign(input, { type: "range", min: "0", max: "100", step: "1", value: "50" });
    if (kind === "fader") {
      input.setAttribute("aria-orientation", "vertical");
      // The native thumb is the cap's travel footprint, so the value a pointer sets puts the cap's centre under it.
      input.style.setProperty("--thumb-width", `${box.width}px`);
      input.style.setProperty("--thumb-height", `${box.height - tokens.fader.travel}px`);
    }
  }
  input.id = id;
  input.dataset.part = kind;
  input.setAttribute("aria-label", `${kind[0]!.toUpperCase()}${kind.slice(1)} ${id}`);
  Object.assign(input.style, { left: `${left}px`, top: `${top}px`, width: `${box.width}px`, height: `${box.height}px`, borderRadius: `${box.radius}px` });
  return input;
}
function layout(name: string) {
  layoutName = name;
  const width = frame.clientWidth, height = frame.clientHeight, edge = tokens.edge, gap = tokens.gap;
  const heading = document.createElement("h2");
  heading.textContent = `I0.2 moving parts: ${name}`;
  const elements: HTMLElement[] = [heading];
  if (name === "main") {
    const rowWidth = kinds.reduce((sum, kind) => sum + specs[kind].box.width, 0) + gap * (kinds.length - 1);
    for (const cluster of clusters) {
      const [row, column] = cluster as unknown as [string, string];
      let x = column === "l" ? edge : column === "r" ? width - edge - rowWidth : Math.round((width - rowWidth) / 2);
      for (const kind of kinds) {
        const box = specs[kind].box;
        const y = row === "t" ? edge : row === "b" ? height - edge - box.height : Math.round((height - box.height) / 2);
        elements.push(control(kind, `${kind}-${cluster}`, x, y));
        x += box.width + gap;
      }
    }
  } else {
    const kind = name.replace(/^corner-/, "") as Kind, box = specs[kind].box;
    if (!kinds.includes(kind)) throw new Error(`Unknown layout ${name}`);
    for (const [corner, x, y] of [["tl", edge, edge], ["tr", width - edge - box.width, edge], ["bl", edge, height - edge - box.height], ["br", width - edge - box.width, height - edge - box.height]] as const) {
      elements.push(control(kind, `${kind}-corner-${corner}`, x, y));
    }
  }
  panel.replaceChildren(...elements);
}

const srgbToLinear = (value: number) => { const c = value / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const material = (spec: PartSpec) => {
  const [r, g, b] = spec.colour;
  const created = createPbrMaterial({ baseColorFactor: [srgbToLinear(r), srgbToLinear(g), srgbToLinear(b), 1], metallicFactor: spec.metallic, roughnessFactor: spec.roughness, doubleSided: true });
  if (spec.emissive) setPbrEmissive(created as unknown as PbrMaterialProps, spec.emissive);
  return created as unknown as Material;
};

/** A thin-instanced part kind with full pose matrices (the harness's `Pose` has no tilt about an in-plane axis). */
interface Instanced extends PartKind { place(index: number, matrix: number[]): void }
function instanced(layer: InstrumentLayer, name: string, data: PartData, partMaterial: Material, capacity: number): Instanced {
  const mesh = partMesh(layer.scene.surface.engine, `${layer.id}-${name}`, data);
  mesh.material = partMaterial;
  const matrices = new Float32Array(Math.max(1, capacity) * 16);
  setThinInstances(mesh, matrices, Math.max(1, capacity));
  addToScene(layer.scene, mesh);
  let dirty = false;
  const kind: Instanced = {
    name, mesh, capacity,
    place(index, matrix) { matrices.set(matrix, index * 16); dirty = true; },
    pose() { throw new Error("Moving parts are placed with full matrices"); },
    hide(index) { matrices.fill(0, index * 16, index * 16 + 16); dirty = true; },
    flush() { if (dirty) { flushThinInstances(mesh); dirty = false; } },
  };
  layer.kinds.push(kind);
  return kind;
}

interface Control { element: HTMLInputElement; kind: Kind; index: number; rect: Rect }
interface Built { layer: InstrumentLayer; parts: Map<string, Instanced>; controls: Map<HTMLElement, Control> }
let built: Built | undefined;
/** Switch travel, eased between the native states; `override` holds a travel per control (tests and animation). */
const motion = new Map<HTMLElement, { t: number; from: number; to: number; start: number }>();
const override = new Map<HTMLElement, number>();
/** When set, only this part (`kind.part`) is drawn: per-part containment. */
let only: string | undefined;
const target = (element: HTMLInputElement) => element.type === "checkbox" ? Number(element.checked) : (Number(element.value) - Number(element.min)) / (Number(element.max) - Number(element.min));
const travelOf = (element: HTMLInputElement) => override.get(element) ?? (element.type === "checkbox" ? motion.get(element)?.t ?? target(element) : target(element));

function build(layer: InstrumentLayer) {
  const controls = new Map<HTMLElement, Control>(), counts = new Map<Kind, number>();
  for (const element of layer.element.querySelectorAll<HTMLInputElement>("input[data-part]")) {
    const kind = element.dataset.part as Kind, index = counts.get(kind) ?? 0;
    counts.set(kind, index + 1);
    controls.set(element, { element, kind, index, rect: layer.rectOf(element) });
  }
  const parts = new Map<string, Instanced>();
  for (const kind of kinds) {
    const count = counts.get(kind) ?? 0;
    if (count) for (const spec of specs[kind].parts) parts.set(`${kind}.${spec.name}`, instanced(layer, `${kind}-${spec.name}`, spec.data, material(spec), count));
  }
  built = { layer, parts, controls };
  for (const element of controls.keys()) pose(element);
}
/** The world matrix of one part of one control at travel `t`. */
function world(entry: Control, spec: PartSpec, t: number, layer = built!.layer) {
  const m = local(spec, t), [wx, wy] = layer.world(entry.rect.x + entry.rect.width / 2, entry.rect.y + entry.rect.height / 2);
  m[12] = m[12]! + wx; m[13] = m[13]! + wy;
  return m;
}
/** Writes one control's parts from its native state (or its override). */
function pose(element: HTMLElement) {
  const entry = built?.controls.get(element);
  if (!entry) return;
  const t = travelOf(entry.element);
  for (const spec of specs[entry.kind].parts) {
    const key = `${entry.kind}.${spec.name}`, kind = built!.parts.get(key)!;
    if (only && only !== key) kind.hide(entry.index);
    else kind.place(entry.index, world(entry, spec, t));
  }
}
const poseAll = () => { if (built) for (const element of built.controls.keys()) pose(element); };
const flushAll = () => { if (built) for (const kind of built.parts.values()) kind.flush(); };

// A switch snaps to its new state: eased, never past either stop.
const ease = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2);
let ticking = false;
function tick() {
  ticking = true;
  requestAnimationFrame(now => {
    let active = false;
    for (const [element, state] of motion) {
      const progress = Math.min(1, (now - state.start) / tokens.snapMs);
      state.t = state.from + (state.to - state.from) * ease(progress);
      if (progress < 1) active = true;
      pose(element);
    }
    flushAll();
    harness.draw();
    if (active) tick(); else ticking = false;
  });
}
function snap(element: HTMLInputElement) {
  const state = motion.get(element) ?? { t: 1 - target(element), from: 0, to: 0, start: 0 };
  Object.assign(state, { from: state.t, to: target(element), start: performance.now() });
  motion.set(element, state);
  if (!ticking) tick();
}
/** Ends every snap at its native state. */
function finishSnaps() { for (const [element, state] of motion) state.t = target(element as HTMLInputElement); poseAll(); flushAll(); harness.draw(); }

// The test waits for `window.movingProbe` and then for `ready`, which rejects with the reason if the probe cannot start.
let resolveReady!: (api: InstrumentProbeApi) => void;
let readyFailed!: (error: unknown) => void;
window.movingProbe = { ready: new Promise<InstrumentProbeApi>((resolve, reject) => { resolveReady = resolve; readyFailed = reject; }) };
const harness = await startInstrument({
  frame, light: tokens.light, envelopes, budgets: { layers: 8, pixels: 4_000_000 },
  onStatus: message => { status.dataset.core = message; },
  mount(root) {
    panel = document.createElement("section");
    panel.id = "panel";
    panel.setAttribute("aria-label", "Moving parts");
    root.append(panel);
    layout(layoutName);
    return [panel];
  },
  build,
}).catch(error => {
  status.textContent = `Probe unavailable: ${error}`;
  window.movingProbe.error = String(error);
  readyFailed(error);
  throw error;
});

// Native state drives the parts: a check snaps a switch, a value poses a range at once.
const refresh = (event: Event) => {
  const element = event.target as HTMLInputElement;
  if (!built?.controls.has(element)) return;
  if (element.type === "checkbox") snap(element);
  else { pose(element); flushAll(); harness.draw(); }
};
panel.addEventListener("input", refresh);
panel.addEventListener("change", refresh);

let shot: Screenshot | undefined;
const canvasBox = () => harness.hosts.outputCanvas.getBoundingClientRect();
const describe = () => {
  const camera = harness.camera();
  status.textContent = `I0.2 moving parts, ${layoutName}: ${built?.controls.size ?? 0} controls, camera ${camera.distance} px\n`
    + kinds.map(kind => `${kind} ${specs[kind].box.width}×${specs[kind].box.height}`).join(", ") + `\n${status.dataset.core ?? ""}`;
};
/** Client-space boxes of the controls. */
const controls = () => [...(built?.controls.values() ?? [])].map(entry => {
  const box = entry.element.getBoundingClientRect();
  return { id: entry.element.id, kind: entry.kind, x: box.left, y: box.top, width: box.width, height: box.height, radius: parseFloat(getComputedStyle(entry.element).borderTopLeftRadius) || 0 };
});
type Box = ReturnType<typeof controls>[number];
/** Signed distance from a point to a rounded rectangle, negative inside (I0.1's measure). */
const rounded = (point: Point, box: { x: number; y: number; width: number; height: number; radius: number }) => {
  const radius = Math.min(box.radius, box.width / 2, box.height / 2);
  const qx = Math.abs(point.x - box.x - box.width / 2) - box.width / 2 + radius, qy = Math.abs(point.y - box.y - box.height / 2) - box.height / 2 + radius;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - radius;
};
const nextFrame = () => new Promise(resolve => requestAnimationFrame(resolve));
async function settle() {
  while (ticking) await nextFrame();
  await harness.idle();
  for (let index = 0; index < 3; index++) { harness.draw(); await nextFrame(); }
  shot = await harness.readback();
  describe();
}
const hitId = (point: Point) => { const hit = document.elementFromPoint(point.x, point.y); return hit?.closest<HTMLElement>("[data-part]")?.id ?? hit?.id ?? ""; };

/**
 * Compares a frame with meshes on against one with them off: every changed pixel belongs to the control whose
 * rounded box holds its centre (strict: on the edge at most, I0.1's rule). Returns the count, the pixels outside every
 * box, the largest signed distance of a drawn pixel from its own box (negative: the closest it came to the edge), the
 * same per kind, and the points a pixel or more inside their box for native hit sampling.
 */
function analyse(on: Screenshot, off: Screenshot, list: Box[]) {
  const box = canvasBox(), dpr = harness.dpr;
  const band = 64, rows = new Map<number, Box[]>();
  for (const entry of list) for (let row = Math.floor(entry.y / band); row <= Math.floor((entry.y + entry.height) / band); row++) { if (!rows.has(row)) rows.set(row, []); rows.get(row)!.push(entry); }
  const result = { changed: 0, outside: 0, maxDistance: -Infinity, outsideSamples: [] as { x: number; y: number; distance: number; id: string }[], perKind: {} as Record<string, { pixels: number; maxDistance: number }> };
  const inner: { x: number; y: number; id: string }[] = [];
  for (let y = 0; y < on.height; y++) for (let x = 0; x < on.width; x++) {
    const offset = (y * on.width + x) * 4;
    if (on.data[offset] === off.data[offset] && on.data[offset + 1] === off.data[offset + 1] && on.data[offset + 2] === off.data[offset + 2]) continue;
    result.changed++;
    const point = { x: box.left + (x + 0.5) / dpr, y: box.top + (y + 0.5) / dpr };
    let owner: Box | undefined, distance = Infinity;
    for (const entry of rows.get(Math.floor(point.y / band)) ?? []) { const d = rounded(point, entry); if (d < distance) { distance = d; owner = entry; } }
    if (!owner) { distance = Infinity; for (const entry of list) { const d = rounded(point, entry); if (d < distance) { distance = d; owner = entry; } } }
    result.maxDistance = Math.max(result.maxDistance, distance);
    const kind = (result.perKind[owner?.kind ?? "none"] ??= { pixels: 0, maxDistance: -Infinity });
    kind.pixels++; kind.maxDistance = Math.max(kind.maxDistance, distance);
    if (distance > 0) {
      result.outside++;
      if (result.outsideSamples.length < 20) result.outsideSamples.push({ ...point, distance, id: owner?.id ?? "" });
      continue;
    }
    if (distance <= -1) inner.push({ ...point, id: owner!.id });
  }
  return { result, inner };
}
async function frameNow() { await settle(); return shot!; }
/**
 * Decoded-pixel containment at the current pose: all parts together (with native hits sampled on up to `samples` drawn
 * pixels), and, with `parts`, every part kind drawn alone against the same meshes-off reference.
 */
async function containment(options: { parts?: boolean; samples?: number } = {}) {
  harness.setMeshes(false);
  const off = await frameNow();
  harness.setMeshes(true);
  const on = await frameNow();
  const list = controls();
  const all = analyse(on, off, list);
  const step = Math.max(1, Math.floor(all.inner.length / (options.samples ?? 4000)));
  const hitSamples: { x: number; y: number; id: string; hit: string }[] = [];
  for (let index = 0; index < all.inner.length; index += step) { const point = all.inner[index]!; hitSamples.push({ ...point, hit: hitId(point) }); }
  const mismatches = hitSamples.filter(sample => sample.hit !== sample.id);
  const parts: Record<string, { pixels: number; outside: number; maxDistance: number; outsideSamples: unknown[] }> = {};
  if (options.parts) {
    for (const key of built!.parts.keys()) {
      only = key; poseAll(); flushAll();
      const { result } = analyse(await frameNow(), off, list);
      parts[key] = { pixels: result.changed, outside: result.outside, maxDistance: result.maxDistance, outsideSamples: result.outsideSamples.slice(0, 5) };
    }
    only = undefined; poseAll(); flushAll();
    await settle();
  }
  return { layout: layoutName, ...all.result, hitSampleCount: hitSamples.length, hitMismatches: mismatches.length, hitMismatchSamples: mismatches.slice(0, 10), parts };
}
/** Native hits on a 7 × 7 grid 1.5 px inside every control's box, and 1.5 px outside each edge's middle. */
function gridHits() {
  const misses: { point: Point; id: string; hit: string; inside: boolean }[] = [];
  let points = 0;
  for (const entry of controls()) {
    for (let i = 0; i < 7; i++) for (let j = 0; j < 7; j++) {
      const point = { x: entry.x + 1.5 + ((entry.width - 3) * i) / 6, y: entry.y + 1.5 + ((entry.height - 3) * j) / 6 };
      // Corners of a rounded box are outside it: a grid point must lie inside the rounded box to be expected on it.
      if (rounded(point, entry) > -1) continue;
      points++;
      const hit = hitId(point);
      if (hit !== entry.id) misses.push({ point, id: entry.id, hit, inside: true });
    }
    const cx = entry.x + entry.width / 2, cy = entry.y + entry.height / 2;
    for (const point of [{ x: entry.x - 1.5, y: cy }, { x: entry.x + entry.width + 1.5, y: cy }, { x: cx, y: entry.y - 1.5 }, { x: cx, y: entry.y + entry.height + 1.5 }]) {
      if (point.x < 0 || point.y < 0 || point.x >= innerWidth || point.y >= innerHeight) continue;
      points++;
      const hit = hitId(point);
      if (hit === entry.id) misses.push({ point, id: entry.id, hit, inside: false });
    }
  }
  return { points, misses: misses.length, missSamples: misses.slice(0, 20) };
}
/** Sets every control to `pose`: `low` and `high` through native state, `mid` as the mid-travel pose of the snap (switches) and value 50 (ranges). */
async function setPose(name: "low" | "mid" | "high") {
  override.clear();
  for (const entry of built!.controls.values()) {
    const element = entry.element;
    if (element.type === "checkbox") {
      element.checked = name === "high";
      if (name === "mid") override.set(element, 0.5);
    } else element.value = name === "low" ? element.min : name === "high" ? element.max : "50";
  }
  finishSnaps();
  await settle();
  return { pose: name, states: controls().slice(0, 6).map(entry => state(entry.id)) };
}
const state = (id: string) => { const element = document.getElementById(id) as HTMLInputElement; return { id, value: element.value, checked: element.checked, travel: travelOf(element) }; };

/** Client point of a world point (the CPU projection the harness camera makes: z = 0 maps 1:1, D from the harness). */
function project([x, y, z]: [number, number, number], distance = harness.camera().distance) {
  const { width, height } = harness.camera(), box = canvasBox(), k = distance / (distance + z);
  return { x: box.left + width / 2 + x * k, y: box.top + height / 2 - y * k };
}
/** Where a control's moving part is drawn now: `part` (the ball, the raised end, the thumb or cap), or a knob cap's `left` or `right`. */
function anchor(id: string, which: "part" | "left" | "right" = "part") {
  const element = document.getElementById(id) as HTMLInputElement, entry = built!.controls.get(element)!, t = travelOf(element);
  const find = (name: string) => specs[entry.kind].parts.find(spec => spec.name === name)!;
  const at = (name: string, point: [number, number, number]) => project(apply(world(entry, find(name), t), ...point));
  if (entry.kind === "bat") return at("ball", [0, 0, -(tokens.bat.pivot + tokens.bat.lever)]);
  // A rocker or paddle is pressed on its raised end: the +y end is raised below mid-travel.
  if (entry.kind === "rocker") return at("plates", [0, (t < 0.5 ? 1 : -1) * tokens.rocker.length * 0.3, -(tokens.rocker.pivot + tokens.rocker.thickness)]);
  if (entry.kind === "wall") return at("paddle", [0, (t < 0.5 ? 1 : -1) * tokens.wall.paddleLength * 0.3, -(tokens.wall.pivot + tokens.wall.paddleRise)]);
  if (entry.kind === "slide") return at("thumb", [0, 0, -(tokens.slide.trackRise + tokens.slide.thumbRise)]);
  if (entry.kind === "fader") return at("cap", [0, 0, -tokens.fader.rise]);
  const rc = tokens.knob.box / 2 - tokens.knob.capInset;
  return project(apply(world(entry, find("collar"), t), which === "left" ? -rc * 0.7 : which === "right" ? rc * 0.7 : 0, 0, -tokens.knob.cap));
}

/**
 * The CPU projection of every vertex of every part, through `samples` travel steps, against its control's client box:
 * per kind and part, the largest signed distance at the low, mid and high poses and over the whole travel.
 */
function analytic() {
  const result: Record<string, { low: number; mid: number; high: number; travel: number; worstAt: number }> = {};
  const boxes = new Map(controls().map(entry => [entry.id, entry]));
  for (const entry of built!.controls.values()) {
    const box = boxes.get(entry.element.id)!;
    for (const spec of specs[entry.kind].parts) {
      const key = `${entry.kind}.${spec.name}`, record = (result[key] ??= { low: -Infinity, mid: -Infinity, high: -Infinity, travel: -Infinity, worstAt: 0 });
      for (const t of travels()) {
        const m = world(entry, spec, t);
        let worst = -Infinity;
        for (let index = 0; index < spec.data.positions.length; index += 3) worst = Math.max(worst, rounded(project(apply(m, spec.data.positions[index]!, spec.data.positions[index + 1]!, spec.data.positions[index + 2]!)), box));
        if (t === 0) record.low = Math.max(record.low, worst);
        if (t === 0.5) record.mid = Math.max(record.mid, worst);
        if (t === 1) record.high = Math.max(record.high, worst);
        if (worst > record.travel) { record.travel = worst; record.worstAt = t; }
      }
    }
  }
  return result;
}
/**
 * Each kind with its box flush in each corner of the stage (the worst place for drift), by the CPU projection: the
 * largest signed distance of a vertex from the box at the low, mid and high poses and over the travel at the harness's
 * `D`, the smallest `D` that keeps every vertex inside, and the smallest box centred on the control that would.
 */
function worstCorner() {
  const { width, height, distance } = harness.camera(), canvas = canvasBox();
  return Object.fromEntries(kinds.map(kind => {
    const spec = specs[kind], box = spec.box;
    const corners = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sy]) => ({ cx: (sx! * (width - box.width)) / 2, cy: (sy! * (height - box.height)) / 2 }));
    // World points of every vertex at every sampled travel and corner, with the travel and box they belong to.
    const evaluate = (D: number, movingOnly = false) => {
      const out = { low: -Infinity, mid: -Infinity, high: -Infinity, travel: -Infinity, halfWidth: 0, halfHeight: 0, parts: {} as Record<string, number> };
      for (const { cx, cy } of corners) {
        const client = { x: canvas.left + width / 2 + cx - box.width / 2, y: canvas.top + height / 2 - cy - box.height / 2, width: box.width, height: box.height, radius: box.radius };
        for (const part of spec.parts.filter(candidate => !movingOnly || candidate.motion !== "fixed")) for (const t of travels()) {
          const m = local(part, t);
          m[12] = m[12]! + cx; m[13] = m[13]! + cy;
          for (let index = 0; index < part.data.positions.length; index += 3) {
            const point = project(apply(m, part.data.positions[index]!, part.data.positions[index + 1]!, part.data.positions[index + 2]!), D), d = rounded(point, client);
            out.travel = Math.max(out.travel, d);
            out.parts[part.name] = Math.max(out.parts[part.name] ?? -Infinity, d);
            if (t === 0) out.low = Math.max(out.low, d);
            if (t === 0.5) out.mid = Math.max(out.mid, d);
            if (t === 1) out.high = Math.max(out.high, d);
            out.halfWidth = Math.max(out.halfWidth, Math.abs(point.x - client.x - box.width / 2));
            out.halfHeight = Math.max(out.halfHeight, Math.abs(point.y - client.y - box.height / 2));
          }
        }
      }
      return out;
    };
    const at = evaluate(distance), moving = evaluate(distance, true);
    // The smallest D that contains every vertex (containment is monotonic in D), for all parts and for the moving ones.
    const needed = (movingOnly: boolean) => {
      let lo = Math.max(...spec.parts.map(part => footprint(part).h)) + 1, hi = 1e6;
      if (evaluate(hi, movingOnly).travel > 0) return null;
      for (let step = 0; step < 40; step++) { const mid = (lo + hi) / 2; if (evaluate(mid, movingOnly).travel <= 0) hi = mid; else lo = mid; }
      return Math.ceil(hi);
    };
    // Static parts are sized from the box (they shrink with it), so the smallest box that matters is the moving parts'.
    return [kind, { box, rule: spec.rule, margins: spec.margins, distance, low: at.low, mid: at.mid, high: at.high, travel: at.travel, parts: at.parts,
      minimumBox: { width: 2 * at.halfWidth, height: 2 * at.halfHeight }, minimumMovingBox: { width: 2 * moving.halfWidth, height: 2 * moving.halfHeight },
      distanceNeeded: needed(false), distanceNeededMoving: needed(true) }];
  }));
}
/** Native hit transform of the panel as the browser reports it, and core's geometry counter. */
const transforms = () => ({ panel: (harness.hosts.outputCanvas as unknown as DrawableCanvas).getElementTransform(panel).toJSON(), geometryUpdates: harness.counts().geometryUpdates });

/**
 * Animates for `frames` frames as poses only: every bat snaps over centre and back (10 frames each way, held 20), every
 * knob turns through its whole sweep. Returns the capture, upload and geometry counts over the run and the native
 * hit transform before and after.
 */
async function animate(frames: number) {
  const entries = [...built!.controls.values()];
  const bats = entries.filter(entry => entry.kind === "bat"), knobs = entries.filter(entry => entry.kind === "knob");
  await settle();
  const before = harness.counts(), transformBefore = transforms();
  const extremes = { bat: { min: 1, max: 0 }, knob: { min: 1, max: 0 } };
  const run = await harness.measure(frames, index => {
    bats.forEach((entry, which) => {
      const phase = (index + which * 7) % 60, t = phase < 10 ? ease(phase / 10) : phase < 30 ? 1 : phase < 40 ? 1 - ease((phase - 30) / 10) : 0;
      override.set(entry.element, t); pose(entry.element);
      extremes.bat.min = Math.min(extremes.bat.min, t); extremes.bat.max = Math.max(extremes.bat.max, t);
    });
    knobs.forEach((entry, which) => {
      const t = 0.5 - 0.5 * Math.cos(index / 24 + which);
      override.set(entry.element, t); pose(entry.element);
      extremes.knob.min = Math.min(extremes.knob.min, t); extremes.knob.max = Math.max(extremes.knob.max, t);
    });
    flushAll();
  });
  const after = harness.counts(), transformAfter = transforms();
  for (const entry of [...bats, ...knobs]) override.delete(entry.element);
  poseAll(); flushAll(); harness.draw();
  return { frames, bats: bats.length, knobs: knobs.length, extremes, captures: after.captures - before.captures, uploads: after.uploads - before.uploads,
    geometryUpdates: after.geometryUpdates - before.geometryUpdates, gpuFrames: after.gpuFrames - before.gpuFrames, mode: after.mode, reason: after.reason,
    transformBefore, transformAfter, work: run.work, intervals: run.intervals };
}
async function setLayout(name: string) {
  // A new layout replaces every control: the old parts leave the surface first, so no frame draws them over it.
  harness.setMeshes(false);
  override.clear(); motion.clear();
  layout(name);
  await harness.controller.settle();
  await harness.rebuild();
  harness.setMeshes(true);
  await settle();
  return { layout: name, controls: built!.controls.size, camera: harness.camera(), counts: harness.counts() };
}

await settle();
const api = {
  dpr: harness.dpr,
  tokens: () => ({ ...tokens, specs: Object.fromEntries(kinds.map(kind => [kind, { box: specs[kind].box, rule: specs[kind].rule, margins: specs[kind].margins,
    parts: specs[kind].parts.map(spec => ({ name: spec.name, motion: spec.motion, pivot: spec.pivot, reach: spec.reach, ...footprint(spec) })) }])),
    envelopes, reference: { ...reference, drift: (h: number) => referenceDrift(h) }, camera: harness.camera() }),
  settle, setLayout, setPose, containment, gridHits, analytic, worstCorner, anchor, animate, transforms, controls, state,
  hits: (points: Point[]) => points.map(hitId),
  counts: () => harness.counts(),
  camera: () => harness.camera(), drift: (h: number) => harness.drift(h),
  diagnostics: () => [...harness.diagnostics],
  browser: () => navigator.userAgent,
};
type InstrumentProbeApi = typeof api;
declare global { interface Window { movingProbe: { ready: Promise<InstrumentProbeApi>; error?: string } } }
resolveReady(api);
