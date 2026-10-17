/**
 * Instrument probe I0.2, moving parts and hits, on `ui-probe-instrument-moving.html` (`window.movingProbe`; see
 * docs/ui-library/instrument.md, Phase I0): rockers, bat toggles, wall switches, slide switches, faders and knobs over
 * real native inputs, at the stage's corners, edges and centre, at 1920 × 1080. At DPR 1 and 2 the test checks that:
 * - GPU presentation stays on throughout (core reports `gpu` and no fallback reason);
 * - at the low, mid-travel and high pose of every control, no decoded mesh pixel lies outside its control's rounded
 *   border box (I0.1's strict rule: pixel centres, on the edge at most), for all parts together and for every part
 *   drawn alone, and the CPU projection of every vertex through the whole travel agrees;
 * - the same holds with each kind's boxes flush in the stage's four corners, the worst place for drift, and the CPU
 *   projection there reports the smallest camera distance and the smallest box that contain every pose;
 * - native hits on a sample of drawn mesh pixels, and on a grid over every control's box, find that control at every
 *   pose, and 1.5 px outside each box they do not;
 * - real pointer input on the drawn lever, paddle, rocker end, thumb and cap toggles every switch both ways, drags a
 *   fader cap to both ends and sets a knob both ways, at the stage's corners and centre;
 * - 300 frames of bats snapping and knobs turning cause no capture, upload or geometry update, and the panel's native
 *   hit transform is the same before and after.
 * Reports and screenshots go to the `ui-probes` evidence directory (`instrument-moving-dpr<n>.json`).
 */
import { test, expect } from "../helpers/current-browser.mjs";
import { evidenceDirectory } from "../helpers/evidence.mjs";
import { mkdir, writeFile } from "node:fs/promises";

const directory = evidenceDirectory("ui-probes");
const kinds = ["rocker", "bat", "wall", "slide", "fader", "knob"];
const poses = ["low", "mid", "high"];
const round = value => (Number.isFinite(value) ? Math.round(value * 100) / 100 : value);

