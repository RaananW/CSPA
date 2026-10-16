/**
 * Browser suite for `@underglass/ui/gpu` on `ui-gpu.html` (`window.strataGpuProbe`): a Strata panel of native controls,
 * enrolled with `@underglass/core` and presented on the GPU with core's relief material. It proves that GPU stays on
 * with face mode set, that the scene follows the panel's markup, tokens and states (hover, press, focus, checked,
 * value), that pixels stay fresh and native input reaches the controls, that the outset shows the panel's shadow,
 * and that returning to ordinary DOM gives the CSS relief back. Pixels are decoded from `#frame` screenshots.
 */
import { test, expect } from "../helpers/current-browser.mjs";
import { mkdir } from "node:fs/promises";
import { PNG } from "pngjs";
import { evidenceDirectory } from "../helpers/evidence.mjs";

const evidence = evidenceDirectory("ui-gpu");

async function ready(page, query = "") {
  await page.goto(`/ui-gpu.html${query}`);
  await page.waitForFunction(() => window.strataGpuProbe && window.strataGpuProbe.controller.state().mode === "gpu", null, { timeout: 30000 });
  await page.waitForFunction(() => window.strataGpuProbe.scene() !== undefined);
  await page.evaluate(() => window.strataGpuProbe.controller.settle());
}
async function snap(page, name) {
  await page.evaluate(async () => { window.strataGpuProbe.refresh(); await window.strataGpuProbe.controller.settle(); });
  await mkdir(evidence, { recursive: true });
  const png = PNG.sync.read(await page.locator("#frame").screenshot({ path: `${evidence}/${name}.png` }));
  const ratio = png.width / 760;
  return (x, y) => [...png.data.subarray((Math.round(y * ratio) * png.width + Math.round(x * ratio)) * 4, (Math.round(y * ratio) * png.width + Math.round(x * ratio)) * 4 + 3)];
}
/** The scene's primitive for the element with `id`, matched by its rectangle. */
async function primitiveOf(page, selector) {
  return page.evaluate(selector => {
    const probe = window.strataGpuProbe, panel = probe.panel(), element = panel.querySelector(selector);
    probe.refresh();
    const outer = panel.getBoundingClientRect(), inner = element.getBoundingClientRect();
    const near = (a, b) => Math.abs(a - b) < 0.5;
    return probe.scene().primitives.find(primitive => near(primitive.rect[0], inner.left - outer.left) && near(primitive.rect[1], inner.top - outer.top)
      && near(primitive.rect[2], inner.width)) ?? null;
  }, selector);
}
const luma = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

