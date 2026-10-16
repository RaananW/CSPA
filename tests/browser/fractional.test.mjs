/**
 * Browser regression suite for layers laid out at fractional CSS sizes on `runtime.html` (`window.runtimeProbe`).
 * The browser reports a fractional native capture grid for such a layer (377.25 px tall at DPR 1). The renderer used to
 * compare that grid with its whole-texel texture on every paint, reallocate, and never settle, so admission failed
 * with "Native refresh did not settle". Content with an auto height lands on fractions routinely. The suite proves
 * that such layers admit, stay GPU-presented with fresh pixels and native hits, and follow a fractional resize.
 */
import { test, expect } from "../helpers/current-browser.mjs";
import { mkdir } from "node:fs/promises";
import { PNG } from "pngjs";
import { evidenceDirectory } from "../helpers/evidence.mjs";

const evidence = evidenceDirectory("fractional");

for (const dpr of [1, 2]) for (const height of ["300.25px", "300.75px", "299.5px"]) test(`a layer at a fractional height (${height}, DPR${dpr}) admits and stays fresh`, async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 900, height: 750 }, deviceScaleFactor: dpr });
  try {
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto("/runtime.html?dom");
    await page.waitForFunction(() => window.runtimeProbe && !window.runtimeProbe.state().initializing);
    await page.evaluate(height => { document.querySelector("#primary").style.height = height; }, height);
    const enabled = await page.evaluate(async () => { await window.runtimeProbe.enable(); const state = window.runtimeProbe.state(); return { mode: state.mode, reason: state.reason }; });
    expect(enabled.mode, enabled.reason).toBe("gpu");
    const pixel = async name => {
      await page.evaluate(() => window.runtimeProbe.settle());
      await mkdir(evidence, { recursive: true });
      const png = PNG.sync.read(await page.locator("#frame").screenshot({ path: `${evidence}/${name}.png` }));
      const ratio = png.width / 640;
      return (x, y) => [...png.data.subarray((Math.round(y * ratio) * png.width + Math.round(x * ratio)) * 4, (Math.round(y * ratio) * png.width + Math.round(x * ratio)) * 4 + 4)];
    };
    expect((await pixel(`${height}-${dpr}`))(45, 340)).toEqual([240, 30, 60, 255]);
    // Native input reaches the layer's control, and the changed content is presented.
    await page.locator("#count").click();
    await expect(page.locator("#count")).toHaveText("Count 1");
    // A fractional resize keeps GPU.
    await page.evaluate(() => { document.querySelector("#primary").style.height = "310.4px"; });
    expect((await pixel(`${height}-${dpr}-resized`))(45, 355)).toEqual([240, 30, 60, 255]);
    expect(await page.evaluate(() => window.runtimeProbe.state().mode)).toBe("gpu");
    expect(errors).toEqual([]);
  } finally { await page.close(); }
});
