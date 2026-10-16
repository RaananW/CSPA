/**
 * The Strata scene format, versions 1 and 2 (`docs/ui-library/rendering-model.md`, part 1): the engine-neutral
 * description of one layer at one moment, resolved from the tokens and the DOM. Version 2 adds objects (the Objects
 * level), the camera they are seen through, and the environment that lights them. A scene names no engine: any renderer that shades it
 * as the rendering model says, and passes the conformance suite, presents Strata. `strata-scene.schema.json` is the
 * same format as a JSON Schema; `validateScene` checks it without a schema library.
 */
import { flatten, numeric, valueOf, type ResolveOptions, type TokenGroup } from "./model.ts";

/** The relief primitives, as `data-strata-face` names them (components README). */
export const sceneFaces = ["raised", "well", "groove", "knob", "mark", "ring", "flat"] as const;
export type SceneFace = (typeof sceneFaces)[number];

export const bevelProfiles = ["quarter-round", "chamfer", "cove"] as const;
export type BevelProfile = (typeof bevelProfiles)[number];

/** A material as numeric layers. Colours come from the captured content, never from the material. */
export interface SceneMaterial {
  base?: { roughness?: number; metallic?: number };
  coat?: { strength?: number; roughness?: number; ior?: number };
  /** An emissive material is unlit: no bevel light, no interior change and no finish. It still casts. */
  emissive?: { strength?: number };
  /** Reserved in version 1: accepted, and ignored by the shading model. */
  sheen?: { strength?: number; roughness?: number };
  iridescence?: { strength?: number; thickness?: number };
  transmission?: { strength?: number; ior?: number; frost?: number };
}

/** Pointer, keyboard and focus state of a primitive. Absent flags are false. */
export interface SceneState {
  hover?: boolean;
  pressed?: boolean;
  focus?: boolean;
  disabled?: boolean;
}

/** One relief primitive, in layer-local CSS px. */
export interface ScenePrimitive {
  face: SceneFace;
  /** `[x, y, width, height]` of the element's border box. */
  rect: [number, number, number, number];
  /** Corner radius; clamped to half the shorter side. A knob is always fully round. */
  radius?: number;
  /** Height above the face for raised parts, depth below it for wells (reserved for wells in version 1). */
  height: number;
  /** A key of the scene's `materials`. */
  material: string;
  /** Whether the material's finish zones apply (raised controls whose text stays clear of them). */
  finish?: boolean;
  state?: SceneState;
  /** For `ring` only: the annulus thickness and its arc, in degrees clockwise from the top. */
  ring?: { thickness: number; start: number; sweep: number; colour: string };
}

/** The objects of version 2 (design language section 6): solids that taper, and domes. */
export const sceneObjects = ["key", "slab", "bezel", "well", "rail", "mark", "knob", "puck"] as const;
export type SceneObjectKind = (typeof sceneObjects)[number];

/**
 * One object (version 2), in layer-local CSS px: a solid (`key`, `slab`, `bezel`, `well`, `rail`, `mark`) or a
 * dome (`knob`, `puck`) standing on its base rectangle, the native control's border box.
 */
export interface SceneObject {
  object: SceneObjectKind;
  /** `[x, y, width, height]` of the base. */
  rect: [number, number, number, number];
  /** Corner radius of a solid; clamped to half the shorter side. A dome's footprint is always fully round. */
  radius?: number;
  /** Height above `base` (for a well, its depth below it). */
  height: number;
  /** The height of the surface the object stands on; default 0. */
  base?: number;
  /** A solid's inset of its cap from its base, at least the perspective drift (design language section 6). */
  taper?: number;
  /** A bezel's ring width. */
  width?: number;
  /** How far a key's or mark's cap sinks when pressed; default 0. */
  travel?: number;
  /** A key of the scene's `materials`. */
  material: string;
  /** A dome's own colour (`#rrggbb`): domes carry no captured content. */
  colour?: string;
  /** Whether the material's finish zones apply on a solid's cap. */
  finish?: boolean;
  /** The native control's border box, which must contain every drawn pixel; default `rect`. */
  bounds?: [number, number, number, number];
  state?: SceneState;
}
/** One entry of a scene's back-to-front list: a relief primitive, or (version 2) an object. */
export type SceneEntry = ScenePrimitive | SceneObject;
export const isSceneObject = (entry: SceneEntry): entry is SceneObject => "object" in entry;

