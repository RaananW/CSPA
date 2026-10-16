/**
 * `@underglass/ui/gpu`: Strata over Underglass. `attachStrataGpu` enrolls each Strata panel that is a direct child of
 * the Underglass root as a GPU layer and gives it core's built-in `relief` material, with a scene in the Strata
 * Rendering Model's format built from the panel's `data-strata-face` markers and its resolved tokens. At the Objects
 * level (`data-strata-level="objects"` on a component, a panel or a scope, or the `level` option) the components
 * become objects (keys, wells, bezels, knobs) and the panel takes core's `objects` material instead. While GPU
 * presents, the panels switch to `data-strata-mode="face"`, so CSS paints flat faces and the GPU paints the relief;
 * whenever GPU is off, the CSS relief is back.
 *
 * Panel motion (`strataEnter`, `strataLeave` from `@underglass/ui/dom`) moves a presented panel on the GPU: core's
 * `transition` carries it through depth (scale, tilt and opacity, as the CSS motion does) while its scene height
 * travels from the modal level, so its shadow grows and settles with it.
 *
 * Everything the scene needs comes from the page as the CSS presentation sees it: geometry from layout (followed through
 * CSS transitions frame by frame), states from
 * `:hover`, `:active`, `:focus-visible` and `:disabled`, and token values from each element's resolved `--strata-*`
 * custom properties, so depth, themes and scopes apply exactly as they do in CSS. The helper never imports
 * `@underglass/core`: it takes the controller as a value and speaks the scene format.
 */
import { cssVariable, flatten, numeric, strataTokens } from "../tokens/index.ts";
import { isSceneObject, type SceneEntry, type SceneFace, type SceneMaterial, type StrataScene } from "../tokens/scene.ts";
import { panelMotion, type PanelMover } from "../dom/motion.ts";

/** What the helper needs from an Underglass controller (`CanvasController` from `@underglass/core`). */
export interface StrataGpuController {
  readonly container: HTMLElement;
  enroll(element: HTMLElement, options: { id: string; origin?: "center" }): () => void;
  setMaterial(id: string, descriptor: StrataSceneMaterial): { update(scene: StrataScene): void; cancel(): void };
  transition(id: string, motion: StrataPanelMotion): { finished: Promise<{ status: string; reason: string }>; cancel(): void };
  state(): { mode: string };
}
/** A panel motion as core's typed motion: numeric keyframes and timing. */
export interface StrataPanelMotion {
  keyframes: { offset: number; opacity?: number; scaleX?: number; scaleY?: number; tiltX?: number; perspective?: number }[];
  timing: { duration: number; easing: string };
}
/** The material descriptor the helper hands to `setMaterial`: `relief` for a version 1 scene, `objects` for version 2. */
export interface StrataSceneMaterial {
  kind: "relief" | "objects";
  scene: StrataScene;
  bounds: "layer";
  interaction: "material";
  media: "identity";
  fallback: "static";
}
export interface StrataGpuOptions {
  /** Which direct root children are Strata panels (default `.ug-panel`). */
  panels?: string;
  /** How often to check whether GPU is presenting, in ms (default 500). Call `refresh()` from `onStatusChange` too. */
  poll?: number;
  /**
   * The application's presentation level (design language section 16), where no component, panel or scope sets
   * `data-strata-level`: `relief` by default. `objects` presents components as objects.
   */
  level?: StrataLevel;
  /**
   * The adjust policy (design language section 16), off by default. When the 95th percentile of frame intervals stays
   * over `frameBudgetMs` for `stepDownAfterFrames` frames, the levels step down (Scene to Objects to Relief); after
   * `stepUpAfterFrames` frames back under 80% of the budget, they step up again, never above what the page sets. Every
   * step is reported through `onAdjust` and a `strata-adjust` event on the root. GPU stays on.
   */
  adjust?: StrataAdjustPolicy;
  /** Called with every step of the adjust policy. */
  onAdjust?(event: StrataAdjustEvent): void;
}
/** The adjust policy's settings. The defaults are provisional, until measured on a low-end GPU. */
export interface StrataAdjustPolicy {
  enabled: boolean;
  /** Default 25 ms (40 frames per second). */
  frameBudgetMs?: number;
  /** Default 120 frames over budget. */
  stepDownAfterFrames?: number;
  /** Default 600 frames back under budget. */
  stepUpAfterFrames?: number;
  /** Frames the 95th percentile is taken over; default 60. */
  window?: number;
}
/** One step of the adjust policy: the highest level presented before and after, and the measurement that caused it. */
export interface StrataAdjustEvent {
  from: StrataLevel;
  to: StrataLevel;
  /** The 95th percentile of the last frame intervals, in ms. */
  p95: number;
  frameBudgetMs: number;
}
export interface StrataGpu {
  /** Rebuilds every panel's scene now (for example from the runtime's `onStatusChange`). */
  refresh(): void;
  /** The scene last given to a panel, for inspection and tests. */
  scene(panel: HTMLElement): StrataScene | undefined;
  /** Releases every panel: cancels materials, leaves face mode and releases the enrollments. */
  detach(): void;
  /** The highest level the adjust policy currently allows (`scene` when it allows everything, or when it is off). */
  cap(): StrataLevel;
}

