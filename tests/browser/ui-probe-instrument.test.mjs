/**
 * Instrument probe I0.1, the mesh pass, on `ui-probe-instrument.html` (`window.instrumentProbe`; see
 * docs/ui-library/instrument.md, Phase I0): a Babylon Lite mesh scene per layer drawn inside core's shared engine right
 * after that layer's own pass (core's Phase I0 prototype hook), for two overlapping enrolled panels of native controls
 * at 1920 × 1080. At DPR 1 and 2 the test checks that:
 * - GPU presentation stays on throughout (core reports `gpu` and no fallback reason);
 * - painter's order holds: with the mesh pass on and off, no lower-panel part shows through the upper panel, and the
 *   lower knob the upper panel's edge crosses is drawn only on its uncovered side;
 * - every pixel the mesh pass draws lies inside its own control's box (rounded, pixel centres), and native hit testing
 *   at a sample of those pixels finds that control;
 * - the captured labels on key caps match core's plain pass texel for texel;
 * - native hits at interior and near-edge points of every control, and real pointer input on a knob, a key, a switch
 *   and a fader, land on the original controls;
 * - with 250 controls (1,480 parts), 50 meters and 20 knobs animating for 300 frames cause no capture, upload or
 *   geometry update, and frame work (pose, core frame, GPU done) stays under 16 ms at the 95th percentile;
 * - 500 and 1,000 controls are measured the same way, and meters written through the DOM are measured for contrast.
 * Reports and screenshots go to the `ui-probes` evidence directory.
 */
import { test, expect } from "../helpers/current-browser.mjs";
import { evidenceDirectory } from "../helpers/evidence.mjs";
import { mkdir, writeFile } from "node:fs/promises";

const directory = evidenceDirectory("ui-probes");
const intersects = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
const trim = result => ({ ...result, gpuTiming: { ...result.gpuTiming, tasks: { ...result.gpuTiming.tasks, perTask: result.gpuTiming.tasks.perTask.slice(0, 8) } } });

