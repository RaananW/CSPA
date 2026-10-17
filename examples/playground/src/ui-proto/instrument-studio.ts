/**
 * The product studio the Phase I1 Instrument prototypes reflect: an environment generated in code (no asset), encoded
 * as a Radiance `.hdr` panorama for Babylon Lite's `loadHdrEnvironment`. Unlike the Strata Phase 1 studio (mostly dark,
 * for glossy plastic), it is a soft grey sweep, brighter above and dark below, so machined metal reads as metal: flat
 * tops reflect the mid-grey in front of the panel, chamfers and skirts reflect the bright ceiling and key softbox at the
 * upper left (the key light's side, azimuth 323°) and the dark floor at the lower right. Directions are Lite's world
 * axes: x right, y up, z away from the viewer (the panel's front is −z).
 */

type Vec = [number, number, number];
const normalise = ([x, y, z]: Vec): Vec => { const length = Math.hypot(x, y, z) || 1; return [x / length, y / length, z / length]; };
const smoothstep = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** A soft rectangular light: centre direction, half-sizes (radians) along its horizontal and vertical axes, power. */
interface Softbox { centre: Vec; width: number; height: number; power: number }

/** The studio for a key light at `azimuth`, `elevation` (degrees, as the design language defines them). */
export function studioRadiance(azimuth = 323, elevation = 41) {
  const a = (azimuth * Math.PI) / 180, e = (elevation * Math.PI) / 180;
  // Towards the key light in Lite's axes, pulled a little towards the panel plane so chamfers catch it.
  const key = normalise([Math.sin(a) * Math.cos(e), Math.cos(a) * Math.cos(e), -Math.sin(e) * 0.35]);
  const boxes: Softbox[] = [
    { centre: key, width: 0.5, height: 0.4, power: 2.5 },
    { centre: normalise([-key[0], 0.1, -0.7]), width: 0.22, height: 0.45, power: 1.2 }, // fill, opposite side
    { centre: [0, 0.97, -0.24], width: 0.9, height: 0.1, power: 0.7 }, // strip overhead
  ];
  return (direction: Vec): Vec => {
    const [, y, z] = direction;
    // The sweep: dark floor, mid-grey in front, brighter towards the ceiling; behind the panel a little darker.
    let value = 0.04 + 0.28 * smoothstep(-0.55, 0.05, y) + 0.22 * smoothstep(0.1, 0.9, y) - 0.08 * Math.max(0, z);
    for (const box of boxes) {
      const centre = normalise(box.centre);
      const right = normalise([centre[2], 0, -centre[0]]);
      const up: Vec = [centre[1] * right[2] - centre[2] * right[1], centre[2] * right[0] - centre[0] * right[2], centre[0] * right[1] - centre[1] * right[0]];
      const facing = direction[0] * centre[0] + direction[1] * centre[1] + direction[2] * centre[2];
      if (facing <= 0) continue;
      const u = Math.atan2(direction[0] * right[0] + direction[1] * right[1] + direction[2] * right[2], facing);
      const v = Math.atan2(direction[0] * up[0] + direction[1] * up[1] + direction[2] * up[2], facing);
      value += box.power * (1 - smoothstep(box.width * 0.6, box.width, Math.abs(u))) * (1 - smoothstep(box.height * 0.6, box.height, Math.abs(v)));
    }
    return [value * 0.99, value, value * 1.02];
  };
}

function rgbe([r, g, b]: Vec): [number, number, number, number] {
  const max = Math.max(r, g, b);
  if (max < 1e-32) return [0, 0, 0, 0];
  const exponent = Math.ceil(Math.log2(max)), scale = 256 / 2 ** exponent;
  return [Math.min(255, Math.floor(r * scale)), Math.min(255, Math.floor(g * scale)), Math.min(255, Math.floor(b * scale)), exponent + 128];
}

/** The studio as a Radiance `.hdr` file (equirectangular; column 0 is longitude −π, as Lite expects). */
export function instrumentStudioHdr(width = 512, height = 256, azimuth = 323, elevation = 41): Uint8Array {
  const radiance = studioRadiance(azimuth, elevation);
  const bytes: number[] = [...new TextEncoder().encode(`#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y ${height} +X ${width}\n`)];
  const channels = [new Uint8Array(width), new Uint8Array(width), new Uint8Array(width), new Uint8Array(width)];
  for (let row = 0; row < height; row++) {
    const latitude = Math.PI / 2 - ((row + 0.5) / height) * Math.PI;
    for (let column = 0; column < width; column++) {
      const longitude = ((column + 0.5) / width) * 2 * Math.PI - Math.PI;
      rgbe(radiance([Math.cos(latitude) * Math.sin(longitude), Math.sin(latitude), Math.cos(latitude) * Math.cos(longitude)])).forEach((value, channel) => { channels[channel]![column] = value; });
    }
    bytes.push(2, 2, width >> 8, width & 255);
    for (const channel of channels) for (let start = 0; start < width; start += 128) {
      const count = Math.min(128, width - start);
      bytes.push(count, ...channel.subarray(start, start + count));
    }
  }
  return new Uint8Array(bytes);
}
