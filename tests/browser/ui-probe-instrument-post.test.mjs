/**
 * Instrument probe I0.8, the post chain and reflections, on `ui-probe-instrument-post.html` (`window.postProbe`; see
 * docs/ui-library/instrument.md, Phase I0, decisions 4 and 10): the I0.1 layout (250 controls, 50 meters and 20 knobs
 * animating, two overlapping panels) with faceplate labels and lamps, its mesh pass drawn into the layer's own colour +
 * depth target, run through TAA or SMAA, contact shadows, SSGI and bloom, composited over the captured face, and a
 * per-layer local environment probe filled from the capture. At 1920 × 1080, DPR 1 and 2, the test checks that:
 * - for every stage alone and for the full chain, the decoded pixels of every visible text region (faceplate labels and
 *   the captured labels on key caps) are identical with the chain on and off, and identical to core's own frame;
 * - with the composite clipped to the controls' boxes no stage draws a pixel outside its control (halos included), and
 *   without the clip the overshoot is reported in CSS px per control kind;
 * - native hits on drawn pixels and at every control's edges land on the original controls; GPU presentation stays on;
 * - cost: per-task GPU timings (Lite's `getRenderTaskGpuTimings`) and the engine's GPU frame time per stage and for the
 *   full chain, each measured 3 times over 300 animated frames (medians of medians, spread recorded), and the probe's
 *   refill cost;
 * - the TAA trail on turning knobs and switching meters, against the same frame without TAA, and SMAA's.
 * `CANVAS_HEADFUL_POST=1` adds the same text-safety and cost checks in a headful window.
 * Reports and screenshots go to the `ui-probes` evidence directory.
 */
import { test, expect } from "../helpers/current-browser.mjs";
import { evidenceDirectory } from "../helpers/evidence.mjs";
import { browserLaunchOptions } from "../helpers/browser.mjs";
import { previewURL } from "../helpers/urls.mjs";
import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";

const directory = evidenceDirectory("ui-probes");
const intersects = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
const off = { route: "target", aa: "none", contact: false, ssgi: false, bloom: false, bloomSource: "emitters", probe: false, clip: true };
/** Stage configurations, each alone, then the full chain; `nc` variants drop the clip to measure overshoot. */
const stages = {
  taa: { aa: "taa" }, smaa: { aa: "smaa" }, contact: { contact: true }, ssgi: { ssgi: true }, bloom: { bloom: true },
  // Bloom by luminance on the mesh chain (the plan's wording), kept for the record next to the emitter-sourced bloom.
  "bloom-mesh": { bloom: true, bloomSource: "mesh" }, probe: { probe: true },
  full: { aa: "taa", contact: true, ssgi: true, bloom: true, probe: true },
};
// The recommended default chain (decided from the cost, trail and look results): SMAA, emitter bloom and the capture
// probe, clipped to the controls; TAA, contact shadows and SSGI are options.
const recommended = { aa: "smaa", bloom: true, probe: true };
const median = values => { const sorted = [...values].sort((a, b) => a - b); return sorted[Math.floor(sorted.length / 2)] ?? null; };

