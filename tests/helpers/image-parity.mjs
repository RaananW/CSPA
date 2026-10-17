/**
 * Image comparison for the parity probes: luminance crops of decoded PNGs, the P0.6 metric (mean and 95th percentile
 * absolute difference in 8-bit luminance levels) and a structural measure (SSIM on luminance, 8 by 8 windows at stride
 * 4). No dependency beyond pngjs, which the tests already use.
 */
import { PNG } from "pngjs";

/** Rec. 709 luma of 8-bit sRGB values, as P0.6 used (no linearisation). */
export const luma = (data, index) => 0.2126 * data[index] + 0.7152 * data[index + 1] + 0.0722 * data[index + 2];

/** A crop of a decoded PNG: `{ width, height, rgba, lum }`. The window is clamped to the image. */
export function crop(png, x0, y0, x1, y1) {
  x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(png.width, x1); y1 = Math.min(png.height, y1);
  const width = x1 - x0, height = y1 - y0, rgba = Buffer.alloc(width * height * 4), lum = new Float32Array(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const source = ((y0 + y) * png.width + x0 + x) * 4, target = (y * width + x) * 4;
    png.data.copy(rgba, target, source, source + 4);
    lum[y * width + x] = luma(png.data, source);
  }
  return { width, height, rgba, lum };
}

/** Mean, 95th percentile and maximum absolute luminance difference of two same-size crops. */
export function lumaDifference(a, b) {
  if (a.width !== b.width || a.height !== b.height) throw new Error(`Crop sizes differ: ${a.width}x${a.height} against ${b.width}x${b.height}`);
  const differences = new Float64Array(a.lum.length);
  let sum = 0;
  for (let index = 0; index < differences.length; index++) { differences[index] = Math.abs(a.lum[index] - b.lum[index]); sum += differences[index]; }
  const sorted = Float64Array.from(differences).sort();
  return { mean: sum / sorted.length, p95: sorted[Math.floor(sorted.length * 0.95)] ?? 0, max: sorted[sorted.length - 1] ?? 0 };
}

/** Mean SSIM of two same-size luminance crops (1 = identical structure). */
export function ssim(a, b, window = 8, stride = 4) {
  const c1 = (0.01 * 255) ** 2, c2 = (0.03 * 255) ** 2, { width, height } = a;
  if (width < window || height < window) return 1;
  let total = 0, count = 0;
  for (let y = 0; y + window <= height; y += stride) for (let x = 0; x + window <= width; x += stride) {
    let sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0;
    for (let j = 0; j < window; j++) for (let i = 0; i < window; i++) {
      const va = a.lum[(y + j) * width + x + i], vb = b.lum[(y + j) * width + x + i];
      sa += va; sb += vb; saa += va * va; sbb += vb * vb; sab += va * vb;
    }
    const n = window * window, ma = sa / n, mb = sb / n, va = saa / n - ma * ma, vb = sbb / n - mb * mb, cov = sab / n - ma * mb;
    total += ((2 * ma * mb + c1) * (2 * cov + c2)) / ((ma * ma + mb * mb + c1) * (va + vb + c2));
    count++;
  }
  return total / count;
}

/** `{ mean, p95, max, ssim }` of two crops. */
export const compare = (a, b) => ({ ...lumaDifference(a, b), ssim: ssim(a, b) });

/** Crops side by side with a gap, plus a heat map of the first against the second: the review image. */
export function strip(crops, gap = 6) {
  const height = Math.max(...crops.map(item => item.height)), width = crops.reduce((sum, item) => sum + item.width, 0) + gap * (crops.length - 1);
  const png = new PNG({ width, height });
  png.data.fill(255);
  let left = 0;
  for (const item of crops) {
    for (let y = 0; y < item.height; y++) item.rgba.copy(png.data, (y * width + left) * 4, y * item.width * 4, (y + 1) * item.width * 4);
    left += item.width + gap;
  }
  return PNG.sync.write(png);
}

/** A heat map (white to red, ×4) of the luminance difference of two same-size crops. */
export function heat(a, b) {
  const rgba = Buffer.alloc(a.width * a.height * 4), lum = new Float32Array(a.width * a.height);
  for (let index = 0; index < lum.length; index++) {
    const level = Math.min(255, Math.abs(a.lum[index] - b.lum[index]) * 4);
    rgba.set([255, 255 - level, 255 - level, 255], index * 4);
  }
  return { width: a.width, height: a.height, rgba, lum };
}
