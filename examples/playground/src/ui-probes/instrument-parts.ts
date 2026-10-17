/**
 * Parametric part geometry for the Instrument probes (docs/ui-library/instrument.md, Phase I0), generated in code
 * from a few numbers, so one mesh per part kind serves every instance of it.
 *
 * Every part is built in its own local space, in CSS px: x right, y up, centred on the part's anchor, standing on the
 * face at z = 0 and rising towards the viewer, so a point `h` above the face has z = −h (world axes: +z is away from
 * the viewer). Thin-instance matrices then place, turn and slide the parts (see `instrument-harness.ts`).
 * - `revolve`: a lathe from an (r, h) profile, creased at every profile point and smooth around the axis (knob caps,
 *   skirts, collars, lenses);
 * - `frustum`: a rounded rectangle tapered from its base to a top inset by `taper`, with that top closed (key bodies,
 *   fader caps, switch tracks and thumbs, meter windows and segments);
 * - `plate`: a flat rounded face at one height (screen-locked tops that carry the captured page);
 * - `bar`: an upright box (pointer lines, grips).
 * Winding does not matter: the probe's materials are double-sided.
 */
import { createMeshFromData, type EngineContext, type Mesh } from "@babylonjs/lite";

/** Raw mesh arrays, so callers can inspect or merge them before a mesh exists. */
export interface PartData { positions: number[]; normals: number[]; uvs: number[]; indices: number[] }
/** One profile point of a lathe: radius and height above the face, in CSS px. */
export type ProfilePoint = readonly [radius: number, height: number];

const empty = (): PartData => ({ positions: [], normals: [], uvs: [], indices: [] });
const normalise = (x: number, y: number, z: number): [number, number, number] => { const length = Math.hypot(x, y, z) || 1; return [x / length, y / length, z / length]; };

/** Creates the Lite mesh for `data`. */
export function partMesh(engine: EngineContext, name: string, data: PartData): Mesh {
  return createMeshFromData(engine, name, new Float32Array(data.positions), new Float32Array(data.normals), new Uint32Array(data.indices), new Float32Array(data.uvs));
}

/**
 * A lathe around the z axis from `profile`, outermost point first. Each profile segment is its own band (a crease at
 * every point, like a machined chamfer); a last point at radius 0 closes the top.
 */
export function revolve(profile: readonly ProfilePoint[], segments = 48): PartData {
  const data = empty();
  for (let index = 0; index + 1 < profile.length; index++) {
    const [r0, h0] = profile[index]!, [r1, h1] = profile[index + 1]!;
    // The outward normal of the segment in the (r, h) plane: perpendicular to (dr, dh), pointing away from the axis or up.
    let nr = h1 - h0, nh = -(r1 - r0);
    if (nr < 0 || (nr === 0 && nh < 0)) { nr = -nr; nh = -nh; }
    const start = data.positions.length / 3;
    for (let step = 0; step <= segments; step++) {
      const angle = (step / segments) * Math.PI * 2, cos = Math.cos(angle), sin = Math.sin(angle);
      const normal = normalise(nr * cos, nr * sin, -nh);
      data.positions.push(r0 * cos, r0 * sin, -h0, r1 * cos, r1 * sin, -h1);
      data.normals.push(...normal, ...normal);
      data.uvs.push(step / segments, 0, step / segments, 1);
    }
    for (let step = 0; step < segments; step++) {
      const a = start + step * 2, b = a + 1, c = a + 2, d = a + 3;
      data.indices.push(a, c, b, b, c, d);
    }
  }
  return data;
}

/** Points of a rounded rectangle centred on the origin (y up), counter-clockwise, with outward unit normals. */
function outline(width: number, height: number, radius: number, segments = 6) {
  const rad = Math.max(0, Math.min(radius, width / 2, height / 2));
  const hx = width / 2 - rad, hy = height / 2 - rad;
  const corners: [number, number, number][] = [[hx, -hy, -Math.PI / 2], [hx, hy, 0], [-hx, hy, Math.PI / 2], [-hx, -hy, Math.PI]];
  const points: [number, number][] = [], normals: [number, number][] = [];
  for (const [cx, cy, start] of corners) for (let step = 0; step <= segments; step++) {
    const angle = start + (step / segments) * (Math.PI / 2), nx = Math.cos(angle), ny = Math.sin(angle);
    points.push([cx + nx * rad, cy + ny * rad]);
    normals.push([nx, ny]);
  }
  return { points, normals };
}

