/**
 * The built-in `relief` material: core's implementation of the Strata Rendering Model, version 1
 * (`docs/ui-library/rendering-model.md`). It takes the model's scene format as data, packs it into a second uniform
 * binding of the layer pass (`reliefUniforms`) and shades it in WGSL (`reliefWGSL`), mirroring the reference
 * implementation in `@underglass/ui/tokens` section by section. Core never depends on Strata: the scene format is
 * the contract, and the conformance suite judges this file.
 *
 * Per-primitive values that do not depend on the pixel (section 2.3: band width, cast height, slope, profile) are
 * derived here on the CPU, so the shader only evaluates what changes per point.
 */

/** Relief primitives one layer may carry (P0.3 budget). */
export const RELIEF_PRIMITIVES = 256;
/**
 * The largest shadow outset per side, in CSS px. It covers the tallest elevation in the design language (a modal at
 * 100% depth casts about 70 px) and bounds the extra pixels a layer may shade.
 */
export const RELIEF_OUTSET = 128;
/** Distinct materials one relief scene may name. */
export const RELIEF_MATERIALS = 16;
const HEADER_VEC4S = 5;
const MATERIAL_VEC4S = 2;
const PRIMITIVE_VEC4S = 6;
/** vec4s in the relief uniform binding: header, material table, primitives. */
export const RELIEF_VEC4S = HEADER_VEC4S + RELIEF_MATERIALS * MATERIAL_VEC4S + RELIEF_PRIMITIVES * PRIMITIVE_VEC4S;

const faces = ["raised", "well", "groove", "knob", "mark", "ring", "flat"] as const;
const profiles = ["quarter-round", "chamfer", "cove"] as const;

/** A material as numeric layers (rendering model, part 1). Colours come from the captured content. */
export interface ReliefMaterial {
  base?: { roughness?: number; metallic?: number };
  coat?: { strength?: number; roughness?: number; ior?: number };
  emissive?: { strength?: number };
  sheen?: { strength?: number; roughness?: number };
  iridescence?: { strength?: number; thickness?: number };
  transmission?: { strength?: number; ior?: number; frost?: number };
}
/** One relief primitive in layer-local CSS px (rendering model, part 1). */
export interface ReliefPrimitive {
  face: (typeof faces)[number];
  rect: [number, number, number, number];
  radius?: number;
  height: number;
  material: string;
  finish?: boolean;
  state?: { hover?: boolean; pressed?: boolean; focus?: boolean; disabled?: boolean };
  ring?: { thickness: number; start: number; sweep: number; colour: string };
}
/**
 * A Strata scene, version 1: the input of the `relief` material. Core draws it over the layer's own box grown by
 * `outset` (shadows only; hits stay on the box); `extent` and `backdrop` are informational here (the layer pass
 * composites over what is beneath it).
 */
export interface ReliefScene {
  format: "strata-scene";
  version: 1;
  extent: { width: number; height: number };
  outset?: { top: number; right: number; bottom: number; left: number };
  backdrop: string;
  light: { azimuth: number; elevation: number };
  bevel: { width: number; gain: number; profile: (typeof profiles)[number] };
  shadow: { strength: number };
  interior: { max: number };
  state: { hoverHeight: number; pressHeight: number; hoverLift: number; pressSink: number };
  focus: { colour: string; width: number; offset: number };
  materials: Record<string, ReliefMaterial>;
  primitives: ReliefPrimitive[];
}

const finite = (value: unknown, path: string, min = -Infinity, max = Infinity): number => {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) throw new Error(`Relief scene ${path} requires a number in ${min}..${max}`);
  return value;
};
const colour = (value: unknown, path: string): string => {
  if (typeof value !== "string" || !/^#[0-9a-f]{6}$/i.test(value)) throw new Error(`Relief scene ${path} requires a #rrggbb colour`);
  return value;
};
const object = (value: unknown, path: string): Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`Relief scene ${path} requires an object`);
  return value as Record<string, unknown>;
};
const optional = (value: unknown, path: string, min: number, max: number, fallback: number) => (value === undefined ? fallback : finite(value, path, min, max));

