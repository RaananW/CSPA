/**
 * The reference implementation of the Strata rendering model (`docs/ui-library/rendering-model.md`, part 3): a pure
 * function from a scene, the captured content and a point to a colour. It is the oracle every backend is judged
 * against, written to be read next to the standard, not to be fast. It uses no GPU and no DOM.
 *
 * All arithmetic is on sRGB-encoded channels in 0–1, as in CSS compositing, so the token validator's lit-contrast
 * checks hold exactly for what this function produces. Version 2 scenes may also carry objects (part 2B), whose
 * geometry lives in `objects.ts`; a version 1 scene shades exactly as before.
 */
import { parseHex } from "./contrast.ts";
import { finish } from "./finish.ts";
import { domeHit, environmentTerm, objectDistance, objectDrawable, reliefEquivalent, resolveObject, sideNormal, type ResolvedObject } from "./objects.ts";
import { isSceneObject, type BevelProfile, type SceneEntry, type SceneFace, type SceneMaterial, type ScenePrimitive, type StrataScene } from "./scene.ts";

/** A straight (not premultiplied) colour with alpha, channels 0–1. */
export type Rgba = readonly [number, number, number, number];
/** An opaque colour, channels 0–1. */
export type Rgb01 = readonly [number, number, number];

/** The captured content at a layer-local point, straight alpha. Points outside the extent are never asked for. */
export type CapturedColour = (x: number, y: number) => Rgba;

/** The steepest bevel slope, in radians, at a quarter-round's outer edge (section 2 of the standard). */
export const bevelSlopeMax = 1.2;
/** Width of the ramp, in px, over which the contrast guard takes hold (section 2.9). */
export const guardRamp = 2;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const smoothstep = (edge0: number, edge1: number, x: number) => { const t = clamp((x - edge0) / (edge1 - edge0), 0, 1); return t * t * (3 - 2 * t); };
const rgb = (hex: string): Rgb01 => parseHex(hex).map(channel => channel / 255) as unknown as Rgb01;
const lifted = (face: SceneFace) => face === "raised" || face === "knob" || face === "mark";
const sunk = (face: SceneFace) => face === "well" || face === "groove" || face === "ring";

/** The direction towards the light, in panel axes (x right, y down, z towards the viewer). */
export function lightVector(azimuth: number, elevation: number): [number, number, number] {
  const a = (azimuth * Math.PI) / 180, e = (elevation * Math.PI) / 180;
  return [Math.sin(a) * Math.cos(e), -Math.cos(a) * Math.cos(e), Math.sin(e)];
}

/** Signed distance from `(x, y)` to a rounded box centred on the origin: negative inside. */
export function roundedBoxDistance(x: number, y: number, halfWidth: number, halfHeight: number, radius: number): number {
  const qx = Math.abs(x) - halfWidth + radius, qy = Math.abs(y) - halfHeight + radius;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - radius;
}

/** Material values with their defaults (part 1). */
interface MaterialValues {
  roughness: number;
  metallic: number;
  coat: number;
  coatRoughness: number;
  emissive: boolean;
}
function materialValues(scene: StrataScene, name: string): MaterialValues {
  const material: SceneMaterial = scene.materials[name] ?? {};
  return { roughness: material.base?.roughness ?? 1, metallic: material.base?.metallic ?? 0, coat: material.coat?.strength ?? 0,
    coatRoughness: material.coat?.roughness ?? 0, emissive: (material.emissive?.strength ?? 0) > 0 };
}

/** A primitive with its derived quantities (section 2.3 of the standard). */
interface Resolved extends MaterialValues {
  face: SceneFace;
  cx: number;
  cy: number;
  halfWidth: number;
  halfHeight: number;
  radius: number;
  /** The bevel band width; 0 for primitives with no bevel. */
  band: number;
  /** +1 for raised faces, −1 for sunk ones. */
  slope: number;
  /** Height after the state multipliers, for casters; 0 otherwise. */
  height: number;
  profile: BevelProfile;
  lit: boolean;
  primitive: ScenePrimitive;
}

/** The state multiplier on a caster's height (section 2.3). */
function stateHeight(scene: StrataScene, state: ScenePrimitive["state"] = {}): number {
  return (1 + (scene.state.hoverHeight - 1) * (state.hover ? 1 : 0)) * (1 - (1 - scene.state.pressHeight) * (state.pressed ? 1 : 0));
}

