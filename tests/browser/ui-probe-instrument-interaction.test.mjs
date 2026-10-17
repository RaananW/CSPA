/**
 * Probe I0.7 (docs/ui-library/instrument.md): do a Knob and a Fader pass as sliders with real pointer and keyboard
 * input, with the WCAG 2.5.7 single-pointer alternative, in plain DOM and in GPU mode? Runs
 * `ui-probe-instrument-interaction.html` (`window.instrumentProbe`) in both modes with `page.mouse` drags, ring
 * clicks, cap taps, the wheel and the keyboard, and checks `value`, `aria-valuetext`, the accessibility tree's value,
 * the dispatched `input`/`change` events, hit geometry at DPR 1 and 2, axe, the accessibility snapshot across modes,
 * reduced motion and target size. GPU mode must stay on throughout.
 */
import { test, expect } from "../helpers/current-browser.mjs";
import AxeBuilder from "@axe-core/playwright";

const tags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const text = value => `${value < 0 ? "−" : ""}${Math.abs(value)} dB`;
const MIN = -24, MAX = 12;

async function open(browser, mode, { dpr = 1, reducedMotion = "no-preference" } = {}) {
  const context = await browser.newContext({ viewport: { width: 1000, height: 700 }, deviceScaleFactor: dpr, reducedMotion });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`/ui-probe-instrument-interaction.html${mode === "dom" ? "?dom" : ""}`);
  await page.waitForFunction(() => window.instrumentProbe);
  if (mode === "gpu") {
    await page.waitForFunction(() => window.instrumentProbe.controller.state().mode === "gpu", null, { timeout: 30000 });
    await page.waitForFunction(() => window.instrumentProbe.scene() !== undefined);
  }
  await page.evaluate(() => window.instrumentProbe.controller.settle());
  return { context, page, errors };
}
/** GPU mode must stay on; in DOM mode it must stay off. */
async function expectMode(page, mode, where) {
  const state = await page.evaluate(() => { const { mode, reason } = window.instrumentProbe.controller.state(); return { mode, reason }; });
  if (mode === "gpu") expect(state.mode, `${where}: ${state.reason}`).toBe("gpu");
  else expect(state.mode, where).not.toBe("gpu");
}
const events = page => page.evaluate(() => window.instrumentProbe.events());
const clearEvents = page => page.evaluate(() => window.instrumentProbe.clearEvents());
const value = (page, id) => page.evaluate(id => Number(document.getElementById(id).value), id);
/**
 * The accessibility tree's own slider node (Chromium's `Accessibility.getFullAXTree`): role, name, value (the tree's
 * valuenow), orientation, range. Its `valuetext` property is not used: CDP reports the number there even for a plain
 * `role="slider"` element with `aria-valuetext`, so `aria-valuetext` is checked as the attribute on the input.
 */
async function axSlider(page, name) {
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send("Accessibility.enable");
    const { nodes } = await cdp.send("Accessibility.getFullAXTree");
    const node = nodes.find(candidate => candidate.role?.value === "slider" && candidate.name?.value === name);
    const property = key => node?.properties?.find(candidate => candidate.name === key)?.value?.value;
    return node && { role: node.role.value, name: node.name.value, value: node.value?.value, orientation: property("orientation"), min: property("valuemin"), max: property("valuemax") };
  } finally { await cdp.detach(); }
}
/** The input's value, its `aria-valuetext` attribute and the accessibility tree's value must agree on `expected`. */
async function expectSlider(page, id, name, expected, where) {
  const dom = await page.evaluate(id => { const input = document.getElementById(id); return { value: input.value, valuetext: input.getAttribute("aria-valuetext") }; }, id);
  expect(Number(dom.value), `${where}: value`).toBe(expected);
  expect(dom.valuetext, `${where}: aria-valuetext`).toBe(text(expected));
  const ax = await axSlider(page, name);
  expect(ax, `${where}: accessibility node`).toBeTruthy();
  expect(Number(ax.value), `${where}: aria-valuenow (accessibility tree)`).toBe(expected);
}
const centre = async locator => { const box = await locator.boundingBox(); return { x: box.x + box.width / 2, y: box.y + box.height / 2, box }; };
/** Sets the knob through the platform, not the page's code, so each test starts from a known value. */
const setKnob = async (page, v) => { await page.evaluate(v => { document.getElementById("pk-knob").value = String(v); document.getElementById("pk-knob").dispatchEvent(new Event("input", { bubbles: true })); }, v); await clearEvents(page); };

