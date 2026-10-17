/**
 * Browser suite for the Strata Knob (anatomy page `knob.md`) on `ui-knob.html` (`window.strataKnobProbe`): plain
 * contract markup with `@underglass/ui/css` and the plain-DOM behaviour (`attachStrata`), in a Strata panel.
 * - Plain DOM (`?plain`), real input: ring clicks on printed numerals set their values; skirt and cap taps step by a
 *   notch; vertical drags with and without Shift, and the tap threshold; the wheel steps without scrolling the page;
 *   native keys; the double-click reset; `aria-valuetext` with units; detents snap; `input` and `change` fire.
 * - Touch (Playwright touch emulation): a tap on a numeral sets it and a touch drag turns the knob, as pointer events
 *   of type touch.
 * - Mobile and text size: at 320 and 390 px no horizontal overflow, targets of at least 24 px, the legend and numerals
 *   inside the viewport and unclipped; at 200% text the numerals stay apart and inside the dial.
 * - Preferences and accessibility: axe in light and dark (and face mode), forced colours draw a visible control,
 *   reduced motion turns detents at once.
 * - GPU at Relief and Objects: GPU stays on through value changes; the skirt and cap are raised faces or slabs; pixels
 *   change after each value change and only inside the knob's dial; a grid of native hits over the dial lands on the
 *   input (0 mismatches) at DPR 1 and 2; real clicks, drags, keys and the wheel work; the accessibility snapshot is the
 *   same in DOM and GPU modes.
 * Screenshots go to the `ui-knob` evidence directory.
 */
import { test, expect } from "../helpers/current-browser.mjs";
import AxeBuilder from "@axe-core/playwright";
import { mkdir } from "node:fs/promises";
import { PNG } from "pngjs";
import { evidenceDirectory } from "../helpers/evidence.mjs";

const evidence = evidenceDirectory("ui-knob");
const tags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const summary = violations => violations.map(v => `${v.id}: ${v.nodes.map(node => node.target.join(" ")).join(", ")}`);

const value = (page, id) => page.locator(`#${id}`).evaluate(input => Number(input.value));
const centre = box => [box.x + box.width / 2, box.y + box.height / 2];
/** The centre of a knob's printed numeral, by its text. */
async function numeral(page, id, text) {
  const box = await page.locator(`#${id}-knob .ug-knob__mark`).filter({ hasText: new RegExp(`^${text}$`) }).boundingBox();
  return centre(box);
}
/** The dial's centre and the skirt's radius. */
async function dial(page, id) {
  const box = await page.locator(`#${id}-knob .ug-knob__dial`).boundingBox(), skirt = await page.locator(`#${id}-knob .ug-knob__skirt`).boundingBox();
  return { box, cx: box.x + box.width / 2, cy: box.y + box.height / 2, r: skirt.width / 2 };
}
async function drag(page, [x, y], dy, { shift = false, steps = 10 } = {}) {
  await page.mouse.move(x, y);
  if (shift) await page.keyboard.down("Shift");
  await page.mouse.down();
  await page.mouse.move(x, y + dy, { steps });
  await page.mouse.up();
  if (shift) await page.keyboard.up("Shift");
}
const events = page => page.evaluate(() => window.strataKnobProbe.events());
const clear = page => page.evaluate(() => window.strataKnobProbe.clearEvents());

