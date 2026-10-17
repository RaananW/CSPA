/**
 * The Phase I1 Instrument prototype page, `ui-proto-instrument.html` (`window.instrumentProto`; see
 * docs/ui-library/instrument.md, Phase I1, and docs/ui-library/instrument-phase0.md, "I1 prototype, second iteration"):
 * one chassis panel of native controls in the premium character, presented as Instrument meshes, Strata Objects and CSS
 * side by side. At 1600 × 900, DPR 2, the test checks what makes its screenshots valid:
 * - GPU presentation stays on through every variant and interaction (core reports `gpu`, no fallback reason);
 * - every pixel the mesh pass draws (shadows and the pointer light off: they are face shading) lies inside its native
 *   control's rounded box, at the default pose, at 100% depth with every switch thrown and with glass caps, and native
 *   hit testing there finds that control (through the glass too);
 * - native hits inside every control find it, and real clicks on the four switches toggle them;
 * - printed labels keep at least 4.5:1 on the faceplate, from decoded pixels (GPU frame for Instrument and Objects, a
 *   page screenshot for CSS), in light and dark;
 * - the push button's captured label and the display window's text match core's plain pass texel for texel, while the
 *   display's glass changes the window outside the text (its finish zone and bevel);
 * - the glass cap reads as glass: its rim's brightest quarter is at least 20 luma levels above the plain capture, and
 *   the printed hub ring under the dome's centre is magnified (factor recorded, at least 1.2);
 * - the knobs behave round (probe I0.7's model): a real click on a printed numeral sets that numeral's value, a tap on
 *   the cap's upper or lower half steps it, the wheel steps without scrolling the page, a double-click resets, and the
 *   keyboard is the native range input's.
 * It then saves the screenshots the look is judged from and `variants.json` with the tuning values, control states and
 * resolved tokens behind each, under the `ui-probes/instrument-i1-v2` evidence directory.
 */
import { test, expect } from "../helpers/current-browser.mjs";
import { evidenceDirectory } from "../helpers/evidence.mjs";
import { mkdir, writeFile } from "node:fs/promises";
import { PNG } from "pngjs";

