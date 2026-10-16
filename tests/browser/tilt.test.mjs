/**
 * Browser suite for tilted layers (`tiltX`, `tiltY`, `perspective`) on `runtime.html` (`window.runtimeProbe`). It
 * proves that admission proves projective hits before tilt is allowed, that the canonical matrix is exactly what CSS
 * composes, that a tilted interactive layer stays GPU-presented with fresh pixels drawn through the projection, that
 * native hits follow the projection where a flat stand-in would disagree, that tilt animates without a recapture,
 * that ordinary DOM presents the same matrix with `matrix3d`, and that a clipped tilted layer is refused rather than
 * hit-tested by a bounding box (WICG html-in-canvas#186).
 *
 * Specimen: `primary` rgb(240,30,60) at (40,50) 260x300 holding the Count button, on a white 640x420 frame.
 */
import { test, expect } from "../helpers/current-browser.mjs";
import { mkdir } from "node:fs/promises";
import { PNG } from "pngjs";
import { evidenceDirectory } from "../helpers/evidence.mjs";

const evidence = evidenceDirectory("tilt");

async function ready(page, query = "") {
  await page.goto(`/runtime.html${query}`);
  await page.waitForFunction(() => window.runtimeProbe?.state().mode === "gpu" && !window.runtimeProbe.state().initializing);
  await page.waitForTimeout(300);
  await page.evaluate(() => window.runtimeProbe.settle());
}
async function snap(page, name) {
  await page.evaluate(() => window.runtimeProbe.settle());
  await mkdir(evidence, { recursive: true });
  const png = PNG.sync.read(await page.locator("#frame").screenshot({ path: `${evidence}/${name}.png` }));
  const ratio = png.width / 640;
  return (x, y) => [...png.data.subarray((Math.round(y * ratio) * png.width + Math.round(x * ratio)) * 4, (Math.round(y * ratio) * png.width + Math.round(x * ratio)) * 4 + 3)];
}
/**
 * Witness points for the primary layer under `transform`, in frame and viewport coordinates: one inside the projected
 * layer that the flat stand-in (no perspective) misses, one inside the flat stand-in that the projection misses.
 */
async function witnesses(page) {
  return page.evaluate(() => {
    const state = window.runtimeProbe.state(), layer = state.layers.find(entry => entry.id === "primary");
    const matrix = new DOMMatrix(layer.matrix), flat = DOMMatrix.fromMatrix(matrix);
    flat.m14 = 0; flat.m24 = 0; flat.m34 = 0; flat.m44 = 1;
    const local = (m, x, y) => { const p = m.transformPoint({ x, y }); return { x: p.x / p.w, y: p.y / p.w }; };
    // Inverse of the z = 0 homography: canvas point to layer-local.
    const unproject = (m, point) => {
      const h = [[m.m11, m.m21, m.m41], [m.m12, m.m22, m.m42], [m.m14, m.m24, m.m44]];
      const [[a, b, c], [d, e, f], [g, k, i]] = h;
      const det = a * (e * i - f * k) - b * (d * i - f * g) + c * (d * k - e * g);
      const inv = [[(e * i - f * k), (c * k - b * i), (b * f - c * e)], [(f * g - d * i), (a * i - c * g), (c * d - a * f)], [(d * k - e * g), (b * g - a * k), (a * e - b * d)]].map(row => row.map(v => v / det));
      const w = inv[2][0] * point.x + inv[2][1] * point.y + inv[2][2];
      return { x: (inv[0][0] * point.x + inv[0][1] * point.y + inv[0][2]) / w, y: (inv[1][0] * point.x + inv[1][1] * point.y + inv[1][2]) / w };
    };
    const { width, height } = layer, inside = p => p.x > 4 && p.y > 4 && p.x < width - 4 && p.y < height - 4;
    const outside = p => p.x < -4 || p.y < -4 || p.x > width + 4 || p.y > height + 4;
    const frame = document.querySelector("#frame").getBoundingClientRect();
    let projectedOnly, flatOnly;
    for (let y = 10; y < height - 10 && !(projectedOnly && flatOnly); y += 5) for (const x of [6, width - 6]) {
      const p = local(matrix, x, y);
      if (!projectedOnly && outside(unproject(flat, p))) projectedOnly = p;
      const q = local(flat, x, y);
      if (!flatOnly && outside(unproject(matrix, q))) flatOnly = q;
    }
    const count = document.querySelector("#count").getBoundingClientRect();
    return { matrix: Array.from(matrix.toFloat64Array()), projectedOnly, flatOnly, frame: { x: frame.x, y: frame.y },
      countCentre: { x: count.x + count.width / 2, y: count.y + count.height / 2 }, insideCheck: projectedOnly && inside(unproject(matrix, projectedOnly)) };
  });
}