function resolvePrimitive(scene: StrataScene, primitive: ScenePrimitive): Resolved {
  const [x, y, width, height] = primitive.rect;
  const state = primitive.state ?? {};
  const material = materialValues(scene, primitive.material);
  const halfWidth = width / 2, halfHeight = height / 2, inradius = Math.min(halfWidth, halfHeight);
  const radius = primitive.face === "knob" ? inradius : clamp(primitive.radius ?? 0, 0, inradius);
  const lit = !state.disabled && !material.emissive && primitive.face !== "flat";
  const ringHalf = primitive.face === "ring" ? (primitive.ring?.thickness ?? 0) / 2 : inradius;
  const band = !lit ? 0 : primitive.face === "knob" ? inradius : Math.min(scene.bevel.width, ringHalf);
  const caster = lifted(primitive.face) && !state.disabled;
  return {
    face: primitive.face, cx: x + halfWidth, cy: y + halfHeight, halfWidth, halfHeight, radius, band,
    slope: sunk(primitive.face) ? -1 : 1,
    height: caster ? primitive.height * stateHeight(scene, state) : 0,
    profile: primitive.face === "knob" ? "quarter-round" : scene.bevel.profile,
    lit, ...material, primitive,
  };
}

/** An object with its derived quantities (part 2B.2), drawn as an object. */
interface ResolvedEntryObject extends MaterialValues {
  shape: ResolvedObject;
  lit: boolean;
  /** The guard's band: the taper for a lit solid, the inradius for a dome, else 0. */
  band: number;
  /** Cast height after the state multipliers; 0 for a well or a disabled object. */
  height: number;
  /** A dome's own colour. */
  colour?: Rgb01;
}
/** One entry of the back-to-front list, resolved: a relief primitive, an object, or an object drawn as its Relief equivalent. */
type ResolvedEntry =
  | { type: "primitive"; resolved: Resolved; colour?: Rgb01 }
  | { type: "object"; resolved: ResolvedEntryObject };

function resolveEntry(scene: StrataScene, entry: SceneEntry): ResolvedEntry | undefined {
  if (!isSceneObject(entry)) return { type: "primitive", resolved: resolvePrimitive(scene, entry) };
  if (!objectDrawable(scene, entry)) {
    // 2B.6: drawn at the Relief level; a dome keeps its colour on its footprint.
    const primitive = reliefEquivalent(entry);
    return primitive && { type: "primitive", resolved: resolvePrimitive(scene, primitive), ...(entry.colour ? { colour: rgb(entry.colour) } : {}) };
  }
  const shape = resolveObject(entry);
  const state = entry.state ?? {};
  const material = materialValues(scene, entry.material);
  const lit = !state.disabled && !material.emissive;
  const rise = shape.z1 - shape.z0;
  const travels = entry.object === "key" || entry.object === "mark";
  return { type: "object", resolved: {
    shape, lit, ...material,
    band: !lit ? 0 : shape.dome ? Math.min(shape.halfWidth, shape.halfHeight) : shape.taper,
    // 2B.2: hover has already raised the cap, and a key's travel lowered it; other objects still shrink when pressed.
    height: rise > 0 && !state.disabled ? rise * (travels ? 1 : 1 - (1 - scene.state.pressHeight) * (state.pressed ? 1 : 0)) : 0,
    ...(shape.dome ? { colour: rgb(entry.colour ?? "#808080") } : {}),
  } };
}

/** Signed distance from a point to a primitive's shape (section 2.2). */
function distance(shape: Resolved, x: number, y: number): number {
  if (shape.face === "ring") {
    const outer = Math.min(shape.halfWidth, shape.halfHeight), half = (shape.primitive.ring?.thickness ?? 0) / 2;
    return Math.abs(Math.hypot(x - shape.cx, y - shape.cy) - (outer - half)) - half;
  }
  return roundedBoxDistance(x - shape.cx, y - shape.cy, shape.halfWidth, shape.halfHeight, shape.radius);
}

/** The unit outward direction of the distance field, by central differences of half a pixel (section 2.4). */
function outward(shape: Resolved, x: number, y: number): [number, number] {
  const e = 0.5;
  const gx = distance(shape, x + e, y) - distance(shape, x - e, y), gy = distance(shape, x, y + e) - distance(shape, x, y - e);
  const length = Math.hypot(gx, gy);
  return length < 1e-9 ? [0, 0] : [gx / length, gy / length];
}