const faces: readonly SceneFace[] = ["raised", "well", "groove", "knob", "mark", "ring", "flat"];
const interactive = "input, button, select, textarea, a[href], [tabindex]";
/** Material roles by face, for elements that name no material (design language section 4). */
function roleOf(face: SceneFace, element: Element, panel: Element): string {
  if (element === panel || element.matches(".ug-card")) return "panel";
  if (face === "raised") return element.matches(".ug-button--accent, .ug-button--primary") ? "buttonPrimary" : "control";
  return ({ well: "field", groove: "rail", knob: "knob", mark: "indicator", ring: "field", flat: "control" } as Record<string, string>)[face] ?? "control";
}

// The numeric tokens a scene reads. Registering them lets the browser resolve their depth-blended `calc()` values
// per element, so `getComputedStyle` returns numbers; their meaning and values do not change.
const sceneTokens = /^(light\.(azimuth|elevation)|bevel\.(width|gain)|shadow\.strength|interior\.max|state\.|focus\.(width|offset)|elevation\.|object\.|camera\.distance|material\.presets\.[^.]+\.(base|coat|emissive)\.(roughness|metallic|strength))/;
const registered = new Set<string>();
function register(name: string, syntax: "<number>" | "<length>", initialValue: string) {
  if (registered.has(name)) return;
  registered.add(name);
  try { CSS.registerProperty({ name, syntax, inherits: true, initialValue }); } catch { /* already registered by the page */ }
}
function registerTokens() {
  for (const token of flatten(strataTokens)) {
    if (!sceneTokens.test(token.path)) continue;
    const length = token.$type === "dimension";
    register(cssVariable(token.path), length ? "<length>" : "<number>", length ? `${numeric(token.$value)}px` : String(numeric(token.$value)));
  }
}
/** An application material named in markup: its layers are registered on first sight. */
function registerMaterial(name: string) {
  for (const [layer, keys] of [["base", ["roughness", "metallic"]], ["coat", ["strength", "roughness"]], ["emissive", ["strength"]]] as const) {
    for (const key of keys) register(cssVariable(`material.presets.${name}.${layer}.${key}`), "<number>", "0");
  }
}

/** A CSS colour value (`#rgb`, `#rrggbb` or `rgb()`) as `#rrggbb`. */
function hex(value: string) {
  if (value.startsWith("#")) {
    const digits = value.slice(1, 7);
    return `#${(digits.length === 3 ? [...digits].map(digit => digit + digit).join("") : digits).toLowerCase()}`;
  }
  const parts = (value.match(/[0-9.]+/g) ?? ["0", "0", "0"]).slice(0, 3).map(Number);
  return `#${parts.map(part => Math.round(part).toString(16).padStart(2, "0")).join("")}`;
}
/** Reads one element's resolved token values. */
function reader(element: Element) {
  const style = getComputedStyle(element);
  const raw = (path: string) => style.getPropertyValue(cssVariable(path)).trim();
  const number = (path: string, fallback = 0) => { const value = Number.parseFloat(raw(path)); return Number.isFinite(value) ? value : fallback; };
  return { raw, number, colour: (role: string) => hex(raw(`colour.${role}`)) };
}

