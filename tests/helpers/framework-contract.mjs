/**
 * The shared browser contract for framework adapters over `@underglass/core`. Each adapter's playground
 * page (`vanilla.html` with plain DOM, `vue.html` with `@underglass/vue`, ...) renders the same small app
 * and exposes it as `window.frameworkProbe`; `frameworkContract` drives it with real pointer and keyboard
 * input and proves the GPU-first contract for that adapter: supported content, structure and transform
 * updates stay GPU-presented with fresh pixels and correct native hits, disable/enable keep the original
 * root and state, and disposal unmounts the framework root and releases every resource.
 *
 * The page app (all coordinates in the 640x420 `#frame`):
 * - layer `panel` at (20,20) 280x220, `rgb(240,30,60)`: `#text`, `#count` ("Count N"), `#name` input,
 *   `#toggle`, and `#swatch` (60x40, 12px from the panel's bottom-right corner) that `#toggle` swaps
 *   between `rgb(20,120,220)` and `rgb(250,200,20)`;
 * - layer `side` at (340,20) 160x100, `rgb(20,200,90)`, with `#side-button` that also increments the count;
 * - `frameworkProbe.addLayer()` / `removeLayer()` add and remove layer `extra` at (520,20) 80x40,
 *   `rgb(38,104,215)`, through the framework's own rendering.
 */
import { expect } from "./current-browser.mjs";
import { mkdir, writeFile } from "node:fs/promises";
import { PNG } from "pngjs";

export const colors = {
  panel: [240, 30, 60, 255], side: [20, 200, 90, 255], extra: [38, 104, 215, 255],
  blue: [20, 120, 220, 255], yellow: [250, 200, 20, 255],
};
// Sample points in frame CSS pixels: empty panel background, swatch centre, side and extra backgrounds.
const points = { panel: { x: 30, y: 230 }, swatch: { x: 258, y: 208 }, side: { x: 490, y: 110 }, extra: { x: 590, y: 50 } };

/**
 * Screenshots `#frame` (saved as `<name>.png` under `directory`) and returns a sampler for frame CSS
 * points, scaled by the screenshot's own pixel ratio so it holds at any DPR.
 */
async function frame(page, directory, name) {
  const png = PNG.sync.read(await page.locator("#frame").screenshot({ path: `${directory}/${name}.png` }));
  const scale = png.width / 640;
  return ({ x, y }) => {
    const offset = (Math.floor(y * scale) * png.width + Math.floor(x * scale)) * 4;
    return [...png.data.subarray(offset, offset + 4)];
  };
}
// Solid colours composite exactly, but allow one unit for rounding in the GPU blend.
function expectColor(actual, expected, label) {
  actual.forEach((value, index) => expect(Math.abs(value - expected[index]), `${label}: ${actual} vs ${expected}`).toBeLessThanOrEqual(1));
}
const state = page => page.evaluate(() => window.frameworkProbe.state());
const settle = page => page.evaluate(() => window.frameworkProbe.controller.settle());
// Frame-relative point to viewport coordinates.
async function viewport(page, point) {
  const box = await page.locator("#frame").boundingBox();
  return { x: box.x + point.x, y: box.y + point.y };
}

/**
 * Runs the whole contract on `path` at device pixel ratio `dpr`, writing screenshots and a JSON report to
 * `directory`. `framework` is the name the page reports in `state().framework`.
 */