async function open(browser, dpr, url = "/ui-probe-instrument-post.html") {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: dpr });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(String(error)));
  await page.goto(url);
  await page.waitForFunction(() => window.postProbe);
  const error = await page.evaluate(async () => { try { await window.postProbe.ready; return null; } catch (failure) { return String(failure); } });
  expect(error, "probe must start: HTML-in-Canvas and WebGPU are required").toBeNull();
  const call = (name, ...args) => page.evaluate(async ({ name, args }) => (await window.postProbe.ready)[name](...args), { name, args });
  const stillGpu = async label => {
    const counts = await call("counts");
    expect(counts.mode, `${label}: GPU presentation stays on (${counts.reason})`).toBe("gpu");
    expect(counts.reason, `${label}: no fallback`).toMatch(/^Current content=drawable owning WebGPU canvas/);
    return counts;
  };
  return { context, page, call, stillGpu, errors };
}
/** Sets a chain and checks that every stage was built without an error or a validation error. */
async function chainOf(call, config, label) {
  const built = await call("setChain", { ...off, ...config });
  expect(built.error, `${label}: rebuild`).toBeNull();
  expect(built.validation, `${label}: WebGPU validation`).toBeNull();
  for (const [layer, records] of Object.entries(built.stages)) for (const record of records) expect(record.error, `${label}: ${layer} ${record.stage} built`).toBeUndefined();
  return built;
}
/** Per-stage text safety, containment and hits; `assert` false only records (the headful pass asserts the same). */
async function textSafety({ call, stillGpu, page }, dpr, names, tag) {
  const report = { stages: {} };
  await call("snapshot", "plain", { meshes: false });
  await call("snapshot", "plain-norelief", { meshes: false, relief: false });
  await chainOf(call, { route: "direct" }, "direct");
  await call("snapshot", "direct");
  await chainOf(call, {}, "off");
  await call("snapshot", "off");
  report.offVsDirect = await call("compare", "off", "direct");
  for (const name of names) {
    const clip = !name.endsWith("-nc"), config = { ...stages[name.replace(/-nc$/, "")], clip };
    const built = await chainOf(call, config, name);
    await stillGpu(name);
    await call("snapshot", name);
    const vsOff = await call("compare", name, "off"), vsPlain = await call("compare", name, "plain", ["face"]), vsCapture = await call("compare", name, "plain-norelief", ["cap"]);
    const diff = await call("meshDiff");
    const delta = await call("frameDelta", name, "off");
    report.stages[name] = { config: built.chain, delta, stages: built.stages.lower, tasks: built.tasks.lower, vsOff, vsPlain, vsCapture,
      mesh: { changed: diff.changed, outside: diff.outside, maxOvershoot: diff.maxOvershoot, outsideByKind: diff.outsideByKind, outsideSamples: diff.outsideSamples.slice(0, 4),
        lowerUnderUpper: diff.lowerUnderUpper, perKind: diff.perKind, hitSampleCount: diff.hitSampleCount, hitMismatches: diff.hitMismatches, hitMismatchSamples: diff.hitMismatchSamples } };
    await page.screenshot({ path: `${directory}/instrument-post-${name}${tag}-dpr${dpr}.png` });
    // Every cap label is the capture texel for texel, with or without the clip: caps are drawn after the composite.
    for (const [label, result] of [["vs chain off", vsOff.cap], ["vs the plain capture", vsCapture.cap]]) {
      expect(result.regions, `${name}: cap labels compared`).toBeGreaterThan(20);
      expect(result.differing, `${name}: cap label pixels ${label}: ${JSON.stringify(result.samples)}`).toBe(0);
    }
    expect(vsOff.face.textured, `${name}: faceplate labels carry text`).toBe(vsOff.face.regions);
    expect(diff.hitMismatches, `${name}: native hits on drawn pixels: ${JSON.stringify(diff.hitMismatchSamples)}`).toBe(0);
    if (clip) {
      // Without the clip an upper part's overshoot can land over a hidden lower control, so this is judged clipped only.
      expect(diff.lowerUnderUpper, `${name}: lower-panel parts showing through the upper panel`).toBe(0);
      expect(vsOff.face.differing, `${name}: faceplate label pixels vs chain off: ${JSON.stringify(vsOff.face.samples)}`).toBe(0);
      expect(vsPlain.face.differing, `${name}: faceplate label pixels vs core's frame: ${JSON.stringify(vsPlain.face.samples)}`).toBe(0);
      expect(diff.outside, `${name}: drawn pixels outside their control: ${JSON.stringify(diff.outsideSamples.slice(0, 5))}`).toBe(0);
    }
  }
  return report;
}
/** Three runs of 300 animated frames per configuration; medians of the run medians and the spread between runs. */
async function cost({ call, stillGpu }, configs, repeats = 3, frames = 300) {
  const results = {};
  for (const [name, config] of configs) {
    await chainOf(call, config, name);
    const runs = [];
    for (let run = 0; run < repeats; run++) {
      const result = await call("measure", frames);
      expect(result.mode, `${name}: GPU stays on`).toBe("gpu");
      expect(result.captures, `${name}: animation needs no capture`).toBe(0);
      expect(result.uploads, `${name}: animation needs no upload`).toBe(0);
      expect(result.geometryUpdates, `${name}: animation leaves hit geometry alone`).toBe(0);
      expect(result.gpuFrames, `${name}: one core frame per animation frame`).toBe(frames);
      runs.push(result);
    }
    await stillGpu(name);
    const pick = (get, key) => runs.map(run => get(run)?.[key]).filter(value => typeof value === "number");
    const summary = metric => ({ p50: median(pick(metric, "p50")), p95: median(pick(metric, "p95")), spreadP50: Math.max(...pick(metric, "p50")) - Math.min(...pick(metric, "p50")), runsP50: pick(metric, "p50"), runsP95: pick(metric, "p95") });
    const names = [...new Set(runs.flatMap(run => Object.keys(run.tasks)))];
    results[name] = { config: runs[0].chain, gpuFrame: summary(run => run.gpu), work: summary(run => run.work), tasksTotal: summary(run => run.tasksTotal),
      tasks: Object.fromEntries(names.map(task => [task, summary(run => run.tasks[task])])), droppedTasks: Math.max(...runs.map(run => run.droppedTasks)),
      timingStatus: runs.map(run => run.timingStatus), controls: runs[0].controls, parts: runs[0].parts, meters: runs[0].meters, knobs: runs[0].knobs };
  }
  return results;
}
const costConfigs = [
  ["direct", { route: "direct" }], ["off", {}], ["taa", stages.taa], ["smaa", stages.smaa], ["contact", stages.contact], ["ssgi", stages.ssgi],
  ["bloom", stages.bloom], ["bloom-mesh", stages["bloom-mesh"]], ["recommended", recommended], ["full-noprobe", { ...stages.full, probe: false }],
  // Last: the probe enables Lite's local cubemap path for the rest of the page's life.
  ["probe", stages.probe], ["full", stages.full],
];

