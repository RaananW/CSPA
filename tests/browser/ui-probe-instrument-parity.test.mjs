/**
 * Instrument probe I0.6 (docs/ui-library/instrument.md): how close the CSS presentation of the skeuomorphic controls
 * gets to the Instrument (GPU mesh) look when both come from the same tokens. On the I1 prototype page
 * (`ui-proto-instrument.html`, `window.instrumentProto`), which renders the same markup as Instrument, Objects and CSS side by
 * side, the test crops the same control region from each copy at DPR 2 for every component state (knob and detented
 * knob at min, mid and max, fader low, mid and high, each switch form off and on, push button at rest, latched and
 * held), in light and dark, at depth 50% (and 0% and 100% for the knobs), and measures:
 * - the P0.6 metric (mean and 95th percentile absolute luminance difference, 8-bit levels, comparable with the Relief
 *   budget of docs/ui-library/phase0.md), plus SSIM on luminance as a structural measure;
 * - three regions per control: the object (its element plus shadow room), the box (the control's box with its printed
 *   scale) and the control with its legend and marks (printed text, which is the same DOM text in every copy);
 * - Instrument against CSS and Instrument against Objects.
 * It writes the table, per-component worst and median values and a proposed budget per component state to
 * `ui-probes/instrument-i0-parity/parity.json`, saves the review images (Instrument | CSS | Objects | difference), checks
 * what CSS cannot show (pointer light, reflections) and how the recipe holds up under reduced motion, more contrast and
 * forced colors (`emulation.json`), and holds the CSS copy to the budgets recorded here.
 */
import { test, expect } from "../helpers/current-browser.mjs";
import { evidenceDirectory } from "../helpers/evidence.mjs";
import { compare, crop, heat, strip } from "../helpers/image-parity.mjs";
import { mkdir, writeFile } from "node:fs/promises";
import { PNG } from "pngjs";

const directory = evidenceDirectory("ui-probes/instrument-i0-parity");
const DPR = 2;
const initial = { volume: 62, input: 4, level: 72, mute: false, power: true, phono: false, lights: true, rec: false };
const pads = { object: 8, box: 10, labels: 6, legend: 2 };
// Relief's budget (P0.6, docs/ui-library/phase0.md): mean <= 2, p95 <= 10 luminance levels over the whole stage.
const relief = { mean: 2, p95: 10 };
// The Instrument parity budget per component, over the control's box: mean and 95th percentile luminance levels, and the
// lowest SSIM, for the worst state in light and dark at any depth (see parity.json `proposedBudget`).
const budgets = {
  volume: { mean: 15.5, p95: 84, ssim: 0.81 }, input: { mean: 15.5, p95: 53, ssim: 0.83 }, level: { mean: 9.5, p95: 40, ssim: 0.89 },
  mute: { mean: 19.5, p95: 94, ssim: 0.68 }, power: { mean: 39.5, p95: 143, ssim: 0.37 }, phono: { mean: 21.5, p95: 85, ssim: 0.78 },
  lights: { mean: 32.5, p95: 110, ssim: 0.57 }, rec: { mean: 30.5, p95: 146, ssim: 0.2 },
};
const round = (value, digits = 2) => Number(value.toFixed(digits));
const median = values => { const sorted = [...values].sort((a, b) => a - b); return sorted[Math.floor(sorted.length / 2)]; };

