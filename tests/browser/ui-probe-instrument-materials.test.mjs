/**
 * Instrument probe I0.4, materials over the capture, on `ui-probe-instrument-materials.html` (`window.materialsProbe`;
 * see docs/ui-library/instrument.md, Phase I0): brushed aluminium, clear-coated lacquer, gold, a glass lens with
 * dispersion, chrome and a display under glass, drawn by a Lite mesh scene per layer over two faceplates (light and
 * dark), with the studio environment and the layer's own capture as a local environment probe. At DPR 1 and 2 the test
 * checks that:
 * - GPU presentation stays on throughout, through real keyboard input into the display;
 * - the studio's softbox lies in the key light's direction after `setEnvironmentRotation` (read back from the cube);
 * - every pixel the mesh scenes draw lies inside its own control's box, and native hits there find that control;
 * - the faceplate outside the controls changes by no more than `interior.max` with the materials on and off, and the
 *   printed labels beside the reflective parts keep at least 4.5:1;
 * - a click through the display glass focuses the native input; each typed character changes the decoded pixels
 *   under the glass; with the caret hidden, the text under the flat glass matches the plain capture (tolerance
 *   recorded) and keeps at least 4.5:1 on both themes;
 * - moving a bright element beside the chrome dome changes the dome's decoded pixels with the probe filled from the
 *   page, and not with the probe filled from the studio only;
 * - the cost of refreshing the probe every frame against only on capture is measured.
 * A second test records why Lite's own transmission is not used over the capture. Reports and screenshots go to the
 * `ui-probes` evidence directory.
 */
import { test, expect } from "../helpers/current-browser.mjs";
import { evidenceDirectory } from "../helpers/evidence.mjs";
import { mkdir, writeFile } from "node:fs/promises";
import { PNG } from "pngjs";

const directory = evidenceDirectory("ui-probes");
const viewport = { width: 1280, height: 800 };
const open = async (browser, dpr, query = "") => {
  const context = await browser.newContext({ viewport, deviceScaleFactor: dpr });
  const page = await context.newPage();
  const errors = [], warnings = [];
  page.on("pageerror", error => errors.push(String(error)));
  page.on("console", message => { if (message.type() === "warning" || message.type() === "error") warnings.push(message.text()); });
  await page.goto(`/ui-probe-instrument-materials.html${query}`);
  await page.waitForFunction(() => window.materialsProbe);
  const error = await page.evaluate(async () => { try { await window.materialsProbe.ready; return null; } catch (failure) { return String(failure); } });
  expect(error, "probe must start: HTML-in-Canvas and WebGPU are required").toBeNull();
  const call = (name, ...args) => page.evaluate(async ({ name, args }) => (await window.materialsProbe.ready)[name](...args), { name, args });
  return { context, page, errors, warnings, call };
};

