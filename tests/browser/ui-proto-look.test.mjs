/**
 * Smoke test for the Strata Phase 1 look prototypes (`ui-proto-look.html`, `window.lookPrototypes`): all six GPU
 * panels (Relief and Objects for three looks) start and draw, and in all nine panels, including the three CSS-only
 * ones, real input reaches the native controls: a click on Save hits Save, a click on the switch toggles its
 * checkbox, and typing edits the field. Screenshots go to the `ui-probes` evidence directory.
 */
import { test, expect } from "../helpers/current-browser.mjs";
import { evidenceDirectory } from "../helpers/evidence.mjs";
import { PNG } from "pngjs";

const directory = evidenceDirectory("ui-probes");

test("Strata look prototypes draw every GPU panel and keep native input in all nine", async ({ browser }) => {
  test.setTimeout(120000);
  const context = await browser.newContext({ viewport: { width: 1520, height: 1150 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.goto("/ui-proto-look.html");
  await page.waitForFunction(() => window.lookPrototypes);
  expect(await page.evaluate(() => window.lookPrototypes.ready)).toEqual({ failed: 0 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${directory}/proto-look.png`, fullPage: true });

  for (const mode of ["relief", "objects", "css"]) for (const index of [0, 1, 2]) {
    const suffix = `-${mode}-${index}`, name = `${mode} look ${index}`;
    const cell = page.locator(`.${mode}.look-${index}`);
    if (mode !== "css") {
      // The GPU drew a panel: the canvas is not blank.
      const png = PNG.sync.read(await cell.locator("canvas").screenshot());
      const colours = new Set();
      for (let offset = 0; offset < png.data.length; offset += 4 * 97) colours.add(png.data.readUInt32BE(offset));
      expect(colours.size, `${name}: canvas drawn`).toBeGreaterThan(20);
    }
    const centre = async id => page.locator(`#${id}${suffix}`).evaluate(element => { const box = element.getBoundingClientRect(); return { x: box.left + box.width / 2, y: box.top + box.height / 2 }; });
    const saveHit = await page.locator(`.${mode}.look-${index} button.primary`).evaluate(button => { const box = button.getBoundingClientRect(); return document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2) === button; });
    expect(saveHit, `${name}: Save is hit where it is drawn`).toBe(true);
    const toggle = await centre("notify");
    const before = await page.locator(`#notify${suffix}`).isChecked();
    await page.mouse.click(toggle.x, toggle.y);
    expect(await page.locator(`#notify${suffix}`).isChecked(), `${name}: switch toggles`).toBe(!before);
    const field = await centre("name");
    await page.mouse.click(field.x, field.y);
    await page.keyboard.press("End");
    await page.keyboard.type("!");
    expect(await page.inputValue(`#name${suffix}`), `${name}: field edits`).toBe("Ada Lovelace!");
  }
  await context.close();
});
