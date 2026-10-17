/**
 * Instrument probe I0.5, object-on-object shadows, on `ui-probe-instrument-shadows.html` (`window.shadowsProbe`; see
 * docs/ui-library/instrument.md, Phase I0 and decision 4): bats (at both stops and mid-travel), rockers, knobs, faders,
 * keys and thin plates over real native inputs, each with a printed label, at 1920 × 1080. Three shadow paths: analytic
 * face shadows (the Relief formula per part footprint, a shader quad per control on the mesh pass), a per-layer shadow
 * map from the key light (parts receive, the captured face does not), and screen-space contact shadows on an offscreen
 * mesh pass composited over the face. At DPR 1 and 2 the test checks that:
 * - GPU presentation stays on throughout, toggling paths causes no capture and no hit-geometry update, and Lite reports
 *   no WebGPU validation error;
 * - with the map on, every bat's plate is darker where its lever and ball project along the light, with no acne
 *   elsewhere on the plate, and no face pixel outside the parts' analytic footprints changes (none outside any box);
 * - with contact shadows on, the band at the base of every knob, key and fader cap darkens and the face is untouched;
 * - every thin plate's mapped shadow on its mount is one connected region with no cut row and no gap from the plate's
 *   base, and its analytic shadow on the face likewise;
 * - every label keeps at least 4.5:1 with every path on; no mesh pixel lies outside its control's box; native hits on
 *   mesh pixels, on a grid over every control and on shadow pixels outside the boxes are unchanged;
 * - the post chain with contact shadows off is pixel-identical to the direct mesh pass.
 * It records the map's bias window per map size, CSM and ESM on the thin plate (each on its own page: switching the
 * generator kind on one engine is unsupported, see the report), and the GPU cost of each path at 60 and 250 controls,
 * static and with 20 bats snapping, for both map refresh policies. Reports and screenshots go to the `ui-probes`
 * evidence directory (`instrument-shadows-dpr<n>.json`, `-headful` when run headed).
 */
import { test, expect } from "../helpers/current-browser.mjs";
import { evidenceDirectory } from "../helpers/evidence.mjs";
import { mkdir, writeFile } from "node:fs/promises";

const directory = evidenceDirectory("ui-probes");
const round = value => (Number.isFinite(value) ? Math.round(value * 1000) / 1000 : value);
const paths = { none: {}, a: { analytic: true }, b: { map: true }, c: { contact: true }, ab: { analytic: true, map: true }, abc: { analytic: true, map: true, contact: true } };
const set = name => ({ analytic: false, map: false, contact: false, ...paths[name] });
const brief = result => { const { outsideSamples, mismatchSamples, outsideBoxSamples, ...rest } = result; return { ...rest, outsideSamples: outsideSamples?.slice(0, 5) }; };
/** One summary row per shadow-map setting: the thin plates on their mounts and the levers on their plates. */
const summarise = (thin, lever) => {
  const sum = key => lever.reduce((total, entry) => total + entry[key], 0);
  return {
    thin: { components: Math.max(...thin.map(entry => entry.components)), minComponents: Math.min(...thin.map(entry => entry.components)), cutRows: thin.reduce((total, entry) => total + entry.cut, 0),
      lines: thin.reduce((total, entry) => total + entry.lines, 0), gapMax: Math.max(...thin.map(entry => entry.gapMax ?? Infinity)), widthMedian: thin[0].widthMedian, acne: round(Math.max(...thin.map(entry => entry.acne))) },
    lever: { inRegion: round(sum("darkened") / sum("region")), meanDelta: round(lever.reduce((total, entry) => total + entry.meanDelta * entry.region, 0) / sum("region")),
      ratio: round(lever.reduce((total, entry) => total + entry.ratio, 0) / lever.length), acne: round(sum("acne") / sum("remoteArea")) },
  };
};