/** The element's border box relative to the panel's, in the panel's CSS px (transforms inside the panel included). */
function rectWithin(element: Element, panel: HTMLElement): [number, number, number, number] {
  const outer = panel.getBoundingClientRect(), inner = element.getBoundingClientRect();
  const scale = outer.width / Math.max(panel.offsetWidth, 1) || 1;
  return [(inner.left - outer.left) / scale, (inner.top - outer.top) / scale, inner.width / scale, inner.height / scale];
}
function radiusOf(element: Element, width: number) {
  const value = getComputedStyle(element).borderTopLeftRadius;
  const amount = Number.parseFloat(value);
  return value.endsWith("%") ? (amount / 100) * width : Number.isFinite(amount) ? amount : 0;
}

/** A presentation level (design language section 16). */
export type StrataLevel = "relief" | "objects" | "scene";

/** What a caller may override in a panel's scene. */
export interface StrataSceneOptions {
  /** The panel's own height, in CSS px, instead of its elevation (panel motion carries it through depth). */
  height?: number;
  /** The level where neither the panel, its components nor a scope around them set one; `relief` by default. */
  level?: StrataLevel;
  /** The stage the camera is centred on (the Underglass root); the panel's parent by default. */
  stage?: Element;
  /** Collects the elements drawn as domes, whose own CSS paint the helper hides while GPU presents them. */
  domes?: Set<Element>;
  /** The highest level to present at (the adjust policy's cap); `scene` by default. */
  cap?: StrataLevel;
}

/** The levels from lowest to highest. */
export const strataLevels: readonly StrataLevel[] = ["relief", "objects", "scene"];
const lower = (a: StrataLevel, b: StrataLevel) => (strataLevels.indexOf(a) <= strataLevels.indexOf(b) ? a : b);

/** The level an element is presented at: its own `data-strata-level`, or the nearest scope's, or the default. */
export function strataLevel(element: Element, fallback: StrataLevel = "relief"): StrataLevel {
  const level = element.closest("[data-strata-level]")?.getAttribute("data-strata-level");
  return level === "relief" || level === "objects" || level === "scene" ? level : fallback;
}

/**
 * Builds a panel's scene from its markup, layout, states and resolved tokens. At the Relief level it is a version 1
 * scene of relief primitives. Where the panel or any of its components is at the Objects level (or the Scene level,
 * which includes it), it is a version 2 scene: those components become objects (design language section 6), mixed
 * into the same back-to-front list, seen through the stage's camera.
 */