for (const dpr of [1, 2]) test(`I0.4 materials over the capture keep contrast, containment, hits and fresh pixels DPR${dpr}`, async ({ browser }) => {
  test.setTimeout(600000);
  const { context, page, errors, warnings, call } = await open(browser, dpr);
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
    await page.screenshot({ path: `${directory}/instrument-materials-dpr${dpr}.png` });
    if (dpr === 2) {
      // One screenshot per material, both themes, named for what it shows.
      const shots = {
        "brushed-aluminium-bezel-display-glass": "display", "black-lacquer-clearcoat-knob": "knob-lacquer", "gold-knob": "knob-gold",
        "glass-lens-dispersion-knob": "knob-glass", "chrome-knob": "knob-chrome", "chrome-dome-reflecting-beacon": "dome",
      };
      for (const theme of ["light", "dark"]) for (const [name, id] of Object.entries(shots)) {
        const rect = await call("partRect", `${theme}-${id}`), pad = id === "dome" ? 72 : 10;
        await page.screenshot({ path: `${directory}/instrument-materials-${theme}-${name}-dpr2.png`,
          clip: { x: rect.x - pad, y: rect.y - 10, width: rect.width + pad + 10, height: rect.height + (id.startsWith("knob") ? 40 : 20) } });
      }
    }

    // The studio's softbox, read back from the loaded cube, lies in the key light's direction.
    report.studioKey = await call("studioKey");
    expect(report.studioKey.samples).toBeGreaterThan(20);
    expect(report.studioKey.angleDegrees, "the softbox is aligned with the key light").toBeLessThan(3);

    // Containment and native hits on drawn mesh pixels.
    const diff = await call("meshDiff");
    report.meshDiff = diff;
    expect(diff.changed, "the mesh scenes draw").toBeGreaterThan(50000 * dpr * dpr);
    expect(diff.outside, `mesh pixels outside their control: ${JSON.stringify(diff.outsideSamples.slice(0, 5))}`).toBe(0);
    expect(diff.hitSampleCount).toBeGreaterThan(1000);
    expect(diff.hitMismatches, `native hits on mesh pixels: ${JSON.stringify(diff.hitMismatchSamples)}`).toBe(0);

    // The face outside the controls, and the labels beside reflective parts.
    const interior = await call("interior");
    report.interior = interior;
    for (const [face, stats] of Object.entries(interior.faces)) {
      expect(stats.pixels, `${face}: face pixels compared`).toBeGreaterThan(100000 * dpr * dpr);
      expect(stats.maxRelative, `${face}: face interior change with materials on and off (${JSON.stringify(stats.worst)})`).toBeLessThanOrEqual(interior.interiorMax);
    }
    expect(interior.labels.length).toBe(10);
    for (const label of interior.labels) expect(label.on.ratio, `${label.id} contrast with the materials on`).toBeGreaterThanOrEqual(4.5);

    // Real pointer input through the glass focuses the native input.
    const glass = await call("glassRect", "light");
    const glassPoints = [{ x: glass.x + 4, y: glass.y + 4 }, { x: glass.x + glass.width / 2, y: glass.y + glass.height / 2 }, { x: glass.x + glass.width - 4, y: glass.y + glass.height - 4 }];
    report.glassHits = await call("hits", glassPoints);
    expect(report.glassHits).toEqual(["light-display", "light-display", "light-display"]);
    await page.mouse.click(glass.x + glass.width - 20, glass.y + glass.height / 2);
    expect((await call("state", "light-display")).focused, "a click on the glass focuses the display's input").toBe(true);
    await page.keyboard.press("End");

    // Real keyboard input: each character is a native change, captured fresh under the glass, with GPU staying on.
    report.typing = [];
    await call("settle");
    let previous = await call("region", glass);
    for (const character of " 7.5k") {
      const before = await call("counts");
      await page.keyboard.type(character);
      await call("settle");
      const pixels = await call("region", glass), counts = await stillGpu(`after typing "${character}"`);
      const changed = pixels.reduce((sum, value, index) => sum + (index % 3 === 0 && (value !== previous[index] || pixels[index + 1] !== previous[index + 1] || pixels[index + 2] !== previous[index + 2]) ? 1 : 0), 0);
      report.typing.push({ character, value: (await call("state", "light-display")).value, changedPixels: changed, captures: counts.captures - before.captures, uploads: counts.uploads - before.uploads });
      previous = pixels;
    }
    expect((await call("state", "light-display")).value).toBe("440.00 Hz 7.5k");
    for (const step of report.typing) {
      expect(step.captures, `"${step.character}" is captured`).toBeGreaterThan(0);
      // A space moves only the caret; every glyph adds more than the caret's own pixels.
      expect(step.changedPixels, `"${step.character}" changes the decoded pixels under the glass`).toBeGreaterThan(step.character === " " ? 0 : 40 * dpr * dpr);
    }

    // Text under the flat glass against the plain capture, and its contrast, with the caret hidden.
    await call("setCaret", false);
    const display = await call("display");
    report.display = display;
    for (const [face, result] of Object.entries(display)) {
      expect(result.compared).toBeGreaterThan(20000 * dpr * dpr);
      expect(result.mismatched, `${face}: text under the clear glass matches the plain capture (max delta ${result.maxDelta})`).toBe(0);
      expect(result.through.ratio, `${face}: display text contrast through the glass`).toBeGreaterThanOrEqual(4.5);
    }
    await call("setCaret", true);
    report.afterTyping = await stillGpu("after typing");

    // The probe reflects the captured page: the beacon's move shows on the chrome dome with the page probe only.
    const reflection = await call("reflection", "light");
    report.reflection = reflection;
    expect(reflection.page.captures, "moving the beacon is captured").toBeGreaterThan(0);
    expect(reflection.page.refreshes, "the probe refreshes on capture").toBeGreaterThan(0);
    expect(reflection.page.dome.changed, "the dome reflects the beacon through the page probe").toBeGreaterThan(30 * dpr * dpr);
    expect(reflection.studio.dome.changed, "with the studio-only probe the dome does not see the beacon").toBe(0);
    expect(reflection.pageVsStudio.changed, "the page probe changes the dome against the studio").toBeGreaterThan(500 * dpr * dpr);
    expect(reflection.page.mode).toBe("gpu");

    // Probe refresh policy: every frame against only on capture (no capture during the run).
    const cost = await call("probeCost", 120);
    report.probeCost = cost;
    expect(cost.capture.captures).toBe(0);
    expect(cost.capture.refreshes, "on capture: no refresh without a capture").toBe(0);
    expect(cost.everyFrame.refreshes, "every frame: one refresh per layer per frame").toBeGreaterThanOrEqual(120 * cost.probe.layers);

    report.gpuTimings = await call("gpuTimings");
    report.end = await stillGpu("end");
    report.diagnostics = await call("diagnostics");
    expect(report.diagnostics).toEqual([]);
    expect(errors).toEqual([]);
    expect(warnings.filter(text => /Invalid|not compatible|validation/i.test(text)), "no WebGPU validation errors").toEqual([]);
  } finally {
    report.errors = errors;
    report.warnings = warnings.slice(0, 20);
    await writeFile(`${directory}/instrument-materials-dpr${dpr}.json`, JSON.stringify(report, null, 2));
    await context.close();
  }
});