test("a knob behaves round in plain DOM: ring clicks, cap taps, drags, the wheel, keys, reset and its value text", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 900, height: 750 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/ui-knob.html?plain");
  await page.waitForFunction(() => window.strataKnobProbe);
  const volume = page.locator("#volume"), gain = page.locator("#gain");
  await expect(volume).toHaveAttribute("aria-valuetext", "62%");
  await expect(volume).toHaveAccessibleName("Volume");

  // Ring clicks on printed numerals set exactly their values, and focus the knob.
  for (const [text, expected] of [["0", 0], ["3", 30], ["5", 50], ["7", 70], ["10", 100], ["2", 20]]) {
    await page.mouse.click(...await numeral(page, "volume", text));
    expect(await value(page, "volume"), `ring click on "${text}"`).toBe(expected);
  }
  await expect(volume).toBeFocused();
  for (const [text, expected] of [["−12", -12], ["−6", -6], ["6", 6], ["12", 12], ["0", 0]]) {
    await page.mouse.click(...await numeral(page, "gain", text));
    expect(await value(page, "gain"), `ring click on "${text}"`).toBe(expected);
  }
  // Between numerals the angle decides; in the bottom gap the nearer end.
  const v = await dial(page, "volume");
  await page.mouse.click(v.cx + (v.r + 10) * Math.sin(Math.PI / 4), v.cy - (v.r + 10) * Math.cos(Math.PI / 4));
  expect(await value(page, "volume")).toBe(67);
  await page.mouse.click(v.cx - 10, v.box.y + v.box.height - 2);
  expect(await value(page, "volume")).toBe(0);
  await page.mouse.click(v.cx + 10, v.box.y + v.box.height - 2);
  expect(await value(page, "volume")).toBe(100);

  // Cap taps (WCAG 2.5.7): the upper half steps up a notch, the lower half down, on the cap and on the skirt.
  await page.mouse.click(v.cx, v.cy - 12);
  expect(await value(page, "volume")).toBe(100);
  for (let tap = 0; tap < 3; tap++) await page.mouse.click(v.cx, v.cy + 12);
  expect(await value(page, "volume")).toBe(97);
  await page.mouse.click(v.cx, v.cy - v.r + 3);
  expect(await value(page, "volume")).toBe(98);
  const g = await dial(page, "gain");
  await page.mouse.click(g.cx, g.cy - 8);
  expect(await value(page, "gain"), "a detented knob steps a detent").toBe(6);
  await page.mouse.click(g.cx, g.cy + 8);
  await page.mouse.click(g.cx, g.cy + 8);
  expect(await value(page, "gain")).toBe(-6);
  // A press that moves under knob.tapSlop (4 px) is still a tap.
  await drag(page, [v.cx, v.cy - 10], -3, { steps: 3 });
  expect(await value(page, "volume")).toBe(99);

  // Drag: 200 px per sweep, up raises; Shift is ten times finer. Input fires while it moves, change once at the end.
  await page.mouse.click(...await numeral(page, "volume", "5"));
  await clear(page);
  await drag(page, [v.cx, v.cy], -50);
  expect(await value(page, "volume")).toBe(75);
  const dragged = await events(page);
  expect(dragged.filter(event => event.type === "input").length).toBeGreaterThan(3);
  expect(dragged.filter(event => event.type === "change")).toEqual([{ id: "volume", type: "change", value: "75" }]);
  await drag(page, [v.cx, v.cy], -100, { shift: true });
  expect(await value(page, "volume")).toBe(80);
  await drag(page, [v.cx, v.cy], 400);
  expect(await value(page, "volume"), "a drag clamps at the minimum").toBe(0);
  // A detented knob snaps to its detents while dragged: only multiples of 6 appear.
  await clear(page);
  await drag(page, [g.cx, g.cy], -150, { steps: 30 });
  expect(await value(page, "gain")).toBe(12);
  expect(new Set((await events(page)).filter(event => event.id === "gain").map(event => event.value))).toEqual(new Set(["0", "6", "12"]));
  await expect(gain).toHaveAttribute("aria-valuetext", "12 dB");

  // The wheel: a notch up raises by a notch, and the page does not scroll; elsewhere it scrolls as usual.
  await page.mouse.click(...await numeral(page, "volume", "5"));
  await page.mouse.move(v.cx, v.cy);
  await page.mouse.wheel(0, -100);
  await page.mouse.wheel(0, 100);
  await page.mouse.wheel(0, 100);
  expect(await value(page, "volume")).toBe(49);
  await page.mouse.move(g.cx + g.box.width / 2 - 4, g.cy);
  await page.mouse.wheel(0, -100);
  expect(await value(page, "gain")).toBe(12);
  await page.mouse.wheel(0, 100);
  expect(await value(page, "gain")).toBe(6);
  expect(await page.evaluate(() => window.scrollY), "the page does not scroll over a knob").toBe(0);
  await page.mouse.move(400, 20);
  await page.mouse.wheel(0, 100);
  await page.waitForFunction(() => window.scrollY > 0);
  await page.evaluate(() => window.scrollTo(0, 0));

  // Keys are native: arrows, Page keys, Home and End.
  await volume.focus();
  await page.keyboard.press("ArrowUp");
  expect(await value(page, "volume")).toBe(50);
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowLeft");
  expect(await value(page, "volume")).toBe(48);
  await page.keyboard.press("End");
  expect(await value(page, "volume")).toBe(100);
  await page.keyboard.press("Home");
  expect(await value(page, "volume")).toBe(0);
  await page.keyboard.press("PageUp");
  expect(await value(page, "volume")).toBeGreaterThan(0);
  await gain.focus();
  await page.keyboard.press("ArrowDown");
  expect(await value(page, "gain")).toBe(0);

  // Double-click returns to the default; the value text and the dial follow.
  await page.mouse.dblclick(v.cx + v.r + 12, v.cy);
  expect(await value(page, "volume")).toBe(62);
  await expect(volume).toHaveAttribute("aria-valuetext", "62%");
  await page.mouse.click(...await numeral(page, "gain", "−6"));
  await expect(gain).toHaveAttribute("aria-valuetext", "−6 dB");
  expect(await page.locator("#gain-knob").evaluate(element => element.style.getPropertyValue("--strata-knob-value"))).toBe("0.25");
  // The pointer turns with the value: (0.25 − 0.5) × 270° once the detent has settled.
  await page.waitForFunction(() => !document.querySelector("#gain-knob .ug-knob__pointer").getAnimations().length);
  expect(await page.locator("#gain-knob .ug-knob__pointer").evaluate(element => getComputedStyle(element).rotate)).toBe("-67.5deg");
  await expect(page.locator("#knob-read")).toHaveText("Volume 62%, gain −6 dB");
  // Disabled: no pointer behaviour.
  await page.evaluate(() => { document.getElementById("gain").disabled = true; });
  await page.mouse.click(...await numeral(page, "gain", "12"));
  expect(await value(page, "gain")).toBe(-6);
  await page.screenshot({ path: `${evidence}/plain.png` });
  expect(errors).toEqual([]);
  await context.close();
});

