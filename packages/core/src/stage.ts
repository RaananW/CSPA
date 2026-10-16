/**
 * The built-in `stage` material: core's implementation of stage scenes, the Scene part of the Strata Rendering Model
 * (`docs/ui-library/rendering-model.md`, part 2C, version 3). A stage scene describes one decorative layer over the
 * stage: a lit backdrop and up to 256 particles. It shares the relief binding and pass (`relief.ts` packs and shades
 * it when the scene is a stage scene), so a stage layer costs one pass like any other.
 *
 * Particle frames (axes and normal), the drawing order and each particle's screen bounds are derived here on the CPU,
 * so the shader only evaluates what changes per point. Particle motion is not core's: the application (Strata)
 * hands over a new scene each frame.
 */

/** Particles one stage layer may carry. */
export const STAGE_PARTICLES = 256;
const HEADER_VEC4S = 6;
const PARTICLE_VEC4S = 6;
/** vec4s a stage scene uses at the start of the relief binding. */
export const STAGE_VEC4S = HEADER_VEC4S + STAGE_PARTICLES * PARTICLE_VEC4S;

/** A particle (rendering model 2C.3). */
export interface StageParticle {
  shape: "card" | "disc";
  position: [number, number, number];
  size: [number, number];
  rotation?: number;
  tilt?: [number, number];
  colour: string;
  opacity?: number;
  roughness?: number;
  metallic?: number;
}
/** A stage scene (rendering model 2C.1), the input of the `stage` material. */
export interface StageScene {
  format: "strata-stage";
  version: 3;
  extent: { width: number; height: number };
  light: { azimuth: number; elevation: number };
  camera: { distance: number; vanish: [number, number] };
  backdrop?: { colour: string; pool: number; vignette: number; tint?: string; tintStrength?: number };
  particles: StageParticle[];
}

const fail = (path: string, what: string): never => { throw new Error(`Stage scene ${path} requires ${what}`); };
const finite = (value: unknown, path: string, min = -1e6, max = 1e6): number =>
  typeof value === "number" && Number.isFinite(value) && value >= min && value <= max ? value : fail(path, `a number in ${min}..${max}`);
const colour = (value: unknown, path: string): string => (typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : fail(path, "a #rrggbb colour"));
const record = (value: unknown, path: string): Record<string, unknown> =>
  (typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : fail(path, "an object"));
const numbers = (value: unknown, path: string, length: number, min = -1e6) =>
  (Array.isArray(value) && value.length === length ? value.map((part, index) => finite(part, `${path}[${index}]`, min)) : fail(path, `${length} numbers`));

/**
 * Validates a stage scene and returns a normalized copy (defaults filled in). Throws on the first problem, naming its
 * path, so an invalid scene changes nothing.
 */
export function validateStageScene(input: StageScene): StageScene {
  const scene = record(input, "");
  if (scene.format !== "strata-stage" || scene.version !== 3) throw new Error("Stage material requires a version 3 strata-stage scene");
  const extent = record(scene.extent, "extent"), light = record(scene.light, "light"), camera = record(scene.camera, "camera");
  const backdrop = scene.backdrop === undefined ? undefined : record(scene.backdrop, "backdrop");
  if (!Array.isArray(scene.particles) || scene.particles.length > STAGE_PARTICLES) fail("particles", `an array of at most ${STAGE_PARTICLES}`);
  return {
    format: "strata-stage", version: 3,
    extent: { width: finite(extent.width, "extent.width", 0), height: finite(extent.height, "extent.height", 0) },
    light: { azimuth: finite(light.azimuth, "light.azimuth", 0, 360), elevation: finite(light.elevation, "light.elevation", 1, 90) },
    camera: { distance: finite(camera.distance, "camera.distance", 100), vanish: numbers(camera.vanish, "camera.vanish", 2) as [number, number] },
    ...(backdrop ? { backdrop: { colour: colour(backdrop.colour, "backdrop.colour"), pool: finite(backdrop.pool, "backdrop.pool", 0, 1),
      vignette: finite(backdrop.vignette, "backdrop.vignette", 0, 1), ...(backdrop.tint !== undefined ? { tint: colour(backdrop.tint, "backdrop.tint") } : {}),
      tintStrength: backdrop.tintStrength === undefined ? 0 : finite(backdrop.tintStrength, "backdrop.tintStrength", 0, 1) } } : {}),
    particles: (scene.particles as unknown[]).map((value, index) => {
      const at = `particles[${index}]`, particle = record(value, at);
      if (particle.shape !== "card" && particle.shape !== "disc") fail(`${at}.shape`, '"card" or "disc"');
      const unit = (key: string, fallback: number) => (particle[key] === undefined ? fallback : finite(particle[key], `${at}.${key}`, 0, 1));
      return {
        shape: particle.shape as StageParticle["shape"],
        position: numbers(particle.position, `${at}.position`, 3) as [number, number, number],
        size: numbers(particle.size, `${at}.size`, 2, 0) as [number, number],
        rotation: particle.rotation === undefined ? 0 : finite(particle.rotation, `${at}.rotation`),
        tilt: particle.tilt === undefined ? [0, 0] : numbers(particle.tilt, `${at}.tilt`, 2) as [number, number],
        colour: colour(particle.colour, `${at}.colour`),
        opacity: unit("opacity", 1), roughness: unit("roughness", 0.6), metallic: unit("metallic", 0),
      };
    }),
  };
}