export async function frameworkContract(browser, { path, framework, dpr, directory }) {
  await mkdir(directory, { recursive: true });
  const page = await browser.newPage({ viewport: { width: 900, height: 750 }, deviceScaleFactor: dpr });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  const report = { framework, dpr };
  try {
    await page.goto(path);
    await page.waitForFunction(() => window.frameworkProbe);
    const startup = await state(page);
    expect(startup.framework).toBe(framework);
    expect(startup.mode).toBe("dom");
    expect(startup.layers.map(layer => layer.id)).toEqual(["panel", "side"]);
    const dom = await frame(page, directory, `${framework}-${dpr}-dom`);
    expectColor(dom(points.panel), colors.panel, "DOM panel");
    expectColor(dom(points.swatch), colors.blue, "DOM swatch");

    // Explicit admission: GPU must present the same pixels the DOM showed.
    const admission = await page.evaluate(() => window.frameworkProbe.controller.enable());
    expect(admission.mode, admission.reason).toBe("gpu");
    await settle(page);
    const gpu = await frame(page, directory, `${framework}-${dpr}-gpu`);
    for (const key of ["panel", "swatch", "side"]) expect(gpu(points[key]), key).toEqual(dom(points[key]));
    report.admission = await state(page);

    // A framework content update from a trusted click: GPU stays, the canvas uploads and shows fresh pixels.
    const beforeToggle = await state(page);
    await page.locator("#toggle").click();
    await settle(page);
    const toggled = await state(page);
    expect(toggled.mode, toggled.reason).toBe("gpu");
    expect(toggled.swatch).toBe("yellow");
    expect(toggled.metrics.uploads).toBeGreaterThan(beforeToggle.metrics.uploads);
    expectColor((await frame(page, directory, `${framework}-${dpr}-toggled`))(points.swatch), colors.yellow, "GPU swatch after update");

    // Native controls on both layers keep working and the framework state follows.
    await page.locator("#count").click();
    await page.locator("#side-button").click();
    await expect(page.locator("#count")).toHaveText("Count 2");
    await page.locator("#name").click();
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.type(`${framework} native`);
    const typed = await state(page);
    expect(typed.name).toBe(`${framework} native`);
    expect(typed.count).toBe(2);
    expect(typed.mode).toBe("gpu");

    // A transform moves pixels and native hit geometry together: the toggle's translated centre must be
    // the element the browser hits, and a trusted click there must reach it.
    await page.evaluate(() => window.frameworkProbe.controller.setTransform("panel", { x: 30, y: 10 }));
    await settle(page);
    const moved = { x: points.swatch.x + 30, y: points.swatch.y + 10 };
    expectColor((await frame(page, directory, `${framework}-${dpr}-translated`))(moved), colors.yellow, "translated swatch");
    const toggleCentre = await page.locator("#toggle").evaluate(node => {
      const rect = node.getBoundingClientRect();
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    });
    expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.id, toggleCentre)).toBe("toggle");
    await page.mouse.click(toggleCentre.x, toggleCentre.y);
    await settle(page);
    expect((await state(page)).swatch).toBe("blue");
    expectColor((await frame(page, directory, `${framework}-${dpr}-translated-toggled`))(moved), colors.blue, "translated swatch after update");
    // A point inside the untranslated swatch (228..288, 188..228) but left of the translated one no longer
    // hits it.
    const stale = await viewport(page, { x: 240, y: 192 });
    expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.id, stale)).not.toBe("swatch");

    // A structural update through the framework adds and removes a layer without leaving GPU.
    await page.evaluate(() => window.frameworkProbe.addLayer());
    await settle(page);
    const added = await state(page);
    expect(added.mode, added.reason).toBe("gpu");
    expect(added.layers.map(layer => layer.id)).toEqual(["panel", "side", "extra"]);
    expectColor((await frame(page, directory, `${framework}-${dpr}-added`))(points.extra), colors.extra, "added layer");
    await page.evaluate(() => window.frameworkProbe.removeLayer());
    await settle(page);
    const removed = await state(page);
    expect(removed.mode, removed.reason).toBe("gpu");
    expect(removed.layers.map(layer => layer.id)).toEqual(["panel", "side"]);
    // No update since admission needed a new admission attempt.
    expect(removed.metrics.admission.attempts).toBe(report.admission.metrics.admission.attempts);
    report.updates = { toggled, typed, added, removed };

    // Explicit disable returns the same original root and controls with their state; re-enable admits again.
    await page.evaluate(() => window.frameworkProbe.controller.disable());
    const recovered = await state(page);
    expect(recovered.mode).toBe("dom");
    expect(recovered.sameRoot && recovered.sameInput).toBe(true);
    expect(recovered.name).toBe(`${framework} native`);
    expect(recovered.count).toBe(2);
    expect(recovered.mounts).toBe(startup.mounts);
    expect((await page.evaluate(() => window.frameworkProbe.controller.enable())).mode).toBe("gpu");
    await page.locator("#count").click();
    await expect(page.locator("#count")).toHaveText("Count 3");
    await page.evaluate(() => window.frameworkProbe.controller.disable());

    // Disposal unmounts the framework root exactly once and releases every resource.
    const disposed = await page.evaluate(() => window.frameworkProbe.dispose());
    expect(Object.values(disposed.resources).every(value => value === 0), JSON.stringify(disposed.resources)).toBe(true);
    expect(Object.values(disposed.runtimeResources).every(value => value === 0), JSON.stringify(disposed.runtimeResources)).toBe(true);
    expect(disposed.mounts).toBe(1);
    expect(disposed.cleanups).toBe(1);
    expect(errors).toEqual([]);
    report.disposed = disposed;
  } finally {
    report.errors = errors;
    await writeFile(`${directory}/${framework}-dpr${dpr}.json`, JSON.stringify(report, null, 2));
    await page.close();
  }
}