// Why the glass is not Lite's own transmission: in a layer scene of the probe hook, `setPbrTransmission` makes Lite
// retarget the scene's render task to a linear offscreen (and add a full-screen image-processing pass that clears the
// swapchain); its render bundle does not carry the harness's separate depth target, the frame fails WebGPU validation and
// core falls back to the DOM with that diagnosis.
test("I0.4 Lite PBR transmission inside a layer scene (recorded experiment)", async ({ browser }) => {
  test.setTimeout(120000);
  const { context, page, warnings, call } = await open(browser, 1, "?transmission=lite");
  const report = { browser: browser.version() };
  try {
    await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 1000)));
    const png = PNG.sync.read(await page.screenshot({ path: `${directory}/instrument-materials-lite-transmission-dpr1.png` }));
    const pixel = (x, y) => [...png.data.subarray((y * png.width + x) * 4, (y * png.width + x) * 4 + 3)];
    // Plain faceplate points, away from every control: the light face, the dark face.
    report.facePixels = { light: pixel(560, 560), dark: pixel(1190, 560) };
    report.counts = await call("counts");
    report.validationWarnings = warnings.filter(text => /not compatible|Invalid/i.test(text)).length;
    report.firstWarning = warnings.find(text => /not compatible/i.test(text));
    expect(report.validationWarnings, "Lite transmission in the layer scene fails WebGPU validation").toBeGreaterThan(0);
    // Core diagnoses the GPU error and falls back to the DOM, as the contract allows for a GPU error.
    expect(report.counts.mode).toBe("dom");
    expect(report.counts.reason).toMatch(/validation failed/);
  } finally {
    await mkdir(directory, { recursive: true });
    await writeFile(`${directory}/instrument-materials-lite-transmission.json`, JSON.stringify(report, null, 2));
    await context.close();
  }
});
