/**
 * Instrument scenes for the `instrument-core.html` page: each enrolled panel's real controls become Instrument
 * objects (Rendering Model 2D) for core's `instrument` material, sized by the box rule (I0.2) so every part stays in
 * its control's box over the whole travel. Native state sets each object's `t`:
 * - knob (`<input type="range">`, round): a skirt and a cap revolved from profiles, and a pointer, turning ±135°;
 * - fader (vertical `<input type="range">`): a printed slot, and a carriage with a grip line sliding its travel;
 * - key (`<button>`): a body and a captured cap (the button's own label, read from the capture), travelling 2.5 px when
 *   pressed;
 * - switch (`<input type="checkbox" role="switch">`): a track and a round thumb sliding across.
 * Nothing here is a core API: it is what the Strata GPU helper will build in its own PR.
 */
import type { InstrumentObject, InstrumentPart, InstrumentProfile, InstrumentRecipe, InstrumentScene } from "@underglass/core";

export type ControlKind = "knob" | "fader" | "key" | "switch";
export interface Theme { name: "light" | "dark"; stage: string; face: string; body: string; slot: string; thumb: string; metal: string }
export const themes: Record<Theme["name"], Theme> = {
  light: { name: "light", stage: "#e3e5e9", face: "#dfe1e5", body: "#2563eb", slot: "#0c0c0e", thumb: "#eceef2", metal: "#eceef0" },
  dark: { name: "dark", stage: "#16181c", face: "#2a2d34", body: "#e2e6ec", slot: "#050506", thumb: "#c9ccd2", metal: "#686b72" },
};
/** The stage camera: `D` = 2,400, the camera rule's floor (2D.3); the page is 1920 × 1080 in its tests. */
export const CAMERA_DISTANCE = 2400;
/** Part heights (50% depth), in CSS px. */
export const heights = { skirt: 2.5, cap: 12, pointer: 0.8, carriage: 8, grip: 0.6, slot: 0.4, body: 5, keyCap: 1, track: 1.5, thumb: 6, overshoot: 60 };

/** The box rule's margin at this stage (`ceil(drift(h) + 1)`, I0.2), with `r` the stage's half-diagonal. */
export function margin(height: number, stage: { width: number; height: number }) {
  const r = Math.hypot(stage.width, stage.height) / 2;
  return Math.ceil((r * height) / (CAMERA_DISTANCE - height) + 1);
}
/** A control's layout box in its panel's CSS px, unrounded. */
export function rectOf(element: HTMLElement, panel: HTMLElement): [number, number, number, number] {
  const box = element.getBoundingClientRect(), base = panel.getBoundingClientRect();
  return [box.left - base.left, box.top - base.top, box.width, box.height];
}
/** A control's position along its travel from native state: value, checked, or pressed. */
export function travelOf(element: HTMLElement, pressed: ReadonlySet<HTMLElement>) {
  if (element instanceof HTMLInputElement && element.type === "range") return (Number(element.value) - Number(element.min)) / (Number(element.max) - Number(element.min));
  if (element instanceof HTMLInputElement) return element.checked ? 1 : 0;
  return pressed.has(element) ? 1 : 0;
}

const lathe = (points: [number, number, number, number][], segments = 48): InstrumentProfile => ({ type: "lathe", points, segments });
const prism = (width: number, length: number, radius: number, height: number, taper = 0, chamfer = 0): InstrumentProfile =>
  ({ type: "prism", width, length, radius: Math.min(radius, width / 2, length / 2), height, taper, chamfer });
const round = (value: number) => Math.round(value * 100) / 100;

/** The materials of a theme (decision 4 of the design note): brushed metal, polished chamfers, lacquer and the rest. */
export function materials(theme: Theme): Record<string, InstrumentRecipe> {
  return {
    face: { base: { roughness: 0.6 } },
    metal: { base: { colour: theme.metal, metallic: 1, roughness: 0.3, direct: 0.2 }, brush: { strength: 0.9, direction: "circular" }, grain: { strength: 0.15 } },
    polished: { base: { colour: "#f4f5f7", metallic: 1, roughness: 0.08, direct: 0.2 } },
    lacquer: { base: { colour: "#1d1d1f", roughness: 0.5 }, coat: { strength: 1, roughness: 0.03, ior: 1.5 } },
    body: { base: { colour: theme.body, roughness: 0.4 } },
    // Captured caps: roughness 1 and no coat, so the interior factor is 1 and the label is the capture itself.
    keycap: { base: { roughness: 1 } },
    slot: { base: { colour: theme.slot, roughness: 0.9 } },
    thumb: { base: { colour: theme.thumb, roughness: 0.35 } },
    grip: { base: { colour: "#f5f5f5", roughness: 0.5 }, emissive: { strength: 0.3 } },
  };
}

