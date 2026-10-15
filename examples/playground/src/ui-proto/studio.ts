/**
 * A neutral studio environment generated in code, for reflections on glossy, coated and metal Strata materials
 * without shipping an asset: an equirectangular radiance panorama (a soft vertical gradient plus two large
 * softboxes in front of and above the panel, where faces facing the viewer reflect) encoded as a Radiance `.hdr`
 * file and handed to Babylon Lite's `loadHdrEnvironment` through a blob URL.
 */

type Rgb = [number, number, number];

/** Radiance at a unit direction (x right, y up, z away from the viewer). */
function radiance([x, y, z]: Rgb): Rgb {
  // Soft gradient: brighter above, darker below, neutral grey.
  const sky = 0.25 + 0.55 * Math.max(0, y) + 0.2 * Math.max(0, 1 - Math.abs(y));
  let value = sky;
  // Softboxes are towards the viewer (negative z), where a face turned to the camera reflects.
  const box = (cx: number, cy: number, cz: number, size: number, power: number) => {
    const length = Math.hypot(cx, cy, cz);
    const cos = (x * cx + y * cy + z * cz) / length;
    return power * Math.max(0, Math.min(1, (cos - (1 - size)) / (size * 0.35)));
  };
  value += box(-0.5, 0.55, -0.67, 0.18, 5); // key softbox: upper left, in front
  value += box(0.6, 0.2, -0.77, 0.12, 1.6); // fill softbox: right, in front
  value += box(0, 1, 0, 0.25, 1.2); // overhead strip
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

/** The studio panorama as a Radiance `.hdr` file (run-length encoded scanlines with literal runs only). */
export function studioHdr(width = 256, height = 128): Uint8Array {
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
