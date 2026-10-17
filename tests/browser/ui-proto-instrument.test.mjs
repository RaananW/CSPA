/**
 * The Phase I1 Instrument prototype page, `ui-proto-instrument.html` (`window.instrumentProto`; see
 * docs/ui-library/instrument.md, Phase I1): one chassis panel of native controls in the premium character, presented as
 * Instrument meshes, Strata Objects and CSS side by side. At 1600 × 900, DPR 2, the test checks what makes its
 * screenshots valid:
 * - GPU presentation stays on through every variant (core reports `gpu`, no fallback reason);
 * - every pixel the mesh pass draws (shadows off: they are face shading) lies inside its native control's rounded box,
 *   at the default pose and at 100% depth with every switch thrown, and native hit testing there finds that control;
 * - native hits inside every control find it, and real clicks on the four switches toggle them;
 * - printed labels keep at least 4.5:1 on the faceplate, from decoded pixels (GPU frame for Instrument and Objects, a
 *   page screenshot for CSS), in light and dark;
 * - the push button's captured label matches core's plain pass texel for texel.
 * It then saves the screenshots the look is judged from (defaults in light and dark, materials, depth, every switch in
 * both states, knob and fader positions, the push button latched and held) and `variants.json` with the tuning values,
 * control states and resolved tokens behind each, under the `ui-probes/instrument-i1` evidence directory.
 */
import { test, expect } from "../helpers/current-browser.mjs";
import { evidenceDirectory } from "../helpers/evidence.mjs";
import { mkdir, writeFile } from "node:fs/promises";
import { PNG } from "pngjs";

const directory = evidenceDirectory("ui-probes/instrument-i1");
const allOff = { mute: false, power: false, phono: false, lights: false };
const allOn = { mute: true, power: true, phono: true, lights: true };
const initial = { volume: 62, input: 4, level: 72, mute: false, power: true, phono: false, lights: true, rec: false };
const materials = ["brushed", "polished", "lacquer", "glass", "gold", "gunmetal"];

