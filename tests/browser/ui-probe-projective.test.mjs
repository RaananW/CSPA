/**
 * Strata Phase 0 probe P0.1 (`ui-probe-projective.html`, `window.projectiveProbe`; see
 * docs/ui-library/plan.md): a drawable face of four native buttons is drawn with raw WebGPU through a
 * perspective 4x4 matrix, and the same matrix is its canvas element transform. For each tilt, at DPR 1
 * and 2, the browser must keep the full matrix, `elementFromPoint` and the drawn pixels must agree with the
 * exact inverse projection on a dense grid, and real pointer clicks must land on the button drawn under
 * them. The grid also counts the points a flat (affine) approximation would get wrong, so a pass cannot
 * come from a bounding-box shortcut. Reports go to the `ui-probes` evidence directory.
 */
import { test, expect } from "../helpers/current-browser.mjs";
import { evidenceDirectory } from "../helpers/evidence.mjs";
import { mkdir, writeFile } from "node:fs/promises";

const directory = evidenceDirectory("ui-probes");
const colors = { nw: [207, 37, 83], ne: [31, 179, 113], sw: [37, 99, 235], se: [245, 158, 11], face: [120, 120, 120], stage: [255, 255, 255] };
const tilts = [
  { name: "flat", rotateX: 0, rotateY: 0, perspective: 0 },
  { name: "x20-y-35-p700", rotateX: 20, rotateY: -35, perspective: 700 },
  { name: "x-30-y45-p600", rotateX: -30, rotateY: 45, perspective: 600 },
  { name: "x0-y55-p900", rotateX: 0, rotateY: 55, perspective: 900 },
];
// Local CSS pixels kept clear of every boundary, so anti-aliased edges are not judged.
const margin = 3;
const step = 4;

// The z = 0 plane of a column-major 4x4 matrix is the homography [m11 m21 m41; m12 m22 m42; m14 m24 m44].
const homography = m => [[m[0], m[4], m[12]], [m[1], m[5], m[13]], [m[3], m[7], m[15]]];
function invert3([[a, b, c], [d, e, f], [g, h, i]]) {
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C;
  return [[A / det, -(b * i - c * h) / det, (b * f - c * e) / det],
    [B / det, (a * i - c * g) / det, -(a * f - c * d) / det],
    [C / det, -(a * h - b * g) / det, (a * e - b * d) / det]];
}
const apply = (h, x, y) => { const w = h[2][0] * x + h[2][1] * y + h[2][2]; return { x: (h[0][0] * x + h[0][1] * y + h[0][2]) / w, y: (h[1][0] * x + h[1][1] * y + h[1][2]) / w }; };
// Best affine stand-in: the 2D part of the same matrix with the perspective row dropped (w = m44).
const affine = m => [[m[0] / m[15], m[4] / m[15], m[12] / m[15]], [m[1] / m[15], m[5] / m[15], m[13] / m[15]], [0, 0, 1]];

/** What a local point should hit: a button id, "face", "stage" (outside), or null within `margin` of a boundary. */
function classify(local, extent, targets) {
  const inside = (r, grow) => local.x > r.x - grow && local.x < r.x + r.width + grow && local.y > r.y - grow && local.y < r.y + r.height + grow;
  const face = { x: 0, y: 0, ...extent };
  if (!inside(face, margin)) return "stage";
  if (!inside(face, -margin)) return null;
  for (const t of targets) {
    if (inside(t, -margin)) return t.id;
    if (inside(t, margin)) return null;
  }
  return "face";
}

