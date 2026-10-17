/**
 * Extra parametric parts for the Phase I1 prototypes, in the conventions of `ui-probes/instrument-parts.ts` (CSS px,
 * x right, y up, centred on the part's anchor, standing on the face at z = 0 and rising towards the viewer, z = −h).
 * - `prism`: a (y, h) profile extruded along x (a rocker paddle's shallow valley);
 * - `lever`: a tapered shaft with a ball end, revolved about z (a bat toggle).
 * Kept apart from `instrument-parts.ts` so parallel probes can extend that file without conflicts.
 */
import { revolve, type PartData, type ProfilePoint } from "../ui-probes/instrument-parts.ts";

const normalise = (x: number, y: number, z: number): [number, number, number] => { const length = Math.hypot(x, y, z) || 1; return [x / length, y / length, z / length]; };

/**
 * An upright prism: the closed (y, h) `profile` (outline order, first point not repeated) extruded `width` along x and
 * centred on it, with flat-shaded facets and both ends capped. The ends are fanned from the profile's mean point, so the
 * profile must be star-shaped from it. Triangles wind so Lite's double-sided PBR keeps the outward normals.
 */
export function prism(profile: readonly (readonly [y: number, h: number])[], width: number): PartData {
  const data: PartData = { positions: [], normals: [], uvs: [], indices: [] };
  const x = width / 2, count = profile.length;
  const [cy, ch] = profile.reduce((sum, [y, h]) => [sum[0]! + y / count, sum[1]! + h / count], [0, 0]);
  for (let index = 0; index < count; index++) {
    const [y0, h0] = profile[index]!, [y1, h1] = profile[(index + 1) % count]!;
    // Facet normal in the (y, h) plane, pointing away from the profile's mean point.
    let ny = -(h1 - h0), nh = y1 - y0;
    if (ny * ((y0 + y1) / 2 - cy!) + nh * ((h0 + h1) / 2 - ch!) < 0) { ny = -ny; nh = -nh; }
    const [, normalY, normalH] = normalise(0, ny, nh);
    const start = data.positions.length / 3;
    for (const [px, py, ph] of [[-x, y0, h0], [x, y0, h0], [x, y1, h1], [-x, y1, h1]] as const) {
      data.positions.push(px, py, -ph); data.normals.push(0, normalY, -normalH); data.uvs.push(px > 0 ? 1 : 0, (py + 1) / 2);
    }
    data.indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
  }
  for (const side of [-1, 1]) {
    const centre = data.positions.length / 3;
    data.positions.push(side * x, cy!, -ch!); data.normals.push(side, 0, 0); data.uvs.push(0.5, 0.5);
    for (const [y, h] of profile) { data.positions.push(side * x, y, -h); data.normals.push(side, 0, 0); data.uvs.push(0.5, 0.5); }
    for (let index = 0; index < count; index++) data.indices.push(centre, centre + 1 + index, centre + 1 + ((index + 1) % count));
  }
  return data;
}

/** A shaft revolved about z: base radius `base`, neck radius `neck`, ending in a ball of radius `ball` at `length`. */
export function lever(base: number, neck: number, ball: number, length: number, segments = 32): PartData {
  const centre = length - ball, profile: ProfilePoint[] = [[base, 0], [neck, centre - ball * 0.6]];
  for (let step = 0; step <= 8; step++) {
    const angle = -Math.PI / 4 + (step / 8) * ((Math.PI * 3) / 4);
    profile.push([Math.max(0, ball * Math.cos(angle)), centre + ball * Math.sin(angle)]);
  }
  profile[profile.length - 1] = [0, length];
  return revolve(profile, segments);
}