const linear = value => { const c = value / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
/** Contrast of a text rect in a decoded PNG (device px = client px × dpr): median face against the 1% extreme. */
function contrastIn(png, rect, dpr) {
  const values = [];
  for (let y = Math.ceil(rect.y * dpr); y < Math.floor((rect.y + rect.height) * dpr); y++) for (let x = Math.ceil(rect.x * dpr); x < Math.floor((rect.x + rect.width) * dpr); x++) {
    const offset = (y * png.width + x) * 4;
    values.push(0.2126 * linear(png.data[offset]) + 0.7152 * linear(png.data[offset + 1]) + 0.0722 * linear(png.data[offset + 2]));
  }
  values.sort((a, b) => a - b);
  const face = values[Math.floor(values.length / 2)], dark = values[Math.floor(values.length * 0.01)], light = values[Math.floor(values.length * 0.99)];
  const ink = face - dark > light - face ? dark : light;
  return (Math.max(face, ink) + 0.05) / (Math.min(face, ink) + 0.05);
}

test("I1 Instrument prototypes: valid screenshots of the premium character at Instrument, Objects and CSS", async ({ browser }) => {
  test.setTimeout(900000);
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(String(error)));
  await page.goto("/ui-proto-instrument.html");
  await page.waitForFunction(() => window.instrumentProto, null, { timeout: 60000 });
  const failure = await page.evaluate(async () => { try { await window.instrumentProto.ready; return null; } catch (error) { return String(error); } });
  expect(failure, "the page must start: HTML-in-Canvas and WebGPU are required").toBeNull();
  const call = (name, ...args) => page.evaluate(async ({ name, args }) => (await window.instrumentProto.ready)[name](...args), { name, args });
  await mkdir(directory, { recursive: true });
  const report = { browser: browser.version(), userAgent: await call("browser"), checks: {} };
  const stillGpu = async label => {
    const counts = await call("counts");
    expect(counts.mode, `${label}: GPU presentation stays on (${counts.reason})`).toBe("gpu");
    expect(counts.reason, `${label}: no fallback`).toMatch(/^Current content=drawable owning WebGPU canvas/);
  };
  const containment = async label => {
    const result = await call("containment");
    report.checks[`containment ${label}`] = { ...result, hitMismatches: result.hitMismatches.length };
    expect(result.changed, `${label}: the mesh pass draws`).toBeGreaterThan(20000);
    expect(result.outside, `${label}: mesh pixels outside their controls ${JSON.stringify(result.outsideSamples)}`).toBe(0);
    expect(result.hits, `${label}: native hits sampled on mesh pixels`).toBeGreaterThan(500);
    expect(result.hitMismatches, `${label}: native hits on mesh pixels find their control`).toEqual([]);
  };
  const contrastChecks = async label => {
    const decoded = await call("labelContrast");
    const png = PNG.sync.read(await page.screenshot());
    decoded.css = (await call("cssPrint")).map(rect => ({ text: rect.text, ratio: contrastIn(png, rect, 2) }));
    report.checks[`contrast ${label}`] = Object.fromEntries(Object.entries(decoded).map(([level, list]) => [level, { count: list.length, min: Math.min(...list.map(item => item.ratio)), lowest: [...list].sort((a, b) => a.ratio - b.ratio).slice(0, 3) }]));
    for (const [level, list] of Object.entries(decoded)) {
      expect(list.length, `${label} ${level}: printed labels measured`).toBeGreaterThan(30);
      for (const item of list) expect(item.ratio, `${label} ${level}: "${item.text}" contrast`).toBeGreaterThanOrEqual(4.5);
    }
  };

  try {
    await stillGpu("start");
    // The basics, at the defaults.
    await containment("default");
    for (const { id, found } of await call("hits")) expect(found, `native hits inside ${id}`).toEqual(Array(found.length).fill(id));
    for (const control of (await call("controls", "instrument")).filter(control => control.id.match(/^(mute|power|phono|lights)-/))) {
      const before = (await call("checked", "instrument"))[control.id];
      await page.mouse.click(control.x + control.width / 2, control.y + control.height / 2);
      expect((await call("checked", "instrument"))[control.id], `a real click toggles ${control.id}`).toBe(!before);
      await page.mouse.click(control.x + control.width / 2, control.y + control.height / 2);
    }
    await page.mouse.move(4, 890);
    await call("state", initial);
    await contrastChecks("light");
    const capLabels = await call("capLabels");
    report.checks.capLabels = capLabels;
    expect(capLabels.compared, "the push button's label is measured").toBeGreaterThan(200);
    expect(capLabels.colours, "the label is drawn (not a flat area)").toBeGreaterThan(4);
    expect(capLabels.mismatched, "the push button's captured label is texel-exact").toBe(0);
    await stillGpu("after the basics");

    // The screenshots and the values behind them.
    const variants = [];
    const shoot = async (file, description, clip = "page") => {
      const rect = await call("screenshot", clip);
      await page.screenshot({ path: `${directory}/${file}`, clip: rect });
      await stillGpu(file);
      variants.push({ file, description, clip, values: await call("values"), query: await page.evaluate(() => location.search), state: await page.evaluate(() => ({
        ...Object.fromEntries([...document.querySelectorAll("#ip-instrument input")].map(input => [input.id.replace(/-instrument$/, ""), input.type === "checkbox" ? input.checked : Number(input.value)])),
        rec: document.querySelector("#ip-instrument .ip-button").getAttribute("aria-pressed") === "true" })), tokens: await call("tokens") });
    };
    await shoot("default-light.png", "Defaults (premium: brushed aluminium caps, polished skirts, brushed aluminium faceplate), light theme");
    for (const level of ["instrument", "objects", "css"]) await shoot(`default-light-${level}.png`, `Defaults, light theme: the ${level} presentation`, level);
    await call("set", { theme: "dark" });
    await contrastChecks("dark");
    await shoot("default-dark.png", "Defaults, dark theme (the faceplate follows the theme: dark gunmetal)");
    await shoot("default-dark-instrument.png", "Defaults, dark theme: the Instrument presentation", "instrument");
    await call("set", { theme: "light" });
    for (const material of materials) { await call("set", { capMaterial: material }); await shoot(`material-cap-${material}.png`, `Cap material: ${material} (skirt polished, faceplate brushed)`); }
    await call("set", { capMaterial: "brushed" });
    for (const material of ["gunmetal", "lacquer", "gold", "polished"]) { await call("set", { plateMaterial: material }); await shoot(`material-plate-${material}.png`, `Faceplate and wall plate: ${material} (caps brushed aluminium)`); }
    await call("set", { capMaterial: "gold", skirtMaterial: "gold", plateMaterial: "lacquer" });
    await shoot("material-gold-on-lacquer.png", "Gold caps and skirts on a black lacquer faceplate");
    await call("set", { capMaterial: "lacquer", skirtMaterial: "brushed", plateMaterial: "brushed" });
    await shoot("material-lacquer-on-brushed.png", "Black lacquer caps on brushed aluminium skirts and faceplate");
    await call("set", { capMaterial: "brushed", skirtMaterial: "polished", plateMaterial: "auto" });
    for (const depth of [0, 50, 100]) { await call("set", { depth }); await shoot(`depth-${depth}.png`, `Depth ${depth}% (heights × ${depth === 0 ? 0.6 : depth === 50 ? 1 : 1.6})`); }
    await call("state", allOn);
    await containment("depth 100, every switch on");
    await call("set", { depth: 50 });
    for (const [name, states] of [["off", allOff], ["on", allOn]]) {
      await call("state", states);
      await shoot(`switches-${name}.png`, `Every switch ${name}`);
      for (const control of ["mute", "power", "phono", "lights"]) await shoot(`switch-${control}-${name}.png`, `${control} (${{ mute: "slide", power: "rocker", phono: "bat", lights: "wall" }[control]}) ${name}, Instrument close-up`, control);
    }
    await call("state", initial);
    for (const [name, at] of [["min", 0], ["mid", 0.5], ["max", 1]]) {
      await call("state", { volume: at * 100, input: Math.round(at * 10) });
      await shoot(`knobs-${name}.png`, `Knobs at ${name} (volume ${at * 100}, input detent ${Math.round(at * 10)})`);
      await shoot(`knobs-${name}-volume.png`, `Volume knob at ${name}, Instrument close-up`, "volume");
      await shoot(`knobs-${name}-input.png`, `Input knob (detented) at ${name}, Instrument close-up`, "input");
    }
    await call("state", initial);
    for (const [name, level] of [["low", 0], ["mid", 50], ["high", 100]]) { await call("state", { level }); await shoot(`fader-${name}.png`, `Fader at ${level}%`); }
    await call("state", { ...initial, rec: true });
    await shoot("button-latched.png", "Push button latched (aria-pressed true): held at its latch travel, ring lit");
    await shoot("button-latched-rec.png", "Push button latched, Instrument close-up", "rec");
    await call("press", true);
    await shoot("button-held-rec.png", "Push button held down (full travel), Instrument close-up", "rec");
    await call("press", false);
    await call("state", initial);
    await shoot("button-released-rec.png", "Push button at rest, Instrument close-up", "rec");
    await writeFile(`${directory}/variants.json`, JSON.stringify({ browser: report.browser, viewport: [1600, 900], deviceScaleFactor: 2, variants }, null, 2));
    expect(errors, "no page errors").toEqual([]);
    report.diagnostics = await call("diagnostics");
    report.screenshots = variants.length;
  } finally {
    await writeFile(`${directory}/report.json`, JSON.stringify(report, null, 2));
    await context.close();
  }
});