/** Client rects of every component in every copy (relative to its panel), plus the panel origins and an empty plate patch. */
function measureLayout() {
  const panels = Object.fromEntries(["instrument", "objects", "css"].map(level => [level, document.getElementById(`ip-${level}`)]));
  const local = (element, panel) => { const box = element.getBoundingClientRect(), origin = panel.getBoundingClientRect(); return { x: box.left - origin.left, y: box.top - origin.top, width: box.width, height: box.height }; };
  const origins = Object.fromEntries(Object.entries(panels).map(([level, panel]) => { const box = panel.getBoundingClientRect(); return [level, { x: box.left, y: box.top, width: box.width, height: box.height }]; }));
  const components = {};
  for (const name of ["volume", "input", "level", "mute", "power", "phono", "lights", "rec"]) {
    components[name] = Object.fromEntries(Object.entries(panels).map(([level, panel]) => {
      const control = panel.querySelector(`[data-control="${name}"]`), knob = control.classList.contains("ip-knob");
      return [level, { object: local(knob ? control.querySelector(".ip-skirt") : control.querySelector("[data-ip]"), panel), box: local(control.querySelector(".ip-box"), panel), labels: local(control, panel), legend: local(control.querySelector(".ip-legend"), panel) }];
    }));
  }
  const bottoms = [...panels.instrument.querySelectorAll(".ip-main .ip-control, .ip-main .ip-note")].map(element => local(element, panels.instrument)).map(rect => rect.y + rect.height);
  const top = Math.max(...bottoms) + 8, patch = { x: 22, y: top, width: 220, height: origins.instrument.height - top - 6 };
  return { origins, components, patch };
}

/** The same region (panel-relative client px, grown by `pad`) cropped from `png` in the copy `level`. */
function cropOf(png, layout, level, rect, pad) {
  const x0 = Math.floor((rect.x - pad) * DPR), y0 = Math.floor((rect.y - pad) * DPR), x1 = Math.ceil((rect.x + rect.width + pad) * DPR), y1 = Math.ceil((rect.y + rect.height + pad) * DPR);
  const origin = layout.origins[level], ox = Math.round(origin.x * DPR), oy = Math.round(origin.y * DPR);
  return crop(png, ox + x0, oy + y0, ox + x1, oy + y1);
}

