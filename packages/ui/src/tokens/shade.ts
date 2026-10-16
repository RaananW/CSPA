/**
 * The reference implementation of the Strata rendering model (`docs/ui-library/rendering-model.md`, part 3): a pure
 * function from a scene, the captured content and a point to a colour. It is the oracle every backend is judged
 * against, written to be read next to the standard, not to be fast. It uses no GPU and no DOM.
 *
 * All arithmetic is on sRGB-encoded channels in 0–1, as in CSS compositing, so the token validator's lit-contrast
 * checks hold exactly for what this function produces.
 */
import { parseHex } from "./contrast.ts";
import { finish } from "./finish.ts";
import type { BevelProfile, SceneFace, SceneMaterial, ScenePrimitive, StrataScene } from "./scene.ts";

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

/** A primitive with its derived quantities (section 2.3 of the standard). */
interface Resolved {
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
  roughness: number;
  metallic: number;
  coat: number;
  coatRoughness: number;
  primitive: ScenePrimitive;
}

function resolvePrimitive(scene: StrataScene, primitive: ScenePrimitive): Resolved {
  const [x, y, width, height] = primitive.rect;
  const state = primitive.state ?? {};
  const material: SceneMaterial = scene.materials[primitive.material] ?? {};
  const halfWidth = width / 2, halfHeight = height / 2, inradius = Math.min(halfWidth, halfHeight);
  const radius = primitive.face === "knob" ? inradius : clamp(primitive.radius ?? 0, 0, inradius);
  const emissive = (material.emissive?.strength ?? 0) > 0;
  const lit = !state.disabled && !emissive && primitive.face !== "flat";
  const ringHalf = primitive.face === "ring" ? (primitive.ring?.thickness ?? 0) / 2 : inradius;
  const band = !lit ? 0 : primitive.face === "knob" ? inradius : Math.min(scene.bevel.width, ringHalf);
  const caster = lifted(primitive.face) && !state.disabled;
  const multiplier = (1 + (scene.state.hoverHeight - 1) * (state.hover ? 1 : 0)) * (1 - (1 - scene.state.pressHeight) * (state.pressed ? 1 : 0));
  return {
    face: primitive.face, cx: x + halfWidth, cy: y + halfHeight, halfWidth, halfHeight, radius, band,
    slope: sunk(primitive.face) ? -1 : 1,
    height: caster ? primitive.height * multiplier : 0,
    profile: primitive.face === "knob" ? "quarter-round" : scene.bevel.profile,
    lit,
    roughness: material.base?.roughness ?? 1,
    metallic: material.base?.metallic ?? 0,
    coat: material.coat?.strength ?? 0,
    coatRoughness: material.coat?.roughness ?? 0,
    primitive,
  };
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
  /** Sum of the bevel light (section 2.5). */
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
  /** Ring arcs over the content, in scene order (section 2.7). */
  arcs: { colour: Rgb01; coverage: number }[];
}

