/**
 * Browser suite for core's built-in `objects` material on `relief-conformance.html` (`window.conformanceProbe`, from
 * `examples/playground/src/demo/relief-conformance.ts`). It runs the Objects conformance suite of the Strata Rendering
 * Model, version 2 (`packages/ui/conformance/objects-2.json`), against decoded GPU pixels: each case's capture is painted as plain DOM in
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

const evidence = evidenceDirectory("objects");
const suite = JSON.parse(await readFile(new URL("../../packages/ui/conformance/objects-2.json", import.meta.url), "utf8"));

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

test("the objects material conforms to the Strata Rendering Model, version 2, on decoded GPU pixels", async ({ page }) => {
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
      const showsPage = inside ? !opaque(entry.capture, x, y) : entry.scene.backdrop.toLowerCase() !== "#ffffff";
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

test("objects update without recompiling, GPU stays on, Relief equivalents are reported and native hits reach the layer", async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/relief-conformance.html");
  await page.waitForFunction(() => window.conformanceProbe && !window.conformanceProbe.state().initializing, null, { timeout: 30000 });
  const origin = await page.evaluate(() => window.conformanceProbe.origin);
  const keys = suite.cases.find(entry => entry.name === "key-states");
  const shown = await page.evaluate(entry => window.conformanceProbe.show(entry), keys);
  expect(shown.mode, shown.reason).toBe("gpu");
  // The rest key's right side, facing away from the vanishing point; pressing it sinks the cap, so the side lightens.
  const [x, y] = keys.samples[2].at;
  const before = await snap(page, "update-before");
  const pressed = structuredClone(keys.scene);
  pressed.primitives[1].state = { pressed: true };
  const revision = await page.evaluate(scene => window.conformanceProbe.update(scene), pressed);
  expect(revision).toBe(shown.revision);
  const after = await snap(page, "update-after");
  const side = [origin.x + Math.floor(x), origin.y + Math.floor(y)];
  expect(after(...side)).not.toEqual(before(...side));
  // The cap keeps the captured pixels in place (screen-locked): only the interior factor changes it.
  const cap = [origin.x + 48, origin.y + 40];
  expect(Math.abs(after(...cap)[0] - before(...cap)[0])).toBeLessThan(16);
  // Native hits reach the layer's own elements through the keys; the outset never hits.
  const hit = await page.evaluate(({ origin }) => {
    const frame = document.querySelector("#frame").getBoundingClientRect();
    return document.elementFromPoint(frame.x + origin.x + 48, frame.y + origin.y + 40)?.closest("#case")?.id;
  }, { origin });
  expect(hit).toBe("case");
  const state = await page.evaluate(() => window.conformanceProbe.state());
  expect(state.mode).toBe("gpu");
  expect(state.materials).toEqual([{ id: "case", kind: "objects", primitives: 5, interior: { max: 0.04 }, degraded: [] }]);
  // Objects that would leave their control are drawn at the Relief level, and reported.
  const fallback = suite.cases.find(entry => entry.name === "relief-equivalents");
  await page.evaluate(entry => window.conformanceProbe.show(entry), fallback);
  const reported = await page.evaluate(() => window.conformanceProbe.state().materials[0].degraded);
  expect(reported).toEqual([
    { index: 1, object: "knob", reason: "its projection leaves its bounds" },
    { index: 2, object: "key", reason: "its taper is less than its perspective drift" },
  ]);
  const disposed = await page.evaluate(() => window.conformanceProbe.dispose());
  expect(Object.values(disposed.runtimeResources).every(value => value === 0)).toBe(true);
  expect(errors).toEqual([]);
});