test("I0.6 CSS parity: how close CSS gets to the Instrument look, per component state", async ({ browser }) => {
  test.setTimeout(1500000);
  await mkdir(directory, { recursive: true });
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: DPR });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(String(error)));
  await page.goto("/ui-proto-instrument.html");
  await page.waitForFunction(() => window.instrumentProto, null, { timeout: 60000 });
  const failure = await page.evaluate(async () => { try { await window.instrumentProto.ready; return null; } catch (error) { return String(error); } });
  expect(failure, "the page must start: HTML-in-Canvas and WebGPU are required").toBeNull();
  const call = (name, ...args) => page.evaluate(async ({ name, args }) => (await window.instrumentProto.ready)[name](...args), { name, args });
  const report = { browser: browser.version(), userAgent: await call("browser"), dpr: DPR, relief, pads, entries: [] };
  const stillGpu = async label => { const counts = await call("counts"); expect(counts.mode, `${label}: GPU presentation stays on (${counts.reason})`).toBe("gpu"); };
  const shot = async () => PNG.sync.read(await page.screenshot());

  try {
    await stillGpu("start");
    const layout = await page.evaluate(measureLayout);
    const record = async (component, state, theme, depth, pngs) => {
      const entry = { component, state, theme, depth, key: `${component}/${state}/${theme}/depth${depth}` };
      const images = {};
      for (const [region, pad] of Object.entries(pads)) {
        const crops = Object.fromEntries(["instrument", "css", "objects"].map(level => [level, cropOf(pngs[level], layout, level, layout.components[component][level][region], pad)]));
        entry[region] = { size: [crops.instrument.width, crops.instrument.height], css: compare(crops.instrument, crops.css), objects: compare(crops.instrument, crops.objects) };
        for (const level of ["css", "objects"]) for (const key of ["mean", "p95", "max", "ssim"]) entry[region][level][key] = round(entry[region][level][key], key === "ssim" ? 4 : 2);
        if (region === "box") images.box = crops;
      }
      const { instrument, css, objects } = images.box;
      await writeFile(`${directory}/${entry.key.replaceAll("/", "-")}.png`, strip([instrument, css, objects, heat(instrument, css)]));
      report.entries.push(entry);
    };
    const same = png => ({ instrument: png, css: png, objects: png });
    const reset = async () => { await page.mouse.move(4, 890); await call("state", initial); };

    for (const theme of ["light", "dark"]) {
      await call("set", { theme, depth: 50 });
      await reset();
      // Baseline: an empty patch of faceplate, which tells how far the plates themselves differ.
      const plain = await shot();
      const patch = level => cropOf(plain, layout, level, layout.patch, 0);
      report[`plate-${theme}`] = { size: [patch("instrument").width, patch("instrument").height], css: compare(patch("instrument"), patch("css")), objects: compare(patch("instrument"), patch("objects")) };
      // Knobs and fader at their ends and middle.
      for (const [name, volume, input, level] of [["min", 0, 0, 0], ["mid", 50, 5, 50], ["max", 100, 10, 100]]) {
        await call("state", { volume, input, level });
        const png = await shot();
        await record("volume", name, theme, 50, same(png));
        await record("input", name, theme, 50, same(png));
        await record("level", { min: "low", mid: "mid", max: "high" }[name], theme, 50, same(png));
      }
      await call("state", initial);
      // The knobs at 0% and 100% depth.
      for (const depth of [0, 100]) {
        await call("set", { depth });
        for (const [name, volume, input] of [["min", 0, 0], ["mid", 50, 5], ["max", 100, 10]]) {
          await call("state", { volume, input });
          const png = await shot();
          await record("volume", name, theme, depth, same(png));
          await record("input", name, theme, depth, same(png));
        }
        await call("state", initial);
      }
      await call("set", { depth: 50 });
      // Switch forms off and on.
      for (const [name, on] of [["off", false], ["on", true]]) {
        await call("state", { mute: on, power: on, phono: on, lights: on });
        const png = await shot();
        for (const component of ["mute", "power", "phono", "lights"]) await record(component, name, theme, 50, same(png));
      }
      await call("state", initial);
      // Push button: rest, latched, held (a real press on each copy in turn, released away from the button).
      await record("rec", "rest", theme, 50, same(await shot()));
      await call("state", { rec: true });
      await record("rec", "latched", theme, 50, same(await shot()));
      await call("state", initial);
      const held = {};
      for (const level of ["instrument", "objects", "css"]) {
        const centre = await page.evaluate(id => { const box = document.getElementById(id).getBoundingClientRect(); return { x: box.left + box.width / 2, y: box.top + box.height / 2 }; }, `rec-${level}`);
        await page.mouse.move(centre.x, centre.y);
        await page.mouse.down();
        await call("settle");
        held[level] = await shot();
        await page.mouse.move(4, 890);
        await page.mouse.up();
        await call("settle");
      }
      expect(await page.evaluate(() => document.getElementById("rec-css").getAttribute("aria-pressed")), "releasing away from the button does not click it").toBe("false");
      await record("rec", "held", theme, 50, held);
      await reset();
      await stillGpu(`after ${theme}`);
    }
    await call("set", { theme: "light", depth: 50 });

    // Per component: worst and median over its states, per region; and the proposed budget per state (the worst box value
    // with 50% headroom on the difference, rounded up; the SSIM floor with 50% headroom on its deficit).
    const summary = {}, proposed = {};
    for (const component of ["volume", "input", "level", "mute", "power", "phono", "lights", "rec"]) {
      summary[component] = {};
      const own = report.entries.filter(entry => entry.component === component);
      for (const region of Object.keys(pads)) for (const target of ["css", "objects"]) {
        const values = key => own.map(entry => entry[region][target][key]);
        summary[component][`${region}.${target}`] = { states: own.length, meanWorst: Math.max(...values("mean")), meanMedian: round(median(values("mean"))), p95Worst: Math.max(...values("p95")), p95Median: median(values("p95")), ssimWorst: Math.min(...values("ssim")), ssimMedian: round(median(values("ssim")), 4) };
      }
      proposed[component] = {};
      for (const state of [...new Set(own.map(entry => entry.state))]) {
        const rows = own.filter(entry => entry.state === state).map(entry => entry.box.css);
        const mean = Math.max(...rows.map(row => row.mean)), p95 = Math.max(...rows.map(row => row.p95)), floor = Math.min(...rows.map(row => row.ssim));
        proposed[component][state] = { observed: { mean: round(mean), p95, ssim: round(floor, 3) }, budget: { mean: Math.ceil(mean * 1.5 * 2) / 2, p95: Math.ceil(p95 * 1.5), ssim: Math.floor((1 - (1 - floor) * 1.5) * 100) / 100 } };
      }
    }
    report.summary = summary;
    report.proposedBudget = proposed;
    expect(errors, "no page errors").toEqual([]);
    for (const entry of report.entries) {
      const limit = budgets[entry.component];
      expect(entry.box.css.mean, `${entry.key}: CSS box mean`).toBeLessThanOrEqual(limit.mean);
      expect(entry.box.css.p95, `${entry.key}: CSS box p95`).toBeLessThanOrEqual(limit.p95);
      expect(entry.box.css.ssim, `${entry.key}: CSS box SSIM`).toBeGreaterThanOrEqual(limit.ssim);
    }
  } finally {
    await writeFile(`${directory}/parity.json`, JSON.stringify(report, null, 2));
    await context.close();
  }
});

