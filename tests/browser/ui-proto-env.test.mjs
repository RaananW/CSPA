/**
 * Check of the Strata studio environment generated in code (`ui-proto-env-check.html`): on the mirror ball, the key
 * softbox reflects in the upper-left quadrant (where the default key light comes from) and is larger there than any
 * highlight in the upper right; the matte ball is lit but not blown out. Guards the panorama's orientation and
 * brightness. The screenshot goes to the `ui-probes` evidence directory.
 */
import { test, expect } from "../helpers/current-browser.mjs";
import { evidenceDirectory } from "../helpers/evidence.mjs";
import { PNG } from "pngjs";

const directory = evidenceDirectory("ui-probes");

test("the generated studio environment is oriented with the key light and not overexposed", async ({ browser }) => {
  const page = await (await browser.newContext({ viewport: { width: 900, height: 600 }, deviceScaleFactor: 1 })).newPage();
  await page.goto("/ui-proto-env-check.html");
  await page.waitForFunction(() => document.getElementById("status").textContent === "ready", null, { timeout: 20000 });
  await page.waitForTimeout(500);
  const png = PNG.sync.read(await page.locator("canvas").screenshot({ path: `${directory}/proto-env-balls.png` }));
  const at = (x, y) => { const i = (y * png.width + x) * 4; return (png.data[i] + png.data[i + 1] + png.data[i + 2]) / 3; };
  // Canvas is 640 by 320 CSS pixels; balls are 170 px wide, centred at x = 120, 320 and 520, y = 160.
  const bright = (cx, cy, dx, dy) => { let count = 0; for (let y = 0; y < 80; y++) for (let x = 0; x < 80; x++) if (at(cx + dx * x, cy + dy * y) > 235) count++; return count; };
  const upperLeft = bright(120, 159, -1, -1), upperRight = bright(121, 159, 1, -1);
  expect(upperLeft, `key highlight upper left (${upperLeft}) larger than upper right (${upperRight})`).toBeGreaterThan(upperRight);
  expect(upperLeft).toBeGreaterThan(40);
  // The matte ball (right) is lit but not clipped to white.
  let sum = 0, white = 0, count = 0;
  for (let y = 100; y < 220; y++) for (let x = 460; x < 580; x++) { const value = at(x, y); sum += value; count++; if (value > 250) white++; }
  expect(sum / count, "matte ball brightness").toBeGreaterThan(60);
  expect(white / count, "matte ball not blown out").toBeLessThan(0.02);
});
