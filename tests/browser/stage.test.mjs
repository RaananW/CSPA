/**
 * Browser suite for core's built-in `stage` material (and environment maps in the `objects` material) on
 * `relief-conformance.html` (`window.conformanceProbe`, from `examples/playground/src/demo/relief-conformance.ts`). It
 * runs the Scene conformance suite of the Strata Rendering Model, version 3 (`packages/ui/conformance/scene-3.json`),
 * against decoded GPU pixels. Stage scenes have no capture: their layer is an empty decorative element, drawn over the
 * page's white. each case's capture is painted as plain DOM in
 * an enrolled layer, the case's scene becomes the layer's material, and every sample inside the layer is compared
 * with the suite's expected colour within its tolerance. It also proves that GPU stays on, that scene changes (states)
 * update pixels without recompiling, and that native hits still reach the layer's own elements.
 *
 * Samples in the shadow outset are compared too: the page behind the frame is white, the backdrop of every light
 * case. Samples where the page shows through and the case's backdrop is not white, or where the capture is
 * transparent inside the box, are skipped, because they show the page rather than the backdrop.
 */
import { test, expect } from "../helpers/current-browser.mjs";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { PNG } from "pngjs";
import { evidenceDirectory } from "../helpers/evidence.mjs";

const evidence = evidenceDirectory("stage");
const suite = JSON.parse(await readFile(new URL("../../packages/ui/conformance/scene-3.json", import.meta.url), "utf8"));

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

test("the stage and objects materials conform to the Strata Rendering Model, version 3, on decoded GPU pixels", async ({ page }) => {
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
      const stage = entry.scene.format === "strata-stage";
      const showsPage = stage ? false : inside ? !opaque(entry.capture, x, y) : entry.scene.backdrop.toLowerCase() !== "#ffffff";
      if (showsPage) { report.push({ case: entry.name, at: sample.at, skipped: "the page shows through" }); continue; }
      const actual = pixel(origin.x + Math.floor(x), origin.y + Math.floor(y)), expected = hex(sample.expect);
      const deviation = Math.max(...actual.map((value, index) => Math.abs(value - expected[index])));
      report.push({ case: entry.name, at: sample.at, note: sample.note, expected: sample.expect, actual, deviation });
      compared++;
    }
  }
  await writeFile(`${evidence}/conformance.json`, JSON.stringify({ tolerance: suite.tolerance, compared, report }, null, 2));
  const failures = report.filter(row => row.deviation > suite.tolerance);
  expect(failures, JSON.stringify(failures, null, 1)).toEqual([]);
  expect(compared).toBe(suite.cases.reduce((total, entry) => total + entry.samples.length, 0));
  expect(errors).toEqual([]);
});

test("a stage layer is decorative: particles move by scene updates with no recompile, GPU stays on and hits pass through", async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/relief-conformance.html");
  await page.waitForFunction(() => window.conformanceProbe && !window.conformanceProbe.state().initializing, null, { timeout: 30000 });
  const origin = await page.evaluate(() => window.conformanceProbe.origin);
  const particles = suite.cases.find(entry => entry.name === "particles");
  const shown = await page.evaluate(entry => window.conformanceProbe.show(entry), particles);
  expect(shown.mode, shown.reason).toBe("gpu");
  const [x, y] = particles.samples[0].at;
  const before = await snap(page, "stage-before");
  expect(before(origin.x + Math.floor(x), origin.y + Math.floor(y))).not.toEqual([255, 255, 255]);
  // Moving every particle is a scene update: the first card leaves its place, with no new pass or registry revision.
  const moved = structuredClone(particles.scene);
  for (const particle of moved.particles) particle.position[1] += 60;
  const revision = await page.evaluate(scene => window.conformanceProbe.update(scene), moved);
  expect(revision).toBe(shown.revision);
  const after = await snap(page, "stage-after");
  expect(after(origin.x + Math.floor(x), origin.y + Math.floor(y))).toEqual([255, 255, 255]);
  // The layer is decorative: inert and aria-hidden, so a point on a drawn particle hits nothing of it.
  const hit = await page.evaluate(({ origin, x, y }) => {
    const frame = document.querySelector("#frame").getBoundingClientRect();
    return document.elementFromPoint(frame.x + origin.x + x, frame.y + origin.y + y + 60)?.closest("#case")?.id ?? null;
  }, { origin, x, y });
  expect(hit).toBeNull();
  const state = await page.evaluate(() => window.conformanceProbe.state());
  expect(state.mode).toBe("gpu");
  expect(state.materials).toEqual([{ id: "case", kind: "stage", particles: 6, backdrop: false }]);
  const disposed = await page.evaluate(() => window.conformanceProbe.dispose());
  expect(Object.values(disposed.runtimeResources).every(value => value === 0)).toBe(true);
  expect(errors).toEqual([]);
});
