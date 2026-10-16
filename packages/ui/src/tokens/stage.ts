/**
 * The Scene part of the Strata rendering model (`docs/ui-library/rendering-model.md`, part 2C, version 3): stage
 * scenes, which describe one decorative layer covering the stage (its lit backdrop and its particles), and environment
 * maps, which version 3 object scenes may reflect instead of the studio. Pure functions: this is the reference
 * implementation, not a renderer. Particle motion is not part of the model; a stage scene is one moment.
 */
import { parseHex } from "./contrast.ts";

/** A particle (2C.3): a small lit card or disc in 3D over the stage. */
export interface StageParticle {
  shape: "card" | "disc";
  /** Its centre: x and y in stage px, z its height above the stage plane. */
  position: [number, number, number];
  /** Width and height in px. */
  size: [number, number];
  /** Turn about the viewer's axis, in degrees clockwise. */
  rotation?: number;
  /** Tumble: tilts of its face about its own x and y axes, in degrees. */
  tilt?: [number, number];
  colour: string;
  /** 0–1, default 1. */
  opacity?: number;
  /** Default 0.6 and 0. */
  roughness?: number;
  metallic?: number;
}

/** A stage scene (version 3): one decorative layer covering the stage, lit by the application's one light. */
export interface StageScene {
  format: "strata-stage";
  version: 3;
  /** The layer's size: the stage. */
  extent: { width: number; height: number };
  light: { azimuth: number; elevation: number };
  camera: { distance: number; vanish: [number, number] };
  /** The lit stage surface (2C.2). Absent: the layer is transparent but for its particles. */
  backdrop?: { colour: string; pool: number; vignette: number; tint?: string; tintStrength?: number };
  /** At most 256 (2C.3). */
  particles: StageParticle[];
}

/** An environment map (2C.4): brightness in a 32 × 16 equirectangular grid, row 0 at the zenith, column 0 at the top of the screen. */
export interface EnvironmentMap {
  source: "map";
  strength: number;
  /** 512 values, row by row; 1 is the studio's ceiling. */
  grid: number[];
}
export const environmentColumns = 32;
export const environmentRows = 16;
export const stageParticleBudget = 256;

/** One problem with a stage scene, at a JSON path. */
export interface StageIssue { path: string; message: string }

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const smoothstep = (edge0: number, edge1: number, x: number) => { const t = clamp((x - edge0) / (edge1 - edge0), 0, 1); return t * t * (3 - 2 * t); };
const rgb = (hex: string): [number, number, number] => parseHex(hex).map(channel => channel / 255) as [number, number, number];
const hexColour = /^#[0-9a-f]{6}$/i;
/** The direction towards the light (design language section 3), as `lightVector` in `shade.ts` gives it. */
function lightVector(azimuth: number, elevation: number): [number, number, number] {
  const a = (azimuth * Math.PI) / 180, e = (elevation * Math.PI) / 180;
  return [Math.sin(a) * Math.cos(e), -Math.cos(a) * Math.cos(e), Math.sin(e)];
}