/** One layer at one moment. Every value is already resolved for the depth and theme. */
export interface StrataScene {
  format: "strata-scene";
  version: 1 | 2;
  /** Version 2: the camera objects are seen through, its distance and its vanishing point in layer-local px. */
  camera?: { distance: number; vanish: [number, number] };
  /** Version 2: the environment that objects reflect. `studio` is defined in code, with no asset. */
  environment?: { source: "studio"; strength: number };
  extent: { width: number; height: number };
  /** Room drawn outside the extent, for shadows only. */
  outset?: { top: number; right: number; bottom: number; left: number };
  /** The colour under the layer (`#rrggbb`); conformance renders over it. */
  backdrop: string;
  light: { azimuth: number; elevation: number };
  bevel: { width: number; gain: number; profile: BevelProfile };
  shadow: { strength: number };
  interior: { max: number };
  state: { hoverHeight: number; pressHeight: number; hoverLift: number; pressSink: number };
  focus: { colour: string; width: number; offset: number };
  materials: Record<string, SceneMaterial>;
  /** Back to front: a later primitive sits on an earlier one. Version 2 may mix objects in. */
  primitives: SceneEntry[];
}

/** A version 1 scene: relief primitives only, with no camera or environment. */
export type StrataReliefScene = Omit<StrataScene, "version" | "camera" | "environment" | "primitives"> & { version: 1; primitives: ScenePrimitive[] };

/** One problem with a scene, at a JSON path such as `primitives[2].rect`. */
export interface SceneIssue {
  path: string;
  message: string;
}

/** The most primitives one layer may carry (P0.3 budget). */
export const scenePrimitiveBudget = 256;

const hex = /^#[0-9a-f]{6}$/i;

