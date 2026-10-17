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

// Builders added for probe I0.2 (moving parts): spheres, merged parts and parts tipped about an in-plane axis.

/** A smooth sphere of `radius` whose centre stands `centre` above the face (a bat lever's ball, a lens). */
export function sphere(radius: number, centre: number, rings = 12, segments = 24): PartData {
  const data = empty();
  for (let ring = 0; ring <= rings; ring++) {
    const polar = (ring / rings) * Math.PI, z = Math.cos(polar), ringRadius = Math.sin(polar);
    for (let step = 0; step <= segments; step++) {
      const angle = (step / segments) * Math.PI * 2, nx = ringRadius * Math.cos(angle), ny = ringRadius * Math.sin(angle);
      // Polar angle 0 is the top (towards the viewer, z = −h).
      data.positions.push(radius * nx, radius * ny, -(centre + radius * z));
      data.normals.push(nx, ny, -z);
      data.uvs.push(step / segments, ring / rings);
    }
  }
  for (let ring = 0; ring < rings; ring++) for (let step = 0; step < segments; step++) {
    const a = ring * (segments + 1) + step, b = a + segments + 1;
    data.indices.push(a, b, a + 1, a + 1, b, b + 1);
  }
  return data;
}

/** One part made of several, so a compound moving part (a rocker's two plates) is one mesh and one pose. */
export function merge(...parts: PartData[]): PartData {
  const data = empty();
  for (const part of parts) {
    const start = data.positions.length / 3;
    data.positions.push(...part.positions); data.normals.push(...part.normals); data.uvs.push(...part.uvs);
    data.indices.push(...part.indices.map(index => index + start));
  }
  return data;
}

/** `data` moved by `dx`, `dy` in the face plane and `dh` towards the viewer. */
export function offset(data: PartData, dx: number, dy: number, dh = 0): PartData {
  return { ...data, positions: data.positions.map((value, index) => value + [dx, dy, -dh][index % 3]!) };
}

/**
 * `data` tipped by `angle` (radians) about the line parallel to the x axis through `y = pivotY` at `pivotHeight` above
 * the face. A positive angle tips the part's top (towards the viewer) towards +y, so a point on +y sinks into the face.
 */
export function turnX(data: PartData, angle: number, pivotHeight: number, pivotY = 0): PartData {
  const c = Math.cos(angle), s = Math.sin(angle), positions: number[] = [], normals: number[] = [];
  for (let index = 0; index < data.positions.length; index += 3) {
    const x = data.positions[index]!, y = data.positions[index + 1]! - pivotY, z = data.positions[index + 2]! + pivotHeight;
    positions.push(x, c * y - s * z + pivotY, s * y + c * z - pivotHeight);
    const ny = data.normals[index + 1]!, nz = data.normals[index + 2]!;
    normals.push(data.normals[index]!, c * ny - s * nz, s * ny + c * nz);
  }
  return { ...data, positions, normals };
}

/** One profile point of a smooth lathe: radius and height above the face, with the outward normal in the (r, h) plane. */
export type SmoothProfilePoint = readonly [radius: number, height: number, normalR: number, normalH: number];

/**
 * A lathe around the z axis from `profile` (outermost point first) with a normal per profile point, shared by the
 * bands on either side of it, so the surface is smooth across the profile as well as around the axis (domes, lenses,
 * filleted caps). UVs: u around the axis, v along the profile, so a tangent frame from them runs around the part.
 */
export function revolveSmooth(profile: readonly SmoothProfilePoint[], segments = 64): PartData {
  const data = empty();
  for (let index = 0; index < profile.length; index++) {
    const [r, h, nr, nh] = profile[index]!;
    for (let step = 0; step <= segments; step++) {
      const angle = (step / segments) * Math.PI * 2, cos = Math.cos(angle), sin = Math.sin(angle);
      data.positions.push(r * cos, r * sin, -h);
      data.normals.push(...normalise(nr * cos, nr * sin, -nh));
      data.uvs.push(step / segments, index / Math.max(1, profile.length - 1));
    }
  }
  for (let index = 0; index + 1 < profile.length; index++) for (let step = 0; step < segments; step++) {
    const a = index * (segments + 1) + step, b = a + segments + 1;
    data.indices.push(a, a + 1, b, b, a + 1, b + 1);
  }
  return data;
}

/**
 * Points of a superellipse dome `|r / radius|^p + |h / height|^p = 1` standing on `base`, from its rim to its apex, with
 * analytic normals: `p = 2` is an ellipse (a lens), larger `p` gives steeper sides and a flatter top (a chrome button).
 */
export function superellipseProfile(radius: number, height: number, p: number, steps = 24, base = 0): SmoothProfilePoint[] {
  const points: SmoothProfilePoint[] = [];
  for (let index = 0; index <= steps; index++) {
    // Parameterised by angle so the samples crowd where the curvature is: |cos|^(2/p), |sin|^(2/p).
    const t = (index / steps) * (Math.PI / 2), c = Math.cos(t), s = Math.sin(t);
    const r = radius * Math.pow(c, 2 / p), h = height * Math.pow(s, 2 / p);
    // Gradient of the implicit function: (p / radius) (r / radius)^(p − 1), (p / height) (h / height)^(p − 1).
    const nr = Math.pow(Math.max(r / radius, 0), p - 1) / radius, nh = Math.pow(Math.max(h / height, 0), p - 1) / height;
    points.push([r, base + h, index === steps ? 0 : nr, index === 0 ? 0 : nh || 1e-6]);
  }
  return points;
}

/**
 * A rounded-rectangle frame (a bezel): the outer side rises from the control's box (`width` by `height`, radius `radius`)
 * to `rise`, tapered in by `taper`; a flat top band runs inwards to a window chamfer that drops by `chamfer` px of
 * inset to the window opening, `border` px inside the box, at `floor` above the face. UVs on the top band map x and y
 * across the frame's box, so a tangent frame from them runs along x (linear brushing).
 */
export function frame(width: number, height: number, radius: number, rise: number, taper: number, border: number, chamfer: number, floor = 0): PartData {
  const data = empty();
  const rings = [
    { inset: 0, h: 0 }, { inset: taper, h: rise }, { inset: border - chamfer, h: rise }, { inset: border, h: floor },
  ].map(({ inset, h }) => ({ h, ...outline(width - 2 * inset, height - 2 * inset, Math.max(0.5, radius - inset)) }));
  const count = rings[0]!.points.length;
  // Three bands, each with its own vertices: outer side, top, window chamfer.
  for (let band = 0; band < 3; band++) {
    const lower = rings[band]!, upper = rings[band + 1]!, start = data.positions.length / 3;
    for (let index = 0; index < count; index++) {
      const [x0, y0] = lower.points[index]!, [x1, y1] = upper.points[index]!, [nx, ny] = lower.normals[index]!;
      const dh = upper.h - lower.h, dr = Math.hypot(x1 - x0, y1 - y0);
      // Outer side faces out and up; the top faces the viewer; the chamfer faces the window and up.
      const normal = band === 1 ? normalise(0, 0, -1) : normalise(nx * dh, ny * dh, -dr);
      data.positions.push(x0, y0, -lower.h, x1, y1, -upper.h);
      data.normals.push(...normal, ...normal);
      data.uvs.push(x0 / width + 0.5, 0.5 - y0 / height, x1 / width + 0.5, 0.5 - y1 / height);
    }
    for (let index = 0; index < count; index++) {
      const next = (index + 1) % count, a = start + index * 2, b = a + 1, c = start + next * 2, d = c + 1;
      data.indices.push(a, c, b, b, c, d);
    }
  }
  return data;
}