test("touch: a tap on a numeral sets it and a touch drag turns the knob, through pointer events of type touch", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await context.newPage();
  await page.goto("/ui-knob.html?plain");
  await page.waitForFunction(() => window.strataKnobProbe);
  await page.evaluate(() => { window.pointerTypes = []; document.addEventListener("pointerdown", event => window.pointerTypes.push(event.pointerType), true); });
  for (const [text, expected] of [["3", 30], ["8", 80], ["0", 0]]) {
    await page.touchscreen.tap(...await numeral(page, "volume", text));
    expect(await value(page, "volume"), `tap on "${text}"`).toBe(expected);
  }
  const v = await dial(page, "volume");
  await page.touchscreen.tap(v.cx, v.cy - 10);
  expect(await value(page, "volume"), "a tap on the cap's upper half").toBe(1);
  // A touch drag 60 px up: +30, and the page does not scroll (the input is touch-action: none).
  const client = await context.newCDPSession(page);
  const touch = async (type, points) => client.send("Input.dispatchTouchEvent", { type, touchPoints: points });
  await touch("touchStart", [{ x: v.cx, y: v.cy }]);
  for (let step = 1; step <= 12; step++) await touch("touchMove", [{ x: v.cx, y: v.cy - step * 5 }]);
  await touch("touchEnd", []);
  expect(await value(page, "volume")).toBe(31);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  expect(await page.evaluate(() => [...new Set(window.pointerTypes)])).toEqual(["touch"]);
  await page.screenshot({ path: `${evidence}/touch-390.png` });
  await context.close();
});