for (const dpr of [1, 2]) test(`P0.1 projective canvas transforms give exact pixels and native hits DPR${dpr}`, async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 900, height: 750 }, deviceScaleFactor: dpr });
  const page = await context.newPage();
  await page.goto("/ui-probe-projective.html");
  await page.waitForFunction(() => window.projectiveProbe);
  const error = await page.evaluate(async () => { try { await window.projectiveProbe.ready; return null; } catch (failure) { return String(failure); } });
  expect(error, "probe must start: HTML-in-Canvas and WebGPU are required").toBeNull();
  const report = { dpr, margin, step, cases: [] };

  for (const tilt of tilts) {
    const state = await page.evaluate(async tilt => {
      const probe = await window.projectiveProbe.ready;
      await probe.setTilt(tilt);
      await probe.settle();
      const box = document.getElementById("stage").getBoundingClientRect();
      return { requested: probe.requested(), applied: probe.applied(), extent: probe.extent(), targets: probe.targets(), origin: { x: box.left, y: box.top }, size: { width: box.width, height: box.height } };
    }, tilt);

    // The browser keeps every one of the 16 coefficients, and reports a 3D matrix when perspective is set.
    state.requested.forEach((value, index) => expect(Math.abs(state.applied.values[index] - value), `coefficient ${index}`).toBeLessThan(1e-5));
    expect(state.applied.is2D).toBe(tilt.perspective === 0 && tilt.rotateX === 0 && tilt.rotateY === 0);

    // Dense grid over the canvas: expected target from the exact inverse projection versus native hits and drawn pixels.
    const inverse = invert3(homography(state.requested));
    const inverseAffine = invert3(affine(state.requested));
    const points = [];
    for (let y = step / 2; y < state.size.height; y += step) for (let x = step / 2; x < state.size.width; x += step) {
      const expected = classify(apply(inverse, x, y), state.extent, state.targets);
      if (!expected) continue;
      const flat = classify(apply(inverseAffine, x, y), state.extent, state.targets);
      points.push({ x, y, expected, flat });
    }
    const observed = await page.evaluate(async ({ points, origin }) => {
      const probe = await window.projectiveProbe.ready;
      return points.map(point => { const client = { x: origin.x + point.x, y: origin.y + point.y }; return { hit: probe.hit(client), pixel: probe.pixel(client) }; });
    }, { points, origin: state.origin });
    const hitMisses = [], pixelMisses = [];
    let affineMisses = 0;
    points.forEach((point, index) => {
      const { hit, pixel } = observed[index];
      if (point.flat !== point.expected) affineMisses++;
      if (hit !== point.expected) hitMisses.push({ ...point, hit });
      // Pixels are judged away from the buttons' bottom-left labels: only the upper 60% of each button.
      const target = state.targets.find(t => t.id === point.expected);
      const local = apply(inverse, point.x, point.y);
      if (target && local.y > target.y + target.height * 0.6) return;
      if (colors[point.expected].some((channel, c) => Math.abs(channel - pixel[c]) > 8)) pixelMisses.push({ ...point, pixel });
    });

    // Real pointer clicks at each button's projected centre land on that button only.
    const clicks = [];
    for (const target of state.targets) {
      const before = await page.evaluate(async () => (await window.projectiveProbe.ready).targets().map(t => t.clicks));
      const centre = apply(homography(state.requested), target.x + target.width / 2, target.y + target.height / 2);
      await page.mouse.click(state.origin.x + centre.x, state.origin.y + centre.y);
      const after = await page.evaluate(async () => { const probe = await window.projectiveProbe.ready; await probe.settle(); return probe.targets().map(t => t.clicks); });
      clicks.push({ id: target.id, delta: after.map((count, index) => count - before[index]) });
    }

    report.cases.push({ tilt, applied: state.applied, points: points.length, affineMisses, hitMisses: hitMisses.slice(0, 20), hitMissCount: hitMisses.length,
      pixelMisses: pixelMisses.slice(0, 20), pixelMissCount: pixelMisses.length, clicks });
    expect(hitMisses, `${tilt.name}: native hits disagree with the projection`).toEqual([]);
    expect(pixelMisses, `${tilt.name}: drawn pixels disagree with the projection`).toEqual([]);
    clicks.forEach(({ id, delta }) => expect(delta, `${tilt.name}: click on ${id}`).toEqual(state.targets.map(t => (t.id === id ? 1 : 0))));
    // A tilted case must be one a flat approximation would get wrong; otherwise it proves nothing about perspective.
    if (tilt.perspective > 0) expect(affineMisses, `${tilt.name}: affine stand-in should disagree somewhere`).toBeGreaterThan(50);
    await page.screenshot({ path: `${directory}/projective-${tilt.name}-dpr${dpr}.png`, clip: { ...state.origin, ...state.size } });
  }

  await mkdir(directory, { recursive: true });
  await writeFile(`${directory}/projective-dpr${dpr}.json`, JSON.stringify(report, null, 2));
  await context.close();
});
