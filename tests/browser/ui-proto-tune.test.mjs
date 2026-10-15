/**
 * Smoke test for the Strata tuning page (`ui-proto-tune.html`, `window.strataTuning`): both GPU panels start, a
 * depth change redraws the Relief and Objects panels with fresh pixels, the dark theme reaches all three
 * presentations, settings round-trip through the URL hash, and real input still reaches the native controls in
 * every panel. Screenshots go to the `ui-probes` evidence directory.
 */
import { test, expect } from "../helpers/current-browser.mjs";
import { evidenceDirectory } from "../helpers/evidence.mjs";
import { PNG } from "pngjs";

const directory = evidenceDirectory("ui-probes");
const difference = (a, b) => { let changed = 0; for (let i = 0; i < a.data.length; i += 4) if (Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2]) > 24) changed++; return changed / (a.data.length / 4); };

test("Strata tuning redraws every presentation from the settings and keeps native input", async ({ browser }) => {
  test.setTimeout(120000);
  const context = await browser.newContext({ viewport: { width: 1420, height: 760 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.goto("/ui-proto-tune.html");
  await page.waitForFunction(() => window.strataTuning);
  expect(await page.evaluate(() => window.strataTuning.ready)).toEqual({ failed: 0 });
  const shot = async name => PNG.sync.read(await page.locator(`.${name} .stage`).screenshot());
  await page.waitForTimeout(600);
  const medium = { relief: await shot("relief"), objects: await shot("objects"), css: await shot("css") };

  await page.evaluate(() => window.strataTuning.set({ depth: 0 }));
  await page.waitForTimeout(800);
  const subtle = { relief: await shot("relief"), objects: await shot("objects"), css: await shot("css") };
  for (const name of ["relief", "objects", "css"]) expect(difference(medium[name], subtle[name]), `${name} redraws for depth 0`).toBeGreaterThan(0.01);
  expect(page.url()).toContain("depth=0");

  // A light change re-lights the objects in place: the stage around the panel keeps its colour (no black clear).
  for (const azimuth of [200, 90]) {
    await page.evaluate(value => window.strataTuning.set({ azimuth: value }), azimuth);
    await page.waitForTimeout(600);
    const png = await shot("objects");
    expect([...png.data.subarray(0, 3)], `objects stage colour after light from ${azimuth}°`).toEqual([255, 255, 255]);
  }

  await page.evaluate(() => window.strataTuning.set({ depth: 0.45, theme: "dark" }));
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${directory}/proto-tune-dark.png`, fullPage: true });
  for (const name of ["relief", "objects", "css"]) {
    const png = await shot(name);
    // The stage corner shows the dark stage colour.
    expect(png.data[0] + png.data[1] + png.data[2], `${name} uses the dark theme`).toBeLessThan(120);
  }

  for (const name of ["relief", "objects", "css"]) {
    const toggle = page.locator(`#notify-${name}`);
    const before = await toggle.isChecked();
    const box = await toggle.evaluate(element => { const r = element.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await page.mouse.click(box.x, box.y);
    expect(await toggle.isChecked(), `${name}: switch toggles`).toBe(!before);
    const field = await page.locator(`#name-${name}`).evaluate(element => { const r = element.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await page.mouse.click(field.x, field.y);
    await page.keyboard.press("End");
    await page.keyboard.type("!");
    expect(await page.inputValue(`#name-${name}`), `${name}: field edits`).toBe("Ada Lovelace!");
  }

  // Settings round-trip through the hash.
  const url = page.url();
  const second = await context.newPage();
  await second.goto(url);
  await second.waitForFunction(() => window.strataTuning);
  expect(await second.evaluate(() => window.strataTuning.config())).toMatchObject({ depth: 0.45, theme: "dark" });
  await context.close();
});