for (const mode of ["dom", "gpu"]) {
  test.describe(mode, () => {
    test("knob: drag, fine drag, ring click, cap tap, wheel, double click and keys all move the value, and the alternative reaches every value a drag can", async ({ browser }) => {
      const { context, page, errors } = await open(browser, mode);
      const knob = page.getByRole("slider", { name: "Gain" });
      const dial = page.locator(".pk-dial");
      await expectSlider(page, "pk-knob", "Gain", 0, "initial");

      // A drag of 50 px at 200 px per sweep is a quarter of the 36 steps: +9. Shift divides the rate by ten: +1.8, which snaps to +2.
      let { x, y } = await centre(dial);
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x, y - 50, { steps: 10 });
      await page.mouse.up();
      await expectSlider(page, "pk-knob", "Gain", 9, "drag up 50px");
      let log = await events(page);
      expect(log.filter(entry => entry.type === "change")).toEqual([{ id: "pk-knob", type: "change", value: "9" }]);
      expect(log.filter(entry => entry.type === "input").map(entry => Number(entry.value))).toEqual([...Array(9).keys()].map(index => index + 1));
      await page.mouse.move(x, y);
      await page.keyboard.down("Shift");
      await page.mouse.down();
      await page.mouse.move(x, y - 100, { steps: 10 });
      await page.mouse.up();
      await page.keyboard.up("Shift");
      await expectSlider(page, "pk-knob", "Gain", 11, "fine drag up 100px");
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x, y + 200, { steps: 20 });
      await page.mouse.up();
      await expectSlider(page, "pk-knob", "Gain", MIN, "drag down past the end clamps at min");
      await expectMode(page, mode, "after drags");

      // Click on the scale ring sets the value at that angle: every value a drag can reach, with no drag at all.
      const radius = 46, set = new Set();
      for (let target = MIN; target <= MAX; target++) {
        const theta = ((target - MIN) / (MAX - MIN) * 270 - 135) / 180 * Math.PI;
        await page.mouse.click(x + radius * Math.sin(theta), y - radius * Math.cos(theta));
        const now = await value(page, "pk-knob");
        expect(now, `ring click for ${target}`).toBe(target);
        set.add(now);
      }
      expect(set.size).toBe(MAX - MIN + 1);
      // In the gap at the bottom, the nearer end of the sweep wins.
      await page.mouse.click(x - 20, y + 54);
      expect(await value(page, "pk-knob")).toBe(MIN);
      await page.mouse.click(x + 20, y + 54);
      expect(await value(page, "pk-knob")).toBe(MAX);
      await expectSlider(page, "pk-knob", "Gain", MAX, "ring click in the gap");

      // A tap on the cap's lower half steps down one, the upper half up one: walk the whole range both ways.
      const visited = [];
      for (let step = 0; step < MAX - MIN; step++) { await page.mouse.click(x, y + 16); visited.push(await value(page, "pk-knob")); }
      expect(visited).toEqual(Array.from({ length: MAX - MIN }, (_, index) => MAX - 1 - index));
      for (let step = 0; step < MAX - MIN; step++) { await page.mouse.click(x, y - 16); visited.push(await value(page, "pk-knob")); }
      expect(visited.slice(MAX - MIN)).toEqual(Array.from({ length: MAX - MIN }, (_, index) => MIN + 1 + index));
      await expectSlider(page, "pk-knob", "Gain", MAX, "after tapping back up");

      // The wheel steps by one, and the (made scrollable) page does not scroll under it.
      await page.evaluate(() => { document.body.style.minHeight = "2000px"; });
      await clearEvents(page);
      await page.mouse.move(x, y);
      await page.mouse.wheel(0, 100);
      await page.mouse.wheel(0, 100);
      await expectSlider(page, "pk-knob", "Gain", MAX - 2, "wheel down twice");
      await page.mouse.wheel(0, -100);
      await expectSlider(page, "pk-knob", "Gain", MAX - 1, "wheel up");
      expect((await events(page)).map(entry => entry.type)).toEqual(["input", "change", "input", "change", "input", "change"]);
      expect(await page.evaluate(() => window.scrollY)).toBe(0);

      // Double click resets to the default.
      await setKnob(page, 7);
      await page.mouse.dblclick(x, y);
      await expectSlider(page, "pk-knob", "Gain", 0, "double click");

      // The keyboard is the native one.
      await knob.focus();
      await page.keyboard.press("ArrowUp");
      await expectSlider(page, "pk-knob", "Gain", 1, "ArrowUp");
      await page.keyboard.press("ArrowRight");
      await expectSlider(page, "pk-knob", "Gain", 2, "ArrowRight");
      await page.keyboard.press("ArrowDown");
      await expectSlider(page, "pk-knob", "Gain", 1, "ArrowDown");
      await page.keyboard.press("PageUp");
      const afterPageUp = await value(page, "pk-knob");
      expect(afterPageUp).toBeGreaterThan(2);
      await expectSlider(page, "pk-knob", "Gain", afterPageUp, "PageUp");
      await page.keyboard.press("PageDown");
      expect(await value(page, "pk-knob")).toBe(1);
      await page.keyboard.press("Home");
      await expectSlider(page, "pk-knob", "Gain", MIN, "Home");
      await page.keyboard.press("End");
      await expectSlider(page, "pk-knob", "Gain", MAX, "End");
      const ax = await axSlider(page, "Gain");
      expect(ax).toMatchObject({ role: "slider", name: "Gain" });
      await expectMode(page, mode, "end of knob test");
      expect(errors).toEqual([]);
      await context.close();
    });

    test("fader: the native vertical thumb, track click, wheel, double click and keys work, with up as more", async ({ browser }) => {
      const { context, page, errors } = await open(browser, mode);
      const fader = page.locator("#pk-fader");
      await expect(fader).toHaveAttribute("aria-orientation", "vertical");
      await expectSlider(page, "pk-fader", "Level", -6, "initial");
      const ax = await axSlider(page, "Level");
      expect(ax).toMatchObject({ role: "slider", name: "Level", orientation: "vertical", min: -60, max: 6 });
      const box = await fader.boundingBox();
      expect(box.height).toBeGreaterThan(box.width * 3);

      // Vertical through writing-mode: the track click near the top is higher than near the bottom.
      const x = box.x + box.width / 2;
      await page.mouse.click(x, box.y + box.height * 0.1);
      const high = await value(page, "pk-fader");
      await page.mouse.click(x, box.y + box.height * 0.9);
      const low = await value(page, "pk-fader");
      expect(high, "click near the top").toBeGreaterThan(-6);
      expect(low, "click near the bottom").toBeLessThan(-40);
      await expectSlider(page, "pk-fader", "Level", low, "track click");

      // The native thumb drags: from its place, 40 px up raises the value.
      const thumb = await page.evaluate(() => { const input = document.getElementById("pk-fader"), box = input.getBoundingClientRect();
        const fraction = (Number(input.value) - Number(input.min)) / (Number(input.max) - Number(input.min));
        return { y: box.top + box.height - 10 - fraction * (box.height - 20) }; });
      await page.mouse.move(x, thumb.y);
      await page.mouse.down();
      await page.mouse.move(x, thumb.y - 40, { steps: 8 });
      await page.mouse.up();
      const dragged = await value(page, "pk-fader");
      expect(dragged - low, "thumb drag 40px up").toBeGreaterThanOrEqual(10);
      expect(dragged - low).toBeLessThanOrEqual(20);
      await expectSlider(page, "pk-fader", "Level", dragged, "thumb drag");

      await clearEvents(page);
      await page.evaluate(() => { document.body.style.minHeight = "2000px"; });
      await page.mouse.move(x, box.y + box.height / 2);
      await page.mouse.wheel(0, -100);
      await expectSlider(page, "pk-fader", "Level", dragged + 1, "wheel up");
      expect((await events(page)).map(entry => entry.type)).toEqual(["input", "change"]);
      expect(await page.evaluate(() => window.scrollY)).toBe(0);
      await page.mouse.dblclick(x, box.y + box.height / 2);
      await expectSlider(page, "pk-fader", "Level", -6, "double click resets");

      await fader.focus();
      await page.keyboard.press("ArrowUp");
      await expectSlider(page, "pk-fader", "Level", -5, "ArrowUp");
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("ArrowDown");
      await expectSlider(page, "pk-fader", "Level", -7, "ArrowDown");
      await page.keyboard.press("PageUp");
      expect(await value(page, "pk-fader")).toBeGreaterThan(-7);
      await page.keyboard.press("Home");
      await expectSlider(page, "pk-fader", "Level", -60, "Home");
      await page.keyboard.press("End");
      await expectSlider(page, "pk-fader", "Level", 6, "End");
      await expectMode(page, mode, "end of fader test");
      expect(errors).toEqual([]);
      await context.close();
    });

    for (const dpr of [1, 2]) {
      test(`elementFromPoint at interior and near-edge points of both controls lands on the input or its label, and edge clicks work, at DPR ${dpr}`, async ({ browser }) => {
        const { context, page, errors } = await open(browser, mode, { dpr });
        const landed = await page.evaluate(() => {
          const out = [];
          for (const id of ["pk-knob", "pk-fader"]) {
            const input = document.getElementById(id), label = input.labels[0], box = input.getBoundingClientRect(), inset = 0.5;
            for (const fx of [0, 0.25, 0.5, 0.75, 1]) for (const fy of [0, 0.25, 0.5, 0.75, 1]) {
              const px = box.left + inset + fx * (box.width - 2 * inset), py = box.top + inset + fy * (box.height - 2 * inset);
              const hit = document.elementFromPoint(px, py);
              out.push({ id, fx, fy, ok: hit === input || hit === label, hit: hit?.id || hit?.className || hit?.tagName });
            }
          }
          return out;
        });
        expect(landed.filter(entry => !entry.ok)).toEqual([]);
        expect(landed).toHaveLength(50);
        // A real click 1.5 CSS px inside the bottom corners of the dial is on the ring, in the gap, and goes to the nearer end.
        const box = await page.locator("#pk-knob").boundingBox();
        await page.mouse.click(box.x + box.width - 1.5, box.y + box.height - 1.5);
        expect(await value(page, "pk-knob")).toBe(MAX);
        await page.mouse.click(box.x + 1.5, box.y + box.height - 1.5);
        expect(await value(page, "pk-knob")).toBe(MIN);
        await expectMode(page, mode, "after edge clicks");
        expect(errors).toEqual([]);
        await context.close();
      });
    }

    test("target size: the cap and the ring are at least 24 by 24 CSS px", async ({ browser }) => {
      const { context, page } = await open(browser, mode);
      const size = await page.evaluate(() => {
        // Layout sizes: the cap's bounding box grows while it is turned.
        const cap = document.querySelector(".pk-cap"), dial = document.querySelector(".pk-dial");
        return { cap: [cap.offsetWidth, cap.offsetHeight], ring: (dial.offsetWidth - cap.offsetWidth) / 2, dial: [dial.offsetWidth, dial.offsetHeight] };
      });
      expect(Math.min(...size.cap)).toBeGreaterThanOrEqual(24);
      expect(size.ring, "ring band thickness").toBeGreaterThanOrEqual(24);
      // The ring is hittable across its whole band: both edges of it.
      const { x, y } = await centre(page.locator(".pk-dial"));
      await page.mouse.click(x + 36, y);
      const inner = await value(page, "pk-knob");
      await page.mouse.click(x - 58, y);
      const outer = await value(page, "pk-knob");
      expect(inner).toBeGreaterThan(0);
      expect(outer).toBeLessThan(0);
      await context.close();
    });

    test("axe passes on the page", async ({ browser }) => {
      const { context, page } = await open(browser, mode);
      const violations = (await new AxeBuilder({ page }).withTags(tags).analyze()).violations;
      expect(violations.map(entry => `${entry.id}: ${entry.nodes.map(node => node.target.join(" ")).join(", ")}`)).toEqual([]);
      await expectMode(page, mode, "after axe");
      await context.close();
    });

    test("reduced motion makes detent animation instant", async ({ browser }) => {
      for (const reducedMotion of ["no-preference", "reduce"]) {
        const { context, page } = await open(browser, mode, { reducedMotion });
        const result = await page.evaluate(() => {
          const cap = document.querySelector(".pk-pointer"), input = document.getElementById("pk-knob");
          const duration = getComputedStyle(cap).transitionDuration;
          input.value = "5";
          input.dispatchEvent(new Event("input", { bubbles: true }));
          getComputedStyle(cap).transform;
          return { duration, running: cap.getAnimations().length };
        });
        if (reducedMotion === "reduce") expect(result).toEqual({ duration: "0s", running: 0 });
        else expect(result.running).toBeGreaterThanOrEqual(1);
        await context.close();
      }
    });

    if (mode === "gpu") {
      test("the cap's pixels are fresh after every pointer change and the GPU never falls back", async ({ browser }) => {
        const { context, page, errors } = await open(browser, "gpu");
        const dial = page.locator(".pk-dial"), { x, y } = await centre(dial), box = await dial.boundingBox();
        const shot = async () => { await page.evaluate(async () => { window.instrumentProbe.refresh(); await window.instrumentProbe.controller.settle(); }); return page.screenshot({ clip: box }); };
        const seen = [await shot()];
        await page.mouse.click(x + 46 * Math.sin(Math.PI / 2), y);
        seen.push(await shot());
        await page.mouse.click(x - 46, y);
        seen.push(await shot());
        await page.mouse.move(x, y);
        await page.mouse.down();
        await page.mouse.move(x, y - 40, { steps: 8 });
        await page.mouse.up();
        seen.push(await shot());
        for (let index = 1; index < seen.length; index++) expect(seen[index].equals(seen[index - 1]), `frame ${index} differs from the one before`).toBe(false);
        const state = await page.evaluate(() => window.instrumentProbe.controller.state());
        expect(state.mode, state.reason).toBe("gpu");
        expect(errors).toEqual([]);
        await context.close();
      });
    }
  });
}

test("the accessibility snapshot of the controls is the same in DOM and GPU mode", async ({ browser }) => {
  const snapshots = {};
  for (const mode of ["dom", "gpu"]) {
    const { context, page } = await open(browser, mode);
    await page.locator("#pk-knob").press("ArrowUp");
    await page.locator("#pk-fader").press("ArrowDown");
    snapshots[mode] = await page.locator("#frame").ariaSnapshot();
    await context.close();
  }
  expect(snapshots.dom).toContain("slider");
  expect(snapshots.dom).toContain("1 dB");
  expect(snapshots.gpu).toBe(snapshots.dom);
});