for (const width of [320, 390]) test(`at ${width} px the knobs reflow with no horizontal overflow, 24 px targets and readable print`, async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width, height: 800 } });
  const page = await context.newPage();
  await page.goto("/ui-knob.html?plain");
  await page.waitForFunction(() => window.strataKnobProbe);
  const layout = await page.evaluate(() => {
    const boxes = selector => [...document.querySelectorAll(selector)].map(element => { const box = element.getBoundingClientRect(); return { left: box.left, right: box.right, width: box.width, height: box.height }; });
    return {
      scrollWidth: document.documentElement.scrollWidth,
      inputs: boxes(".ug-knob__input"),
      print: boxes(".ug-knob__label, .ug-knob__mark"),
      clipped: [...document.querySelectorAll(".ug-knob__label")].filter(label => label.scrollWidth > label.clientWidth + 0.5).length,
    };
  });
  expect(layout.scrollWidth, "no horizontal scrolling").toBeLessThanOrEqual(width);
  for (const input of layout.inputs) expect(Math.min(input.width, input.height)).toBeGreaterThanOrEqual(24);
  for (const box of layout.print) { expect(box.left).toBeGreaterThanOrEqual(0); expect(box.right).toBeLessThanOrEqual(width); }
  expect(layout.clipped).toBe(0);
  console.log(`${width} px: scrollWidth ${layout.scrollWidth}, smallest input ${Math.min(...layout.inputs.map(input => Math.min(input.width, input.height)))} px`);
  await page.screenshot({ path: `${evidence}/reflow-${width}.png`, fullPage: true });
  await context.close();
});

test("at 200% text the numerals stay apart and inside the dial, and the legend wraps without loss", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 320, height: 800 } });
  const page = await context.newPage();
  await page.goto("/ui-knob.html?plain");
  await page.waitForFunction(() => window.strataKnobProbe);
  const check = () => page.evaluate(() => [...document.querySelectorAll(".ug-knob")].map(knob => {
    const dial = knob.querySelector(".ug-knob__dial").getBoundingClientRect();
    const marks = [...knob.querySelectorAll(".ug-knob__mark")].map(mark => {
      const range = document.createRange(); range.selectNodeContents(mark); return range.getBoundingClientRect();
    });
    const overlaps = marks.flatMap((a, i) => marks.slice(i + 1).filter(b => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom)).length;
    const outside = marks.filter(box => box.left < dial.left || box.right > dial.right || box.top < dial.top || box.bottom > dial.bottom).length;
    return { overlaps, outside, dial: dial.width, scrollWidth: document.documentElement.scrollWidth };
  }));
  for (const knob of await check()) expect(knob).toMatchObject({ overlaps: 0, outside: 0 });
  await page.evaluate(() => {
    for (const size of ["caption", "small", "body"]) {
      const name = `--strata-font-size-${size}`;
      document.documentElement.style.setProperty(name, `${parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name)) * 2}px`);
    }
  });
  const large = await check();
  for (const knob of large) expect(knob).toMatchObject({ overlaps: 0, outside: 0 });
  expect(large[0].scrollWidth).toBeLessThanOrEqual(320);
  console.log(`200% text: dials ${large.map(knob => knob.dial).join(", ")} px wide`);
  await page.screenshot({ path: `${evidence}/text-200.png`, fullPage: true });
  await context.close();
});