/** The bevel's slope angle at `s` (0 at the outer edge, 1 where the band meets the interior), section 2.4. */
export function profileAngle(profile: BevelProfile, s: number): number {
  if (profile === "chamfer") return bevelSlopeMax / 2;
  if (profile === "cove") return bevelSlopeMax * s;
  return bevelSlopeMax * (1 - s);
}

/** Coverage of a ring's arc at a point: 1 inside the arc's sector, 0 outside, anti-aliased over 1 px (section 2.7). */
function arcCoverage(shape: Resolved, x: number, y: number): number {
  const ring = shape.primitive.ring;
  if (!ring) return 0;
  if (ring.sweep >= 360) return 1;
  const radius = Math.min(shape.halfWidth, shape.halfHeight) - ring.thickness / 2;
  const angle = ((Math.atan2(x - shape.cx, -(y - shape.cy)) * 180) / Math.PI + 360) % 360;
  const along = (((angle - ring.start) % 360) + 360) % 360;
  const degrees = along <= ring.sweep ? -Math.min(along, ring.sweep - along) : Math.min(along - ring.sweep, 360 - along);
  return 1 - smoothstep(-0.5, 0.5, (degrees * Math.PI / 180) * radius);
}

/** What the model computes at one point, before compositing; exposed for tests and tools. */
export interface ShadingTerms {
  /** Sum of the bevel light (section 2.5) and, for objects, their side and dome light and environment (2B.7). */
  shade: number;
  /** Interior factor K (section 2.6). */
  interior: number;
  /** Cast shadow S (section 2.8). */
  shadow: number;
  /** Contrast-guard weight w (section 2.9). */
  guard: number;
  /** Finish brightening and darkening (section 2.6). */
  band: number;
  dark: number;
  /** Focus edge coverage (section 2.10). */
  edge: number;
  /** Ring arcs as one overlay over the content (section 2.7): premultiplied colour and its alpha. */
  arc: { colour: Rgb01; alpha: number };
  /** Domes' own colour, over the captured content before light (2B.5): premultiplied colour and its alpha. */
  surface: { colour: Rgb01; alpha: number };
}

/** The bevel light of a normal (section 2.5), shared by relief bevels and object sides and domes. */
function bevelLight(scene: StrataScene, n: readonly [number, number, number], material: MaterialValues): number {
  const light = lightVector(scene.light.azimuth, scene.light.elevation);
  const halfway = (() => { const h = [light[0], light[1], light[2] + 1]; const length = Math.hypot(...h); return h.map(c => c / length) as [number, number, number]; })();
  const facing = Math.max(n[0] * halfway[0] + n[1] * halfway[1] + n[2] * halfway[2], 0);
  const lambert = n[0] * light[0] + n[1] * light[1] + n[2] * light[2] - light[2];
  const specular = facing ** mix(160, 6, material.roughness) * (1 - material.roughness) * mix(0.35, 1, material.metallic);
  const fresnel = 0.04 + 0.96 * (1 - clamp(n[2], 0, 1)) ** 5;
  const coat = material.coat * (facing ** mix(90, 10, material.coatRoughness) * 0.9 + fresnel * 0.6);
  return lambert * scene.bevel.gain * (1 + material.metallic) + specular * 1.2 + coat;
}

