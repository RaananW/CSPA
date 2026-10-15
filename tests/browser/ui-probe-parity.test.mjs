/**
 * Strata Phase 0 probe P0.6 (see docs/ui-library/plan.md): how close the CSS presentation (`ui-probe-parity.html`)
 * gets to the GPU relief (`ui-probe-relief.html`) when both come from the same tokens. For each state (rest,
 * hover, press, keyboard focus), driven by real input on both pages, the test compares the two 640 by 420 stages
 * pixel by pixel in luminance. It reports the mean and 95th percentile difference for the whole stage and for
 * its regions (cast shadows, bevel edges, face interiors), writes difference images, and holds the result to the
 * parity budget recorded in docs/ui-library/phase0.md. Reports go to the `ui-probes` evidence directory.
 */
import { test, expect } from "../helpers/current-browser.mjs";
import { evidenceDirectory } from "../helpers/evidence.mjs";
import { mkdir, writeFile } from "node:fs/promises";
import { PNG } from "pngjs";

const directory = evidenceDirectory("ui-probes");
// Parity budget per state, in 8-bit luminance levels (see the P0.6 section of docs/ui-library/phase0.md).
const budget = { mean: 2, p95: 10 };
const luminance = (data, index) => 0.2126 * data[index] + 0.7152 * data[index + 1] + 0.0722 * data[index + 2];

/** Drives one state with real input; `setup` gets the page and the client centre of an element by id. */
const states = {
  rest: async () => {},
  hover: async (page, centre) => { const point = await centre("save"); await page.mouse.move(point.x, point.y); },
  press: async (page, centre) => { const point = await centre("save"); await page.mouse.move(point.x, point.y); await page.mouse.down(); },
  focus: async page => { for (let tries = 0; tries < 6 && await page.evaluate(() => document.activeElement?.id) !== "name"; tries++) await page.keyboard.press("Tab"); },
};

async function capture(browser, path, dpr, state) {
  const context = await browser.newContext({ viewport: { width: 900, height: 750 }, deviceScaleFactor: dpr, reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto(path);
  if (path.includes("relief")) {
    await page.waitForFunction(() => window.reliefProbe);
    await page.evaluate(() => window.reliefProbe.ready);
  } else await page.waitForFunction(() => window.parityProbe);
  await page.mouse.move(5, 5);
  const centre = async id => page.locator(`#${id}`).evaluate(element => { const box = element.getBoundingClientRect(); return { x: box.left + box.width / 2, y: box.top + box.height / 2 }; });
  // In the GPU page the controls live inside the canvas; their DOM boxes are where the canvas transform puts them.
  await states[state](page, centre);
  if (path.includes("relief")) await page.evaluate(async () => { const probe = await window.reliefProbe.ready; await probe.settle(); });
  await page.waitForTimeout(150);
  const regions = await page.evaluate(() => {
    const stage = document.getElementById("stage").getBoundingClientRect();
    const local = element => { const box = element.getBoundingClientRect(); return { x: box.left - stage.left, y: box.top - stage.top, width: box.width, height: box.height }; };
    return { face: local(document.getElementById("face")), controls: [...document.querySelectorAll("[data-relief]")].map(local) };
  });
  const png = PNG.sync.read(await page.locator("#stage").screenshot({ path: `${directory}/parity-${path.includes("relief") ? "gpu" : "css"}-${state}-dpr${dpr}.png` }));
  await context.close();
  return { png, regions };
}

for (const dpr of [1, 2]) test(`P0.6 CSS relief stays within the parity budget of the GPU relief DPR${dpr}`, async ({ browser }) => {
  test.setTimeout(120000);
  await mkdir(directory, { recursive: true });
  const report = { dpr, budget, states: {} };
  try {
    for (const state of Object.keys(states)) {
      const gpu = await capture(browser, "/ui-probe-relief.html", dpr, state);
      const css = await capture(browser, "/ui-probe-parity.html", dpr, state);
      expect(gpu.png.width).toBe(css.png.width);
      const { width, height } = gpu.png;
      // Regions in CSS pixels (same layout on both pages): bevel bands, cast-shadow bands and face interiors.
      const { face, controls } = gpu.regions;
      const shapes = [face, ...controls];
      const inBox = (x, y, box, grow) => x >= box.x - grow && x < box.x + box.width + grow && y >= box.y - grow && y < box.y + box.height + grow;
      const region = (x, y) => {
        if (shapes.some(box => inBox(x, y, box, 0) && !inBox(x, y, box, -8))) return "bevel";
        if (controls.some(box => inBox(x, y, box, -8))) return "interior";
        if (!inBox(x, y, face, 0)) return inBox(x, y, face, 40) ? "panelShadow" : "background";
        return controls.some(box => inBox(x, y, box, 12)) ? "controlShadow" : "face";
      };
      const differences = { all: [] };
      const heat = new PNG({ width, height });
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const index = (y * width + x) * 4;
        const difference = Math.abs(luminance(gpu.png.data, index) - luminance(css.png.data, index));
        const name = region(x / dpr, y / dpr);
        (differences[name] ??= []).push(difference);
        differences.all.push(difference);
        const level = Math.min(255, difference * 4);
        heat.data.set([255, 255 - level, 255 - level, 255], index);
      }
      await writeFile(`${directory}/parity-difference-${state}-dpr${dpr}.png`, PNG.sync.write(heat));
      const summary = values => { const sorted = Float64Array.from(values).sort(); return { pixels: sorted.length, mean: +(sorted.reduce((sum, v) => sum + v, 0) / sorted.length).toFixed(2), p95: +sorted[Math.floor(sorted.length * 0.95)].toFixed(2), max: +sorted[sorted.length - 1].toFixed(2) }; };
      report.states[state] = Object.fromEntries(Object.entries(differences).map(([name, values]) => [name, summary(values)]));
    }
  } finally {
    await writeFile(`${directory}/parity-dpr${dpr}.json`, JSON.stringify(report, null, 2));
  }
  for (const [state, regions] of Object.entries(report.states)) {
    expect(regions.all.mean, `${state}: mean luminance difference`).toBeLessThanOrEqual(budget.mean);
    expect(regions.all.p95, `${state}: 95th percentile luminance difference`).toBeLessThanOrEqual(budget.p95);
  }
});