test("a tilted interactive layer stays on the GPU with projected pixels and native hits", async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await ready(page);
  const admission = await page.evaluate(() => window.runtimeProbe.state().metrics.admission.last.projective);
  expect(admission).toEqual({ result: "proven", hits: [true, false] });
  const origin = await page.evaluate(() => window.runtimeProbe.state().layers.find(layer => layer.id === "primary").matrix.slice(4, 6));
  await page.evaluate(() => { window.runtimeProbe.origin("primary", "center"); window.runtimeProbe.transform("primary", { tiltY: 35, perspective: 700 }); });
  const state = await page.evaluate(() => { const s = window.runtimeProbe.state(); return { mode: s.mode, reason: s.reason, matrix: s.layers.find(l => l.id === "primary").matrix }; });
  expect(state.mode, state.reason).toBe("gpu");
  // The canonical matrix is what CSS composes for the same transform, about the pivot.
  const expected = await page.evaluate(([x, y]) => Array.from(new DOMMatrix(
    `translate(${x + 130}px, ${y + 150}px) perspective(700px) rotate(0deg) rotateX(0deg) rotateY(35deg) scale(1, 1) translate(-130px, -150px)`).toFloat64Array()), origin);
  state.matrix.forEach((value, index) => expect(Math.abs(value - expected[index])).toBeLessThan(1e-6));

  // Pixels and hits follow the projection where a flat stand-in would disagree.
  const witness = await witnesses(page);
  expect(witness.projectedOnly && witness.flatOnly, "witness points exist").toBeTruthy();
  const pixel = await snap(page, "tilted");
  expect(pixel(witness.projectedOnly.x, witness.projectedOnly.y)).toEqual([240, 30, 60]);
  expect(pixel(witness.flatOnly.x, witness.flatOnly.y)).toEqual([255, 255, 255]);
  const hit = point => page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest("#primary") ? "primary" : document.elementFromPoint(x, y)?.id ?? null,
    { x: witness.frame.x + point.x, y: witness.frame.y + point.y });
  expect(await hit(witness.projectedOnly)).toBe("primary");
  expect(await hit(witness.flatOnly)).not.toBe("primary");
  // A real click on the projected button reaches it.
  await page.mouse.click(witness.countCentre.x, witness.countCentre.y);
  await expect(page.locator("#count")).toHaveText("Count 1");
  expect(await page.evaluate(() => window.runtimeProbe.state().mode)).toBe("gpu");

  // Tilt animates on the GPU with no recapture, and lands on the target.
  const motion = await page.evaluate(() => window.runtimeProbe.animate({ tiltY: -25, tiltX: 10, perspective: 900 }, 30));
  expect(motion.after.mode).toBe("gpu");
  expect(motion.after.metrics.captures).toBe(motion.before.metrics.captures);
  expect(motion.after.layers.find(layer => layer.id === "primary").transform).toMatchObject({ tiltY: -25, tiltX: 10, perspective: 900 });
  const after = await witnesses(page);
  expect((await snap(page, "animated"))(after.projectedOnly.x, after.projectedOnly.y)).toEqual([240, 30, 60]);

  // Ordinary DOM presents the same matrix as matrix3d, so DOM hits match too.
  await page.evaluate(() => window.runtimeProbe.disable());
  const dom = await page.evaluate(() => ({ transform: getComputedStyle(document.querySelector("#primary")).transform, mode: window.runtimeProbe.state().mode }));
  expect(dom.mode).toBe("dom");
  expect(dom.transform).toMatch(/^matrix3d\(/);
  expect(errors).toEqual([]);
});

test("tilt is refused in a clipping viewport, and invalid tilts are rejected", async ({ page }) => {
  await ready(page, "?clip");
  const refused = await page.evaluate(() => {
    const failures = [];
    for (const transform of [{ tiltX: 61 }, { tiltY: 20, perspective: 50 }, { tiltY: NaN }]) {
      try { window.runtimeProbe.transform("primary", transform); failures.push("accepted"); } catch (error) { failures.push(String(error)); }
    }
    return failures;
  });
  expect(refused[0]).toMatch(/within ±60 degrees/);
  expect(refused[1]).toMatch(/at least 100 px/);
  expect(refused[2]).toMatch(/finite/);
  expect(await page.evaluate(() => window.runtimeProbe.state().mode)).toBe("gpu");
});