for (const dpr of [1, 2]) test(`I0.2 moving parts stay inside their boxes and native hits land on the control at every pose DPR${dpr}`, async ({ browser }) => {
  test.setTimeout(900000);
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: dpr });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(String(error)));
  await page.goto("/ui-probe-instrument-moving.html");
  await page.waitForFunction(() => window.movingProbe);
  const error = await page.evaluate(async () => { try { await window.movingProbe.ready; return null; } catch (failure) { return String(failure); } });
  expect(error, "probe must start: HTML-in-Canvas and WebGPU are required").toBeNull();
  const call = (name, ...args) => page.evaluate(async ({ name, args }) => (await window.movingProbe.ready)[name](...args), { name, args });
  const report = { dpr, browser: browser.version(), userAgent: await call("browser"), tokens: await call("tokens") };
  await mkdir(directory, { recursive: true });
  const stillGpu = async label => {
    const counts = await call("counts");
    expect(counts.mode, `${label}: GPU presentation stays on (${counts.reason})`).toBe("gpu");
    expect(counts.reason, `${label}: no fallback`).toMatch(/^Current content=drawable owning WebGPU canvas/);
    return counts;
  };
  /** Pixel containment (all parts and each part alone), mesh-pixel hits, grid hits and the CPU projection at each pose. */
  const checkPoses = async label => {
    const out = {};
    for (const pose of poses) {
      await call("setPose", pose);
      const pixels = await call("containment", { parts: true });
      const grid = await call("gridHits");
      const analytic = await call("analytic");
      out[pose] = {
        changed: pixels.changed, outside: pixels.outside, maxDistance: round(pixels.maxDistance), outsideSamples: pixels.outsideSamples.slice(0, 5),
        perKind: Object.fromEntries(Object.entries(pixels.perKind).map(([kind, value]) => [kind, { pixels: value.pixels, maxDistance: round(value.maxDistance) }])),
        parts: Object.fromEntries(Object.entries(pixels.parts).map(([part, value]) => [part, { pixels: value.pixels, outside: value.outside, maxDistance: round(value.maxDistance), outsideSamples: value.outsideSamples }])),
        hitSampleCount: pixels.hitSampleCount, hitMismatches: pixels.hitMismatches, hitMismatchSamples: pixels.hitMismatchSamples,
        grid, analytic: Object.fromEntries(Object.entries(analytic).map(([part, value]) => [part, round(value[pose])])),
      };
      // Four corner controls draw far fewer pixels than the 54 of the main layout (four bats: about 1,300 at DPR 1).
      const where = `${label} ${pose}`, floor = label === "main" ? { changed: 5000, hits: 1000 } : { changed: 1000, hits: 500 };
      expect(pixels.changed, `${where}: the meshes draw`).toBeGreaterThan(floor.changed);
      expect(pixels.outside, `${where}: mesh pixels outside their control ${JSON.stringify(pixels.outsideSamples.slice(0, 5))}`).toBe(0);
      for (const [part, value] of Object.entries(pixels.parts)) {
        expect(value.pixels, `${where}: ${part} draws`).toBeGreaterThan(20);
        expect(value.outside, `${where}: ${part} pixels outside its control ${JSON.stringify(value.outsideSamples)}`).toBe(0);
      }
      for (const [part, value] of Object.entries(analytic)) expect(value[pose], `${where}: ${part} vertices inside its box (CPU projection)`).toBeLessThanOrEqual(0);
      expect(pixels.hitSampleCount, `${where}: hit samples`).toBeGreaterThan(floor.hits);
      expect(pixels.hitMismatches, `${where}: native hits on mesh pixels ${JSON.stringify(pixels.hitMismatchSamples)}`).toBe(0);
      expect(grid.misses, `${where}: grid hits ${JSON.stringify(grid.missSamples)}`).toBe(0);
    }
    // Over the whole travel (33 steps), not only the three poses.
    out.travel = Object.fromEntries(Object.entries(await call("analytic")).map(([part, value]) => [part, { max: round(value.travel), at: value.worstAt }]));
    for (const [part, value] of Object.entries(out.travel)) expect(value.max, `${label}: ${part} inside its box through its travel`).toBeLessThanOrEqual(0);
    return out;
  };

  try {
    report.start = await stillGpu("start");
    report.transformStart = await call("transforms");
    await call("settle");
    await page.screenshot({ path: `${directory}/instrument-moving-dpr${dpr}.png` });

    // Every kind at the corners, edges and centre, at three poses.
    report.main = await checkPoses("main");
    await call("setPose", "high");
    await page.screenshot({ path: `${directory}/instrument-moving-high-dpr${dpr}.png` });

    // Real pointer input on the drawn parts, at the stage's top-right and bottom-left corners and the centre.
    await call("setPose", "low");
    const pointer = [];
    const settle = () => call("settle");
    for (const cluster of ["tr", "bl", "mc"]) for (const kind of kinds) {
      const id = `${kind}-${cluster}`, entry = { id };
      if (kind === "fader") {
        // Drag the cap to the top end, then back to the bottom end.
        await call("setPose", "mid");
        const box = (await call("controls")).find(control => control.id === id);
        for (const [end, y] of [["top", box.y + 1], ["bottom", box.y + box.height - 1]]) {
          const at = await call("anchor", id);
          expect((await call("hits", [at]))[0], `${id}: the cap is on the fader`).toBe(id);
          await page.mouse.move(at.x, at.y);
          await page.mouse.down();
          await page.mouse.move(at.x, y, { steps: 12 });
          await page.mouse.up();
          await settle();
          entry[end] = { from: at, value: (await call("state", id)).value };
        }
        expect(Number(entry.top.value), `${id}: dragging the cap up sets the maximum`).toBe(100);
        expect(Number(entry.bottom.value), `${id}: dragging the cap down sets the minimum`).toBe(0);
      } else if (kind === "knob") {
        await call("setPose", "mid");
        for (const side of ["left", "right"]) {
          const at = await call("anchor", id, side);
          expect((await call("hits", [at]))[0], `${id}: the cap's ${side} is on the knob`).toBe(id);
          await page.mouse.click(at.x, at.y);
          await settle();
          entry[side] = { at, value: (await call("state", id)).value };
        }
        expect(Number(entry.left.value), `${id}: a click on the cap's left sets a lower value`).toBeLessThan(50);
        expect(Number(entry.right.value), `${id}: a click on the cap's right sets a higher value`).toBeGreaterThan(50);
      } else {
        await call("setPose", "low");
        for (const expected of [true, false]) {
          const at = await call("anchor", id), before = await call("counts");
          expect((await call("hits", [at]))[0], `${id}: the drawn part is on the switch`).toBe(id);
          await page.mouse.click(at.x, at.y);
          await settle();
          const after = await call("counts"), state = await call("state", id);
          entry[expected ? "on" : "off"] = { at, checked: state.checked, travel: state.travel, captures: after.captures - before.captures, geometryUpdates: after.geometryUpdates - before.geometryUpdates };
          expect(state.checked, `${id}: a click on the drawn part turns it ${expected ? "on" : "off"}`).toBe(expected);
          expect(state.travel, `${id}: the part snapped to its stop`).toBe(expected ? 1 : 0);
        }
      }
      pointer.push(entry);
    }
    report.pointer = pointer;
    report.afterPointer = await stillGpu("after pointer input");

    // Motion: poses only, no capture, and the native hit geometry never changes.
    report.animation = await call("animate", 300);
    expect(report.animation.mode, "animation: GPU stays on").toBe("gpu");
    expect(report.animation.bats).toBe(9);
    expect(report.animation.knobs).toBe(9);
    expect(report.animation.extremes.bat, "the bats reach both stops").toEqual({ min: 0, max: 1 });
    expect(report.animation.extremes.knob.min, "the knobs reach the start of the sweep").toBeLessThan(0.01);
    expect(report.animation.extremes.knob.max, "the knobs reach the end of the sweep").toBeGreaterThan(0.99);
    expect(report.animation.captures, "animation needs no capture").toBe(0);
    expect(report.animation.uploads, "animation needs no upload").toBe(0);
    expect(report.animation.geometryUpdates, "animation leaves hit geometry alone").toBe(0);
    expect(report.animation.gpuFrames, "one core frame per animation frame").toBe(300);
    expect(report.animation.transformAfter, "the native hit transform is unchanged by motion").toEqual(report.animation.transformBefore);

    // The worst corner: each kind with its boxes flush in the stage's four corners.
    report.corners = {};
    for (const kind of kinds) {
      const layout = await call("setLayout", `corner-${kind}`);
      await stillGpu(`corner-${kind}`);
      report.corners[kind] = { layout, poses: await checkPoses(`corner-${kind}`) };
      if (kind === "bat") { await call("setPose", "high"); await page.screenshot({ path: `${directory}/instrument-moving-corner-bat-dpr${dpr}.png` }); }
    }
    // The CPU projection at the exact corners: what D and what box containment needs.
    report.worstCorner = await call("worstCorner");
    for (const [kind, value] of Object.entries(report.worstCorner)) {
      expect(value.travel, `${kind} at the stage corner: overshoot ${value.travel} px at D ${value.distance}; minimum box ${JSON.stringify(value.minimumBox)}`).toBeLessThanOrEqual(0);
      expect(value.distanceNeeded, `${kind}: a camera distance contains it`).not.toBeNull();
    }
    await call("setLayout", "main");
    report.transformEnd = await call("transforms");
    expect(report.transformEnd.panel, "the panel's native hit transform is unchanged").toEqual(report.transformStart.panel);
    report.end = await stillGpu("end");
    report.diagnostics = await call("diagnostics");
    expect(report.diagnostics).toEqual([]);
    expect(errors).toEqual([]);
  } finally {
    report.errors = errors;
    await writeFile(`${directory}/instrument-moving-dpr${dpr}.json`, JSON.stringify(report, null, 2));
    await context.close();
  }
});