/** The model's terms at a layer-local point. */
export function shadingTerms(scene: StrataScene, x: number, y: number): ShadingTerms {
  const shapes = scene.primitives.map(primitive => resolvePrimitive(scene, primitive));
  const light = lightVector(scene.light.azimuth, scene.light.elevation);
  const halfway = (() => { const h = [light[0], light[1], light[2] + 1]; const n = Math.hypot(...h); return h.map(c => c / n) as [number, number, number]; })();
  const m = scene.interior.max;
  const { offset, width } = scene.focus;
  let shade = 0, offsets = 0, shadow = 0, band = 0, dark = 0, edge = 0, inside = false, clearance = Infinity;
  const arcs: ShadingTerms["arcs"] = [];
  for (const shape of shapes) {
    const d = distance(shape, x, y);
    const state = shape.primitive.state ?? {};
    if (d < 0) inside = true;
    clearance = Math.min(clearance, Math.abs(d) - shape.band);
    // 2.4 Occlusion: a primitive hides the bevel light, interior offset, finish and arcs of those beneath it.
    const cover = 1 - smoothstep(-0.5, 0.5, d);
    shade *= 1 - cover; offsets *= 1 - cover; band *= 1 - cover; dark *= 1 - cover;
    for (const arc of arcs) arc.coverage *= 1 - cover;
    if (shape.lit && shape.band > 0) {
      const s = clamp(-d / shape.band, 0, 1);
      // A knob is all bevel (a dome); it has no interior.
      if (s < 1 || shape.face === "knob") {
        // 2.5 Bevel light: a normal from the profile, Lambert relative to a flat face, a specular lobe and a coat.
        const [gx, gy] = outward(shape, x, y), theta = profileAngle(shape.profile, s);
        const n = [gx * shape.slope * Math.sin(theta), gy * shape.slope * Math.sin(theta), Math.cos(theta)];
        const facing = Math.max(n[0]! * halfway[0] + n[1]! * halfway[1] + n[2]! * halfway[2], 0);
        const lambert = n[0]! * light[0] + n[1]! * light[1] + n[2]! * light[2] - light[2];
        const specular = facing ** mix(160, 6, shape.roughness) * (1 - shape.roughness) * mix(0.35, 1, shape.metallic);
        const fresnel = 0.04 + 0.96 * (1 - clamp(n[2]!, 0, 1)) ** 5;
        const coat = shape.coat * (facing ** mix(90, 10, shape.coatRoughness) * 0.9 + fresnel * 0.6);
        const coverage = 1 - smoothstep(-0.5, 0.5, d);
        shade += (lambert * scene.bevel.gain * (1 + shape.metallic) + specular * 1.2 + coat) * coverage;
      } else {
        // 2.6 Interior: a uniform brightness offset for state and gloss, and the finish zones.
        offsets += scene.state.hoverLift * (state.hover ? 1 : 0) - scene.state.pressSink * (state.pressed ? 1 : 0) + shape.coat * 0.02 + (1 - shape.roughness) * 0.01;
        if (shape.primitive.finish) {
          const along = clamp((y - (shape.cy - shape.halfHeight)) / Math.max(shape.halfHeight * 2, 1), 0, 1);
          const [bright, darken] = finish(along, { roughness: shape.roughness, metallic: shape.metallic, coat: shape.coat, coatRoughness: shape.coatRoughness });
          band = Math.max(band, bright);
          dark = Math.max(dark, darken);
        }
      }
    }
    if (shape.face === "ring" && shape.primitive.ring && !state.disabled) {
      arcs.push({ colour: rgb(shape.primitive.ring.colour), coverage: (1 - smoothstep(-0.5, 0.5, d)) * arcCoverage(shape, x, y) });
    }
    if (shape.height > 0) {
      // 2.8 Cast shadow: the shape moved away from the light by its height, softened over 2h + 1 px, outside the shape only.
      const ox = (-light[0] / light[2]) * shape.height, oy = (-light[1] / light[2]) * shape.height;
      const shifted = distance(shape, x - ox, y - oy);
      shadow = Math.max(shadow, scene.shadow.strength * (1 - smoothstep(-0.5 * shape.height, 1.5 * shape.height + 1, shifted)) * smoothstep(-1, 0.5, d));
    }
    if (state.focus && !state.disabled) edge = Math.max(edge, smoothstep(offset - 0.5, offset + 0.5, d) * (1 - smoothstep(offset + width - 0.5, offset + width + 0.5, d)));
  }
  return {
    shade,
    interior: 1 + clamp(offsets, -m, m),
    shadow,
    guard: inside ? smoothstep(0, guardRamp, clearance) : 0,
    band, dark, edge, arcs,
  };
}

/**
 * The colour the model gives at a layer-local point `(x, y)` in CSS px, composited over the scene's backdrop
 * (section 2.11). Points in the outset take no captured content. Channels are 0–1, sRGB-encoded.
 */
export function shadePoint(scene: StrataScene, captured: CapturedColour, x: number, y: number): Rgb01 {
  const terms = shadingTerms(scene, x, y);
  const within = x >= 0 && y >= 0 && x <= scene.extent.width && y <= scene.extent.height;
  const [r, g, b, a] = within ? captured(x, y) : [0, 0, 0, 0];
  const backdrop = rgb(scene.backdrop), focus = rgb(scene.focus.colour);
  const m = scene.interior.max, k = clamp(terms.interior * (1 - terms.shadow), 1 - m, 1 + m);
  return [r, g, b].map((c, channel) => {
    let content = mix((c * terms.interior + terms.shade) * (1 - terms.shadow), c * k, terms.guard);
    for (const arc of terms.arcs) content = mix(content, arc.colour[channel]!, arc.coverage);
    content = mix(mix(content, 1, terms.band), 0, terms.dark);
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