for (const dpr of [1, 2]) test(`I0.1 mesh pass per layer keeps painter's order, exact caps, native hits and frame budget DPR${dpr}`, async ({ browser }) => {
  test.setTimeout(600000);
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: dpr });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(String(error)));
  await page.goto("/ui-probe-instrument.html");
  await page.waitForFunction(() => window.instrumentProbe);
  const error = await page.evaluate(async () => { try { await window.instrumentProbe.ready; return null; } catch (failure) { return String(failure); } });
  expect(error, "probe must start: HTML-in-Canvas and WebGPU are required").toBeNull();
  const call = (name, ...args) => page.evaluate(async ({ name, args }) => (await window.instrumentProbe.ready)[name](...args), { name, args });
  const report = { dpr, browser: browser.version(), userAgent: await call("browser"), tokens: await call("tokens") };
  await mkdir(directory, { recursive: true });
  const stillGpu = async label => {
    const counts = await call("counts");
    expect(counts.mode, `${label}: GPU presentation stays on (${counts.reason})`).toBe("gpu");
    expect(counts.reason, `${label}: no fallback`).toMatch(/^Current content=drawable owning WebGPU canvas/);
    return counts;
  };

  try {
    report.start = await stillGpu("start");
    await call("settle");
    await page.screenshot({ path: `${directory}/instrument-dpr${dpr}.png` });

    // Painter's order, containment and hits on drawn mesh pixels, from the mesh pass on and off.
    const diff = await call("meshDiff");
    report.meshDiff = diff;
    expect(diff.changed, "the mesh pass draws").toBeGreaterThan(50000);
    expect(diff.outside, `mesh pixels outside their control: ${JSON.stringify(diff.outsideSamples.slice(0, 5))}`).toBe(0);
    expect(diff.lowerUnderUpper, "lower-panel parts showing through the upper panel").toBe(0);
    expect(diff.upperOwn, "the upper panel's own parts draw over it").toBeGreaterThan(1000);
    expect(diff.straddled.covered, "the crossed lower knob is hidden under the upper panel").toBe(0);
    expect(diff.straddled.uncovered, "the crossed lower knob is drawn where it is uncovered").toBeGreaterThan(500);
    expect(diff.hitSampleCount).toBeGreaterThan(1000);
    expect(diff.hitMismatches, `native hits on mesh pixels: ${JSON.stringify(diff.hitMismatchSamples)}`).toBe(0);

    // Captured labels on key caps: texel for texel against core's plain pass (relief and meshes off).
    const controls = await call("controls");
    const panels = await call("panels");
    const visible = controls.filter(control => control.layer === "upper" || !intersects(control, panels.upper));
    const keys = visible.filter(control => control.kind === "key").map(control => control.id);
    const labels = await call("labels", keys);
    report.labels = labels;
    expect(labels.length).toBeGreaterThan(3);
    for (const label of labels) {
      expect(label.mismatched, `${label.id} label differs from the capture: ${JSON.stringify(label.samples)}`).toBe(0);
      expect(label.colours, `${label.id} label has text`).toBeGreaterThan(8);
    }

    // Native hits: centre and 1.5 px inside each edge's midpoint land on the control; 1.5 px outside does not.
    const points = [], expected = [];
    for (const control of visible) {
      const cx = control.x + control.width / 2, cy = control.y + control.height / 2;
      for (const point of [{ x: cx, y: cy }, { x: control.x + 1.5, y: cy }, { x: control.x + control.width - 1.5, y: cy }, { x: cx, y: control.y + 1.5 }, { x: cx, y: control.y + control.height - 1.5 }]) {
        points.push(point); expected.push({ id: control.id, inside: true });
      }
      for (const point of [{ x: control.x - 1.5, y: cy }, { x: control.x + control.width + 1.5, y: cy }, { x: cx, y: control.y - 1.5 }, { x: cx, y: control.y + control.height + 1.5 }]) {
        points.push(point); expected.push({ id: control.id, inside: false });
      }
    }
    // The crossed knob: its uncovered side hits the knob, its covered side hits the upper panel.
    const straddled = controls.find(control => control.id === diff.straddled.id);
    const knobRow = straddled.y + straddled.height / 2;
    points.push({ x: panels.upper.x - 4, y: knobRow }, { x: panels.upper.x + 4, y: knobRow });
    expected.push({ id: straddled.id, inside: true }, { id: "upper", inside: true });
    const hits = await call("hits", points);
    const misses = [];
    hits.forEach((hit, index) => {
      const want = expected[index];
      if (want.inside ? hit !== want.id : hit === want.id) misses.push({ point: points[index], hit, ...want });
    });
    report.hits = { points: points.length, missCount: misses.length, misses: misses.slice(0, 20) };
    expect(misses).toEqual([]);

    // Real pointer input on the original controls, through the drawn parts.
    const visibleOf = kind => visible.filter(control => control.kind === kind && control.layer === "lower");
    const centre = control => ({ x: control.x + control.width / 2, y: control.y + control.height / 2 });
    const pointer = {};
    const knob = await (async () => { for (const control of visibleOf("knob")) if (Math.abs(Number((await call("state", control.id)).value) - 50) > 10) return control; })();
    const knobBefore = await call("state", knob.id);
    await page.mouse.click(centre(knob).x, centre(knob).y);
    pointer.knob = { id: knob.id, before: knobBefore, after: await call("state", knob.id) };
    expect(Math.abs(Number(pointer.knob.after.value) - 50), "a click on the knob's cap sets the native range input").toBeLessThanOrEqual(3);
    const key = visibleOf("key")[0];
    await page.mouse.click(centre(key).x, centre(key).y);
    pointer.key = { id: key.id, after: await call("state", key.id) };
    expect(pointer.key.after.presses, "a click on the key's cap presses the native button").toBe(1);
    const toggle = visibleOf("switch")[0];
    const toggleBefore = await call("state", toggle.id);
    await page.mouse.click(centre(toggle).x, centre(toggle).y);
    pointer.switch = { id: toggle.id, before: toggleBefore, after: await call("state", toggle.id) };
    expect(pointer.switch.after.checked, "a click on the switch toggles the native checkbox").toBe(!toggleBefore.checked);
    const fader = visibleOf("fader")[0];
    await page.mouse.click(centre(fader).x, fader.y + 6);
    pointer.fader = { id: fader.id, after: await call("state", fader.id) };
    expect(Number(pointer.fader.after.value), "a click near the fader's top sets a high value").toBeGreaterThan(80);
    report.pointer = pointer;
    report.afterPointer = await stillGpu("after pointer input");

    // Density: poses only, no capture; frame work under 16 ms at 250 controls.
    report.density = [];
    for (const count of [250, 500, 1000]) {
      const layout = await call("setDensity", count);
      await stillGpu(`${count} controls`);
      if (count === 250) await page.screenshot({ path: `${directory}/instrument-250-dpr${dpr}.png` });
      const meters = Math.round(count / 5), knobs = Math.round((count * 20) / 250);
      const run = trim(await call("animate", 300, { meters, knobs }));
      report.density.push({ count, layout, run });
      expect(layout.controls).toBe(count);
      expect(run.mode, `${count} controls: GPU stays on`).toBe("gpu");
      expect(run.captures, `${count} controls: animation needs no capture`).toBe(0);
      expect(run.uploads, `${count} controls: animation needs no upload`).toBe(0);
      expect(run.geometryUpdates, `${count} controls: animation leaves hit geometry alone`).toBe(0);
      expect(run.gpuFrames, `${count} controls: one core frame per animation frame`).toBe(300);
      if (count === 250) {
        expect(layout.parts).toBe(1480);
        expect(run.meters).toBe(50);
        expect(run.knobs).toBe(20);
        expect(run.work.p95, "250 controls: frame work p95 under 16 ms").toBeLessThan(16);
      }
    }
    // For contrast: the same meters written through the DOM (each write is a native change, so it captures).
    await call("setDensity", 250);
    report.domMeters = trim(await call("animate", 120, { meters: 50, knobs: 20, dom: true }));
    report.gpuTimings = await call("gpuTimings");
    report.end = await stillGpu("end");
    report.diagnostics = await call("diagnostics");
    expect(report.diagnostics).toEqual([]);
    expect(errors).toEqual([]);
  } finally {
    report.errors = errors;
    await writeFile(`${directory}/instrument-dpr${dpr}.json`, JSON.stringify(report, null, 2));
    await context.close();
  }
});
