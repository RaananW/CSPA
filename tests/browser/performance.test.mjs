import { test, expect } from "@playwright/test";
import { PNG } from "pngjs";
import { mkdir, writeFile } from "node:fs/promises";
import { evidenceDirectory } from "../helpers/evidence.mjs";

const evidence = evidenceDirectory("performance/fixtures");

for (const variant of ["dom-static", "gpu-static", "dom-affine", "gpu-affine", "gpu-ripple"]) {
  test(`wall-clock fixture validates rendering, sampling and cleanup: ${variant}`, async ({ page }) => {
    await page.goto(`/performance.html?layers=8&variant=${variant}`);
    await page.waitForFunction(() => window.measurement);
    const png = PNG.sync.read(await page.locator("#frame").screenshot());
    const offset = (110 * png.width + 80) * 4;
    const pixel = [...png.data.slice(offset, offset + 3)];
    if (variant.endsWith("affine")) {
      expect(pixel[0]).toBeGreaterThanOrEqual(245);
      expect(pixel[1]).toBeGreaterThanOrEqual(196);
      expect(pixel[2]).toBeLessThan(80);
    } else expect(pixel).toEqual([245, 196, 41]);
    await page.getByLabel("Native input", { exact: true }).fill("real");
    await expect(page.getByLabel("Native input", { exact: true })).toHaveValue("real");
    const interval = await page.evaluate(() => window.measurement.collect(500));
    expect(interval.durationMs).toBeGreaterThanOrEqual(500);
    expect(interval.intervals.length).toBeGreaterThan(5);
    expect(interval.samples.every(sample => Number.isFinite(sample.durationMs) && sample.durationMs >= 0)).toBe(true);
    for (const [kind, counter] of [["captureMs", "captures"], ["uploadMs", "uploads"], ["readbackCompareMs", "pixelReadbacks"]]) {
      expect(interval.samples.filter(sample => sample.kind === kind).length).toBe(
        interval.after.metrics[counter] - interval.before.metrics[counter]);
    }
    expect(interval.after.mode).toBe(variant.startsWith("gpu") ? "gpu" : "dom");
    if (variant === "gpu-affine" || variant === "gpu-ripple") {
      expect(interval.after.metrics.gpuFrames - interval.before.metrics.gpuFrames).toBeGreaterThan(5);
      expect(interval.samples.filter(s => s.kind === "frameWorkMs").length).toBe(
        interval.after.metrics.gpuFrames - interval.before.metrics.gpuFrames);
    }
    const retired = await page.evaluate(() => window.measurement.dispose());
    expect(Object.values(retired.resources).every(value => value === 0)).toBe(true);
    expect(Object.values(retired.runtimeResources).every(value => value === 0)).toBe(true);
    await mkdir(evidence, { recursive: true });
    await writeFile(`${evidence}/${variant}.json`, JSON.stringify({ interval, retired }, null, 2));
  });
}