/**
 * Validates a scene for the `relief` material and returns a deep, normalized copy (defaults filled in). Throws on
 * the first problem, naming its path, so an invalid scene changes nothing. Checks what core relies on; the full
 * format is `@underglass/ui/scene.schema.json`.
 */
export function validateReliefScene(input: ReliefScene): ReliefScene {
  const scene = object(input, "");
  if (scene.format !== "strata-scene" || scene.version !== 1) throw new Error("Relief material requires a version 1 strata-scene");
  const extent = object(scene.extent, "extent"), light = object(scene.light, "light"), bevel = object(scene.bevel, "bevel");
  const state = object(scene.state, "state"), focus = object(scene.focus, "focus");
  if (!profiles.includes(bevel.profile as (typeof profiles)[number])) throw new Error(`Relief scene bevel.profile requires one of ${profiles.join(", ")}`);
  const materials = object(scene.materials, "materials");
  const names = Object.keys(materials);
  if (names.length > RELIEF_MATERIALS) throw new Error(`Relief scene holds more than ${RELIEF_MATERIALS} materials`);
  if (!Array.isArray(scene.primitives) || scene.primitives.length > RELIEF_PRIMITIVES) throw new Error(`Relief scene primitives requires an array of at most ${RELIEF_PRIMITIVES}`);
  const outset = scene.outset === undefined ? undefined : object(scene.outset, "outset");
  return {
    format: "strata-scene", version: 1,
    extent: { width: finite(extent.width, "extent.width", 0), height: finite(extent.height, "extent.height", 0) },
    ...(outset ? { outset: { top: finite(outset.top, "outset.top", 0, RELIEF_OUTSET), right: finite(outset.right, "outset.right", 0, RELIEF_OUTSET),
      bottom: finite(outset.bottom, "outset.bottom", 0, RELIEF_OUTSET), left: finite(outset.left, "outset.left", 0, RELIEF_OUTSET) } } : {}),
    backdrop: colour(scene.backdrop, "backdrop"),
    light: { azimuth: finite(light.azimuth, "light.azimuth", 0, 360), elevation: finite(light.elevation, "light.elevation", 1, 90) },
    bevel: { width: finite(bevel.width, "bevel.width", 0), gain: finite(bevel.gain, "bevel.gain", 0), profile: bevel.profile as (typeof profiles)[number] },
    shadow: { strength: finite(object(scene.shadow, "shadow").strength, "shadow.strength", 0, 1) },
    interior: { max: finite(object(scene.interior, "interior").max, "interior.max", 0, 0.1) },
    state: { hoverHeight: finite(state.hoverHeight, "state.hoverHeight", 0), pressHeight: finite(state.pressHeight, "state.pressHeight", 0),
      hoverLift: finite(state.hoverLift, "state.hoverLift", 0, 0.1), pressSink: finite(state.pressSink, "state.pressSink", 0, 0.1) },
    focus: { colour: colour(focus.colour, "focus.colour"), width: finite(focus.width, "focus.width", 0), offset: finite(focus.offset, "focus.offset", 0) },
    materials: Object.fromEntries(names.map(name => {
      const material = object(materials[name], `materials.${name}`);
      const layer = (key: string) => (material[key] === undefined ? undefined : object(material[key], `materials.${name}.${key}`));
      const base = layer("base"), coat = layer("coat"), emissive = layer("emissive");
      return [name, {
        base: { roughness: optional(base?.roughness, `materials.${name}.base.roughness`, 0, 1, 1), metallic: optional(base?.metallic, `materials.${name}.base.metallic`, 0, 1, 0) },
        coat: { strength: optional(coat?.strength, `materials.${name}.coat.strength`, 0, 1, 0), roughness: optional(coat?.roughness, `materials.${name}.coat.roughness`, 0, 1, 0), ior: optional(coat?.ior, `materials.${name}.coat.ior`, 1, 3, 1.5) },
        emissive: { strength: optional(emissive?.strength, `materials.${name}.emissive.strength`, 0, 4, 0) },
      } satisfies ReliefMaterial];
    })),
    primitives: (scene.primitives as unknown[]).map((value, index) => {
      const at = `primitives[${index}]`, primitive = object(value, at);
      if (!faces.includes(primitive.face as (typeof faces)[number])) throw new Error(`Relief scene ${at}.face requires one of ${faces.join(", ")}`);
      if (!Array.isArray(primitive.rect) || primitive.rect.length !== 4) throw new Error(`Relief scene ${at}.rect requires [x, y, width, height]`);
      if (typeof primitive.material !== "string" || !names.includes(primitive.material)) throw new Error(`Relief scene ${at}.material requires one of the scene's materials`);
      const flags = primitive.state === undefined ? {} : object(primitive.state, `${at}.state`);
      const flag = (key: string) => { const v = flags[key]; if (v !== undefined && typeof v !== "boolean") throw new Error(`Relief scene ${at}.state.${key} requires a boolean`); return v === true; };
      const ring = primitive.face === "ring" ? object(primitive.ring, `${at}.ring`) : undefined;
      if (primitive.face !== "ring" && primitive.ring !== undefined) throw new Error(`Relief scene ${at}.ring is only for the ring face`);
      return {
        face: primitive.face as (typeof faces)[number],
        rect: primitive.rect.map((part, i) => finite(part, `${at}.rect[${i}]`, i < 2 ? -1e6 : 0, 1e6)) as [number, number, number, number],
        radius: optional(primitive.radius, `${at}.radius`, 0, 1e6, 0),
        height: finite(primitive.height, `${at}.height`, 0),
        material: primitive.material,
        finish: primitive.finish === undefined ? false : primitive.finish === true,
        state: { hover: flag("hover"), pressed: flag("pressed"), focus: flag("focus"), disabled: flag("disabled") },
        ...(ring ? { ring: { thickness: finite(ring.thickness, `${at}.ring.thickness`, 0), start: finite(ring.start, `${at}.ring.start`, -360, 360),
          sweep: finite(ring.sweep, `${at}.ring.sweep`, 0, 360), colour: colour(ring.colour, `${at}.ring.colour`) } } : {}),
      };
    }),
  };
}