const rgb = (hex: string) => [1, 3, 5].map(index => Number.parseInt(hex.slice(index, index + 2), 16) / 255);
type Vec3 = [number, number, number];
/** 2C.3: a particle's axes and normal: turned about z, after tilting about its own x, then its own y axis. */
function frame(particle: StageParticle): [Vec3, Vec3, Vec3] {
  const turn = ((particle.rotation ?? 0) * Math.PI) / 180;
  const [tx, ty] = (particle.tilt ?? [0, 0]).map(value => (value * Math.PI) / 180) as [number, number];
  const rotate = ([x0, y0, z0]: Vec3): Vec3 => {
    let x = x0, y = y0 * Math.cos(tx) - z0 * Math.sin(tx), z = y0 * Math.sin(tx) + z0 * Math.cos(tx);
    [x, z] = [x * Math.cos(ty) + z * Math.sin(ty), -x * Math.sin(ty) + z * Math.cos(ty)];
    return [x * Math.cos(turn) - y * Math.sin(turn), x * Math.sin(turn) + y * Math.cos(turn), z];
  };
  return [rotate([1, 0, 0]), rotate([0, 1, 0]), rotate([0, 0, 1])];
}

/**
 * Packs a validated stage scene into the first `STAGE_VEC4S` vec4s of a relief binding of `length` floats: a header
 * (light, camera and stage reach, backdrop, tint, pool, vignette, count, the stage flag, extent), then each particle
 * farthest first with its frame and its screen bounds.
 */
export function stageUniforms(scene: StageScene, length: number): Float32Array {
  const values = new Float32Array(length);
  const a = (scene.light.azimuth * Math.PI) / 180, e = (scene.light.elevation * Math.PI) / 180;
  const { width, height } = scene.extent, { distance, vanish: [vx, vy] } = scene.camera;
  const backdrop = scene.backdrop;
  const order = scene.particles.map((particle, index) => ({ particle, index }))
    .sort((p, q) => p.particle.position[2] - q.particle.position[2] || p.index - q.index).map(entry => entry.particle);
  values.set([
    Math.sin(a) * Math.cos(e), -Math.cos(a) * Math.cos(e), Math.sin(e), 0,
    distance, vx, vy, Math.hypot(width, height) / 2,
    ...(backdrop ? rgb(backdrop.colour) : [0, 0, 0]), backdrop ? 1 : 0,
    ...(backdrop ? rgb(backdrop.tint ?? backdrop.colour) : [0, 0, 0]), backdrop?.tintStrength ?? 0,
    backdrop?.pool ?? 0, backdrop?.vignette ?? 0, order.length, 1,
    width, height, 0, 0,
  ], 0);
  order.forEach((particle, index) => {
    const [u, v, n] = frame(particle);
    const [x, y, z] = particle.position, [hw, hh] = [particle.size[0] / 2, particle.size[1] / 2];
    // Screen bounds: the card lies within its bounding sphere, which projects inside this circle (its own size seen
    // from its nearest point, plus the parallax of its depth at its distance from the vanishing point).
    const radius = Math.hypot(hw, hh), near = Math.max(distance - z - radius, 1);
    const scale = distance / Math.max(distance - z, 1);
    const reach = radius * distance / near + Math.hypot(x - vx, y - vy) * (distance / near - scale) + 2;
    values.set([
      x, y, z, particle.shape === "disc" ? 1 : 0,
      ...u, hw,
      ...v, hh,
      ...n, particle.opacity ?? 1,
      ...rgb(particle.colour), particle.roughness ?? 0.6,
      particle.metallic ?? 0, vx + (x - vx) * scale, vy + (y - vy) * scale, reach,
    ], (HEADER_VEC4S + index * PARTICLE_VEC4S) * 4);
  });
  return values;
}

