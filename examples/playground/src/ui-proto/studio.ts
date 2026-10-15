/**
 * A neutral studio environment generated in code, for reflections on glossy, coated and metal Strata materials
 * without shipping an asset. Like a photo studio it is mostly dark, so glossy surfaces show contrast, with three
 * soft rectangular softboxes in front of the panel (where surfaces facing the viewer reflect): a key at the upper
 * left, matching the default key light, a fill at the right and a long strip overhead. The panorama is encoded as a
 * Radiance `.hdr` file and handed to Babylon Lite's `loadHdrEnvironment` through a blob URL. Directions use Lite's
 * world axes (x right, y up, z away from the viewer); `ui-proto-env-check.html` shows the result on mirror balls.
 */

type Rgb = [number, number, number];

/** A soft rectangular light: centre direction, half-sizes in radians along its local right and up axes, and power. */
interface Softbox { centre: Rgb; width: number; height: number; power: number }
const softboxes: Softbox[] = [
  { centre: [-0.55, 0.5, -0.67], width: 0.32, height: 0.22, power: 3.2 }, // key: upper left, in front
  { centre: [0.7, 0.05, -0.71], width: 0.16, height: 0.3, power: 1.1 }, // fill: right, in front
  { centre: [0, 0.92, -0.38], width: 0.6, height: 0.08, power: 1.6 }, // strip: overhead, slightly in front
];

const normalise = ([x, y, z]: Rgb): Rgb => { const length = Math.hypot(x, y, z); return [x / length, y / length, z / length]; };
const smooth = (edge: number, value: number) => { const t = Math.min(1, Math.max(0, (edge - value) / (edge * 0.35))); return t * t * (3 - 2 * t); };

/** Radiance at a unit direction. */
function radiance(direction: Rgb): Rgb {
  const [, y] = direction;
  // Dark studio: a little brighter towards the ceiling, darkest at the floor.
  let value = 0.05 + 0.07 * Math.max(0, y) - 0.03 * Math.max(0, -y);
  for (const box of softboxes) {
    const centre = normalise(box.centre);
    // Local axes: right is horizontal and perpendicular to the centre direction, up completes the frame.
    const right = normalise([centre[2], 0, -centre[0]]);
    const up: Rgb = [centre[1] * right[2] - centre[2] * right[1], centre[2] * right[0] - centre[0] * right[2], centre[0] * right[1] - centre[1] * right[0]];
    const facing = direction[0] * centre[0] + direction[1] * centre[1] + direction[2] * centre[2];
    if (facing <= 0) continue;
    const u = Math.atan2(direction[0] * right[0] + direction[1] * right[1] + direction[2] * right[2], facing);
    const v = Math.atan2(direction[0] * up[0] + direction[1] * up[1] + direction[2] * up[2], facing);
    value += box.power * smooth(box.width, Math.abs(u)) * smooth(box.height, Math.abs(v));
  }
  return [value, value, value * 1.02];
}

/** RGBE bytes for one linear colour (Radiance shared-exponent format). */
function rgbe([r, g, b]: Rgb): [number, number, number, number] {
  const max = Math.max(r, g, b);
  if (max < 1e-32) return [0, 0, 0, 0];
  const exponent = Math.ceil(Math.log2(max));
  const scale = 256 / 2 ** exponent;
  return [Math.min(255, Math.floor(r * scale)), Math.min(255, Math.floor(g * scale)), Math.min(255, Math.floor(b * scale)), exponent + 128];
}

/**
 * The studio panorama as a Radiance `.hdr` file (run-length encoded scanlines with literal runs only). Column 0 is
 * longitude −π, matching Lite's equirectangular convention (checked on the mirror balls in ui-proto-env-check.html).
 */
export function studioHdr(width = 512, height = 256): Uint8Array {
  const header = new TextEncoder().encode(`#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y ${height} +X ${width}\n`);
  const bytes: number[] = [...header];
  const channels = [new Uint8Array(width), new Uint8Array(width), new Uint8Array(width), new Uint8Array(width)];
  for (let row = 0; row < height; row++) {
    const latitude = Math.PI / 2 - (row + 0.5) / height * Math.PI;
    for (let column = 0; column < width; column++) {
      const longitude = (column + 0.5) / width * 2 * Math.PI - Math.PI;
      const direction: Rgb = [Math.cos(latitude) * Math.sin(longitude), Math.sin(latitude), Math.cos(latitude) * Math.cos(longitude)];
      rgbe(radiance(direction)).forEach((value, channel) => { channels[channel]![column] = value; });
    }
    bytes.push(2, 2, width >> 8, width & 255);
    for (const channel of channels) for (let start = 0; start < width; start += 128) {
      const count = Math.min(128, width - start);
      bytes.push(count, ...channel.subarray(start, start + count));
    }
  }
  return new Uint8Array(bytes);
}

/** A blob URL for the studio panorama; revoke it once the environment has loaded. */
export function studioUrl(): string {
  return URL.createObjectURL(new Blob([studioHdr() as BlobPart], { type: "application/octet-stream" }));
}