for (const dpr of [1, 2]) test(`I0.8 post chain leaves captured text untouched, stays inside the controls and keeps hits DPR${dpr}`, async ({ browser }) => {
  test.setTimeout(1500000);
  const session = await open(browser, dpr);
  const { call, stillGpu, page, errors } = session;
  const report = { dpr, browser: browser.version(), userAgent: await call("browser"), tokens: await call("tokens") };
  await mkdir(directory, { recursive: true });
  try {
    report.start = await stillGpu("start");
    Object.assign(report, await textSafety(session, dpr, [...Object.keys(stages), "taa-nc", "smaa-nc", "contact-nc", "ssgi-nc", "bloom-nc", "bloom-mesh-nc", "probe-nc", "full-nc"], ""));
    expect(report.offVsDirect.face.differing, "the target route draws the same faceplate text as the I0.1 route").toBe(0);
    expect(report.offVsDirect.cap.differing, "the target route draws the same cap labels as the I0.1 route").toBe(0);

    // Native hits with the full chain on: centre and 1.5 px inside each edge land on the control; 1.5 px outside does not.
    await chainOf(call, stages.full, "full");
    const controls = await call("controls"), panels = await call("panels");
    const visible = controls.filter(control => control.layer === "upper" || !intersects(control, panels.upper));
    const points = [], expected = [];
    for (const control of visible) {
      const cx = control.x + control.width / 2, cy = control.y + control.height / 2;
      for (const point of [{ x: cx, y: cy }, { x: control.x + 1.5, y: cy }, { x: control.x + control.width - 1.5, y: cy }, { x: cx, y: control.y + 1.5 }, { x: cx, y: control.y + control.height - 1.5 }]) { points.push(point); expected.push({ id: control.id, inside: true }); }
      for (const point of [{ x: control.x - 1.5, y: cy }, { x: control.x + control.width + 1.5, y: cy }, { x: cx, y: control.y - 1.5 }, { x: cx, y: control.y + control.height + 1.5 }]) { points.push(point); expected.push({ id: control.id, inside: false }); }
    }
    const hits = await call("hits", points), misses = [];
    hits.forEach((hit, index) => { const want = expected[index]; if (want.inside ? hit !== want.id : hit === want.id) misses.push({ point: points[index], hit, ...want }); });
    report.hits = { points: points.length, missCount: misses.length, misses: misses.slice(0, 20) };
    expect(misses).toEqual([]);
    // Real pointer input through the filtered parts: a lamp toggles, a knob takes a click.
    const lamp = visible.find(control => control.kind === "lamp" && control.layer === "lower");
    const lampBefore = await call("state", lamp.id);
    await page.mouse.click(lamp.x + lamp.width / 2, lamp.y + lamp.height / 2);
    report.pointer = { lamp: { id: lamp.id, before: lampBefore, after: await call("state", lamp.id) } };
    expect(report.pointer.lamp.after.checked, "a click on the lamp toggles the native checkbox").toBe(!lampBefore.checked);
    report.afterPointer = await stillGpu("after pointer input");
    report.probes = await call("probes");
    report.end = await stillGpu("end");
    report.diagnostics = await call("diagnostics");
    expect(report.diagnostics).toEqual([]);
    expect(errors).toEqual([]);
  } finally {
    report.errors = errors;
    await writeFile(`${directory}/instrument-post-safety-dpr${dpr}.json`, JSON.stringify(report, null, 2));
    await session.context.close();
  }
});

