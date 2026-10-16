/**
 * `@underglass/ui/gpu`: Strata over Underglass. `attachStrataGpu` enrolls each Strata panel that is a direct child of
 * the Underglass root as a GPU layer and gives it core's built-in `relief` material, with a scene in the Strata
 * Rendering Model's format built from the panel's `data-strata-face` markers and its resolved tokens. While GPU
 * presents, the panels switch to `data-strata-mode="face"`, so CSS paints flat faces and the GPU paints the relief;
 * whenever GPU is off, the CSS relief is back.
 *
 * Everything the scene needs comes from the page as the CSS presentation sees it: geometry from layout (followed through
 * CSS transitions frame by frame), states from
 * `:hover`, `:active`, `:focus-visible` and `:disabled`, and token values from each element's resolved `--strata-*`
 * custom properties, so depth, themes and scopes apply exactly as they do in CSS. The helper never imports
 * `@underglass/core`: it takes the controller as a value and speaks the scene format.
 */
import { cssVariable, flatten, numeric, strataTokens } from "../tokens/index.ts";
import type { ScenePrimitive, StrataReliefScene, SceneFace, SceneMaterial } from "../tokens/scene.ts";

/** What the helper needs from an Underglass controller (`CanvasController` from `@underglass/core`). */
export interface StrataGpuController {
  readonly container: HTMLElement;
  enroll(element: HTMLElement, options: { id: string }): () => void;
  setMaterial(id: string, descriptor: StrataReliefMaterial): { update(scene: StrataReliefScene): void; cancel(): void };
  state(): { mode: string };
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

/** Builds a panel's scene from its markup, layout, states and resolved tokens. */
export function strataScene(panel: HTMLElement): StrataReliefScene {
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
  const primitives: ScenePrimitive[] = [{ face: "raised", rect: [0, 0, width, height], radius: radiusOf(panel, width), height: level(panel, "floating"), material: materialFor(panel, "raised") }];
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
  const panels = new Map<HTMLElement, { id: string; release: () => void; handle?: ReturnType<StrataGpuController["setMaterial"]>; scene?: string }>();
  let serial = 0, frame = 0, detached = false;
  const schedule = () => { if (!frame && !detached) frame = requestAnimationFrame(sync); };
  const resize = new ResizeObserver(schedule);

  function sync() {
    frame = 0;
    if (detached) return;
    const gpu = controller.state().mode === "gpu" && !forced.matches;
    for (const element of root.children) {
      if (!(element instanceof HTMLElement) || !element.matches(selector) || panels.has(element)) continue;
      const id = element.id || `strata-panel-${++serial}`;
      try { panels.set(element, { id, release: controller.enroll(element, { id }) }); resize.observe(element); }
      catch (error) { console.warn(`Strata GPU: ${id} was not enrolled: ${String(error)}`); }
    }
    for (const [element, entry] of panels) {
      if (element.parentElement !== root) {
        entry.handle?.cancel(); entry.release(); resize.unobserve(element); element.removeAttribute("data-strata-mode"); panels.delete(element);
        continue;
      }
      if (!gpu) {
        // GPU is off: the CSS relief presents, and no material is kept.
        if (element.getAttribute("data-strata-mode") === "face") element.removeAttribute("data-strata-mode");
        entry.handle?.cancel(); entry.handle = undefined; entry.scene = undefined;
        continue;
      }
      if (element.getAttribute("data-strata-mode") !== "face") element.setAttribute("data-strata-mode", "face");
      const scene = strataScene(element), key = JSON.stringify(scene);
      if (entry.scene === key) continue;
      try {
        if (entry.handle) entry.handle.update(scene);
        else entry.handle = controller.setMaterial(entry.id, { kind: "relief", scene, bounds: "layer", interaction: "material", media: "identity", fallback: "static" });
        entry.scene = key;
      } catch {
        // The runtime is between states (admitting or transitioning): try again on the next change or poll.
        entry.scene = undefined;
      }
    }
    // A CSS transition (a knob sliding, a face settling) moves geometry with no event per frame: follow it until it
    // ends. Endless CSS animations (the spinner) stay in the captured content and need no new scene.
    if (gpu && root.getAnimations({ subtree: true }).some(animation => animation instanceof CSSTransition && animation.playState === "running")) schedule();
  }
  const events = ["pointerover", "pointerout", "pointerdown", "pointerup", "focusin", "focusout", "keydown", "keyup", "input", "change", "transitionrun", "transitionend"];
  for (const type of events) root.addEventListener(type, schedule, true);
  const mutation = new MutationObserver(schedule);
  mutation.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style", "disabled", "checked", "aria-checked",
    "aria-disabled", "data-strata-face", "data-strata-material", "data-strata-elevation", "data-strata-depth", "data-strata-theme", "data-strata-scope", "data-strata-preview", "hidden"] });
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
      for (const [element, entry] of panels) { entry.handle?.cancel(); entry.release(); element.removeAttribute("data-strata-mode"); }
      panels.clear();
    },
  };
}