/** Checks a stage scene. Returns every problem found; an empty list means valid. */
export function validateStageScene(scene: unknown): StageIssue[] {
  const issues: StageIssue[] = [];
  const report = (path: string, message: string) => issues.push({ path, message });
  const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
  const number = (value: unknown, path: string, min = -Infinity, max = Infinity) => {
    if (typeof value !== "number" || !Number.isFinite(value)) return report(path, "must be a finite number");
    if (value < min || value > max) report(path, `must be within ${min} to ${max}`);
  };
  const tuple = (value: unknown, path: string, length: number, min = -Infinity) => {
    if (!Array.isArray(value) || value.length !== length) return report(path, `must hold ${length} numbers`);
    value.forEach((part, index) => number(part, `${path}[${index}]`, min));
  };
  const colour = (value: unknown, path: string) => { if (typeof value !== "string" || !hexColour.test(value)) report(path, "must be a #rrggbb colour"); };
  if (!isObject(scene)) return [{ path: "", message: "must be an object" }];
  for (const key of Object.keys(scene)) if (!["$schema", "format", "version", "extent", "light", "camera", "backdrop", "particles"].includes(key)) report(key, "is not part of the format");
  if (scene.format !== "strata-stage") report("format", 'must be "strata-stage"');
  if (scene.version !== 3) report("version", "must be 3");
  if (!isObject(scene.extent)) report("extent", "must be an object");
  else { number(scene.extent.width, "extent.width", 0); number(scene.extent.height, "extent.height", 0); }
  if (!isObject(scene.light)) report("light", "must be an object");
  else { number(scene.light.azimuth, "light.azimuth", 0, 360); number(scene.light.elevation, "light.elevation", 1, 90); }
  if (!isObject(scene.camera)) report("camera", "must be an object");
  else { number(scene.camera.distance, "camera.distance", 100); tuple(scene.camera.vanish, "camera.vanish", 2); }
  if (scene.backdrop !== undefined) {
    const backdrop = scene.backdrop;
    if (!isObject(backdrop)) report("backdrop", "must be an object");
    else {
      colour(backdrop.colour, "backdrop.colour");
      number(backdrop.pool, "backdrop.pool", 0, 1);
      number(backdrop.vignette, "backdrop.vignette", 0, 1);
      if (backdrop.tint !== undefined) colour(backdrop.tint, "backdrop.tint");
      if (backdrop.tintStrength !== undefined) number(backdrop.tintStrength, "backdrop.tintStrength", 0, 1);
    }
  }
  if (!Array.isArray(scene.particles)) report("particles", "must be an array");
  else {
    if (scene.particles.length > stageParticleBudget) report("particles", `holds more than ${stageParticleBudget} particles`);
    scene.particles.forEach((particle: unknown, index) => {
      const at = `particles[${index}]`;
      if (!isObject(particle)) return report(at, "must be an object");
      for (const key of Object.keys(particle)) if (!["shape", "position", "size", "rotation", "tilt", "colour", "opacity", "roughness", "metallic"].includes(key)) report(`${at}.${key}`, "is not part of the format");
      if (particle.shape !== "card" && particle.shape !== "disc") report(`${at}.shape`, 'must be "card" or "disc"');
      tuple(particle.position, `${at}.position`, 3);
      tuple(particle.size, `${at}.size`, 2, 0);
      if (particle.rotation !== undefined) number(particle.rotation, `${at}.rotation`);
      if (particle.tilt !== undefined) tuple(particle.tilt, `${at}.tilt`, 2);
      colour(particle.colour, `${at}.colour`);
      for (const key of ["opacity", "roughness", "metallic"]) if (particle[key] !== undefined) number(particle[key], `${at}.${key}`, 0, 1);
    });
  }
  return issues;
}

/** Checks an environment map (2C.4). */
export function validateEnvironmentMap(map: unknown, path = "environment"): StageIssue[] {
  if (typeof map !== "object" || map === null) return [{ path, message: "must be an object" }];
  const value = map as Record<string, unknown>, issues: StageIssue[] = [];
  if (value.source !== "map") issues.push({ path: `${path}.source`, message: 'must be "map"' });
  if (typeof value.strength !== "number" || !(value.strength >= 0 && value.strength <= 1)) issues.push({ path: `${path}.strength`, message: "must be within 0 to 1" });
  if (!Array.isArray(value.grid) || value.grid.length !== environmentColumns * environmentRows
    || !value.grid.every(cell => typeof cell === "number" && Number.isFinite(cell) && cell >= 0 && cell <= 4)) {
    issues.push({ path: `${path}.grid`, message: `must hold ${environmentColumns * environmentRows} numbers within 0 to 4` });
  }
  return issues;
}

/**
 * 2C.4: the map's brightness in direction `r` (a unit vector in panel axes, z towards the viewer), sampled bilinearly
 * at `u = atan2(r.x, −r.y) / 2π + 0.5` (wrapping) and `v = acos(r.z) / π`, between cell centres.
 */
