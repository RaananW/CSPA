/**
 * The Scene level's parts that are not drawing (Phase 5, `docs/ui-library/phase5.md`): the physics that moves
 * particles between frames, and environment maps loaded from Radiance `.hdr` files. Drawing is core's `stage` and
 * `objects` materials; the rendering model describes one moment, and this module produces the next.
 */
import type { EnvironmentMap, StageParticle } from "../tokens/stage.ts";
import { environmentColumns, environmentRows } from "../tokens/stage.ts";

/** A deterministic random source (mulberry32): the same seed gives the same burst. */
export function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One confetti particle's state between frames. */
export interface Confetto {
  shape: "card" | "disc";
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  width: number; height: number;
  rotation: number; spin: number;
  tiltX: number; tiltY: number; tumbleX: number; tumbleY: number;
  colour: string;
  /** Seconds lived, and the life it ends at. */
  age: number;
  life: number;
}

/** What a burst looks like. */
export interface BurstOptions {
  /** Particles, at most 256; 80 by default. */
  count?: number;
  /** Their colours; the theme's accent and status colours by default. */
  colours?: string[];
  /** The seed of the random source, so a burst can be reproduced; random by default. */
  seed?: number;
  /** Launch speed, in px per second; 900 by default. */
  power?: number;
  /** Half the cone the particles leave in, in degrees around straight up; 70 by default. */
  spread?: number;
}

/** The constants of the physics: px and seconds. */
export const physics = { gravity: 1500, lift: 700, drag: 1.4, bounce: 0.35, friction: 0.7, step: 1 / 120, fade: 0.4 };

/** Launches a burst from `(x, y)` on the stage. */
export function launch(x: number, y: number, colours: readonly string[], options: BurstOptions = {}): Confetto[] {
  const random = seeded(options.seed ?? Math.floor(Math.random() * 2 ** 32));
  const count = Math.max(0, Math.min(256, Math.round(options.count ?? 80)));
  const power = options.power ?? 900, spread = ((options.spread ?? 70) * Math.PI) / 180;
  return Array.from({ length: count }, () => {
    const angle = (random() * 2 - 1) * spread, speed = power * (0.45 + 0.55 * random());
    const disc = random() < 0.3;
    const size = 6 + random() * 5;
    return {
      shape: disc ? "disc" : "card",
      x, y, z: 4,
      vx: Math.sin(angle) * speed, vy: -Math.cos(angle) * speed, vz: 250 + random() * 250,
      width: size, height: disc ? size : size * (1.3 + random() * 0.6),
      rotation: random() * 360, spin: (random() * 2 - 1) * 720,
      tiltX: random() * 360, tiltY: random() * 360, tumbleX: (random() * 2 - 1) * 540, tumbleY: (random() * 2 - 1) * 540,
      colour: colours[Math.floor(random() * colours.length)] ?? "#2563eb",
      age: 0, life: 1.4 + random() * 0.8,
    };
  });
}

/**
 * Advances particles by `seconds` in fixed steps: gravity down the screen, a pull back to the stage plane, air drag,
 * spin and tumble, and a damped bounce on the stage's floor. Returns the particles still alive.
 */
export function advance(particles: Confetto[], seconds: number, floor: number): Confetto[] {
  let remaining = Math.min(seconds, 0.1);
  while (remaining > 1e-9) {
    const dt = Math.min(physics.step, remaining);
    remaining -= dt;
    const damping = Math.exp(-physics.drag * dt);
    for (const p of particles) {
      p.vy += physics.gravity * dt;
      p.vz -= physics.lift * dt;
      p.vx *= damping; p.vy *= damping; p.vz *= damping;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z = Math.max(0, p.z + p.vz * dt);
      if (p.z === 0 && p.vz < 0) p.vz = 0;
      if (p.y > floor && p.vy > 0) { p.y = floor; p.vy *= -physics.bounce; p.vx *= physics.friction; }
      p.rotation += p.spin * dt; p.tiltX += p.tumbleX * dt; p.tiltY += p.tumbleY * dt;
      p.age += dt;
    }
  }
  return particles.filter(p => p.age < p.life);
}

/** A particle as the rendering model draws it (2C.3); it fades over its last moments. */
export function asParticle(p: Confetto): StageParticle {
  return {
    shape: p.shape, position: [p.x, p.y, p.z], size: [p.width, p.height], rotation: p.rotation % 360,
    tilt: [p.tiltX % 360, p.tiltY % 360], colour: p.colour, opacity: Math.max(0, Math.min(1, (p.life - p.age) / physics.fade)),
    roughness: 0.5,
  };
}

