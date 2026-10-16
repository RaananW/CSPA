/**
 * Browser suite for core's built-in `relief` material on `relief-conformance.html` (`window.conformanceProbe`, from
 * `examples/playground/src/demo/relief-conformance.ts`). It runs the Strata Rendering Model's conformance suite
 * (`packages/ui/conformance/relief-1.json`) against decoded GPU pixels: each case's capture is painted as plain DOM in
 * an enrolled layer, the case's scene becomes the layer's material, and every sample inside the layer is compared
 * with the suite's expected colour within its tolerance. It also proves that GPU stays on, that scene changes (states)
 * update pixels without recompiling, and that native hits still reach the layer's own elements.
 *
 * Samples outside the layer's box (shadows in the outset) wait for the outset (Phase 4 step 3). Samples where the
 * capture is transparent are skipped too, because they show the page behind the layer rather than the backdrop.
 */
import { test, expect } from "../helpers/current-browser.mjs";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { PNG } from "pngjs";
import { evidenceDirectory } from "../helpers/evidence.mjs";

const evidence = evidenceDirectory("relief");
const suite = JSON.parse(await readFile(new URL("../../packages/ui/conformance/relief-1.json", import.meta.url), "utf8"));

/** Whether the case's capture is opaque at a point: inside any painted rounded rectangle, 1.5 px clear of its edge. */
function opaque(capture, x, y) {
  return capture.some(({ rect: [left, top, width, height], radius = 0 }) => {
    const r = Math.min(radius, width / 2, height / 2);
    const qx = Math.abs(x - left - width / 2) - width / 2 + r, qy = Math.abs(y - top - height / 2) - height / 2 + r;
    return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r <= -1.5;
  });
}
/** Settles, screenshots `#frame` and returns a sampler of frame-local device pixels. */
async function snap(page, name) {
  await page.evaluate(() => window.conformanceProbe.settle());
  await mkdir(evidence, { recursive: true });
  const png = PNG.sync.read(await page.locator("#frame").screenshot({ path: `${evidence}/${name}.png` }));
  return (x, y) => [...png.data.subarray((y * png.width + x) * 4, (y * png.width + x) * 4 + 3)];
}
const hex = value => [1, 3, 5].map(index => Number.parseInt(value.slice(index, index + 2), 16));

test("the relief material conforms to the Strata Rendering Model on decoded GPU pixels", async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/relief-conformance.html");
  await page.waitForFunction(() => window.conformanceProbe && !window.conformanceProbe.state().initializing, null, { timeout: 30000 });
  expect(await page.evaluate(() => devicePixelRatio)).toBe(1);
  const origin = await page.evaluate(() => window.conformanceProbe.origin);
  const report = [];
  let compared = 0;
  for (const entry of suite.cases) {
    const shown = await page.evaluate(entry => window.conformanceProbe.show(entry), entry);
    expect(shown.mode, `${entry.name}: ${shown.reason}`).toBe("gpu");
    const pixel = await snap(page, entry.name);
    for (const sample of entry.samples) {
      const [x, y] = sample.at;
      const inside = x >= 0 && y >= 0 && x <= entry.scene.extent.width && y <= entry.scene.extent.height;
      if (!inside || !opaque(entry.capture, x, y)) { report.push({ case: entry.name, at: sample.at, skipped: inside ? "transparent capture" : "outset (step 3)" }); continue; }
      const actual = pixel(origin.x + Math.floor(x), origin.y + Math.floor(y)), expected = hex(sample.expect);
      const deviation = Math.max(...actual.map((value, index) => Math.abs(value - expected[index])));
      report.push({ case: entry.name, at: sample.at, note: sample.note, expected: sample.expect, actual, deviation });
      compared++;
    }
  }
  await writeFile(`${evidence}/conformance.json`, JSON.stringify({ tolerance: suite.tolerance, compared, report }, null, 2));
  const failures = report.filter(row => row.deviation > suite.tolerance);
  expect(failures, JSON.stringify(failures, null, 1)).toEqual([]);
  expect(compared).toBeGreaterThan(40);
  expect(errors).toEqual([]);
});

test("relief scenes update without recompiling, GPU stays on and native hits reach the layer", async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/relief-conformance.html");
  await page.waitForFunction(() => window.conformanceProbe && !window.conformanceProbe.state().initializing, null, { timeout: 30000 });
  const origin = await page.evaluate(() => window.conformanceProbe.origin);
  const focus = suite.cases.find(entry => entry.name === "focus");
  const shown = await page.evaluate(entry => window.conformanceProbe.show(entry), focus);
  expect(shown.mode, shown.reason).toBe("gpu");
  // 2 px outside the focused button: the focus colour.
  const [x, y] = focus.samples[0].at;
  const before = await snap(page, "update-before");
  expect(before(origin.x + Math.floor(x), origin.y + Math.floor(y))).toEqual(hex(focus.scene.focus.colour));
  // Clearing the focus state is a scene update: the edge goes, with no new pass or registry revision.
  const unfocused = structuredClone(focus.scene);
  unfocused.primitives[1].state = {};
  const revision = await page.evaluate(scene => window.conformanceProbe.update(scene), unfocused);
  expect(revision).toBe(shown.revision);
  const after = await snap(page, "update-after");
  expect(after(origin.x + Math.floor(x), origin.y + Math.floor(y))).not.toEqual(hex(focus.scene.focus.colour));
  // The layer's own elements still take native hits under the material.
  const hit = await page.evaluate(({ origin }) => {
    const frame = document.querySelector("#frame").getBoundingClientRect();
    return document.elementFromPoint(frame.x + origin.x + 56, frame.y + origin.y + 32)?.closest("#case")?.id;
  }, { origin });
  expect(hit).toBe("case");
  const state = await page.evaluate(() => window.conformanceProbe.state());
  expect(state.mode).toBe("gpu");
  expect(state.materials).toEqual([{ id: "case", kind: "relief", primitives: 2, interior: { max: 0.04 } }]);
  const disposed = await page.evaluate(() => window.conformanceProbe.dispose());
  expect(Object.values(disposed.runtimeResources).every(value => value === 0)).toBe(true);
  expect(errors).toEqual([]);
});