/**
 * The scene of one panel. `options.overshoot` names a knob whose pointer is drawn far too tall: in a stage corner its
 * drift leaves the box, so core draws it as its Relief primitive and reports it. `options.casters: false` removes every
 * face shadow (each part's caster `null`), for pixel tests that must see the parts alone. `objects: false` leaves only
 * the face.
 */
export function panelScene(panel: HTMLElement, theme: Theme, stage: { width: number; height: number }, pressed: ReadonlySet<HTMLElement>,
  options: { overshoot?: string; casters?: boolean; objects?: boolean } = {}): InstrumentScene {
  const profiles: Record<string, InstrumentProfile> = {};
  const profile = (name: string, shape: InstrumentProfile) => { const key = `${name}:${JSON.stringify(shape)}`; profiles[key] ??= shape; return key; };
  const objects: InstrumentObject[] = [];
  const caster = options.casters === false ? { caster: null } : {};
  for (const element of options.objects === false ? [] : panel.querySelectorAll<HTMLElement>("[data-part]")) {
    const kind = element.dataset.part as ControlKind, rect = rectOf(element, panel), [x, y, w, h] = rect;
    const cx = x + w / 2, cy = y + h / 2, t = travelOf(element, pressed);
    let parts: InstrumentPart[];
    let radius = 0;
    if (kind === "knob") {
      radius = w / 2;
      const rc = round(w / 2 - margin(heights.skirt + heights.cap, stage)), rs = round(Math.max(rc + 1, w / 2 - margin(heights.skirt, stage)));
      const tall = element.id === options.overshoot;
      const turn = { from: { turn: -135 }, to: { turn: 135 } };
      const offset = round(rc * 0.55);
      const pointerTurn = { from: { turn: -135, pivot: [0, offset, 0] as [number, number, number] }, to: { turn: 135, pivot: [0, offset, 0] as [number, number, number] } };
      parts = [
        { kind: "skirt", profile: profile("skirt", lathe([[rs, 0, 1, 0], [rs, heights.skirt - 0.8, 1, 0], [rs - 0.8, heights.skirt, 0.6, 0.8], [rc, heights.skirt, 0, 1]])), at: [cx, cy, 0], material: "metal", pose: turn, ...caster },
        { kind: "cap", profile: profile("cap", lathe([[rc, 0, 1, 0], [rc, heights.cap - 1.4, 1, 0], [rc - 1.4, heights.cap, 0.6, 0.8], [0, heights.cap, 0, 1]])), at: [cx, cy, heights.skirt], material: "lacquer", pose: turn, ...caster },
        { kind: "chamfer", profile: profile("chamfer", lathe([[rc + 0.01, heights.cap - 1.4, 0.75, 0.66], [rc - 1.4, heights.cap + 0.01, 0.75, 0.66]])), at: [cx, cy, heights.skirt], material: "polished", pose: turn, caster: null },
        { kind: "pointer", profile: profile("pointer", prism(2, round(rc * 0.5), 0.6, tall ? heights.overshoot : heights.pointer, 0.2)), at: [cx, round(cy - offset), heights.skirt + heights.cap], material: "grip", pose: pointerTurn, caster: null },
      ];
    } else if (kind === "fader") {
      const m = margin(heights.carriage, stage), width = round(Math.max(6, w - 2 * m)), length = round(Math.min(18, Math.max(8, h * 0.18)));
      const travel = round(Math.max(0, h - 2 * m - length)), top = y + m + length / 2;
      const slide = { from: { slide: [0, travel] as [number, number] }, to: { slide: [0, 0] as [number, number] } };
      parts = [
        { kind: "slot", profile: profile("slot", prism(3, Math.max(1, travel), 1.5, heights.slot)), at: [cx, round(top + travel / 2), 0], material: "slot", caster: null },
        { kind: "carriage", profile: profile("carriage", prism(width, length, 2.5, heights.carriage, 2, 0.5)), at: [cx, round(top), 0], material: "lacquer", pose: slide, ...caster },
        { kind: "grip", profile: profile("grip", prism(round(Math.max(2, width - 6)), 1.4, 0.4, heights.grip)), at: [cx, round(top), heights.carriage], material: "grip", pose: slide, caster: null },
      ];
    } else if (kind === "key") {
      radius = parseFloat(getComputedStyle(element).borderTopLeftRadius) || 0;
      const m = margin(heights.body + heights.keyCap, stage), width = round(w - 2 * m), length = round(h - 2 * m);
      const press = { from: { travel: 0 }, to: { travel: -2.5 } };
      parts = [
        { kind: "plinth", profile: profile("body", prism(width, length, Math.max(1, radius - m), heights.body, 1.2)), at: [cx, cy, 0], material: "body", pose: press, ...caster },
        { kind: "cap", profile: profile("keyCap", prism(round(width - 2.4), round(length - 2.4), Math.max(1, radius - m - 1.2), heights.keyCap)), at: [cx, cy, heights.body], material: "keycap", captured: true, pose: press, caster: null },
      ];
    } else {
      radius = h / 2;
      const m = margin(heights.thumb, stage), track = { width: round(w - 2 * m), length: round(h - 2 * m) };
      const d = round(Math.max(4, track.length - 2)), travel = round(Math.max(0, track.width - d));
      parts = [
        { kind: "slot", profile: profile("track", prism(track.width, track.length, track.length / 2, heights.track, 0.4)), at: [cx, cy, 0], material: "slot", caster: null },
        { kind: "carriage", profile: profile("thumb", prism(d, d, d / 2, heights.thumb, 1)), at: [round(cx - travel / 2), cy, heights.track], material: "thumb",
          pose: { from: { slide: [0, 0] }, to: { slide: [travel, 0] } }, ...caster },
      ];
    }
    objects.push({ id: element.id, rect, bounds: { rect, radius }, t, parts,
      // The Relief primitive drawn instead (pending builds, step-downs) casts no shadow, so it stays inside the box too.
      relief: { face: kind === "knob" ? "knob" : "raised", rect, radius, height: 0, material: kind === "key" ? "body" : "metal" } });
  }
  return {
    format: "strata-scene", version: 4, kind: "instrument",
    camera: { distance: CAMERA_DISTANCE, vanish: [stage.width / 2, stage.height / 2] },
    environment: { source: "studio", strength: 1 },
    extent: { width: panel.offsetWidth, height: panel.offsetHeight }, outset: { top: 16, right: 16, bottom: 16, left: 16 },
    backdrop: theme.stage, light: { azimuth: 323, elevation: 41 },
    bevel: { width: 3, gain: 1, profile: "quarter-round" }, shadow: { strength: 0.24 }, interior: { max: 0.04 },
    state: { hoverHeight: 1.6, pressHeight: 0.25, hoverLift: 0.02, pressSink: 0.03 }, focus: { colour: "#2563eb", width: 2, offset: 2 },
    materials: materials(theme),
    primitives: [{ face: "raised", rect: [0, 0, panel.offsetWidth, panel.offsetHeight], radius: 14, height: 6, material: "face" }],
    profiles, objects,
  };
}

/**
 * A scene with exactly `parts` parts (tiny pins, one kind) spread over the panel's controls, for the budget check: the
 * renderer draws the layer at the Relief level above 2,048 parts and reports it.
 */
export function budgetScene(base: InstrumentScene, parts: number): InstrumentScene {
  const pin: InstrumentProfile = { type: "prism", width: 1, length: 1, radius: 0, height: 0.2 };
  const objects: InstrumentObject[] = [];
  let left = parts;
  for (let index = 0; left > 0; index++) {
    const host = base.objects[index % base.objects.length]!, count = Math.min(64, left);
    left -= count;
    const [x, y, w, h] = host.rect;
    objects.push({ id: `pins-${index}`, rect: host.rect, bounds: { rect: host.rect, radius: 0 }, t: 0,
      parts: Array.from({ length: count }, (_, at): InstrumentPart => ({ kind: "pivot", profile: "pin", at: [x + w / 2 + (at % 8) - 4, y + h / 2 + Math.floor(at / 8) - 4, 0], material: "slot", caster: null })),
      relief: { face: "raised", rect: host.rect, radius: 0, height: 2, material: "slot" } });
  }
  return { ...base, profiles: { pin }, objects };
}