const rgb = (hex: string) => [1, 3, 5].map(index => Number.parseInt(hex.slice(index, index + 2), 16) / 255);
const packed = new WeakMap<ReliefScene, Float32Array>();
/**
 * Packs a validated scene into the relief binding: a header (light vector, bevel, shadow, interior budget, state
 * multipliers, focus edge, counts), the material table, and each primitive with its derived values. Cached per
 * scene object, so an unchanged scene is packed once.
 */
export function reliefUniforms(scene: ReliefScene): Float32Array {
  const cached = packed.get(scene);
  if (cached) return cached;
  const values = new Float32Array(RELIEF_VEC4S * 4);
  const a = (scene.light.azimuth * Math.PI) / 180, e = (scene.light.elevation * Math.PI) / 180;
  const names = Object.keys(scene.materials);
  values.set([Math.sin(a) * Math.cos(e), -Math.cos(a) * Math.cos(e), Math.sin(e), scene.bevel.width,
    scene.bevel.gain, profiles.indexOf(scene.bevel.profile), scene.shadow.strength, scene.interior.max,
    scene.state.hoverHeight, scene.state.pressHeight, scene.state.hoverLift, scene.state.pressSink,
    ...rgb(scene.focus.colour), scene.focus.width,
    scene.focus.offset, scene.primitives.length, names.length, 0], 0);
  names.forEach((name, index) => {
    const material = scene.materials[name]!;
    values.set([material.base?.roughness ?? 1, material.base?.metallic ?? 0, material.coat?.strength ?? 0, material.coat?.roughness ?? 0,
      (material.emissive?.strength ?? 0) > 0 ? 1 : 0, 0, 0, 0], (HEADER_VEC4S + index * MATERIAL_VEC4S) * 4);
  });
  scene.primitives.forEach((primitive, index) => {
    const [x, y, width, height] = primitive.rect;
    const state = primitive.state ?? {};
    const material = scene.materials[primitive.material] ?? {};
    const inradius = Math.min(width, height) / 2;
    const knob = primitive.face === "knob", ring = primitive.face === "ring";
    // 2.3: lit unless flat, disabled or emissive; the band; the cast height after the state multipliers.
    const lit = !state.disabled && (material.emissive?.strength ?? 0) <= 0 && primitive.face !== "flat";
    const band = !lit ? 0 : knob ? inradius : Math.min(scene.bevel.width, ring ? (primitive.ring?.thickness ?? 0) / 2 : inradius);
    const lifted = primitive.face === "raised" || knob || primitive.face === "mark";
    const cast = lifted && !state.disabled ? primitive.height * (1 + (scene.state.hoverHeight - 1) * (state.hover ? 1 : 0)) * (1 - (1 - scene.state.pressHeight) * (state.pressed ? 1 : 0)) : 0;
    const sunk = primitive.face === "well" || primitive.face === "groove" || ring;
    values.set([
      x, y, width, height,
      knob ? inradius : Math.min(Math.max(primitive.radius ?? 0, 0), inradius), band, cast, faces.indexOf(primitive.face),
      state.hover ? 1 : 0, state.pressed ? 1 : 0, state.focus && !state.disabled ? 1 : 0, state.disabled ? 1 : 0,
      primitive.finish && lit ? 1 : 0, primitive.ring?.thickness ?? 0, primitive.ring?.start ?? 0, primitive.ring?.sweep ?? 0,
      ...(primitive.ring ? rgb(primitive.ring.colour) : [0, 0, 0]), names.indexOf(primitive.material),
      knob ? 0 : profiles.indexOf(scene.bevel.profile), sunk ? -1 : 1, knob ? 1 : 0, ring && primitive.ring && !state.disabled ? 1 : 0,
    ], (HEADER_VEC4S + RELIEF_MATERIALS * MATERIAL_VEC4S + index * PRIMITIVE_VEC4S) * 4);
  });
  packed.set(scene, values);
  return values;
}