/** The model's terms at a layer-local point. */
export function shadingTerms(scene: StrataScene, x: number, y: number): ShadingTerms {
  const entries = scene.primitives.map(entry => resolveEntry(scene, entry)).filter(entry => entry !== undefined);
  const light = lightVector(scene.light.azimuth, scene.light.elevation);
  const m = scene.interior.max;
  const { offset, width } = scene.focus;
  let shade = 0, offsets = 0, shadow = 0, band = 0, dark = 0, edge = 0, inside = false, clearance = Infinity;
  let arcColour = [0, 0, 0], arcAlpha = 0, surfaceColour = [0, 0, 0], surfaceAlpha = 0;
  // 2.4 Occlusion: an entry hides the relief, interior offset, finish, arcs, dome colour and cast shadows of those
  // beneath it.
  const occlude = (cover: number) => {
    shade *= 1 - cover; shadow *= 1 - cover; offsets *= 1 - cover; band *= 1 - cover; dark *= 1 - cover;
    arcColour = arcColour.map(channel => channel * (1 - cover)); arcAlpha *= 1 - cover;
    surfaceColour = surfaceColour.map(channel => channel * (1 - cover)); surfaceAlpha *= 1 - cover;
  };
  // 2.6 Interior: a uniform brightness offset for state and gloss, and the finish zones on a face's top.
  const interior = (material: MaterialValues, state: ScenePrimitive["state"] = {}, finishes: boolean, top: number, height: number) => {
    offsets += scene.state.hoverLift * (state.hover ? 1 : 0) - scene.state.pressSink * (state.pressed ? 1 : 0) + material.coat * 0.02 + (1 - material.roughness) * 0.01;
    if (finishes) {
      const along = clamp((y - top) / Math.max(height, 1), 0, 1);
      const [bright, darken] = finish(along, { roughness: material.roughness, metallic: material.metallic, coat: material.coat, coatRoughness: material.coatRoughness });
      band = Math.max(band, bright);
      dark = Math.max(dark, darken);
    }
  };
  // 2.8 Cast shadow: the footprint moved away from the light by its height, softened over 2h + 1 px, outside it only.
  const cast = (height: number, d: number, shifted: number) => {
    shadow = Math.max(shadow, scene.shadow.strength * (1 - smoothstep(-0.5 * height, 1.5 * height + 1, shifted)) * smoothstep(-1, 0.5, d));
  };
  const focusEdge = (d: number) => { edge = Math.max(edge, smoothstep(offset - 0.5, offset + 0.5, d) * (1 - smoothstep(offset + width - 0.5, offset + width + 0.5, d))); };
  const ox = -light[0] / light[2], oy = -light[1] / light[2];

  for (const entry of entries) {
    if (entry.type === "object") {
      const object = entry.resolved, shape = object.shape, state = shape.object.state ?? {};
      const d = objectDistance(shape, x, y);
      if (shape.dome) {
        // 2B.5 A dome, ray-cast: its colour goes over what is beneath, lit by its own normal.
        const hit = domeHit(scene, shape, x, y);
        if (d < 0 || hit.coverage > 0.5) inside = true;
        clearance = Math.min(clearance, Math.abs(d) - object.band);
        occlude(hit.coverage);
        surfaceColour = surfaceColour.map((channel, index) => channel * (1 - hit.coverage) + object.colour![index]! * hit.coverage);
        surfaceAlpha += hit.coverage * (1 - surfaceAlpha);
        if (object.lit && hit.coverage > 0) shade += (bevelLight(scene, hit.normal, object) + environmentTerm(scene, hit.normal, object.roughness, object.metallic)) * hit.coverage;
      } else {
        // 2B.4 A solid: a side within `taper` of its footprint's edge, its cap beyond.
        if (d < 0) inside = true;
        clearance = Math.min(clearance, Math.abs(d) - object.band);
        const cover = 1 - smoothstep(-0.5, 0.5, d);
        occlude(cover);
        if (object.lit) {
          if (object.band > 0 && d > -object.band) {
            const n = sideNormal(scene, shape, x, y);
            shade += (bevelLight(scene, n, object) + environmentTerm(scene, n, object.roughness, object.metallic)) * cover;
          } else if (d <= -object.band) {
            interior(object, state, shape.object.finish === true, shape.cy - shape.halfHeight, shape.halfHeight * 2);
          }
        }
      }
      if (object.height > 0) cast(object.height, d, objectDistance(shape, x - ox * object.height, y - oy * object.height));
      if (state.focus && !state.disabled) focusEdge(d);
      continue;
    }
    const shape = entry.resolved;
    const d = distance(shape, x, y);
    const state = shape.primitive.state ?? {};
    if (d < 0) inside = true;
    clearance = Math.min(clearance, Math.abs(d) - shape.band);
    const cover = 1 - smoothstep(-0.5, 0.5, d);
    occlude(cover);
    if (entry.colour) {
      // 2B.6 A dome drawn at the Relief level keeps its own colour on its footprint.
      surfaceColour = surfaceColour.map((channel, index) => channel + entry.colour![index]! * cover);
      surfaceAlpha += cover * (1 - surfaceAlpha);
    }
    if (shape.lit && shape.band > 0) {
      const s = clamp(-d / shape.band, 0, 1);
      // A knob is all bevel (a dome); it has no interior.
      if (s < 1 || shape.face === "knob") {
        // 2.5 Bevel light: a normal from the profile, Lambert relative to a flat face, a specular lobe and a coat.
        const [gx, gy] = outward(shape, x, y), theta = profileAngle(shape.profile, s);
        const n = [gx * shape.slope * Math.sin(theta), gy * shape.slope * Math.sin(theta), Math.cos(theta)] as const;
        shade += bevelLight(scene, n, shape) * cover;
      } else {
        interior(shape, state, shape.primitive.finish === true, shape.cy - shape.halfHeight, shape.halfHeight * 2);
      }
    }
    if (shape.face === "ring" && shape.primitive.ring && !state.disabled) {
      // Each arc goes over the overlay so far, back to front.
      const coverage = cover * arcCoverage(shape, x, y), colour = rgb(shape.primitive.ring.colour);
      arcColour = arcColour.map((channel, index) => channel * (1 - coverage) + colour[index]! * coverage);
      arcAlpha += coverage * (1 - arcAlpha);
    }
    if (shape.height > 0) cast(shape.height, d, distance(shape, x - ox * shape.height, y - oy * shape.height));
    if (state.focus && !state.disabled) focusEdge(d);
  }
  return {
    shade,
    interior: 1 + clamp(offsets, -m, m),
    shadow,
    guard: inside ? smoothstep(0, guardRamp, clearance) : 0,
    band, dark, edge, arc: { colour: arcColour as unknown as Rgb01, alpha: arcAlpha },
    surface: { colour: surfaceColour as unknown as Rgb01, alpha: surfaceAlpha },
  };
}