export function environmentSample(map: EnvironmentMap, r: readonly [number, number, number]): number {
  const u = (Math.atan2(r[0], -r[1]) / (2 * Math.PI) + 0.5) * environmentColumns - 0.5;
  const v = clamp((Math.acos(clamp(r[2], -1, 1)) / Math.PI) * environmentRows - 0.5, 0, environmentRows - 1);
  const column = Math.floor(u), row = Math.floor(v), fu = u - column, fv = v - row;
  const cell = (c: number, r: number) => map.grid[clamp(r, 0, environmentRows - 1) * environmentColumns + ((c % environmentColumns) + environmentColumns) % environmentColumns]!;
  return mix(mix(cell(column, row), cell(column + 1, row), fu), mix(cell(column, row + 1), cell(column + 1, row + 1), fu), fv);
}

/** 2C.2: the lit stage surface at a stage point, opaque. */
export function backdropColour(scene: StageScene, x: number, y: number): [number, number, number] {
  const backdrop = scene.backdrop!;
  const { width, height } = scene.extent;
  const reach = Math.hypot(width, height) / 2;
  const [lx, ly, lz] = lightVector(scene.light.azimuth, scene.light.elevation);
  // The pool sits towards the light, nearer the centre the higher the light stands.
  const cx = width / 2 + lx * reach * 0.5, cy = height / 2 + ly * reach * 0.5;
  const pool = backdrop.pool * (1 - smoothstep(0, reach * (0.6 + 0.4 * lz), Math.hypot(x - cx, y - cy)));
  const vignette = backdrop.vignette * smoothstep(reach * 0.45, reach * 1.1, Math.hypot(x - width / 2, y - height / 2));
  const base = rgb(backdrop.colour), tint = backdrop.tint ? rgb(backdrop.tint) : base, t = backdrop.tintStrength ?? 0;
  return base.map((channel, index) => clamp(mix(channel, tint[index]!, t) * (1 + 0.25 * pool - 0.35 * vignette), 0, 1)) as [number, number, number];
}

/** A particle's frame: its centre, its unit axes in the card's plane and its normal (2C.3). */
function frame(particle: StageParticle) {
  const turn = ((particle.rotation ?? 0) * Math.PI) / 180;
  const [tx, ty] = (particle.tilt ?? [0, 0]).map(value => (value * Math.PI) / 180) as [number, number];
  // The card's axes: turned about z, then tilted about its own x axis, then about its own y axis.
  const rotate = (v: [number, number, number]): [number, number, number] => {
    // tilt about x
    let [x, y, z] = v;
    [y, z] = [y * Math.cos(tx) - z * Math.sin(tx), y * Math.sin(tx) + z * Math.cos(tx)];
    // tilt about y
    [x, z] = [x * Math.cos(ty) + z * Math.sin(ty), -x * Math.sin(ty) + z * Math.cos(ty)];
    // turn about z
    return [x * Math.cos(turn) - y * Math.sin(turn), x * Math.sin(turn) + y * Math.cos(turn), z];
  };
  return { centre: particle.position, u: rotate([1, 0, 0]), v: rotate([0, 1, 0]), n: rotate([0, 0, 1]) };
}

/**
 * 2C.3: where the camera ray through the screen point `(x, y)` meets a particle's plane, in the card's own px
 * (`[along u, along v]`), with the screen scale there; or undefined when the ray runs along the plane.
 */
function onParticle(scene: StageScene, particle: StageParticle, x: number, y: number) {
  const { distance: D, vanish: [vx, vy] } = scene.camera;
  const { centre, u, v, n } = frame(particle);
  // Ray: from (vx, vy, D) towards (x, y, 0).
  const direction = [x - vx, y - vy, -D];
  const denominator = n[0] * direction[0]! + n[1] * direction[1]! + n[2] * direction[2]!;
  if (Math.abs(denominator) < 1e-9) return undefined;
  const t = (n[0] * (centre[0] - vx) + n[1] * (centre[1] - vy) + n[2] * (centre[2] - D)) / denominator;
  const hit = [vx + direction[0]! * t - centre[0], vy + direction[1]! * t - centre[1], D + direction[2]! * t - centre[2]];
  return { local: [hit[0]! * u[0] + hit[1]! * u[1] + hit[2]! * u[2], hit[0]! * v[0] + hit[1]! * v[1] + hit[2]! * v[2]] as [number, number],
    scale: D / Math.max(D - centre[2], 1), normal: n };
}

