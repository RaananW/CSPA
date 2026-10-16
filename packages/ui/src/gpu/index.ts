/**
 * `@underglass/ui/gpu`: Strata over Underglass. `attachStrataGpu` enrolls each Strata panel that is a direct child of
 * the Underglass root as a GPU layer and gives it core's built-in `relief` material, with a scene in the Strata
 * Rendering Model's format built from the panel's `data-strata-face` markers and its resolved tokens. While GPU
 * presents, the panels switch to `data-strata-mode="face"`, so CSS paints flat faces and the GPU paints the relief;
 * whenever GPU is off, the CSS relief is back.
 *
 * The root becomes a stage (`data-strata-stage`): Dialog and Drawer panels rendered into it are presented as panels
 * of their own while they are open, over a scrim the GPU fades, and are let go before they hide.
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
import type { ScenePrimitive, StrataReliefScene, SceneFace, SceneMaterial } from "../tokens/scene.ts";
import { panelMotion, type PanelMover } from "../dom/motion.ts";
import { strataStage, type StagePresenter } from "../dom/stage.ts";

/** What the helper needs from an Underglass controller (`CanvasController` from `@underglass/core`). */
export interface StrataGpuController {
  readonly container: HTMLElement;
  enroll(element: HTMLElement, options: { id: string; origin?: "center" }): () => void;
  setMaterial(id: string, descriptor: StrataReliefMaterial): { update(scene: StrataReliefScene): void; cancel(): void };
  transition(id: string, motion: StrataPanelMotion): { finished: Promise<{ status: string; reason: string }>; cancel(): void };
  state(): { mode: string };
}
/** A panel motion as core's typed motion: numeric keyframes and timing. */
export interface StrataPanelMotion {
  keyframes: { offset: number; opacity?: number; scaleX?: number; scaleY?: number; tiltX?: number; perspective?: number }[];
  timing: { duration: number; easing: string };
}
/** The material descriptor the helper hands to `setMaterial`. */
export interface StrataReliefMaterial {
  kind: "relief";
  scene: StrataReliefScene;
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
}
export interface StrataGpu {
  /** Rebuilds every panel's scene now (for example from the runtime's `onStatusChange`). */
  refresh(): void;
  /** The scene last given to a panel, for inspection and tests. */
  scene(panel: HTMLElement): StrataReliefScene | undefined;
  /** Releases every panel: cancels materials, leaves face mode and releases the enrollments. */
  detach(): void;
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
const sceneTokens = /^(light\.(azimuth|elevation)|bevel\.(width|gain)|shadow\.strength|interior\.max|state\.|focus\.(width|offset)|elevation\.|material\.presets\.[^.]+\.(base|coat|emissive)\.(roughness|metallic|strength))/;
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

/** What a caller may override in a panel's scene. */
export interface StrataSceneOptions {
  /** The panel's own height, in CSS px, instead of its elevation (panel motion carries it through depth). */
  height?: number;
}

/** Builds a panel's scene from its markup, layout, states and resolved tokens. */
export function strataScene(panel: HTMLElement, options: StrataSceneOptions = {}): StrataReliefScene {
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
      pressed: control.matches(":active") || preview.includes("active"),
      focus: control.matches(":focus-visible") || preview.includes("focus"),
      disabled: control.matches(":disabled, [aria-disabled='true']"),
    };
  };
  const width = panel.offsetWidth, height = panel.offsetHeight;
  const primitives: ScenePrimitive[] = [{ face: "raised", rect: [0, 0, width, height], radius: radiusOf(panel, width), height: options.height ?? level(panel, "floating"),
    material: materialFor(panel, "raised") }];
  for (const element of panel.querySelectorAll<HTMLElement>("[data-strata-face]")) {
    if (primitives.length >= 255) break;
    const face = element.getAttribute("data-strata-face") as SceneFace;
    if (!faces.includes(face) || !element.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
    let rect = rectWithin(element, panel);
    if (rect[2] <= 0 || rect[3] <= 0) continue;
    const state = states(element);
    if (element.matches("input[type='range']")) {
      // A slider: the face is the input's box; the groove is its rail, and the knob is placed from the value.
      const input = element as HTMLInputElement;
      const rail = Number.parseFloat(getComputedStyle(element).getPropertyValue("--_rail")) || 6;
      primitives.push({ face: "groove", rect: [rect[0], rect[1] + (rect[3] - rail) / 2, rect[2], rail], radius: rail / 2, height: level(element, "well"),
        material: materialFor(element, "groove"), state: { disabled: state.disabled } });
      const min = Number(input.min || 0), max = Number(input.max || 100), along = max > min ? (Number(input.value) - min) / (max - min) : 0;
      const size = rect[3];
      primitives.push({ face: "knob", rect: [rect[0] + along * (rect[2] - size), rect[1], size, size], radius: size / 2, height: level(element, "raised"),
        material: material(tokens.raw("material.roles.knob") || "satin"), state });
      continue;
    }
    if (face === "ring") {
      // A spinner: the ring is its arc's box; the turning arc stays in the captured content.
      const arc = element.querySelector(".ug-spinner__arc");
      if (arc) rect = rectWithin(arc, panel);
      primitives.push({ face, rect, height: level(element, "well"), material: materialFor(element, face), state,
        ring: { thickness: Math.max(2, Math.min(rect[2], rect[3]) / 8), start: 0, sweep: 0, colour: tokens.colour("accent") } });
      continue;
    }
    primitives.push({
      face, rect, radius: radiusOf(element, rect[2]),
      height: face === "flat" ? 0 : face === "raised" || face === "knob" ? level(element, "raised") : level(element, "well"),
      material: materialFor(element, face),
      finish: face === "raised" && element.matches("button, [role='button'], .ug-button") && element.getAttribute("data-strata-finish") !== "off",
      state,
    });
  }
  // The outset reaches the farthest shadow: the offset plus the softness of the tallest caster, hovered.
  const elevation = (tokens.number("light.elevation", 41) * Math.PI) / 180;
  const tallest = Math.max(...primitives.map(primitive => primitive.height)) * tokens.number("state.hoverHeight", 1.6);
  const reach = Math.min(128, Math.ceil(tallest / Math.tan(elevation) + 1.5 * tallest + 1));
  return {
    format: "strata-scene", version: 1,
    extent: { width, height },
    outset: { top: reach, right: reach, bottom: reach, left: reach },
    backdrop: tokens.colour("stage"),
    light: { azimuth: tokens.number("light.azimuth", 323), elevation: tokens.number("light.elevation", 41) },
    bevel: { width: tokens.number("bevel.width", 6), gain: tokens.number("bevel.gain", 0.55), profile: (tokens.raw("bevel.profile") || "quarter-round") as StrataReliefScene["bevel"]["profile"] },
    shadow: { strength: tokens.number("shadow.strength", 0.24) },
    interior: { max: Math.min(0.1, tokens.number("interior.max", 0.04)) },
    state: { hoverHeight: tokens.number("state.hoverHeight", 1.6), pressHeight: tokens.number("state.pressHeight", 0.25),
      hoverLift: tokens.number("state.hoverLift", 0.04), pressSink: tokens.number("state.pressSink", 0.06) },
    focus: { colour: tokens.colour("accent"), width: tokens.number("focus.width", 3), offset: tokens.number("focus.offset", 0.5) },
    materials,
    primitives,
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
  const panels = new Map<HTMLElement, { id: string; release: () => void; handle?: ReturnType<StrataGpuController["setMaterial"]>; scene?: string; motion?: Motion }>();
  // Scrims under open dialogs: plain layers (no material) that the GPU fades in and out.
  const scrims = new Map<HTMLElement, { id: string; release: () => void; fade?: ReturnType<StrataGpuController["transition"]>; closing?: boolean }>();
  let serial = 0, frame = 0, detached = false;
  const schedule = () => { if (!frame && !detached) frame = requestAnimationFrame(sync); };
  const resize = new ResizeObserver(schedule);
  const presenting = () => controller.state().mode === "gpu" && !forced.matches;
  // A layer must never be hidden while presented (it would have no size), so only shown children are taken on.
  const shown = (element: Element): element is HTMLElement => element instanceof HTMLElement && !element.hidden && element.checkVisibility();

  /** Enrolls a shown panel now. Face mode comes first, so the panel never carries its CSS relief as a GPU layer. */
  function enrollPanel(element: HTMLElement, gpu: boolean) {
    const id = element.id || `strata-panel-${++serial}`;
    try {
      if (gpu) element.setAttribute("data-strata-mode", "face");
      // Centred, so depth and tilt move the panel about its middle as the CSS motion does.
      const release = controller.enroll(element, { id, origin: "center" });
      panels.set(element, { id, release });
      (element as Movable)[panelMotion] = mover(element);
      resize.observe(element);
    } catch (error) {
      element.removeAttribute("data-strata-mode");
      console.warn(`Strata GPU: ${id} was not enrolled: ${String(error)}`);
    }
  }
  /** Lets a panel go now: its material, its enrollment, face mode and its mover. */
  function releasePanel(element: HTMLElement) {
    const entry = panels.get(element);
    if (!entry) return;
    entry.handle?.cancel(); entry.release(); resize.unobserve(element); element.removeAttribute("data-strata-mode"); panels.delete(element);
    delete (element as Movable)[panelMotion];
  }
  /** Enrolls a shown scrim now, on the GPU only, and fades it in. */
  function enrollScrim(element: HTMLElement) {
    const id = `strata-scrim-${++serial}`;
    try {
      element.setAttribute("data-strata-mode", "face");
      scrims.set(element, { id, release: controller.enroll(element, { id }) });
      fadeScrim(element, false);
    } catch (error) {
      element.removeAttribute("data-strata-mode");
      console.warn(`Strata GPU: a scrim was not enrolled: ${String(error)}`);
    }
  }
  function releaseScrim(element: HTMLElement) {
    const entry = scrims.get(element);
    if (!entry) return;
    entry.fade?.cancel(); entry.release(); element.removeAttribute("data-strata-mode"); scrims.delete(element);
  }
  /** Fades a scrim's layer in, or out once its dialog closes, over `motion.slow` (instant under reduced motion). */
  function fadeScrim(element: HTMLElement, out: boolean) {
    const entry = scrims.get(element);
    if (!entry) return;
    entry.closing = out;
    const tokens = reader(element);
    const duration = Math.max(1, milliseconds(tokens.raw("motion.slow")) || 320);
    const keyframes = out ? [{ offset: 0 }, { offset: 1, opacity: 0 }] : [{ offset: 0, opacity: 0 }, { offset: 1 }];
    try { entry.fade = controller.transition(entry.id, { keyframes, timing: { duration, easing: tokens.raw("motion.easing.standard") || "ease-out" } }); }
    catch { entry.fade = undefined; }
  }
  // The stage hook (`@underglass/ui/dom`'s `stageOf`): dialogs hand their panel and scrim over as they show, and take
  // them back before they hide, in the same task.
  const presenter: StagePresenter = {
    present: element => {
      if (detached || element.parentElement !== root || !shown(element)) return;
      const gpu = presenting();
      if (element.matches(".ug-scrim")) { if (gpu && !scrims.has(element)) enrollScrim(element); return; }
      if (!element.matches(selector) || panels.has(element)) return;
      enrollPanel(element, gpu);
      const entry = panels.get(element);
      if (entry && gpu) update(element, entry);
    },
    withdraw: element => { releasePanel(element); releaseScrim(element); },
  };
  root.setAttribute("data-strata-stage", "");
  (root as HTMLElement & { [strataStage]?: StagePresenter })[strataStage] = presenter;

  function sync() {
    frame = 0;
    if (detached) return;
    const gpu = presenting();
    for (const element of root.children) {
      if (!shown(element)) continue;
      if (gpu && element.matches(".ug-scrim") && !scrims.has(element)) enrollScrim(element);
      if (!element.matches(selector) || panels.has(element)) continue;
      enrollPanel(element, gpu);
    }
    for (const [element, entry] of scrims) {
      if (element.parentElement !== root || !shown(element)) { releaseScrim(element); continue; }
      if (!gpu) { element.removeAttribute("data-strata-mode"); continue; }
      element.setAttribute("data-strata-mode", "face");
      if (element.hasAttribute("data-strata-closing") && !entry.closing) fadeScrim(element, true);
    }
    for (const [element, entry] of panels) {
      if (element.parentElement !== root) { releasePanel(element); continue; }
      if (!gpu) {
        // GPU is off: the CSS relief presents, and no material is kept.
        if (element.getAttribute("data-strata-mode") === "face") element.removeAttribute("data-strata-mode");
        entry.handle?.cancel(); entry.handle = undefined; entry.scene = undefined;
        continue;
      }
      update(element, entry);
    }
    // A CSS transition (a knob sliding, a face settling) moves geometry with no event per frame: follow it until it
    // ends. Endless CSS animations (the spinner) stay in the captured content and need no new scene.
    if (gpu && (root.getAnimations({ subtree: true }).some(animation => animation instanceof CSSTransition && animation.playState === "running")
      || [...panels.values()].some(entry => entry.motion))) schedule();
  }

  /** Brings a presented panel's scene and material up to date. */
  function update(element: HTMLElement, entry: NonNullable<ReturnType<typeof panels.get>>) {
    if (element.getAttribute("data-strata-mode") !== "face") element.setAttribute("data-strata-mode", "face");
    const motion = entry.motion;
    const scene = strataScene(element, motion ? { height: motion.from + (motion.to - motion.from) * motion.ease(Math.min(1, (performance.now() - motion.start) / motion.duration)) } : {});
    const key = JSON.stringify(scene);
    if (entry.scene === key) return;
    try {
      if (entry.handle) entry.handle.update(scene);
      else entry.handle = controller.setMaterial(entry.id, { kind: "relief", scene, bounds: "layer", interaction: "material", media: "identity", fallback: "static" });
      entry.scene = key;
    } catch {
      // The runtime is between states (admitting or transitioning): try again on the next change or poll.
      entry.scene = undefined;
    }
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
    "aria-disabled", "data-strata-closing", "data-strata-face", "data-strata-material", "data-strata-elevation", "data-strata-depth", "data-strata-theme", "data-strata-scope", "data-strata-preview", "hidden"] });
  resize.observe(root);
  const poll = setInterval(schedule, options.poll ?? 500);
  forced.addEventListener("change", schedule);
  sync();
  return {
    refresh: () => { if (frame) cancelAnimationFrame(frame); sync(); },
    scene: panel => { const key = panels.get(panel)?.scene; return key ? JSON.parse(key) as StrataReliefScene : undefined; },
    detach: () => {
      if (detached) return;
      detached = true;
      if (frame) cancelAnimationFrame(frame);
      for (const type of events) root.removeEventListener(type, schedule, true);
      mutation.disconnect(); resize.disconnect(); clearInterval(poll); forced.removeEventListener("change", schedule);
      for (const element of [...panels.keys()]) releasePanel(element);
      for (const element of [...scrims.keys()]) releaseScrim(element);
      root.removeAttribute("data-strata-stage");
      delete (root as HTMLElement & { [strataStage]?: StagePresenter })[strataStage];
    },
  };
}