/**
 * The colour the model gives at a layer-local point `(x, y)` in CSS px, composited over the scene's backdrop
 * (section 2.11). Points in the outset take no captured content. Channels are 0–1, sRGB-encoded.
 */
export function shadePoint(scene: StrataScene, captured: CapturedColour, x: number, y: number): Rgb01 {
  const terms = shadingTerms(scene, x, y);
  const within = x >= 0 && y >= 0 && x <= scene.extent.width && y <= scene.extent.height;
  const [cr, cg, cb, ca] = within ? captured(x, y) : [0, 0, 0, 0];
  // 2B.5 Domes' colour goes over the captured content, as the surface the light then falls on.
  const s = terms.surface.alpha, a = ca * (1 - s) + s;
  const surface = [cr, cg, cb].map((c, channel) => (a > 1e-9 ? (c * ca * (1 - s) + terms.surface.colour[channel]!) / a : 0));
  const backdrop = rgb(scene.backdrop), focus = rgb(scene.focus.colour);
  // 2.9: on a guarded face a cast shadow is scaled to darken by at most m, so it keeps its soft profile.
  const m = scene.interior.max, scaled = terms.shadow * (scene.shadow.strength > m ? m / scene.shadow.strength : 1);
  const k = clamp(terms.interior * (1 - scaled), 1 - m, 1 + m);
  return surface.map((c, channel) => {
    let content = mix((c * terms.interior + terms.shade) * (1 - terms.shadow), c * k, terms.guard);
    content = content * (1 - terms.arc.alpha) + terms.arc.colour[channel]!;
    content = clamp(mix(mix(content, 1, terms.band), 0, terms.dark), 0, 1);
    const over = content * a + backdrop[channel]! * (1 - a) * (1 - terms.shadow);
    return clamp(mix(over, focus[channel]!, terms.edge), 0, 1);
  }) as unknown as Rgb01;
}

/** The area a renderer draws: the extent grown by the outset, as `[x, y, width, height]` in layer-local px. */
export function drawnArea(scene: StrataScene): [number, number, number, number] {
  const { top, right, bottom, left } = scene.outset ?? { top: 0, right: 0, bottom: 0, left: 0 };
  return [-left, -top, scene.extent.width + left + right, scene.extent.height + top + bottom];
}

/**
 * Renders a whole scene into an RGBA byte buffer at `scale` device pixels per CSS px, sampling each device pixel at
 * its centre. Covers the drawn area (extent plus outset); for tools and tests.
 */
export function renderScene(scene: StrataScene, captured: CapturedColour, scale = 1): { width: number; height: number; data: Uint8ClampedArray } {
  const [left, top, areaWidth, areaHeight] = drawnArea(scene);
  const width = Math.ceil(areaWidth * scale), height = Math.ceil(areaHeight * scale);
  const data = new Uint8ClampedArray(width * height * 4);
  for (let row = 0; row < height; row++) {
    for (let column = 0; column < width; column++) {
      const colour = shadePoint(scene, captured, left + (column + 0.5) / scale, top + (row + 0.5) / scale);
      data.set([...colour.map(channel => Math.round(channel * 255)), 255], (row * width + column) * 4);
    }
  }
  return { width, height, data };
}