test("the knob passes axe in light and dark, draws a visible control under forced colours, and settles at once under reduced motion", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 900, height: 750 } });
  const page = await context.newPage();
  await page.goto("/ui-knob.html?plain");
  await page.waitForFunction(() => window.strataKnobProbe);
  for (const theme of ["light", "dark"]) {
    await page.evaluate(value => { document.documentElement.dataset.strataTheme = value; }, theme);
    const relief = await new AxeBuilder({ page }).include("#knob-panel").withTags(tags).analyze();
    expect(summary(relief.violations), `axe, ${theme}`).toEqual([]);
    await page.evaluate(() => { document.documentElement.dataset.strataMode = "face"; });
    const face = await new AxeBuilder({ page }).include("#knob-panel").withTags(tags).analyze();
    expect(summary(face.violations), `axe, ${theme}, face mode`).toEqual([]);
    await page.evaluate(() => { delete document.documentElement.dataset.strataMode; });
    await page.locator("#knob-panel").screenshot({ path: `${evidence}/theme-${theme}.png` });
  }
  await page.evaluate(() => { delete document.documentElement.dataset.strataTheme; });
  // The detent settles over motion.fast; the continuous knob follows at once.
  expect(await page.locator("#gain-knob .ug-knob__pointer").evaluate(element => getComputedStyle(element).transitionDuration)).toBe("0.12s");
  expect(await page.locator("#volume-knob .ug-knob__pointer").evaluate(element => getComputedStyle(element).transitionDuration)).toBe("0s");

  await page.emulateMedia({ forcedColors: "active" });
  const forced = await new AxeBuilder({ page }).include("#knob-panel").withTags(tags).analyze();
  expect(summary(forced.violations), "axe under forced colours").toEqual([]);
  const styles = await page.locator("#volume-knob").evaluate(knob => {
    const style = selector => getComputedStyle(knob.querySelector(selector));
    return { skirt: [style(".ug-knob__skirt").borderTopStyle, style(".ug-knob__skirt").borderTopWidth], cap: style(".ug-knob__cap").borderTopStyle,
      pointer: getComputedStyle(knob.querySelector(".ug-knob__pointer"), "::after").backgroundColor, canvas: style(".ug-knob__cap").backgroundColor };
  });
  expect(styles.skirt).toEqual(["solid", "1px"]);
  expect(styles.cap).toBe("solid");
  expect(styles.pointer).not.toBe(styles.canvas);
  // Decoded pixels: the dial shows the skirt ring, the cap ring and the pointer in CanvasText on Canvas.
  const png = PNG.sync.read(await page.locator("#volume-knob .ug-knob__dial").screenshot({ path: `${evidence}/forced-colors.png` }));
  const luma = index => 0.2126 * png.data[index] + 0.7152 * png.data[index + 1] + 0.0722 * png.data[index + 2];
  let dark = 0, light = 0;
  for (let index = 0; index < png.data.length; index += 4) { if (luma(index) < 60) dark++; else if (luma(index) > 200) light++; }
  expect(dark, "CanvasText ink in the dial").toBeGreaterThan(300);
  expect(light).toBeGreaterThan(5000);
  // Focus shows as a Highlight ring round the skirt.
  await page.locator("#volume").focus();
  await page.keyboard.press("ArrowUp");
  expect(await page.locator("#volume-knob .ug-knob__skirt").evaluate(element => getComputedStyle(element).outlineStyle)).toBe("solid");
  await page.emulateMedia({ forcedColors: "none", reducedMotion: "reduce" });
  expect(await page.locator("#gain-knob .ug-knob__pointer").evaluate(element => getComputedStyle(element).transitionDuration)).toBe("0s");
  await context.close();
});

// ---- GPU ----

async function ready(page, query = "") {
  await page.goto(`/ui-knob.html${query}`);
  await page.waitForFunction(() => window.strataKnobProbe && window.strataKnobProbe.controller.state().mode === "gpu", null, { timeout: 30000 });
  await page.waitForFunction(() => window.strataKnobProbe.scene() !== undefined);
  await page.evaluate(() => window.strataKnobProbe.controller.settle());
}
const mode = page => page.evaluate(() => window.strataKnobProbe.controller.state().mode);
/** The `#frame` decoded, after the scene and the GPU have caught up; `at(x, y)` in frame CSS px. */
async function frame(page, name) {
  await page.mouse.move(2, 2);
  await page.evaluate(async () => {
    await new Promise(resolve => setTimeout(resolve, 200));
    window.strataKnobProbe.refresh(); await window.strataKnobProbe.controller.settle();
  });
  await mkdir(evidence, { recursive: true });
  return PNG.sync.read(await page.locator("#frame").screenshot({ path: `${evidence}/${name}.png` }));
}
/** Pixels that differ between two frames, split into those inside `allowed` boxes (frame CSS px) and outside them. */
function difference(a, b, allowed) {
  const ratio = a.width / 640;
  let inside = 0, outside = 0;
  const outsideSamples = [];
  for (let y = 0; y < a.height; y++) for (let x = 0; x < a.width; x++) {
    const index = (y * a.width + x) * 4;
    if (Math.abs(a.data[index] - b.data[index]) + Math.abs(a.data[index + 1] - b.data[index + 1]) + Math.abs(a.data[index + 2] - b.data[index + 2]) < 6) continue;
    const px = (x + 0.5) / ratio, py = (y + 0.5) / ratio;
    if (allowed.some(box => px >= box.x && px <= box.x + box.width && py >= box.y && py <= box.y + box.height)) inside++;
    else { outside++; if (outsideSamples.length < 5) outsideSamples.push([Math.round(px), Math.round(py)]); }
  }
  return { inside, outside, outsideSamples };
}
/** Boxes in frame CSS px. */
const inFrame = (page, selector) => page.evaluate(selector => {
  const frame = document.getElementById("frame").getBoundingClientRect(), box = document.querySelector(selector).getBoundingClientRect();
  return { x: box.left - frame.left, y: box.top - frame.top, width: box.width, height: box.height };
}, selector);
/** elementFromPoint over a grid on the dial (inset 0.5 px): every hit must be the input. */
const hits = (page, id, n = 11) => page.evaluate(([id, n]) => {
  const input = document.getElementById(id), box = input.getBoundingClientRect();
  let total = 0; const misses = [];
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const x = box.left + 0.5 + (i / (n - 1)) * (box.width - 1), y = box.top + 0.5 + (j / (n - 1)) * (box.height - 1);
    total++;
    const hit = document.elementFromPoint(x, y);
    if (hit !== input) misses.push({ x, y, hit: hit?.className || hit?.tagName });
  }
  return { total, misses };
}, [id, n]);