test("I0.6 what CSS cannot show, and the recipe under reduced motion, more contrast and forced colors", async ({ browser }) => {
  test.setTimeout(600000);
  await mkdir(directory, { recursive: true });
  const report = { browser: browser.version(), pointerAndReflections: {}, modes: {} };
  const open = async options => {
    const context = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: DPR, ...options });
    const page = await context.newPage();
    await page.goto("/ui-proto-instrument.html");
    await page.waitForFunction(() => window.instrumentProto, null, { timeout: 60000 });
    const failure = await page.evaluate(async () => { try { await window.instrumentProto.ready; return null; } catch (error) { return String(error); } });
    const call = (name, ...args) => page.evaluate(async ({ name, args }) => (await window.instrumentProto.ready)[name](...args), { name, args });
    return { context, page, call, failure };
  };
  try {
    // Pointer light and reflections: what changes in the Instrument copy and in the CSS copy when the pointer is over
    // the volume knob, and when the studio reflections go from 0 to 2.
    const base = await open({});
    expect(base.failure, "the page must start").toBeNull();
    const layout = await base.page.evaluate(measureLayout);
    const shot = async () => PNG.sync.read(await base.page.screenshot());
    const region = (png, level) => cropOf(png, layout, level, layout.components.volume[level].box, 10);
    const point = (id) => base.page.evaluate(id2 => { const box = document.getElementById(id2).getBoundingClientRect(); return { x: box.left + box.width * 0.3, y: box.top + box.height * 0.3 }; }, id);
    await base.page.mouse.move(4, 890);
    await base.call("state", { volume: 62 });
    const rest = await shot();
    const over = await point("volume-instrument"), cssOver = await point("volume-css");
    await base.page.mouse.move(over.x, over.y);
    await base.call("settle");
    const hovered = await shot();
    await base.page.mouse.move(cssOver.x, cssOver.y);
    await base.call("settle");
    const cssHovered = await shot();
    await base.page.mouse.move(4, 890);
    report.pointerAndReflections.hoverVolume = { instrumentChange: compare(region(rest, "instrument"), region(hovered, "instrument")), cssChange: compare(region(rest, "css"), region(cssHovered, "css")) };
    const reflections = {};
    for (const value of [0, 2]) {
      await base.call("set", { reflections: value });
      await base.page.mouse.move(4, 890);
      await base.call("settle");
      reflections[value] = await shot();
    }
    const against = (a, b, names) => Object.fromEntries(names.map(name => [name, Object.fromEntries(["instrument", "objects", "css"].map(level => [level, compare(cropOf(a, layout, level, layout.components[name][level].box, 10), cropOf(b, layout, level, layout.components[name][level].box, 10))]))]));
    report.pointerAndReflections.reflections0to2 = against(reflections[0], reflections[2], ["volume", "level", "phono", "rec"]);
    await base.call("set", { reflections: 1, depth: 0 });
    const flat = await shot();
    await base.call("set", { depth: 100 });
    const deep = await shot();
    report.pointerAndReflections.depth0to100 = against(flat, deep, ["volume", "level", "phono", "power", "lights"]);
    await base.call("set", { depth: 50 });
    await base.context.close();

    // The CSS copy under each emulated mode, against the plain CSS copy (same page, same pose).
    const cssPanel = (png, layout2) => cropOf(png, layout2, "css", { x: 0, y: 0, width: layout2.origins.css.width, height: layout2.origins.css.height }, 0);
    const distinct = image => { const colours = new Set(); for (let index = 0; index < image.rgba.length; index += 4) colours.add((image.rgba[index] << 16) | (image.rgba[index + 1] << 8) | image.rgba[index + 2]); return colours.size; };
    const reference = await open({});
    const referenceLayout = await reference.page.evaluate(measureLayout);
    await reference.page.mouse.move(4, 890);
    const referencePng = PNG.sync.read(await reference.page.screenshot());
    const referenceCss = cssPanel(referencePng, referenceLayout);
    const probes = () => {
      const style = (selector, names) => { const element = document.querySelector(selector); if (!element) return null; const computed = getComputedStyle(element); return Object.fromEntries(names.map(name => [name, computed.getPropertyValue(name)])); };
      return {
        panel: style("#ip-css", ["background-image", "background-color", "box-shadow", "color", "forced-color-adjust"]),
        cap: style("#ip-css .ip-cap", ["background-image", "background-color", "box-shadow", "border-top-color"]),
        skirt: style("#ip-css .ip-skirt", ["background-image", "box-shadow"]),
        paddle: style("#ip-css .ip-switch--rocker .ip-paddle", ["background-image", "box-shadow", "transition-duration", "transform"]),
        slider: style("#ip-css .ip-slider", ["transition-duration"]),
        title: style("#ip-css .ip-title", ["color"]),
        media: Object.fromEntries(["(forced-colors: active)", "(prefers-contrast: more)", "(prefers-reduced-motion: reduce)"].map(query => [query, matchMedia(query).matches])),
      };
    };
    report.modes.plain = { probes: await reference.page.evaluate(probes), distinctColours: distinct(referenceCss) };
    await reference.context.close();
    const modes = { "reduced-motion": { reducedMotion: "reduce" }, "contrast-more": { contrast: "more" }, "forced-colors": { forcedColors: "active" }, "forced-colors-dark": { forcedColors: "active", colorScheme: "dark" } };
    for (const [name, options] of Object.entries(modes)) {
      const mode = await open(options);
      const entry = { startFailure: mode.failure };
      try {
        await mode.page.mouse.move(4, 890);
        await mode.page.waitForTimeout(400);
        const modeLayout = await mode.page.evaluate(measureLayout);
        const png = PNG.sync.read(await mode.page.screenshot());
        const panel = cssPanel(png, modeLayout);
        await writeFile(`${directory}/mode-${name}-css.png`, strip([referenceCss, panel, heat(referenceCss, panel)]));
        await writeFile(`${directory}/mode-${name}-page.png`, PNG.sync.write(png));
        entry.cssPanelAgainstPlain = compare(referenceCss, panel);
        entry.distinctColours = distinct(panel);
        entry.probes = await mode.page.evaluate(probes);
        // The volume knob in this mode against the plain one.
        const knob = cropOf(png, modeLayout, "css", modeLayout.components.volume.css.object, 8), plainKnob = cropOf(referencePng, referenceLayout, "css", referenceLayout.components.volume.css.object, 8);
        entry.volumeKnob = { ...compare(plainKnob, knob), distinctColours: distinct(knob), plainDistinctColours: distinct(plainKnob) };
        // With transitions off (reduced motion) a toggle must still change state at once.
        if (name === "reduced-motion") {
          await mode.call("state", { power: false });
          entry.toggleChecked = await mode.page.evaluate(() => document.getElementById("power-css").checked);
        }
      } catch (error) { entry.error = String(error); }
      report.modes[name] = entry;
      await mode.context.close();
    }
  } finally {
    await writeFile(`${directory}/emulation.json`, JSON.stringify(report, null, 2));
  }
  expect(report.modes["reduced-motion"].probes.media["(prefers-reduced-motion: reduce)"], "reduced motion is emulated").toBe(true);
});