/** Adds a flat rounded face at `height` (facing the viewer) to `data`; UVs map the face's box onto 0..1. */
function fan(data: PartData, width: number, height: number, radius: number, at: number) {
  const ring = outline(width, height, radius);
  const centre = data.positions.length / 3;
  data.positions.push(0, 0, -at); data.normals.push(0, 0, -1); data.uvs.push(0.5, 0.5);
  for (const [x, y] of ring.points) { data.positions.push(x, y, -at); data.normals.push(0, 0, -1); data.uvs.push(x / width + 0.5, 0.5 - y / height); }
  for (let index = 0; index < ring.points.length; index++) data.indices.push(centre, centre + 1 + index, centre + 1 + ((index + 1) % ring.points.length));
}

/**
 * A rounded rectangle `width` by `height` (radius `radius`) on the face, rising to `rise` with its top inset by `taper`
 * on every side, standing on `base`. The sides are smooth around the outline and tilted by the taper. The top is closed
 * unless `open` (a key body, whose top is the screen-locked captured plate).
 */
export function frustum(width: number, height: number, radius: number, rise: number, taper: number, base = 0, open = false): PartData {
  const data = empty();
  const lower = outline(width, height, radius), upper = outline(width - 2 * taper, height - 2 * taper, Math.max(0.5, radius - taper));
  const start = data.positions.length / 3;
  lower.points.forEach(([x, y], index) => {
    const [nx, ny] = lower.normals[index]!, normal = normalise(nx * rise, ny * rise, -taper);
    const [ux, uy] = upper.points[index]!;
    data.positions.push(x, y, -base, ux, uy, -(base + rise));
    data.normals.push(...normal, ...normal);
    data.uvs.push(index / lower.points.length, 0, index / lower.points.length, 1);
  });
  for (let index = 0; index < lower.points.length; index++) {
    const next = (index + 1) % lower.points.length, a = start + index * 2, b = a + 1, c = start + next * 2, d = c + 1;
    data.indices.push(a, c, b, b, c, d);
  }
  if (!open) fan(data, width - 2 * taper, height - 2 * taper, Math.max(0.5, radius - taper), base + rise);
  return data;
}

/** A flat rounded face `width` by `height` at `height` above the face. */
export function plate(width: number, height: number, radius: number, at: number): PartData {
  const data = empty();
  fan(data, width, height, radius, at);
  return data;
}

/** An upright box `width` by `length` (y), from `base` to `top` above the face, with flat-shaded sides and top. */
export function bar(width: number, length: number, base: number, top: number): PartData {
  const data = empty();
  const x = width / 2, y = length / 2;
  // Top, then the four sides, each with its own normal.
  const faces: [number, number, number, number[][]][] = [
    [0, 0, -1, [[-x, -y, top], [x, -y, top], [x, y, top], [-x, y, top]]],
    [0, -1, 0, [[-x, -y, base], [x, -y, base], [x, -y, top], [-x, -y, top]]],
    [1, 0, 0, [[x, -y, base], [x, y, base], [x, y, top], [x, -y, top]]],
    [0, 1, 0, [[x, y, base], [-x, y, base], [-x, y, top], [x, y, top]]],
    [-1, 0, 0, [[-x, y, base], [-x, -y, base], [-x, -y, top], [-x, y, top]]],
  ];
  for (const [nx, ny, nz, corners] of faces) {
    const start = data.positions.length / 3;
    for (const [px, py, h] of corners) { data.positions.push(px!, py!, -h!); data.normals.push(nx, ny, nz); data.uvs.push(0, 0); }
    data.indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
  }
  return data;
}