for (const level of ["relief", "objects"]) test(`on the GPU at the ${level} level the knob stays presented, its pixels are fresh and contained, and native hits land on it`, async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await ready(page, level === "objects" ? "?level=objects" : "");
  const kinds = await page.evaluate(() => {
    const probe = window.strataKnobProbe, scene = probe.scene(), panel = probe.panel().getBoundingClientRect();
    const entry = selector => { const box = document.querySelector(selector).getBoundingClientRect();
      return scene.primitives.find(p => Math.abs(p.rect[0] - (box.left - panel.left)) < 0.5 && Math.abs(p.rect[1] - (box.top - panel.top)) < 0.5 && Math.abs(p.rect[2] - box.width) < 0.5) ?? null; };
    return { version: scene.version, material: probe.controller.state().materials[0]?.kind, skirt: entry("#volume-knob .ug-knob__skirt"), cap: entry("#volume-knob .ug-knob__cap"),
      input: scene.primitives.some(p => p.face === "groove"), count: scene.primitives.length };
  });
  if (level === "relief") {
    expect(kinds).toMatchObject({ version: 1, material: "relief", skirt: { face: "raised", material: "satin" }, cap: { face: "raised", material: "satin" }, input: false, count: 5 });
  } else {
    expect(kinds).toMatchObject({ version: 2, material: "objects", skirt: { object: "slab", material: "satin" }, cap: { object: "slab", material: "satin" }, input: false, count: 5 });
    // The cap stands on the skirt's top.
    expect(kinds.cap.base).toBe(kinds.skirt.base + kinds.skirt.height);
  }
  // Native hits: a grid over each dial lands on its input, and the legend on its label.
  for (const id of ["volume", "gain"]) {
    const result = await hits(page, id);
    expect(result.misses, `${id}: hits over the dial`).toEqual([]);
    console.log(`${level}: ${id} ${result.total} hits, ${result.misses.length} mismatches`);
  }
  expect(await page.evaluate(() => { const label = document.querySelector("#volume-knob .ug-knob__label").getBoundingClientRect();
    return document.elementFromPoint(label.left + label.width / 2, label.top + label.height / 2)?.className; })).toBe("ug-knob__label");

  // Fresh pixels after each value change, all of them inside the knob's dial (or the readout, which prints the value).
  const allowed = [await inFrame(page, "#volume-knob .ug-knob__dial"), await inFrame(page, "#gain-knob .ug-knob__dial"), await inFrame(page, "#knob-read")];
  let before = await frame(page, `${level}-0`);
  const steps = [
    ["ring click on 3", async () => page.mouse.click(...await numeral(page, "volume", "3")), 30],
    ["drag up 40 px", async () => { const v = await dial(page, "volume"); await drag(page, [v.cx, v.cy], -40); }, 50],
    ["cap tap", async () => { const v = await dial(page, "volume"); await page.mouse.click(v.cx, v.cy + 12); }, 49],
    ["ArrowUp key", async () => { await page.locator("#volume").focus(); await page.keyboard.press("End"); }, 100],
    ["wheel notch", async () => { const v = await dial(page, "volume"); await page.mouse.move(v.cx, v.cy); await page.mouse.wheel(0, 100); }, 99],
    ["double-click reset", async () => { const v = await dial(page, "volume"); await page.mouse.dblclick(v.cx + v.r + 12, v.cy); }, 62],
  ];
  for (const [name, act, expected] of steps) {
    await act();
    expect(await value(page, "volume"), name).toBe(expected);
    expect(await mode(page), `${name}: GPU stays on`).toBe("gpu");
    const after = await frame(page, `${level}-${expected}`);
    const changed = difference(before, after, allowed);
    expect(changed.inside, `${name}: pixels change in the dial`).toBeGreaterThan(20);
    expect(changed.outside, `${name}: no pixel changes outside the dial (${JSON.stringify(changed.outsideSamples)})`).toBe(0);
    console.log(`${level}: ${name} → ${expected}: ${changed.inside} px changed in the dial, ${changed.outside} outside`);
    before = after;
  }
  // The detented knob, by a real click on a numeral, then a real drag; the page never scrolled.
  await page.mouse.click(...await numeral(page, "gain", "6"));
  expect(await value(page, "gain")).toBe(6);
  const g = await dial(page, "gain");
  await drag(page, [g.cx, g.cy], 100);
  expect(await value(page, "gain")).toBe(-6);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  // Real clicks in the dial's bottom corners set the ends: every pixel of the box is the control.
  const v = await dial(page, "volume");
  await page.mouse.click(v.box.x + 1, v.box.y + v.box.height - 1);
  expect(await value(page, "volume")).toBe(0);
  await page.mouse.click(v.box.x + v.box.width - 1, v.box.y + v.box.height - 1);
  expect(await value(page, "volume")).toBe(100);
  expect(await mode(page)).toBe("gpu");
  expect(errors).toEqual([]);
});