/** Checks a scene against versions 1 and 2 of the format. Returns every problem found; an empty list means valid. */
export function validateScene(scene: unknown): SceneIssue[] {
  const issues: SceneIssue[] = [];
  const report = (path: string, message: string) => issues.push({ path, message });
  const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
  const number = (value: unknown, path: string, min = -Infinity, max = Infinity) => {
    if (typeof value !== "number" || !Number.isFinite(value)) return report(path, "must be a finite number");
    if (value < min || value > max) report(path, `must be within ${min} to ${max}`);
  };
  const colour = (value: unknown, path: string) => { if (typeof value !== "string" || !hex.test(value)) report(path, "must be a #rrggbb colour"); };
  const group = (value: unknown, path: string, fields: Record<string, (value: unknown, path: string) => void>, optional: string[] = []) => {
    if (!isObject(value)) return report(path, "must be an object");
    known(value, Object.keys(fields), path);
    for (const [key, check] of Object.entries(fields)) {
      if (value[key] === undefined) { if (!optional.includes(key)) report(`${path}.${key}`, "is required"); }
      else check(value[key], `${path}.${key}`);
    }
  };
  const range = (min: number, max = Infinity) => (value: unknown, path: string) => number(value, path, min, max);

  const known = (value: Record<string, unknown>, keys: string[], path: string) => {
    for (const key of Object.keys(value)) if (!keys.includes(key)) report(path ? `${path}.${key}` : key, "is not part of the format");
  };

  if (!isObject(scene)) return [{ path: "", message: "must be an object" }];
  const materials = scene.materials;
  known(scene, ["$schema", "format", "version", "camera", "environment", "extent", "outset", "backdrop", "light", "bevel", "shadow", "interior", "state", "focus", "materials", "primitives"], "");
  if (scene.format !== "strata-scene") report("format", 'must be "strata-scene"');
  if (scene.version !== 1 && scene.version !== 2) report("version", "must be 1 or 2");
  const objects = scene.version === 2;
  if (!objects) for (const key of ["camera", "environment"]) if (scene[key] !== undefined) report(key, "is only in version 2");
  if (objects) {
    group(scene.camera, "camera", { distance: range(100), vanish: (value, path) => {
      if (!Array.isArray(value) || value.length !== 2) report(path, "must be [x, y]");
      else value.forEach((part, index) => number(part, `${path}[${index}]`));
    } });
    if (scene.environment !== undefined) group(scene.environment, "environment", { source: (value, path) => { if (value !== "studio") report(path, 'must be "studio"'); }, strength: range(0, 1) });
  }
  group(scene.extent, "extent", { width: range(0), height: range(0) });
  if (scene.outset !== undefined) group(scene.outset, "outset", { top: range(0), right: range(0), bottom: range(0), left: range(0) });
  colour(scene.backdrop, "backdrop");
  group(scene.light, "light", { azimuth: range(0, 360), elevation: range(1, 90) });
  group(scene.bevel, "bevel", { width: range(0), gain: range(0), profile: (value, path) => { if (!bevelProfiles.includes(value as BevelProfile)) report(path, `must be one of ${bevelProfiles.join(", ")}`); } });
  group(scene.shadow, "shadow", { strength: range(0, 1) });
  group(scene.interior, "interior", { max: range(0, 0.1) });
  group(scene.state, "state", { hoverHeight: range(0), pressHeight: range(0), hoverLift: range(0, 0.1), pressSink: range(0, 0.1) });
  group(scene.focus, "focus", { colour, width: range(0), offset: range(0) });
  const unit = range(0, 1);
  if (!isObject(scene.materials)) report("materials", "must be an object");
  else {
    for (const [name, material] of Object.entries(scene.materials)) {
      const at = `materials.${name}`;
      if (!isObject(material)) { report(at, "must be an object"); continue; }
      const layers: Record<string, Record<string, (value: unknown, path: string) => void>> = {
        base: { roughness: unit, metallic: unit },
        coat: { strength: unit, roughness: unit, ior: range(1, 3) },
        emissive: { strength: range(0, 4) },
        sheen: { strength: unit, roughness: unit },
        iridescence: { strength: unit, thickness: range(0) },
        transmission: { strength: unit, ior: range(1, 3), frost: unit },
      };
      for (const key of Object.keys(material)) if (!(key in layers)) report(`${at}.${key}`, "is not a material layer");
      for (const [layer, fields] of Object.entries(layers)) if (material[layer] !== undefined) group(material[layer], `${at}.${layer}`, fields, Object.keys(fields));
    }
  }
  function states(value: unknown, at: string) {
    if (value === undefined) return;
    if (!isObject(value)) return report(`${at}.state`, "must be an object");
    for (const [key, flag] of Object.entries(value)) {
      if (!["hover", "pressed", "focus", "disabled"].includes(key)) report(`${at}.state.${key}`, "is not a state");
      else if (typeof flag !== "boolean") report(`${at}.state.${key}`, "must be a boolean");
    }
  }
  const box = (value: unknown, path: string) => {
    if (!Array.isArray(value) || value.length !== 4) report(path, "must be [x, y, width, height]");
    else value.forEach((part, index) => number(part, `${path}[${index}]`, index < 2 ? -Infinity : 0));
  };
  function validateObject(object: Record<string, unknown>, at: string) {
    known(object, ["object", "rect", "radius", "height", "base", "taper", "width", "travel", "material", "colour", "finish", "bounds", "state"], at);
    const kind = object.object as SceneObjectKind;
    if (!sceneObjects.includes(kind)) report(`${at}.object`, `must be one of ${sceneObjects.join(", ")}`);
    const dome = kind === "knob" || kind === "puck";
    box(object.rect, `${at}.rect`);
    if (object.bounds !== undefined) box(object.bounds, `${at}.bounds`);
    for (const key of ["radius", "taper", "width", "travel"]) if (object[key] !== undefined) number(object[key], `${at}.${key}`, 0);
    number(object.height, `${at}.height`, 0);
    if (object.base !== undefined) number(object.base, `${at}.base`);
    if (typeof object.material !== "string" || !isObject(materials) || !(object.material in materials)) report(`${at}.material`, "must name one of the scene's materials");
    if (dome) colour(object.colour, `${at}.colour`);
    else if (object.colour !== undefined) report(`${at}.colour`, "is only for domes");
    if (kind === "bezel" && object.width === undefined) report(`${at}.width`, "is required for a bezel");
    if (kind !== "bezel" && object.width !== undefined) report(`${at}.width`, "is only for a bezel");
    if (dome && object.taper !== undefined) report(`${at}.taper`, "is only for solids");
    if (object.travel !== undefined && kind !== "key" && kind !== "mark") report(`${at}.travel`, "is only for keys and marks");
    if (object.finish !== undefined && typeof object.finish !== "boolean") report(`${at}.finish`, "must be a boolean");
    states(object.state, at);
  }
  if (!Array.isArray(scene.primitives)) report("primitives", "must be an array");
  else {
    if (scene.primitives.length > scenePrimitiveBudget) report("primitives", `holds more than ${scenePrimitiveBudget} primitives`);
    scene.primitives.forEach((primitive: unknown, index) => {
      const at = `primitives[${index}]`;
      if (!isObject(primitive)) return report(at, "must be an object");
      if ("object" in primitive) {
        if (!objects) return report(`${at}.object`, "objects are only in version 2");
        return validateObject(primitive, at);
      }
      known(primitive, ["face", "rect", "radius", "height", "material", "finish", "state", "ring"], at);
      if (!sceneFaces.includes(primitive.face as SceneFace)) report(`${at}.face`, `must be one of ${sceneFaces.join(", ")}`);
      const rect = primitive.rect;
      if (!Array.isArray(rect) || rect.length !== 4) report(`${at}.rect`, "must be [x, y, width, height]");
      else rect.forEach((value, part) => number(value, `${at}.rect[${part}]`, part < 2 ? -Infinity : 0));
      if (primitive.radius !== undefined) number(primitive.radius, `${at}.radius`, 0);
      number(primitive.height, `${at}.height`, 0);
      if (typeof primitive.material !== "string" || !isObject(scene.materials) || !(primitive.material in scene.materials)) report(`${at}.material`, "must name one of the scene's materials");
      if (primitive.finish !== undefined && typeof primitive.finish !== "boolean") report(`${at}.finish`, "must be a boolean");
      states(primitive.state, at);
      if (primitive.face === "ring") group(primitive.ring, `${at}.ring`, { thickness: range(0), start: range(-360, 360), sweep: range(0, 360), colour });
      else if (primitive.ring !== undefined) report(`${at}.ring`, "is only for the ring face");
    });
  }
  return issues;
}