export function strataScene(panel: HTMLElement, options: StrataSceneOptions = {}): StrataScene {
  registerTokens();
  const tokens = reader(panel);
  const level = (element: Element, fallback: string) =>
    tokens.number(`elevation.${element.getAttribute("data-strata-elevation") ?? fallback}`, tokens.number(`elevation.${fallback}`));
  const presets = new Set(flatten(strataTokens).filter(token => token.path.startsWith("material.presets.")).map(token => token.path.split(".")[2]!));
  const materials: Record<string, SceneMaterial> = {};
  const material = (name: string): string => {
    if (!presets.has(name)) registerMaterial(name);
    if (!materials[name]) {
      const at = (path: string, fallback = 0) => tokens.number(`material.presets.${name}.${path}`, fallback);
      materials[name] = { base: { roughness: at("base.roughness", 1), metallic: at("base.metallic") },
        coat: { strength: at("coat.strength"), roughness: at("coat.roughness"), ior: 1.5 }, emissive: { strength: at("emissive.strength") } };
    }
    return name;
  };
  const materialFor = (element: Element, face: SceneFace) => {
    const named = element.closest("[data-strata-material]");
    return material(named && panel.contains(named) ? named.getAttribute("data-strata-material")! : tokens.raw(`material.roles.${roleOf(face, element, panel)}`) || "matte");
  };
  const states = (element: Element) => {
    const control = element.matches(interactive) ? element : element.closest("label")?.querySelector("input, select, textarea") ?? element;
    const target = control.closest("label") ?? control;
    const preview = `${element.getAttribute("data-strata-preview") ?? ""} ${control.getAttribute("data-strata-preview") ?? ""}`.split(/\s+/);
    return {
      hover: target.matches(":hover") || preview.includes("hover"),
      // A toggle that is on holds its key down (design language section 6: it latches at its travel).
      pressed: control.matches(":active, [aria-pressed='true']") || preview.includes("active"),
      focus: control.matches(":focus-visible") || preview.includes("focus"),
      disabled: control.matches(":disabled, [aria-disabled='true']"),
    };
  };
  const objects = (element: Element) => lower(strataLevel(element, options.level), options.cap ?? "scene") !== "relief";
  // Objects (design language section 6): the tokens of their proportions, and the height each surface's top stands at.
  const keyHeight = tokens.number("object.keyHeight", 8), keyTravel = tokens.number("object.keyTravel", 6), taper = tokens.number("object.taper", 3);
  const tops = new Map<Element, number>(), floors = new Map<Element, number>();
  const baseOf = (element: Element) => {
    for (let node = element.parentElement; node && node !== panel.parentElement; node = node.parentElement) if (tops.has(node)) return tops.get(node)!;
    return 0;
  };
  // A knob, dot or mark stands on the floor of its control's well; the control is the label around both.
  const floorOf = (element: Element) => floors.get(element.closest("label") ?? element.parentElement!) ?? baseOf(element);
  const width = panel.offsetWidth, height = panel.offsetHeight;
  const panelHeight = options.height ?? level(panel, "floating");
  const entries: SceneEntry[] = [];
  if (objects(panel)) {
    entries.push({ object: "slab", rect: [0, 0, width, height], radius: radiusOf(panel, width), height: panelHeight, taper, material: materialFor(panel, "raised") });
    tops.set(panel, panelHeight);
  } else entries.push({ face: "raised", rect: [0, 0, width, height], radius: radiusOf(panel, width), height: panelHeight, material: materialFor(panel, "raised") });
  for (const element of panel.querySelectorAll<HTMLElement>("[data-strata-face]")) {
    if (entries.length >= 254) break;
    const face = element.getAttribute("data-strata-face") as SceneFace;
    if (!faces.includes(face) || !element.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
    let rect = rectWithin(element, panel);
    if (rect[2] <= 0 || rect[3] <= 0) continue;
    const state = states(element);
    const radius = radiusOf(element, rect[2]);
    if (objects(element) && face !== "ring" && face !== "flat") {
      const base = baseOf(element);
      if (element.matches("input[type='range']")) {
        // A slider: a metal rail along the input, and a puck (a flattened dome) placed from the value, inside the input.
        const input = element as HTMLInputElement;
        const rail = Number.parseFloat(getComputedStyle(element).getPropertyValue("--_rail")) || 6;
        const rise = Math.max(1, keyHeight / 4);
        entries.push({ object: "rail", rect: [rect[0], rect[1] + (rect[3] - rail) / 2, rect[2], rail], radius: rail / 2, height: rise, base, taper: 1,
          material: materialFor(element, "groove"), state: { disabled: state.disabled } });
        const min = Number(input.min || 0), max = Number(input.max || 100), along = max > min ? (Number(input.value) - min) / (max - min) : 0;
        const size = rect[3], inset = Math.min(taper, size / 4);
        entries.push({ object: "puck", rect: [rect[0] + along * (rect[2] - size) + inset, rect[1] + inset, size - 2 * inset, size - 2 * inset],
          height: Math.max(2, keyHeight / 2), base: base + rise, material: material(tokens.raw("material.roles.knob") || "satin"), colour: tokens.colour("knob"),
          bounds: rect, state });
        options.domes?.add(element);
        continue;
      }
      if (face === "raised") {
        // Controls are keys that travel on press; cards, plinths and other raised faces are slabs others stand on.
        if (element.matches("button, select, [role='button']")) {
          entries.push({ object: "key", rect, radius, height: keyHeight, base, taper, travel: keyTravel, material: materialFor(element, face),
            finish: element.matches("button, [role='button'], .ug-button") && element.getAttribute("data-strata-finish") !== "off", state });
        } else {
          const rise = level(element, "raised");
          entries.push({ object: "slab", rect, radius, height: rise, base, taper: Math.min(taper, rise), material: materialFor(element, face), state });
          tops.set(element, base + rise);
        }
        continue;
      }
      if (face === "well" && element.matches("input[type='checkbox'], input[type='radio']")) {
        // A checkbox, radio or switch: a well sunk into the surface; its mark, dot or knob stands on its floor.
        const depth = Math.max(1, level(element, "well"));
        entries.push({ object: "well", rect, radius, height: depth, base, taper: Math.min(taper, depth), material: materialFor(element, face), state });
        floors.set(element.closest("label") ?? element.parentElement!, base - depth);
        continue;
      }
      if (face === "well") {
        // A text field: its well, and a bezel ring just inside it (the text sits on the face).
        entries.push({ face, rect, radius, height: level(element, "well"), material: materialFor(element, face), state });
        entries.push({ object: "bezel", rect, radius, height: Math.max(1, keyHeight / 4), base, taper: 1, width: Math.max(3, tokens.number("bevel.width", 6) / 2),
          material: materialFor(element, face), state: { disabled: state.disabled } });
        continue;
      }
      if (face === "mark") {
        entries.push({ object: "mark", rect, radius, height: Math.max(1, keyHeight / 4), base: floorOf(element), taper: 1, material: materialFor(element, face), state });
        continue;
      }
      if (face === "knob") {
        // A switch knob or radio dot: a dome in the control's colour, kept inside the control (the label around it).
        const control = element.closest("label") ?? element.parentElement!;
        entries.push({ object: "knob", rect, height: Math.min(rect[2], rect[3]) / 2, base: floorOf(element), material: materialFor(element, face),
          colour: tokens.colour(element.matches(".ug-radio__dot") ? "accent" : "knob"), bounds: rectWithin(control, panel), state });
        options.domes?.add(element);
        continue;
      }
    }
    if (element.matches("input[type='range']")) {
      // A slider: the face is the input's box; the groove is its rail, and the knob is placed from the value.
      const input = element as HTMLInputElement;
      const rail = Number.parseFloat(getComputedStyle(element).getPropertyValue("--_rail")) || 6;
      entries.push({ face: "groove", rect: [rect[0], rect[1] + (rect[3] - rail) / 2, rect[2], rail], radius: rail / 2, height: level(element, "well"),
        material: materialFor(element, "groove"), state: { disabled: state.disabled } });
      const min = Number(input.min || 0), max = Number(input.max || 100), along = max > min ? (Number(input.value) - min) / (max - min) : 0;
      const size = rect[3];
      entries.push({ face: "knob", rect: [rect[0] + along * (rect[2] - size), rect[1], size, size], radius: size / 2, height: level(element, "raised"),
        material: material(tokens.raw("material.roles.knob") || "satin"), state });
      continue;
    }
    if (face === "ring") {
      // A spinner: the ring is its arc's box; the turning arc stays in the captured content.
      const arc = element.querySelector(".ug-spinner__arc");
      if (arc) rect = rectWithin(arc, panel);
      entries.push({ face, rect, height: level(element, "well"), material: materialFor(element, face), state,
        ring: { thickness: Math.max(2, Math.min(rect[2], rect[3]) / 8), start: 0, sweep: 0, colour: tokens.colour("accent") } });
      continue;
    }
    entries.push({
      face, rect, radius,
      height: face === "flat" ? 0 : face === "raised" || face === "knob" ? level(element, "raised") : level(element, "well"),
      material: materialFor(element, face),
      finish: face === "raised" && element.matches("button, [role='button'], .ug-button") && element.getAttribute("data-strata-finish") !== "off",
      state,
    });
  }
  // The outset reaches the farthest shadow: the offset plus the softness of the tallest caster, hovered.
  const elevation = (tokens.number("light.elevation", 41) * Math.PI) / 180;
  const top = (entry: SceneEntry) => (isSceneObject(entry) ? (entry.base ?? 0) + (entry.object === "well" ? 0 : entry.height) : entry.height);
  const tallest = Math.max(...entries.map(top)) * tokens.number("state.hoverHeight", 1.6);
  const reach = Math.min(128, Math.ceil(tallest / Math.tan(elevation) + 1.5 * tallest + 1));
  const settings = {
    extent: { width, height },
    outset: { top: reach, right: reach, bottom: reach, left: reach },
    backdrop: tokens.colour("stage"),
    light: { azimuth: tokens.number("light.azimuth", 323), elevation: tokens.number("light.elevation", 41) },
    bevel: { width: tokens.number("bevel.width", 6), gain: tokens.number("bevel.gain", 0.55), profile: (tokens.raw("bevel.profile") || "quarter-round") as StrataScene["bevel"]["profile"] },
    shadow: { strength: tokens.number("shadow.strength", 0.24) },
    interior: { max: Math.min(0.1, tokens.number("interior.max", 0.04)) },
    state: { hoverHeight: tokens.number("state.hoverHeight", 1.6), pressHeight: tokens.number("state.pressHeight", 0.25),
      hoverLift: tokens.number("state.hoverLift", 0.04), pressSink: tokens.number("state.pressSink", 0.06) },
    focus: { colour: tokens.colour("accent"), width: tokens.number("focus.width", 3), offset: tokens.number("focus.offset", 0.5) },
    materials,
  };
  if (!entries.some(isSceneObject)) return { format: "strata-scene", version: 1, ...settings, primitives: entries };
  // The camera (design language section 2): centred on the stage, at D = max(camera.distance, r · h / taper + h),
  // with r the stage's half-diagonal, so every solid keeps the taper rule wherever its panel sits.
  const outer = panel.getBoundingClientRect(), stage = (options.stage ?? panel.parentElement ?? panel).getBoundingClientRect();
  const scale = outer.width / Math.max(panel.offsetWidth, 1) || 1;
  const steepest = Math.max(0, ...entries.filter(isSceneObject).filter(entry => entry.taper).map(entry => entry.height / entry.taper!));
  const highest = Math.max(0, ...entries.map(top));
  const distance = Math.max(tokens.number("camera.distance", 1600), Math.ceil(Math.hypot(stage.width, stage.height) / 2 / scale * steepest + highest + 1));
  return {
    format: "strata-scene", version: 2,
    camera: { distance, vanish: [(stage.left + stage.width / 2 - outer.left) / scale, (stage.top + stage.height / 2 - outer.top) / scale] },
    ...settings, primitives: entries,
  };
}

type Movable = HTMLElement & { [panelMotion]?: PanelMover };

/** A resolved CSS time (`.32s`, `320ms`) in milliseconds. */
function milliseconds(value: string): number {
  const amount = Number.parseFloat(value);
  return value.trim().endsWith("ms") ? amount : amount * 1000;
}

/** A CSS `cubic-bezier()` timing function (or `linear`), as progress over time, for the scene height during motion. */
function bezier(value: string): (t: number) => number {
  const match = value.match(/cubic-bezier\(([^)]+)\)/);
  const [x1, y1, x2, y2] = match ? match[1]!.split(",").map(Number) as [number, number, number, number] : [0, 0, 1, 1];
  const at = (t: number, a: number, b: number) => 3 * (1 - t) ** 2 * t * a + 3 * (1 - t) * t * t * b + t ** 3;
  return x => {
    // x(t) is monotonic for x1, x2 in [0, 1]: bisect for t, then read y.
    let low = 0, high = 1;
    for (let step = 0; step < 24; step++) { const mid = (low + high) / 2; if (at(mid, x1, x2) < x) low = mid; else high = mid; }
    return at((low + high) / 2, y1, y2);
  };
}