test("native hits over the dial land on the input at DPR 2 on the GPU, at both levels", async ({ browser }) => {
  for (const query of ["", "?level=objects"]) {
    const context = await browser.newContext({ viewport: { width: 900, height: 750 }, deviceScaleFactor: 2 });
    const page = await context.newPage();
    await ready(page, query);
    for (const id of ["volume", "gain"]) {
      const result = await hits(page, id, 21);
      expect(result.misses, `${query || "relief"}, DPR 2: ${id}`).toEqual([]);
      console.log(`DPR 2 ${query || "relief"}: ${id} ${result.total} hits, ${result.misses.length} mismatches`);
    }
    await page.mouse.click(...await numeral(page, "volume", "7"));
    expect(await value(page, "volume")).toBe(70);
    expect(await mode(page)).toBe("gpu");
    await context.close();
  }
});

test("the accessibility snapshot is the same in DOM and GPU modes, and axe passes on the GPU page", async ({ page }) => {
  await page.goto("/ui-knob.html?dom");
  await page.waitForFunction(() => window.strataKnobProbe);
  await page.evaluate(() => window.strataKnobProbe.controller.settle?.());
  const act = async () => { await page.locator("#volume").focus(); await page.keyboard.press("ArrowUp"); await page.keyboard.press("ArrowUp"); await page.locator("#gain").focus(); await page.keyboard.press("ArrowDown"); };
  await act();
  const dom = await page.locator("#knob-panel").ariaSnapshot();
  await ready(page);
  await act();
  const gpu = await page.locator("#knob-panel").ariaSnapshot();
  expect(gpu).toBe(dom);
  expect(gpu).toContain('slider "Volume"');
  expect(await mode(page)).toBe("gpu");
  const { violations } = await new AxeBuilder({ page }).include("#knob-panel").withTags(tags).analyze();
  expect(summary(violations), "axe on the GPU page").toEqual([]);
});