const primitiveBase = HEADER_VEC4S + RELIEF_MATERIALS * MATERIAL_VEC4S;
/**
 * WGSL for the relief binding (`@binding(3)`) and `reliefShade(p, captured)`, which returns the shaded colour as
 * straight RGB with alpha, ready for the layer pass to blend over what is beneath (rendering model 2.11). Section
 * numbers refer to the rendering model.
 */
export const reliefWGSL = /* wgsl */ `
@group(0) @binding(3) var<uniform> relief: array<vec4f, ${RELIEF_VEC4S}>;
fn reliefBox(p: vec2f, centre: vec2f, half: vec2f, radius: f32) -> f32 {
  let q = abs(p - centre) - half + vec2f(radius);
  return length(max(q, vec2f(0.0))) + min(max(q.x, q.y), 0.0) - radius;
}
// 2.2: signed distance to primitive i.
fn reliefDistance(p: vec2f, i: u32) -> f32 {
  let base = ${primitiveBase}u + i * ${PRIMITIVE_VEC4S}u;
  let rect = relief[base];
  let shape = relief[base + 1u];
  let half = rect.zw * 0.5;
  let centre = rect.xy + half;
  if (shape.w == 5.0) {
    let thickness = relief[base + 3u].y;
    return abs(length(p - centre) - (min(half.x, half.y) - thickness * 0.5)) - thickness * 0.5;
  }
  return reliefBox(p, centre, half, shape.x);
}
// The finish-zone profile (design language section 4): (brighten, darken) at \`along\`.
fn reliefFinish(along: f32, material: vec4f) -> vec2f {
  let rise = 0.008 + (0.05 - 0.008) * material.w;
  let band = material.z * 0.6 * smoothstep(0.03, 0.03 + rise, along) * (1.0 - smoothstep(0.15, 0.26, along));
  let horizon = material.z * 0.16 * smoothstep(0.24, 0.27, along) * (1.0 - smoothstep(0.28, 0.32, along));
  let sheen = max(0.0, 0.5 - material.x) * 0.8 * (1.0 - smoothstep(0.0, 0.27, along));
  let metalTop = material.y * 0.4 * (1.0 - smoothstep(0.05, 0.28, along));
  let metalBottom = material.y * 0.36 * smoothstep(0.72, 0.97, along);
  return vec2f(max(band, max(sheen, metalTop)), max(metalBottom, horizon));
}
fn reliefShade(p: vec2f, captured: vec4f) -> vec4f {
  let light = relief[0].xyz;
  let bevelGain = relief[1].x;
  let m = relief[1].w;
  let states = relief[2];
  let focusColour = relief[3].xyz;
  let focusWidth = relief[3].w;
  let focusOffset = relief[4].x;
  let count = u32(relief[4].y);
  let halfway = normalize(light + vec3f(0.0, 0.0, 1.0));
  var shade = 0.0;
  var offsets = 0.0;
  var shadow = 0.0;
  var band = 0.0;
  var dark = 0.0;
  var edge = 0.0;
  var arcColour = vec3f(0.0);
  var arcAlpha = 0.0;
  var inside = false;
  var clearance = 1e9;
  for (var i = 0u; i < count; i++) {
    let base = ${primitiveBase}u + i * ${PRIMITIVE_VEC4S}u;
    let rect = relief[base];
    let shape = relief[base + 1u];
    let flags = relief[base + 2u];
    let ring = relief[base + 3u];
    let extra = relief[base + 4u];
    let kind = relief[base + 5u];
    let bandWidth = shape.y;
    let lift = shape.z;
    // A primitive farther than every term's reach contributes nothing, so it is skipped. The box distance is a
    // lower bound of the shape's distance, so the skip is exact: no coverage (0.5 px), no effect on the guard's
    // clearance beyond its 2 px ramp, no shadow (offset plus softness) and no focus edge.
    var reach = bandWidth + 2.0;
    if (lift > 0.0) { reach = max(reach, length(light.xy) / light.z * lift + 1.5 * lift + 1.0); }
    if (flags.z > 0.5) { reach = max(reach, focusOffset + focusWidth + 0.5); }
    if (length(max(abs(p - rect.xy - rect.zw * 0.5) - rect.zw * 0.5, vec2f(0.0))) > reach) { continue; }
    let d = reliefDistance(p, i);
    if (d < 0.0) { inside = true; }
    clearance = min(clearance, abs(d) - bandWidth);
    // 2.4 Occlusion: this primitive hides the relief of those beneath it.
    let cover = 1.0 - smoothstep(-0.5, 0.5, d);
    shade *= 1.0 - cover; offsets *= 1.0 - cover; band *= 1.0 - cover; dark *= 1.0 - cover;
    arcColour *= 1.0 - cover; arcAlpha *= 1.0 - cover;
    let material = relief[${HEADER_VEC4S}u + u32(extra.w) * ${MATERIAL_VEC4S}u];
    if (bandWidth > 0.0) {
      let s = clamp(-d / bandWidth, 0.0, 1.0);
      if (s < 1.0 || kind.z > 0.5) {
        // 2.4 Normal from the profile; 2.5 bevel light.
        let e = 0.5;
        var g = vec2f(reliefDistance(p + vec2f(e, 0.0), i) - reliefDistance(p - vec2f(e, 0.0), i),
          reliefDistance(p + vec2f(0.0, e), i) - reliefDistance(p - vec2f(0.0, e), i));
        g = select(vec2f(0.0), g / length(g), length(g) > 1e-9);
        var theta = 1.2 * (1.0 - s);
        if (kind.x == 1.0) { theta = 0.6; }
        if (kind.x == 2.0) { theta = 1.2 * s; }
        let n = vec3f(g * kind.y * sin(theta), cos(theta));
        let facing = max(dot(n, halfway), 0.0);
        let lambert = dot(n, light) - light.z;
        let specular = pow(facing, mix(160.0, 6.0, material.x)) * (1.0 - material.x) * mix(0.35, 1.0, material.y);
        let rim = 1.0 - clamp(n.z, 0.0, 1.0);
        let fresnel = 0.04 + 0.96 * rim * rim * rim * rim * rim;
        let coat = material.z * (pow(facing, mix(90.0, 10.0, material.w)) * 0.9 + fresnel * 0.6);
        shade += (lambert * bevelGain * (1.0 + material.y) + specular * 1.2 + coat) * cover;
      } else {
        // 2.6 Interior offset and finish zones.
        offsets += states.z * flags.x - states.w * flags.y + material.z * 0.02 + (1.0 - material.x) * 0.01;
        if (ring.x > 0.5) {
          let zones = reliefFinish(clamp((p.y - rect.y) / max(rect.w, 1.0), 0.0, 1.0), material);
          band = max(band, zones.x);
          dark = max(dark, zones.y);
        }
      }
    }
    // 2.7 Ring arc, accumulated as an overlay.
    if (kind.w > 0.5) {
      var arc = 1.0;
      if (ring.w < 360.0) {
        let centre = rect.xy + rect.zw * 0.5;
        let radius = min(rect.z, rect.w) * 0.5 - ring.y * 0.5;
        let angle = (degrees(atan2(p.x - centre.x, -(p.y - centre.y))) + 360.0) % 360.0;
        let along = ((angle - ring.z) % 360.0 + 360.0) % 360.0;
        let inArc = along <= ring.w;
        let distance = select(min(along - ring.w, 360.0 - along), -min(along, ring.w - along), inArc);
        arc = 1.0 - smoothstep(-0.5, 0.5, radians(distance) * radius);
      }
      let c = cover * arc;
      arcColour = arcColour * (1.0 - c) + extra.xyz * c;
      arcAlpha = arcAlpha + c * (1.0 - arcAlpha);
    }
    // 2.8 Cast shadow, outside the caster only.
    if (lift > 0.0) {
      let shifted = reliefDistance(p + light.xy / light.z * lift, i);
      shadow = max(shadow, relief[1].z * (1.0 - smoothstep(-0.5 * lift, 1.5 * lift + 1.0, shifted)) * smoothstep(-1.0, 0.5, d));
    }
    // 2.10 Focus edge.
    if (flags.z > 0.5) {
      edge = max(edge, smoothstep(focusOffset - 0.5, focusOffset + 0.5, d) * (1.0 - smoothstep(focusOffset + focusWidth - 0.5, focusOffset + focusWidth + 0.5, d)));
    }
  }
  // 2.9 Guard and 2.11 compositing.
  let interior = 1.0 + clamp(offsets, -m, m);
  let guard = select(0.0, smoothstep(0.0, 2.0, clearance), inside);
  let k = clamp(interior * (1.0 - shadow), 1.0 - m, 1.0 + m);
  var content = mix((captured.rgb * interior + vec3f(shade)) * (1.0 - shadow), captured.rgb * k, guard);
  content = content * (1.0 - arcAlpha) + arcColour;
  content = clamp(mix(mix(content, vec3f(1.0), band), vec3f(0.0), dark), vec3f(0.0), vec3f(1.0));
  var premultiplied = content * captured.a;
  var alpha = captured.a + shadow * (1.0 - captured.a);
  premultiplied = premultiplied * (1.0 - edge) + focusColour * edge;
  alpha = alpha * (1.0 - edge) + edge;
  return vec4f(select(vec3f(0.0), premultiplied / alpha, alpha > 1e-5), alpha);
}
`;