for (const dpr of [1, 2]) test(`I0.8 post chain cost per stage at 250 controls DPR${dpr}`, async ({ browser }) => {
  test.setTimeout(1500000);
  const session = await open(browser, dpr);
  const { call, stillGpu, page, errors } = session;
  const report = { dpr, browser: browser.version(), userAgent: await call("browser"), note: "medians of 3 runs of 300 frames; other GPU work may share the machine" };
  await mkdir(directory, { recursive: true });
  try {
    report.start = await stillGpu("start");
    report.cost = await cost(session, costConfigs);
    for (const [name, result] of Object.entries(report.cost)) {
      expect(result.controls).toBe(250);
      expect(result.meters).toBe(50);
      expect(result.knobs).toBe(20);
      expect(result.timingStatus.every(status => status === "available"), `${name}: per-task GPU timings available`).toBe(true);
      expect(result.gpuFrame.p50, `${name}: engine GPU frame time measured`).toBeGreaterThan(0);
    }
    // The probe's refill (on a capture) of one layer's cube, timed with timestamp queries.
    await chainOf(call, stages.probe, "probe");
    report.probeRefresh = await call("probeRefresh", 30);
    expect(report.probeRefresh.gpu.n).toBeGreaterThan(0);
    // The look of each stage, close up around a lit lamp (for the report).
    const controls = await call("controls"), panels = await call("panels");
    let lamp;
    for (const control of controls) if (control.kind === "lamp" && control.layer === "lower" && !intersects(control, panels.upper) && control.y > 300 && (await call("state", control.id)).checked) { lamp = control; break; }
    const clip = { x: Math.max(0, lamp.x + lamp.width / 2 - 150), y: Math.max(0, lamp.y + lamp.height / 2 - 100), width: 300, height: 200 };
    for (const [name, config] of [["off", {}], ...Object.entries(stages), ["recommended", recommended]]) {
      await chainOf(call, config, name);
      await page.screenshot({ path: `${directory}/instrument-post-crop-${name}-dpr${dpr}.png`, clip });
    }
    report.crop = clip;
    report.end = await stillGpu("end");
    expect(errors).toEqual([]);
  } finally {
    report.errors = errors;
    await writeFile(`${directory}/instrument-post-cost-dpr${dpr}.json`, JSON.stringify(report, null, 2));
    await session.context.close();
  }
});

for (const dpr of [1, 2]) test(`I0.8 TAA trail on turning knobs against no AA and SMAA DPR${dpr}`, async ({ browser }) => {
  test.setTimeout(600000);
  const session = await open(browser, dpr);
  const { call, stillGpu, errors } = session;
  const report = { dpr, browser: browser.version() };
  await mkdir(directory, { recursive: true });
  try {
    // Static frames: what anti-aliasing alone changes on knobs and meters.
    for (const aa of ["none", "taa", "smaa"]) { await chainOf(call, { aa }, aa); await call("snapshot", `static-${aa}`); }
    // The same animation frame (I0.1's 50 meters and 20 knobs after 90 frames) under each mode.
    report.frames = {};
    for (const aa of ["none", "taa", "smaa"]) { await chainOf(call, { aa }, aa); report.frames[aa] = await call("ghosting", 90); }
    report.static = { taa: await call("trail", "static-taa", "static-none"), smaa: await call("trail", "static-smaa", "static-none") };
    report.moving = { taa: await call("trail", "ghost-taa", "ghost-none"), smaa: await call("trail", "ghost-smaa", "ghost-none") };
    // A trail is what motion adds beyond the static anti-aliasing difference.
    report.trail = Object.fromEntries(["taa", "smaa"].map(aa => [aa, Object.fromEntries(["knob", "meter"].map(kind => [kind,
      { overShare: report.moving[aa][kind].overShare - report.static[aa][kind].overShare, mean: report.moving[aa][kind].mean - report.static[aa][kind].mean }]))]));
    report.end = await stillGpu("end");
    expect(errors).toEqual([]);
  } finally {
    report.errors = errors;
    await writeFile(`${directory}/instrument-post-ghosting-dpr${dpr}.json`, JSON.stringify(report, null, 2));
    await session.context.close();
  }
});

test("I0.8 post chain in a headful window: text safety, containment and cost", async () => {
  test.skip(process.env.CANVAS_HEADFUL_POST !== "1", "Opt-in headful run (CANVAS_HEADFUL_POST=1)");
  test.setTimeout(1800000);
  const browser = await chromium.launch(browserLaunchOptions({ headless: false }));
  const report = { browser: browser.version(), headful: true, runs: {} };
  await mkdir(directory, { recursive: true });
  try {
    for (const dpr of [1, 2]) {
      const session = await open(browser, dpr, `${previewURL}/ui-probe-instrument-post.html`);
      const run = (report.runs[dpr] = { windowDpr: await session.page.evaluate(() => devicePixelRatio) });
      try {
        await session.page.bringToFront();
        run.start = await session.stillGpu("start");
        Object.assign(run, await textSafety(session, dpr, ["full", "bloom-nc", "full-nc"], "-headful"));
        run.cost = await session.call("measure", 30).then(() => cost(session, [["off", {}], ["recommended", recommended], ["full", stages.full]]));
        run.end = await session.stillGpu("end");
        expect(session.errors).toEqual([]);
      } finally { run.errors = session.errors; await session.context.close(); }
    }
  } finally {
    await writeFile(`${directory}/instrument-post-headful.json`, JSON.stringify(report, null, 2));
    await browser.close();
  }
});