/** The particles in drawing order: farthest from the viewer first (lowest z), then in list order. */
export function particleOrder(scene: StageScene): StageParticle[] {
  return scene.particles.map((particle, index) => ({ particle, index }))
    .sort((a, b) => a.particle.position[2] - b.particle.position[2] || a.index - b.index).map(entry => entry.particle);
}

/** 2C.3: a particle's coverage and lit colour at a screen point. */
export function particleAt(scene: StageScene, particle: StageParticle, x: number, y: number): { coverage: number; colour: [number, number, number] } {
  const hit = onParticle(scene, particle, x, y);
  const none = { coverage: 0, colour: [0, 0, 0] as [number, number, number] };
  if (!hit) return none;
  const [hw, hh] = [particle.size[0] / 2, particle.size[1] / 2];
  const [a, b] = hit.local;
  let distance: number;
  if (particle.shape === "disc") distance = (Math.hypot(a / Math.max(hw, 1e-6), b / Math.max(hh, 1e-6)) - 1) * Math.min(hw, hh);
  else {
    const r = Math.min(hw, hh) * 0.25, qx = Math.abs(a) - hw + r, qy = Math.abs(b) - hh + r;
    distance = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
  }
  const coverage = (1 - smoothstep(-0.5, 0.5, distance * hit.scale)) * (particle.opacity ?? 1);
  if (coverage <= 0) return none;
  // Two-sided: the face towards the viewer is lit.
  const n = hit.normal[2] >= 0 ? hit.normal : hit.normal.map(c => -c) as [number, number, number];
  const light = lightVector(scene.light.azimuth, scene.light.elevation);
  const halfway = (() => { const h = [light[0], light[1], light[2] + 1]; const length = Math.hypot(...h); return h.map(c => c / length); })();
  const roughness = particle.roughness ?? 0.6, metallic = particle.metallic ?? 0;
  const diffuse = 0.55 + 0.45 * Math.max(n[0] * light[0] + n[1] * light[1] + n[2] * light[2], 0) / Math.max(light[2], 1e-3);
  const facing = Math.max(n[0] * halfway[0]! + n[1] * halfway[1]! + n[2] * halfway[2]!, 0);
  const specular = facing ** mix(160, 6, roughness) * (1 - roughness) * mix(0.35, 1, metallic);
  const base = rgb(particle.colour);
  return { coverage, colour: base.map(channel => clamp(channel * Math.min(diffuse, 1.6) + specular, 0, 1)) as [number, number, number] };
}

/**
 * The colour and alpha a stage scene gives at a stage point (2C.5): the backdrop (opaque) or nothing, then each
 * particle over it, farthest first. Straight colour with alpha, channels 0–1.
 */
export function shadeStage(scene: StageScene, x: number, y: number): [number, number, number, number] {
  let colour: [number, number, number] = scene.backdrop ? backdropColour(scene, x, y) : [0, 0, 0];
  let alpha = scene.backdrop ? 1 : 0;
  for (const particle of particleOrder(scene)) {
    const { coverage, colour: lit } = particleAt(scene, particle, x, y);
    if (coverage <= 0) continue;
    // Straight-alpha "over": the particle over what is drawn so far.
    const out = coverage + alpha * (1 - coverage);
    colour = colour.map((channel, index) => (out > 1e-9 ? (lit[index]! * coverage + channel * alpha * (1 - coverage)) / out : 0)) as [number, number, number];
    alpha = out;
  }
  return [...colour, alpha];
}