test("Strata panels are GPU-presented in face mode with a scene from their markup, tokens and states", async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await ready(page);
  const initial = await page.evaluate(() => {
    const probe = window.strataGpuProbe, state = probe.controller.state(), scene = probe.scene();
    return { mode: state.mode, reason: state.reason, layers: state.layers.map(layer => layer.id), materials: state.materials,
      face: probe.panel().getAttribute("data-strata-mode"), faces: scene.primitives.map(primitive => primitive.face), scene };
  });
  expect(initial.mode, initial.reason).toBe("gpu");
  expect(initial.layers).toEqual(["gpu-panel"]);
  expect(initial.face).toBe("face");
  expect(initial.materials).toEqual([expect.objectContaining({ id: "gpu-panel", kind: "relief" })]);
  // Panel, field, checkbox well and mark, switch well and knob, slider groove and knob, three buttons, spinner ring.
  expect(initial.faces).toEqual(["raised", "well", "well", "mark", "well", "knob", "groove", "knob", "raised", "raised", "raised", "ring"]);
  // Token values resolve through the stylesheet: depth 50% in the light theme.
  expect(initial.scene).toMatchObject({ light: { azimuth: 323, elevation: 41 }, bevel: { width: 6, gain: 0.55, profile: "quarter-round" },
    shadow: { strength: 0.24 }, interior: { max: 0.04 }, backdrop: "#ffffff", focus: { colour: "#2563eb", width: 3, offset: 0.5 } });
  expect(initial.scene.primitives[0]).toMatchObject({ face: "raised", height: 8, material: "matte" });
  expect(await primitiveOf(page, "#gpu-save")).toMatchObject({ face: "raised", height: 3, finish: true, state: { hover: false, disabled: false } });
  expect(await primitiveOf(page, "#gpu-disabled")).toMatchObject({ state: { disabled: true } });
  expect(initial.scene.materials.metal).toMatchObject({ base: { metallic: 1 } });

  // GPU relief: the panel's shadow falls into the outset below it, where CSS face mode draws nothing.
  const panelBox = await page.evaluate(() => { const panel = window.strataGpuProbe.panel(); return { x: panel.offsetLeft, y: panel.offsetTop, w: panel.offsetWidth, h: panel.offsetHeight }; });
  const pixel = await snap(page, "gpu");
  expect(luma(pixel(panelBox.x + panelBox.w / 2, panelBox.y + panelBox.h + 3))).toBeLessThan(240);

  // States follow the pointer and the keyboard, with no rebuild of the pass.
  const revision = await page.evaluate(() => window.strataGpuProbe.controller.state().registryRevision);
  await page.locator("#gpu-save").hover();
  expect(await primitiveOf(page, "#gpu-save")).toMatchObject({ state: { hover: true } });
  await page.locator("#gpu-save").click();
  expect(await page.evaluate(() => window.strataGpuProbe.saves())).toBe(1);
  await expect(page.locator("#gpu-count")).toHaveText("Saved 1 times");
  // Keyboard focus shows the focus edge: Tab from Save lands on the disabled button's neighbour, so focus the field
  // and confirm it matches :focus-visible, as keyboard focus does.
  await page.locator("#gpu-name").focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  expect(await page.evaluate(() => document.activeElement?.id)).toBe("gpu-name");
  expect(await primitiveOf(page, "#gpu-name")).toMatchObject({ state: { focus: true } });
  // Native input: typing, toggling and sliding reach the original controls, and the scene follows.
  await page.locator("#gpu-name").fill("Grace Hopper");
  await expect(page.locator("#gpu-name")).toHaveValue("Grace Hopper");
  const knobBefore = await page.evaluate(() => window.strataGpuProbe.scene().primitives.filter(primitive => primitive.face === "knob").map(primitive => primitive.rect[0]));
  await page.locator("#gpu-wifi").check();
  await page.locator("#gpu-volume").fill("90");
  // The switch knob slides with a CSS transition; the scene follows it to the end.
  await page.waitForFunction(() => !window.strataGpuProbe.panel().getAnimations({ subtree: true }).some(animation => animation instanceof CSSTransition && animation.playState === "running"));
  await page.evaluate(async () => { await new Promise(requestAnimationFrame); await window.strataGpuProbe.controller.settle(); });
  const knobAfter = await page.evaluate(() => window.strataGpuProbe.scene().primitives.filter(primitive => primitive.face === "knob").map(primitive => primitive.rect[0]));
  expect(knobAfter[0]).toBeGreaterThan(knobBefore[0]);
  expect(knobAfter[1]).toBeGreaterThan(knobBefore[1]);
  const after = await page.evaluate(() => window.strataGpuProbe.controller.state());
  expect(after.mode).toBe("gpu");
  expect(after.registryRevision).toBe(revision);
  expect(errors).toEqual([]);
});

test("ordinary DOM gives the CSS relief back, and GPU returns to face mode", async ({ page }) => {
  await ready(page);
  await page.evaluate(async () => { await window.strataGpuProbe.controller.disable(); window.strataGpuProbe.refresh(); });
  const dom = await page.evaluate(() => ({ mode: window.strataGpuProbe.controller.state().mode, face: window.strataGpuProbe.panel().getAttribute("data-strata-mode"),
    shadow: getComputedStyle(window.strataGpuProbe.panel()).boxShadow, materials: window.strataGpuProbe.controller.state().materials }));
  expect(dom.mode).toBe("dom");
  expect(dom.face).toBeNull();
  expect(dom.shadow).not.toBe("none");
  expect(dom.materials).toEqual([]);
  await page.evaluate(async () => { await window.strataGpuProbe.controller.enable(); window.strataGpuProbe.refresh(); await window.strataGpuProbe.controller.settle(); });
  // The CSS shadow fades out over the motion duration once face mode is on.
  await page.waitForFunction(() => getComputedStyle(window.strataGpuProbe.panel()).boxShadow === "none");
  const gpu = await page.evaluate(() => ({ mode: window.strataGpuProbe.controller.state().mode, face: window.strataGpuProbe.panel().getAttribute("data-strata-mode"),
    shadow: getComputedStyle(window.strataGpuProbe.panel()).boxShadow, materials: window.strataGpuProbe.controller.state().materials.length }));
  expect(gpu).toEqual({ mode: "gpu", face: "face", shadow: "none", materials: 1 });
  // Detaching restores the CSS presentation and releases the layer.
  const detached = await page.evaluate(() => { window.strataGpuProbe.detach(); const state = window.strataGpuProbe.controller.state();
    return { layers: state.layers.length, materials: state.materials.length, face: window.strataGpuProbe.panel().getAttribute("data-strata-mode") }; });
  expect(detached).toEqual({ layers: 0, materials: 0, face: null });
});
