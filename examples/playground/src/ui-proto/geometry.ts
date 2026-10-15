/**
 * Rounded geometry for the Strata objects prototype (Babylon Lite has no rounded box). Shapes are built from a
 * rounded-rectangle outline in face-local CSS pixels and mapped to world space by the caller's `world` function:
 * - `frustum`: smooth-shaded sides from a base outline to a top outline inset by `taper` at `height`;
 * - `cap`: a flat rounded face (triangle fan), optionally UV-mapped to the panel capture;
 * - `band`: a rounded bezel ring (outer side, flat top, inner side).
 * Heights are towards the viewer for positive values; `flip` reverses winding if the engine's front face differs.
 */
import { createMeshFromData, type EngineContext, type Mesh } from "@babylonjs/lite";

export interface Rect { x: number; y: number; width: number; height: number }
type World = (x: number, y: number, z?: number) => [number, number, number];
interface Ring { points: [number, number][]; normals: [number, number][] }

/** Outline of a rounded rectangle (clockwise on screen, y down), with outward unit normals per point. */
export function outline(r: Rect, radius: number, segments = 8): Ring {
  const rad = Math.max(0, Math.min(radius, r.width / 2, r.height / 2));
  const corners: [number, number, number][] = [
    [r.x + r.width - rad, r.y + rad, -Math.PI / 2], [r.x + r.width - rad, r.y + r.height - rad, 0],
    [r.x + rad, r.y + r.height - rad, Math.PI / 2], [r.x + rad, r.y + rad, Math.PI],
  ];
  const points: [number, number][] = [], normals: [number, number][] = [];
  for (const [cx, cy, start] of corners) for (let step = 0; step <= segments; step++) {
    const angle = start + step / segments * Math.PI / 2;
    const nx = Math.cos(angle), ny = Math.sin(angle);
    points.push([cx + nx * rad, cy + ny * rad]);
    normals.push([nx, ny]);
  }
  return { points, normals };
}

const inset = (r: Rect, by: number): Rect => ({ x: r.x + by, y: r.y + by, width: r.width - 2 * by, height: r.height - 2 * by });

class Builder {
  positions: number[] = []; normals: number[] = []; uvs: number[] = []; indices: number[] = [];
  constructor(private world: World, private flip: boolean) {}
  vertex(x: number, y: number, z: number, normal: [number, number, number], uv: [number, number] = [0, 0]) {
    this.positions.push(...this.world(x, y, z)); this.normals.push(...normal); this.uvs.push(...uv);
    return this.positions.length / 3 - 1;
  }
  triangle(a: number, b: number, c: number) { this.flip ? this.indices.push(a, c, b) : this.indices.push(a, b, c); }
  mesh(engine: EngineContext, name: string): Mesh {
    return createMeshFromData(engine, name, new Float32Array(this.positions), new Float32Array(this.normals), new Uint32Array(this.indices), new Float32Array(this.uvs));
  }
  /** Side wall between two rings; `slope` is the outward tilt of the wall normal (taper over height). */
  wall(lower: Ring, lowerZ: number, upper: Ring, upperZ: number, outward: 1 | -1) {
    const rise = Math.abs(upperZ - lowerZ) || 1;
    const run = (lower.points[0]![0] - upper.points[0]![0]) * lower.normals[0]![0] + (lower.points[0]![1] - upper.points[0]![1]) * lower.normals[0]![1];
    const base: number[] = [], top: number[] = [];
    lower.points.forEach(([x, y], index) => {
      const [nx, ny] = lower.normals[index]!;
      // World normal: outward in the plane (y flipped), tilted towards the viewer (−z) by the wall's slope.
      const normal = normalise([outward * nx * rise, -outward * ny * rise, -Math.abs(run)]);
      base.push(this.vertex(x, y, -lowerZ, normal));
      const [ux, uy] = upper.points[index]!;
      top.push(this.vertex(ux, uy, -upperZ, normal));
    });
    for (let index = 0; index < base.length; index++) {
      const next = (index + 1) % base.length;
      if (outward > 0) { this.triangle(base[index]!, base[next]!, top[next]!); this.triangle(base[index]!, top[next]!, top[index]!); }
      else { this.triangle(base[index]!, top[next]!, base[next]!); this.triangle(base[index]!, top[index]!, top[next]!); }
    }
  }
  /** Flat face facing the viewer at height z: a fan over the ring, UVs from `uv(x, y)`. */
  fan(ring: Ring, z: number, uv?: (x: number, y: number) => [number, number]) {
    const cx = ring.points.reduce((sum, [x]) => sum + x, 0) / ring.points.length, cy = ring.points.reduce((sum, [, y]) => sum + y, 0) / ring.points.length;
    const centre = this.vertex(cx, cy, -z, [0, 0, -1], uv?.(cx, cy));
    const around = ring.points.map(([x, y]) => this.vertex(x, y, -z, [0, 0, -1], uv?.(x, y)));
    for (let index = 0; index < around.length; index++) this.triangle(centre, around[index]!, around[(index + 1) % around.length]!);
  }
}
const normalise = ([x, y, z]: number[]): [number, number, number] => { const length = Math.hypot(x!, y!, z!) || 1; return [x! / length, y! / length, z! / length]; };

/** Smooth-shaded sides of a rounded frustum: base `r` at z = 0, top inset by `taper` at `height` (negative: behind). */
export function frustum(engine: EngineContext, world: World, name: string, r: Rect, radius: number, height: number, taper: number, flip = false): Mesh {
  const builder = new Builder(world, flip);
  const top = inset(r, taper);
  if (height >= 0) builder.wall(outline(r, radius), 0, outline(top, Math.max(1, radius - taper)), height, 1);
  else builder.wall(outline(top, Math.max(1, radius - taper)), height, outline(r, radius), 0, 1);
  return builder.mesh(engine, name);
}

/** A flat rounded face at `height`; with `extent`, UVs map face-local pixels onto a capture of that size. */
export function cap(engine: EngineContext, world: World, name: string, r: Rect, radius: number, height: number, extent?: { width: number; height: number }, flip = false): Mesh {
  const builder = new Builder(world, flip);
  builder.fan(outline(r, radius), height, extent ? (x, y) => [x / extent.width, y / extent.height] : undefined);
  return builder.mesh(engine, name);
}

/** A rounded bezel ring `band` wide inside `r`, standing `height` above the face, its top inset by `taper`. */
export function band(engine: EngineContext, world: World, name: string, r: Rect, radius: number, width: number, height: number, taper: number, flip = false): Mesh {
  const builder = new Builder(world, flip);
  const outerTop = inset(r, taper), innerTop = inset(r, width - taper), inner = inset(r, width);
  builder.wall(outline(r, radius), 0, outline(outerTop, Math.max(1, radius - taper)), height, 1);
  builder.wall(outline(inner, Math.max(1, radius - width)), 0, outline(innerTop, Math.max(1, radius - width + taper)), height, -1);
  // Flat top between the two top outlines.
  const outer = outline(outerTop, Math.max(1, radius - taper)), innerRing = outline(innerTop, Math.max(1, radius - width + taper));
  const a = outer.points.map(([x, y]) => builder.vertex(x, y, -height, [0, 0, -1]));
  const b = innerRing.points.map(([x, y]) => builder.vertex(x, y, -height, [0, 0, -1]));
  for (let index = 0; index < a.length; index++) {
    const next = (index + 1) % a.length;
    builder.triangle(a[index]!, a[next]!, b[next]!); builder.triangle(a[index]!, b[next]!, b[index]!);
  }
  return builder.mesh(engine, name);
}