const directory = evidenceDirectory("ui-probes/instrument-i1-v2");
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
  test.setTimeout(1200000);
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
  const capturedExact = async label => {
    const result = await call("capLabels");
    report.checks[`captured ${label}`] = result;
    expect(result.compared, `${label}: the push button's label is measured`).toBeGreaterThan(200);
    expect(result.colours, `${label}: the label is drawn (not a flat area)`).toBeGreaterThan(4);
    expect(result.mismatched, `${label}: the push button's captured label is texel-exact`).toBe(0);
    expect(result.display.text.compared, `${label}: the display's text region is measured`).toBeGreaterThan(2000);
    expect(result.display.text.colours, `${label}: the display text is drawn`).toBeGreaterThan(4);
    expect(result.display.text.mismatched, `${label}: the display's text under the glass is texel-exact`).toBe(0);
    expect(result.display.window.changed, `${label}: the glass is visible outside the text (finish zone, bevel)`).toBeGreaterThan(500);
    expect(result.display.textContrast, `${label}: the display text's contrast`).toBeGreaterThanOrEqual(4.5);
  };
  const native = id => call("native", id);

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
    await capturedExact("light");
    await stillGpu("after the basics");

    // The knobs behave round (I0.7): ring clicks on printed numerals, cap taps, wheel, double-click, native keys.
    const knobs = {};
    for (const [name, expectations] of [["volume", { 0: 0, 3: 30, 5: 50, 7: 70, 10: 100 }], ["input", { 0: 0, 2: 2, 5: 5, 9: 9, 10: 10 }]]) {
      const id = `${name}-instrument`, numerals = await call("numerals", name), results = [];
      for (const [text, value] of Object.entries(expectations)) {
        const numeral = numerals.find(item => item.text === text);
        await page.mouse.click(numeral.x, numeral.y);
        const state = await native(id);
        results.push({ numeral: text, x: numeral.x, y: numeral.y, value: state.value, text: state.text });
        expect(state.value, `${name}: a click on the printed "${text}" sets ${value}`).toBe(value);
        expect(state.focused, `${name}: the click focuses the knob`).toBe(true);
      }
      const box = (await call("controls", "instrument")).find(control => control.id === id), cx = box.x + box.width / 2, cy = box.y + box.height / 2;
      await page.mouse.click(numerals.find(item => item.text === "5").x, numerals.find(item => item.text === "5").y);
      // A tap and a wheel notch step by the notch: the input's step, at least 1% of its range (1 on both knobs).
      const mid = (await native(id)).value, notch = 1;
      await page.mouse.click(cx, cy - 10);
      const up = (await native(id)).value;
      await page.mouse.click(cx, cy + 10);
      await page.mouse.click(cx, cy + 10);
      const down = (await native(id)).value;
      expect(up, `${name}: a tap on the cap's upper half steps up`).toBeCloseTo(mid + notch, 5);
      expect(down, `${name}: two taps on the lower half step down twice`).toBeCloseTo(mid - notch, 5);
      // The wheel steps the knob and the page does not scroll.
      await page.mouse.move(cx, cy);
      const scroll = await page.evaluate(() => scrollY);
      await page.mouse.wheel(0, -100);
      await page.waitForTimeout(150);
      const wheeled = (await native(id)).value;
      expect(wheeled, `${name}: a wheel notch up steps the knob`).toBeCloseTo(mid, 5);
      expect(await page.evaluate(() => scrollY), `${name}: the page does not scroll`).toBe(scroll);
      // Native keys on the focused input.
      await page.keyboard.press("ArrowUp");
      const key = (await native(id)).value;
      await page.keyboard.press("End");
      const end = (await native(id)).value;
      await page.keyboard.press("Home");
      const home = (await native(id)).value;
      expect(key, `${name}: ArrowUp (native) steps up`).toBeGreaterThan(wheeled);
      expect(end, `${name}: End (native) goes to max`).toBe(name === "volume" ? 100 : 10);
      expect(home, `${name}: Home (native) goes to min`).toBe(0);
      // A double-click on the cap resets to the default.
      await page.mouse.dblclick(cx, cy);
      const reset = (await native(id)).value;
      expect(reset, `${name}: a double-click resets`).toBe(initial[name]);
      knobs[name] = { ringClicks: results, cap: { from: mid, up, down }, wheel: wheeled, keys: { arrowUp: key, end, home }, reset, valueText: (await native(id)).text };
    }
    report.checks.knobs = knobs;
    await page.mouse.move(4, 890);
    await call("state", initial);
    await stillGpu("after the knob interactions");

    // Glass: the cap reads as glass (rim and magnification), and the hits land through it.
    await call("set", { capMaterial: "glass" });
    const glass = await call("glass");
    report.checks.glass = { ...glass, hub: { plain: glass.hub.plain, through: glass.hub.through, factor: glass.hub.factor } };
    expect(glass.pixels, "the glass rim is measured").toBeGreaterThan(400);
    expect(glass.rimArc, "the rim's brightest quarter is at least 20 levels over the plain capture (Fresnel)").toBeGreaterThanOrEqual(20);
    expect(glass.hub.factor, "the printed hub under the dome's centre is magnified").toBeGreaterThanOrEqual(1.2);
    await containment("glass caps");
    await call("set", { theme: "dark" });
    const glassDark = await call("glass");
    report.checks.glassDark = { ...glassDark, hub: { plain: glassDark.hub.plain, through: glassDark.hub.through, factor: glassDark.hub.factor } };
    expect(glassDark.rimArc, "dark theme: the rim's brightest quarter is at least 20 levels over the plain capture").toBeGreaterThanOrEqual(20);
    await call("set", { theme: "light", capMaterial: "brushed" });

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
    await capturedExact("dark");
    await shoot("default-dark.png", "Defaults, dark theme (the faceplate follows the theme: dark gunmetal)");
    await shoot("default-dark-instrument.png", "Defaults, dark theme: the Instrument presentation", "instrument");
    await call("set", { capMaterial: "glass" });
    await shoot("glass-dark-instrument.png", "Glass caps, dark theme: the Instrument presentation", "instrument");
    await shoot("closeup-glass-dark.png", "Glass cap, dark theme, close-up", "volume");
    await call("set", { theme: "light" });
    for (const material of materials) { await call("set", { capMaterial: material }); await shoot(`material-cap-${material}.png`, `Cap material: ${material} (skirt polished, faceplate brushed)`); }
    await call("set", { capMaterial: "glass" });
    await shoot("closeup-glass-cap.png", "Glass cap over the printed hub, light theme, close-up", "volume");
    await shoot("closeup-glass-input.png", "Glass cap on the detented knob, close-up", "input");
    await call("set", { capMaterial: "glass", skirtMaterial: "glass" });
    await shoot("material-glass-on-everything.png", "Glass on everything: caps, skirts, bezels, paddles, lever, carriage (faceplate brushed)");
    await call("set", { capMaterial: "glass", skirtMaterial: "glass", plateMaterial: "glass" });
    await shoot("material-glass-on-glass-plate.png", "Glass caps and skirts on the glass recipe's dark faceplate");
    await call("set", { capMaterial: "brushed", skirtMaterial: "polished", plateMaterial: "auto" });
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
    await call("state", { ...initial, level: 50 });
    await shoot("closeup-fader.png", "Fader carriage at 50%, close-up (brushed body and top, polished chamfer)", "level");
    await call("state", { ...initial, rec: true });
    await shoot("button-latched.png", "Push button latched (aria-pressed true): held at its latch travel, ring lit, its glow bloomed");
    await shoot("button-latched-rec.png", "Push button latched, Instrument close-up", "rec");
    await call("press", true);
    await shoot("button-held-rec.png", "Push button held down (full travel), Instrument close-up", "rec");
    await call("press", false);
    await call("state", initial);
    await shoot("button-released-rec.png", "Push button at rest, Instrument close-up", "rec");
    await shoot("closeup-display.png", "The display window: flat glass over the readout, its finish-zone band and bevel", "display");
    await call("state", { ...initial, phono: true });
    await shoot("closeup-bat-on.png", "The bat lever thrown up (on), close-up", "phono");
    await call("state", initial);
    await shoot("closeup-bat-off.png", "The bat lever thrown down (off), close-up", "phono");
    // The pointer light over a knob (real mouse input), light and dark.
    const volume = (await call("controls", "instrument")).find(control => control.id === "volume-instrument");
    await page.mouse.move(volume.x + volume.width * 0.8, volume.y + volume.height * 0.25, { steps: 4 });
    await call("settle");
    report.checks.pointer = await call("pointer");
    await shoot("closeup-pointer-light.png", "The pointer light over the volume knob (real mouse), close-up", "volume");
    await shoot("pointer-light-instrument.png", "The pointer light over the volume knob: the pool on the faceplate and the highlight on the parts", "instrument");
    await call("set", { theme: "dark" });
    await page.mouse.move(volume.x + volume.width * 0.8, volume.y + volume.height * 0.3, { steps: 4 });
    await call("settle");
    await shoot("pointer-light-dark-instrument.png", "The pointer light, dark theme", "instrument");
    await call("set", { theme: "light" });
    await page.mouse.move(4, 890);
    await call("settle");
    await writeFile(`${directory}/variants.json`, JSON.stringify({ browser: report.browser, viewport: [1600, 900], deviceScaleFactor: 2, variants }, null, 2));
    expect(errors, "no page errors").toEqual([]);
    report.diagnostics = await call("diagnostics");
    report.info = await call("info");
    report.screenshots = variants.length;
  } finally {
    await writeFile(`${directory}/report.json`, JSON.stringify(report, null, 2));
    await context.close();
  }
});