/** The scene settings that come from the tokens, resolved for a depth and theme (everything but extent and primitives). */
export type SceneSettings = Omit<StrataScene, "format" | "version" | "extent" | "outset" | "primitives">;

/**
 * Resolves a scene's settings from a token source: light, bevel, shadow, interior budget, state multipliers, the
 * focus edge, the backdrop (`colour.stage`) and every material preset as numeric layers.
 */
export function sceneSettings(source: TokenGroup, options: ResolveOptions = {}): SceneSettings {
  const tokens = flatten(source);
  const values = new Map(tokens.map(token => [token.path, valueOf(token, options)]));
  const at = (path: string, fallback = 0) => (values.has(path) ? numeric(values.get(path)!) : fallback);
  const text = (path: string) => String(values.get(path) ?? "");
  const colour = (role: string) => {
    const value = text(`colour.${role}`);
    return value.startsWith("{") ? text(value.slice(1, -1)) : value;
  };
  const materials: Record<string, SceneMaterial> = {};
  const presets = new Set(tokens.filter(token => token.path.startsWith("material.presets.")).map(token => token.path.split(".")[2]!));
  for (const preset of presets) {
    const base = `material.presets.${preset}`, has = (layer: string) => tokens.some(token => token.path.startsWith(`${base}.${layer}.`));
    const material: SceneMaterial = {};
    if (has("base")) material.base = { roughness: at(`${base}.base.roughness`, 1), metallic: at(`${base}.base.metallic`) };
    if (has("coat")) material.coat = { strength: at(`${base}.coat.strength`), roughness: at(`${base}.coat.roughness`), ior: at(`${base}.coat.ior`, 1.5) };
    if (has("emissive")) material.emissive = { strength: at(`${base}.emissive.strength`) };
    if (has("transmission")) material.transmission = { strength: at(`${base}.transmission.strength`), ior: at(`${base}.transmission.ior`, 1.5), frost: at(`${base}.transmission.frost`) };
    materials[preset] = material;
  }
  return {
    backdrop: colour("stage"),
    light: { azimuth: at("light.azimuth"), elevation: at("light.elevation") },
    bevel: { width: at("bevel.width"), gain: at("bevel.gain"), profile: text("bevel.profile") as BevelProfile },
    shadow: { strength: at("shadow.strength") },
    interior: { max: at("interior.max") },
    state: { hoverHeight: at("state.hoverHeight", 1), pressHeight: at("state.pressHeight", 1), hoverLift: at("state.hoverLift"), pressSink: at("state.pressSink") },
    focus: { colour: colour("accent"), width: at("focus.width"), offset: at("focus.offset") },
    materials,
  };
}