/**
 * Presents the Strata panels among `controller.container`'s direct children on the GPU, and keeps their scenes in
 * step with layout, states, tokens and the presentation mode. Returns a handle; `detach()` restores everything.
 */
export function attachStrataGpu(controller: StrataGpuController, options: StrataGpuOptions = {}): StrataGpu {
  registerTokens();
  const selector = options.panels ?? ".ug-panel";
  const root = controller.container;
  // Under forced colours everything is flat (design language section 4): the CSS presentation stays.
  const forced = matchMedia("(forced-colors: active)");
  type Motion = { start: number; duration: number; ease: (t: number) => number; from: number; to: number };
  const panels = new Map<HTMLElement, { id: string; release: () => void; handle?: ReturnType<StrataGpuController["setMaterial"]>; kind?: StrataSceneMaterial["kind"];
    scene?: string; motion?: Motion; domes: Set<Element> }>();
  /** Shows the CSS paint of the elements a panel no longer draws as domes, and hides it on those it now does. */
  const markDomes = (entry: { domes: Set<Element> }, domes: Set<Element>) => {
    for (const element of entry.domes) if (!domes.has(element)) element.removeAttribute("data-strata-dome");
    for (const element of domes) if (!element.hasAttribute("data-strata-dome")) element.setAttribute("data-strata-dome", "");
    entry.domes = domes;
  };
  let serial = 0, frame = 0, detached = false;
  const schedule = () => { if (!frame && !detached) frame = requestAnimationFrame(sync); };
  const resize = new ResizeObserver(schedule);
  // The adjust policy: a cap on levels, moved by frame intervals measured here (no core dependency).
  let cap: StrataLevel = "scene";
  const policy = { frameBudgetMs: 25, stepDownAfterFrames: 120, stepUpAfterFrames: 600, window: 60, ...options.adjust };
  const intervals: number[] = [];
  let over = 0, under = 0, previous = 0, meter = 0;
  /** The highest level any panel (or the application) asks for, so the cap never rises above it. */
  const wanted = () => {
    let highest: StrataLevel = options.level ?? "relief";
    for (const element of panels.keys()) {
      for (const node of [element, ...element.querySelectorAll("[data-strata-level]")]) highest = strataLevels[Math.max(strataLevels.indexOf(highest), strataLevels.indexOf(strataLevel(node, options.level)))]!;
    }
    return highest;
  };
  const step = (to: StrataLevel, p95: number) => {
    const event: StrataAdjustEvent = { from: lower(cap, wanted()), to, p95, frameBudgetMs: policy.frameBudgetMs };
    cap = to;
    intervals.length = 0; over = 0; under = 0;
    options.onAdjust?.(event);
    root.dispatchEvent(new CustomEvent("strata-adjust", { detail: event }));
    schedule();
  };
  const measure = (now: number) => {
    meter = 0;
    if (detached) return;
    // A hidden tab or a stall is not rendering cost: intervals over 250 ms are not counted.
    if (previous && now - previous < 250) {
      intervals.push(now - previous);
      if (intervals.length > policy.window) intervals.shift();
    }
    previous = now;
    if (intervals.length >= policy.window && controller.state().mode === "gpu") {
      const sorted = [...intervals].sort((a, b) => a - b), p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))]!;
      const highest = wanted(), current = lower(cap, highest);
      over = p95 > policy.frameBudgetMs ? over + 1 : 0;
      under = p95 <= policy.frameBudgetMs * 0.8 ? under + 1 : 0;
      if (over >= policy.stepDownAfterFrames && current !== "relief") step(strataLevels[strataLevels.indexOf(current) - 1]!, p95);
      else if (under >= policy.stepUpAfterFrames && strataLevels.indexOf(cap) < strataLevels.indexOf(highest)) step(strataLevels[strataLevels.indexOf(current) + 1]!, p95);
    }
    meter = requestAnimationFrame(measure);
  };
  if (options.adjust?.enabled) meter = requestAnimationFrame(measure);

  function sync() {
    frame = 0;
    if (detached) return;
    const gpu = controller.state().mode === "gpu" && !forced.matches;
    for (const element of root.children) {
      if (!(element instanceof HTMLElement) || !element.matches(selector) || panels.has(element)) continue;
      const id = element.id || `strata-panel-${++serial}`;
      try {
        // Centred, so depth and tilt move the panel about its middle as the CSS motion does.
        const release = controller.enroll(element, { id, origin: "center" });
        panels.set(element, { id, release, domes: new Set() });
        (element as Movable)[panelMotion] = mover(element);
        resize.observe(element);
      } catch (error) { console.warn(`Strata GPU: ${id} was not enrolled: ${String(error)}`); }
    }
    for (const [element, entry] of panels) {
      if (element.parentElement !== root) {
        entry.handle?.cancel(); entry.release(); resize.unobserve(element); element.removeAttribute("data-strata-mode"); panels.delete(element);
        delete (element as Movable)[panelMotion];
        markDomes(entry, new Set());
        continue;
      }
      if (!gpu) {
        // GPU is off: the CSS relief presents, and no material is kept.
        if (element.getAttribute("data-strata-mode") === "face") element.removeAttribute("data-strata-mode");
        entry.handle?.cancel(); entry.handle = undefined; entry.scene = undefined;
        markDomes(entry, new Set());
        continue;
      }
      if (element.getAttribute("data-strata-mode") !== "face") element.setAttribute("data-strata-mode", "face");
      const motion = entry.motion;
      const domes = new Set<Element>();
      const scene = strataScene(element, { level: options.level, cap, stage: root, domes,
        ...(motion ? { height: motion.from + (motion.to - motion.from) * motion.ease(Math.min(1, (performance.now() - motion.start) / motion.duration)) } : {}) });
      markDomes(entry, domes);
      const key = JSON.stringify(scene);
      if (entry.scene === key) continue;
      const kind = scene.version === 2 ? "objects" : "relief";
      try {
        // A change of level changes the material's kind: the new material replaces the old one in one step.
        if (entry.handle && entry.kind === kind) entry.handle.update(scene);
        else entry.handle = controller.setMaterial(entry.id, { kind, scene, bounds: "layer", interaction: "material", media: "identity", fallback: "static" });
        entry.kind = kind;
        entry.scene = key;
      } catch {
        // The runtime is between states (admitting or transitioning): try again on the next change or poll.
        entry.scene = undefined;
      }
    }
    // A CSS transition (a knob sliding, a face settling) moves geometry with no event per frame: follow it until it
    // ends. Endless CSS animations (the spinner) stay in the captured content and need no new scene.
    if (gpu && (root.getAnimations({ subtree: true }).some(animation => animation instanceof CSSTransition && animation.playState === "running")
      || [...panels.values()].some(entry => entry.motion))) schedule();
  }

  /**
   * A panel's GPU mover: from `elevation.modal` towards the panel's own level over `motion.slow`, as the CSS motion's
   * `perspective() translateZ() rotateX()` does: the depth becomes a scale of `D / (D − modal)` about the centre, with
   * the same tilt and fade. The panel's scene height travels the same way. It resolves when core's transition ends;
   * a motion core cannot start (GPU between states) ends at once, as reduced motion does.
   */
  function mover(element: HTMLElement): PanelMover {
    return async (motion, { tilt }) => {
      const entry = panels.get(element);
      if (!entry) return;
      const tokens = reader(element);
      const distance = tokens.number("camera.distance", 1600), modal = tokens.number("elevation.modal", 24);
      const own = tokens.number(`elevation.${element.getAttribute("data-strata-elevation") ?? "floating"}`, tokens.number("elevation.floating", 8));
      const duration = Math.max(1, milliseconds(tokens.raw("motion.slow")) || 320);
      const easing = tokens.raw("motion.easing.standard") || "cubic-bezier(0.2, 0, 0, 1)";
      const depth = distance / Math.max(distance - modal, 1);
      const far = { opacity: 0, scaleX: depth, scaleY: depth, ...(tilt ? { tiltX: tilt, perspective: distance } : {}) };
      const keyframes = motion === "enter" ? [{ offset: 0, ...far }, { offset: 1 }] : [{ offset: 0 }, { offset: 1, ...far }];
      let handle: ReturnType<StrataGpuController["transition"]>;
      try { handle = controller.transition(entry.id, { keyframes, timing: { duration, easing } }); }
      catch (error) { console.warn(`Strata GPU: ${entry.id} did not move: ${String(error)}`); return; }
      entry.motion = { start: performance.now(), duration, ease: bezier(easing), from: motion === "enter" ? modal : own, to: motion === "enter" ? own : modal };
      schedule();
      try { await handle.finished; } finally { entry.motion = undefined; schedule(); }
    };
  }
  const events = ["pointerover", "pointerout", "pointerdown", "pointerup", "focusin", "focusout", "keydown", "keyup", "input", "change", "transitionrun", "transitionend"];
  for (const type of events) root.addEventListener(type, schedule, true);
  const mutation = new MutationObserver(schedule);
  mutation.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style", "disabled", "checked", "aria-checked",
    "aria-disabled", "aria-pressed", "data-strata-face", "data-strata-material", "data-strata-elevation", "data-strata-level", "data-strata-depth", "data-strata-theme", "data-strata-scope", "data-strata-preview", "hidden"] });
  resize.observe(root);
  const poll = setInterval(schedule, options.poll ?? 500);
  forced.addEventListener("change", schedule);
  sync();
  return {
    refresh: () => { if (frame) cancelAnimationFrame(frame); sync(); },
    scene: panel => { const key = panels.get(panel)?.scene; return key ? JSON.parse(key) as StrataScene : undefined; },
    cap: () => cap,
    detach: () => {
      if (detached) return;
      detached = true;
      if (frame) cancelAnimationFrame(frame);
      if (meter) cancelAnimationFrame(meter);
      for (const type of events) root.removeEventListener(type, schedule, true);
      mutation.disconnect(); resize.disconnect(); clearInterval(poll); forced.removeEventListener("change", schedule);
      for (const [element, entry] of panels) {
        entry.handle?.cancel(); entry.release(); element.removeAttribute("data-strata-mode"); delete (element as Movable)[panelMotion];
        markDomes(entry, new Set());
      }
      panels.clear();
    },
  };
}