/**
 * WGSL for stage scenes, over the relief binding declared by \`reliefWGSL\`: \`stageShade(p)\` returns the backdrop and
 * particles at a stage point as straight RGB with alpha (rendering model 2C.5).
 */
export const stageWGSL = /* wgsl */ `
fn stageShade(p: vec2f) -> vec4f {
  let light = relief[0].xyz;
  let camera = relief[1];
  let reach = camera.w;
  let extent = relief[5].xy;
  var colour = vec3f(0.0);
  var alpha = 0.0;
  if (relief[2].w > 0.5) {
    // 2C.2 Backdrop: a pool towards the light and a vignette at the edges.
    let centre = extent * 0.5;
    let pool = relief[4].x * (1.0 - smoothstep(0.0, reach * (0.6 + 0.4 * light.z), length(p - (centre + light.xy * reach * 0.5))));
    let vignette = relief[4].y * smoothstep(reach * 0.45, reach * 1.1, length(p - centre));
    colour = clamp(mix(relief[2].xyz, relief[3].xyz, relief[3].w) * (1.0 + 0.25 * pool - 0.35 * vignette), vec3f(0.0), vec3f(1.0));
    alpha = 1.0;
  }
  let halfway = normalize(light + vec3f(0.0, 0.0, 1.0));
  let eye = vec3f(camera.yz, camera.x);
  let count = u32(relief[4].z);
  for (var i = 0u; i < count; i++) {
    let base = ${HEADER_VEC4S}u + i * ${PARTICLE_VEC4S}u;
    let bounds = relief[base + 5u];
    if (length(p - bounds.yz) > bounds.w) { continue; }
    let centre = relief[base];
    let u = relief[base + 1u];
    let v = relief[base + 2u];
    let normal = relief[base + 3u];
    let look = vec3f(p - camera.yz, -camera.x);
    let denominator = dot(normal.xyz, look);
    if (abs(denominator) < 1e-6) { continue; }
    let t = dot(normal.xyz, centre.xyz - eye) / denominator;
    let hit = eye + look * t - centre.xyz;
    let local = vec2f(dot(hit, u.xyz), dot(hit, v.xyz));
    var distance = 0.0;
    if (centre.w > 0.5) {
      distance = (length(local / max(vec2f(u.w, v.w), vec2f(1e-6))) - 1.0) * min(u.w, v.w);
    } else {
      let radius = min(u.w, v.w) * 0.25;
      let q = abs(local) - vec2f(u.w, v.w) + vec2f(radius);
      distance = length(max(q, vec2f(0.0))) + min(max(q.x, q.y), 0.0) - radius;
    }
    let scale = camera.x / max(camera.x - centre.z, 1.0);
    let coverage = (1.0 - smoothstep(-0.5, 0.5, distance * scale)) * normal.w;
    if (coverage <= 0.0) { continue; }
    // 2C.3 Light, two-sided.
    let n = select(-normal.xyz, normal.xyz, normal.z >= 0.0);
    let material = relief[base + 4u];
    let diffuse = min(0.55 + 0.45 * max(dot(n, light), 0.0) / max(light.z, 1e-3), 1.6);
    let specular = pow(max(dot(n, halfway), 0.0), mix(160.0, 6.0, material.w)) * (1.0 - material.w) * mix(0.35, 1.0, bounds.x);
    let lit = clamp(material.xyz * diffuse + vec3f(specular), vec3f(0.0), vec3f(1.0));
    // 2C.5 Each particle over what is drawn so far.
    let out = coverage + alpha * (1.0 - coverage);
    colour = select(vec3f(0.0), (lit * coverage + colour * alpha * (1.0 - coverage)) / out, out > 1e-6);
    alpha = out;
  }
  return vec4f(colour, alpha);
}
`;