/**
 * A damped spring's position at `t` seconds, from 0 to rest at 1, for panels settling at the Scene level: angular
 * frequency `omega` (rad/s) and damping ratio `damping` (under 1, so it overshoots once and settles).
 */
export function spring(t: number, omega = 14, damping = 0.45): number {
  const decay = damping * omega, damped = omega * Math.sqrt(1 - damping * damping);
  return 1 - Math.exp(-decay * t) * (Math.cos(damped * t) + (decay / damped) * Math.sin(damped * t));
}

/** A decoded Radiance image: linear RGB, row by row from the top. */
export interface HdrImage { width: number; height: number; data: Float32Array }

/** Decodes a Radiance `.hdr` (RGBE) file, flat or run-length encoded. Throws on anything else. */
export function decodeHdr(buffer: ArrayBuffer): HdrImage {
  const bytes = new Uint8Array(buffer);
  let at = 0;
  const line = () => {
    let text = "";
    while (at < bytes.length && bytes[at] !== 0x0a) text += String.fromCharCode(bytes[at++]!);
    at++;
    return text;
  };
  const magic = line();
  if (!magic.startsWith("#?")) throw new Error("Not a Radiance HDR file");
  for (let header = line(); header !== ""; header = line()) {
    if (header.startsWith("FORMAT=") && header !== "FORMAT=32-bit_rle_rgbe") throw new Error(`Unsupported HDR format: ${header}`);
    if (at >= bytes.length) throw new Error("Truncated HDR header");
  }
  const size = line().match(/^-Y (\d+) \+X (\d+)$/);
  if (!size) throw new Error("Unsupported HDR orientation");
  const height = Number(size[1]), width = Number(size[2]);
  const data = new Float32Array(width * height * 3);
  const scanline = new Uint8Array(width * 4);
  for (let row = 0; row < height; row++) {
    const rle = width >= 8 && width < 32768 && bytes[at] === 2 && bytes[at + 1] === 2 && (bytes[at + 2]! << 8 | bytes[at + 3]!) === width;
    if (rle) {
      at += 4;
      for (let channel = 0; channel < 4; channel++) {
        for (let x = 0; x < width;) {
          let count = bytes[at++]!;
          if (count > 128) { count -= 128; const value = bytes[at++]!; for (let i = 0; i < count; i++) scanline[(x++) * 4 + channel] = value; }
          else for (let i = 0; i < count; i++) scanline[(x++) * 4 + channel] = bytes[at++]!;
        }
      }
    } else {
      scanline.set(bytes.subarray(at, at + width * 4));
      at += width * 4;
    }
    for (let x = 0; x < width; x++) {
      const e = scanline[x * 4 + 3]!;
      const scale = e ? 2 ** (e - 136) : 0;
      for (let c = 0; c < 3; c++) data[(row * width + x) * 3 + c] = scanline[x * 4 + c]! * scale;
    }
  }
  return { width, height, data };
}

/**
 * An environment map (rendering model 2C.4) from an equirectangular image: luminance averaged into 32 × 16 cells, the
 * image's top (its sky) towards the viewer, normalized so the upper quarter averages 1, at `strength`.
 */
export function environmentFrom(image: HdrImage, strength = 0.6): EnvironmentMap {
  const sums = new Float64Array(environmentColumns * environmentRows), counts = new Float64Array(sums.length);
  for (let y = 0; y < image.height; y++) {
    const row = Math.min(environmentRows - 1, Math.floor((y / image.height) * environmentRows));
    for (let x = 0; x < image.width; x++) {
      const column = Math.min(environmentColumns - 1, Math.floor((x / image.width) * environmentColumns));
      const at = (y * image.width + x) * 3;
      sums[row * environmentColumns + column]! += 0.2126 * image.data[at]! + 0.7152 * image.data[at + 1]! + 0.0722 * image.data[at + 2]!;
      counts[row * environmentColumns + column]! += 1;
    }
  }
  const cells = [...sums].map((sum, index) => (counts[index] ? sum / counts[index]! : 0));
  const upper = cells.slice(0, environmentColumns * (environmentRows / 4));
  const scale = 1 / Math.max(upper.reduce((total, value) => total + value, 0) / upper.length, 1e-6);
  return { source: "map", strength, grid: cells.map(value => Math.min(4, Math.max(0, value * scale))) };
}