for (const dpr of [1, 2]) test(`I0.5 object-on-object shadows fall on parts only, with a clean thin-plate shadow and measured cost DPR${dpr}`, async ({ browser, headless }) => {
  test.setTimeout(2400000);
  const suffix = headless ? "" : "-headful";
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: dpr });
  const errors = [], gpuWarnings = [];
  /** Opens the probe with an initial configuration; each page has its own engine. */
  const open = async (config = {}) => {
    const page = await context.newPage();
    page.on("pageerror", error => errors.push(String(error)));
    page.on("console", message => { if (/Invalid|WGSL|validat/i.test(message.text())) gpuWarnings.push({ config, text: message.text().slice(0, 300) }); });
    await page.goto(`/ui-probe-instrument-shadows.html?config=${encodeURIComponent(JSON.stringify(config))}`);
    await page.waitForFunction(() => window.shadowsProbe);
    const error = await page.evaluate(async () => { try { await window.shadowsProbe.ready; return null; } catch (failure) { return String(failure); } });
    expect(error, "probe must start: HTML-in-Canvas and WebGPU are required").toBeNull();
    const call = (name, ...args) => page.evaluate(async ({ name, args }) => (await window.shadowsProbe.ready)[name](...args), { name, args });
    await call("showStatus", false);
    return { page, call };
  };
  const { page, call } = await open();
  const report = { dpr, headless, browser: browser.version(), userAgent: await call("browser"), tokens: await call("tokens") };
  await mkdir(directory, { recursive: true });
  const stillGpu = async (label, probe = call) => {
    const counts = await probe("counts");
    expect(counts.mode, `${label}: GPU presentation stays on (${counts.reason})`).toBe("gpu");
    expect(counts.reason, `${label}: no fallback`).toMatch(/^Current content=drawable owning WebGPU canvas/);
    return counts;
  };
  const snap = async (name, probe = call) => { await probe("setPaths", set(name)); await probe("snap", name); };

  try {
    report.start = await stillGpu("start");
    report.config = await call("config");
    report.gridBefore = await call("gridHits");
    expect(report.gridBefore.misses, `grid hits ${JSON.stringify(report.gridBefore.missSamples)}`).toBe(0);

    // Every path, toggled at run time: decoded frames, no capture, no hit-geometry update.
    const before = await call("counts");
    for (const name of Object.keys(paths)) await snap(name);
    const after = await call("counts");
    report.toggles = { captures: after.captures - before.captures, geometryUpdates: after.geometryUpdates - before.geometryUpdates, gpuFrames: after.gpuFrames - before.gpuFrames };
    expect(report.toggles.captures, "path toggles need no capture").toBe(0);
    expect(report.toggles.geometryUpdates, "path toggles leave hit geometry alone").toBe(0);

    // (b) The map: shadow on the plates under the levers, the face untouched outside the analytic footprints.
    report.compare = {};
    for (const [on, off] of [["b", "none"], ["ab", "a"], ["c", "none"], ["a", "none"], ["abc", "none"]]) report.compare[`${on}-${off}`] = brief(await call("compare", on, off));
    for (const key of ["b-none", "ab-a", "c-none"]) {
      expect(report.compare[key].changed, `${key}: the path draws`).toBeGreaterThan(1000);
      expect(report.compare[key].outsideBoxes, `${key}: changed face pixels outside every control's box`).toBe(0);
      expect(report.compare[key].outsideFootprints, `${key}: changed face pixels outside the analytic footprints`).toBe(0);
      expect(report.compare[key].hitMismatches, `${key}: native hits on changed pixels`).toBe(0);
    }
    for (const key of ["a-none", "abc-none"]) expect(report.compare[key].outsideFootprints, `${key}: changed face pixels outside the analytic footprints ${JSON.stringify(report.compare[key].outsideSamples)}`).toBe(0);
    report.lever = await call("leverShadow", "b", "none");
    for (const bat of report.lever) {
      expect(bat.region, `${bat.id}: the lever's shadow region lies on the plate`).toBeGreaterThan(20 * dpr * dpr);
      expect(bat.darkened / bat.region, `${bat.id} at travel ${bat.travel}: plate darker under the lever`).toBeGreaterThan(0.8);
      expect(bat.meanDelta, `${bat.id}: mean darkening under the lever (levels)`).toBeLessThan(-8);
      expect(bat.acne / bat.remoteArea, `${bat.id}: acne where no part can cast`).toBeLessThan(0.01);
    }
    expect(new Set(report.lever.map(bat => bat.travel)), "bats at both stops and mid-travel").toEqual(new Set([0, 0.5, 1]));

    // (c) Contact shadows at every cap's base.
    report.contact = await call("contactLines", "c", "none");
    for (const [kind, value] of Object.entries(report.contact)) {
      expect(value.darkened / value.band, `${kind}: the contact line at the cap's base darkens`).toBeGreaterThan(0.3);
      expect(value.meanDelta, `${kind}: mean darkening of the contact band (levels)`).toBeLessThan(-3);
    }

    // The thin plate: one connected shadow, no cut, no gap, on its mount (map) and on the face (analytic).
    report.thin = { map: await call("thinPlate", "b", "none"), analyticFace: await call("thinPlate", "a", "none", { face: true }), contact: await call("thinPlate", "c", "none") };
    for (const [path, plates] of Object.entries({ map: report.thin.map, analyticFace: report.thin.analyticFace })) for (const plate of plates) {
      expect(plate.components, `${path} ${plate.id}: shadow is one connected region`).toBe(1);
      expect(plate.cut, `${path} ${plate.id}: rows with no shadow beside the plate (cut)`).toBe(0);
      expect(plate.gapMax, `${path} ${plate.id}: gap between the plate's base and its shadow (px)`).toBeLessThanOrEqual(1);
      expect(plate.acne, `${path} ${plate.id}: darkening away from the plate (acne)`).toBeLessThan(0.01);
    }

    // Labels keep their contrast with every path.
    report.labels = {};
    for (const name of Object.keys(paths)) {
      report.labels[name] = await call("labelContrast", name);
      expect(report.labels[name].min, `${name}: lowest label contrast (${report.labels[name].worst})`).toBeGreaterThanOrEqual(4.5);
    }

    // Containment: no mesh pixel outside its control's box (map and contact on); analytic shadows only in their footprints.
    await call("setPaths", set("b"));
    await call("setPaths", { contact: true });
    report.containment = await call("containment");
    expect(report.containment.changed, "the meshes draw").toBeGreaterThan(20000);
    expect(report.containment.outsideBoxes, `mesh pixels outside their control ${JSON.stringify(report.containment.outsideBoxSamples)}`).toBe(0);
    expect(report.containment.hitMismatches, `native hits on mesh pixels ${JSON.stringify(report.containment.mismatchSamples)}`).toBe(0);
    await call("setPaths", set("abc"));
    report.containmentAnalytic = await call("containment");
    expect(report.containmentAnalytic.outsideFootprints, "pixels outside the boxes and the analytic footprints").toBe(0);
    report.shadowHits = await call("shadowHits", "__on", "__off");
    expect(report.shadowHits.points, "shadow pixels outside the boxes sampled").toBeGreaterThan(100);
    expect(report.shadowHits.onControl, `shadow pixels outside the boxes hit a control ${JSON.stringify(report.shadowHits.samples)}`).toBe(0);
    report.gridAfter = await call("gridHits");
    expect(report.gridAfter, "grid hits unchanged by the shadow paths").toEqual(report.gridBefore);

    // Screenshots of every path (status hidden): whole stage and a close-up of the first case of each kind.
    const clip = await call("closeUp");
    report.screenshots = [];
    for (const name of Object.keys(paths)) {
      await call("setPaths", set(name));
      for (const [kind, options] of [["", {}], ["-close", { clip }]]) {
        const path = `${directory}/instrument-shadows-${name}${kind}-dpr${dpr}${suffix}.png`;
        await page.screenshot({ path, ...options });
        report.screenshots.push(path);
      }
    }

    // The post chain with contact shadows off is the direct mesh pass, pixel for pixel.
    await snap("a");
    await call("configure", { post: false });
    await call("setPaths", set("a"));
    await call("snap", "a-direct");
    report.postVersusDirect = brief(await call("compare", "a", "a-direct"));
    expect(report.postVersusDirect.changed, "post chain (contact off) against the direct mesh pass").toBe(0);
    await call("configure", { post: true });

    // The map's bias window per map size, on the thin plates and the levers (map alone against no shadows).
    report.biasSweep = [];
    for (const [mapSize, biases] of [[2048, [1e-3, 1.5e-3, 2e-3, 2.5e-3, 3e-3]], [4096, [5e-4, 7.5e-4, 1e-3, 1.5e-3, 2.5e-3, 3e-3]]]) for (const bias of biases) {
      await call("configure", { mapSize, bias, post: false });
      await snap("none"); await snap("b");
      const { thin, lever } = summarise(await call("thinPlate", "b", "none"), await call("leverShadow", "b", "none"));
      // Lite offsets the caster's NDC depth by bias / 2; the light-space depth range spans the stage plus 400 px.
      const range = 2 * (Math.hypot(1920, 1080) / 2 + 200);
      report.biasSweep.push({ mapSize, bias, worldBiasPx: round((bias / 2) * range), thin, lever, clean: thin.minComponents === 1 && thin.components === 1 && thin.cutRows === 0 && thin.acne < 0.01 && lever.acne < 0.01 && lever.inRegion > 0.8 });
    }
    for (const [mapSize, bias] of [[4096, 1.5e-3], [2048, 2e-3]]) expect(report.biasSweep.find(row => row.mapSize === mapSize && row.bias === bias)?.clean, `${mapSize} at bias ${bias} is clean`).toBe(true);
    await call("configure", { mapSize: 4096, bias: 1.5e-3, post: true });

    // Cost: GPU time per path at 60 and 250 controls, static and with 20 bats snapping, for each build.
    report.cost = {};
    const measure = async (label, names) => {
      for (const name of names) {
        await call("setPaths", set(name));
        for (const snapping of [false, true]) {
          const run = await call("measure", 120, { snapping });
          report.cost[report.layout][`${label}/${name}/${snapping ? "snapping" : "static"}`] = { gpuMean: round(run.gpu?.mean), gpuP50: round(run.gpu?.p50), gpuP95: round(run.gpu?.p95), workP50: round(run.work.p50),
            tasks: Object.fromEntries(Object.entries(run.tasks).map(([task, value]) => [task, round(value.meanPerFrame)])), shadowRenders: run.shadowRenders, frames: run.sampledFrames, bats: run.bats, captures: run.captures };
          expect(run.mode, `${label}/${name}: GPU stays on`).toBe("gpu");
          expect(run.captures, `${label}/${name}: animation needs no capture`).toBe(0);
          expect(run.geometryUpdates, `${label}/${name}: animation leaves hit geometry alone`).toBe(0);
          if (snapping) expect(run.bats, "20 bats snap").toBe(20);
        }
      }
    };
    for (const layout of ["cases", "dense"]) {
      report.layout = layout;
      report.cost[layout] = { layout: await call("setLayout", layout) };
      await stillGpu(layout);
      if (layout === "dense") await page.screenshot({ path: `${directory}/instrument-shadows-dense-abc-dpr${dpr}${suffix}.png` });
      await call("configure", { mapSize: 4096, bias: 1.5e-3, post: true, policy: "change" });
      await measure("post-pcf4096-change", ["none", "a", "b", "c", "abc"]);
      await call("configure", { policy: "frame" });
      await measure("post-pcf4096-frame", ["b", "abc"]);
      await call("configure", { policy: "change", post: false });
      await measure("direct-pcf4096-change", ["none", "a", "b"]);
      await call("configure", { mapSize: 2048, bias: 2e-3, post: true });
      await measure("post-pcf2048-change", ["b"]);
      await call("configure", { mapSize: 4096, bias: 1.5e-3, post: true });
    }
    delete report.layout;
    await call("setLayout", "cases");
    report.end = await stillGpu("end");
    report.diagnostics = await call("diagnostics");
    expect(report.diagnostics).toEqual([]);
    await page.close();

    // Alternatives on the thin plate, each on its own page (its own engine): CSM, then ESM.
    report.alternatives = [];
    const alternatives = [
      { generator: "csm", mapSize: 4096, bias: 0, post: false, csm: { numCascades: 2, lambda: 0.5, stabilizeCascades: false, worldSpaceBias: 1.5 } },
      { generator: "csm", mapSize: 2048, bias: 0, post: false, csm: { numCascades: 2, lambda: 0.5, stabilizeCascades: false, worldSpaceBias: 2 } },
      { generator: "csm", mapSize: 2048, bias: 0, post: false, csm: { numCascades: 4, lambda: 0.5, stabilizeCascades: false, worldSpaceBias: 1 } },
      { generator: "esm", mapSize: 4096, bias: 0, post: false, esm: { depthScale: 50, blurKernel: 1 } },
      { generator: "esm", mapSize: 4096, bias: 1e-3, post: false, esm: { depthScale: 87, blurKernel: 2 } },
    ];
    for (const config of alternatives) {
      const probe = await open(config);
      await stillGpu(config.generator, probe.call);
      await snap("none", probe.call); await snap("b", probe.call);
      const row = { config, ...summarise(await probe.call("thinPlate", "b", "none"), await probe.call("leverShadow", "b", "none")), compare: brief(await probe.call("compare", "b", "none")) };
      expect(row.compare.outsideBoxes, `${config.generator}: face pixels outside every box`).toBe(0);
      const name = `${config.generator}-${config.mapSize}-${config.csm?.numCascades ?? config.esm.depthScale}`;
      await probe.page.screenshot({ path: `${directory}/instrument-shadows-${name}-close-dpr${dpr}${suffix}.png`, clip: await probe.call("closeUp") });
      const runs = {};
      for (const snapping of [false, true]) { const run = await probe.call("measure", 120, { snapping }); runs[snapping ? "snapping" : "static"] = { gpuP50: round(run.gpu?.p50), tasks: Object.fromEntries(Object.entries(run.tasks).map(([task, value]) => [task, round(value.meanPerFrame)])), shadowRenders: run.shadowRenders }; }
      row.cost = runs;
      report.alternatives.push(row);
      await probe.page.close();
    }
    report.gpuWarnings = gpuWarnings;
    expect(gpuWarnings, "no WebGPU validation error").toEqual([]);
    expect(errors).toEqual([]);
  } finally {
    report.errors = errors;
    report.gpuWarnings = gpuWarnings;
    await writeFile(`${directory}/instrument-shadows-dpr${dpr}${suffix}.json`, JSON.stringify(report, null, 2));
    await context.close();
  }
});
