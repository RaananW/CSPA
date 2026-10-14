import { test, expect } from "../helpers/current-browser.mjs";
import { developmentURL } from "../helpers/urls.mjs";
import { mkdir, writeFile, stat, utimes } from "node:fs/promises";
import { PNG } from "pngjs";

import { evidenceDirectory } from "../helpers/evidence.mjs";
const evidence = evidenceDirectory("runtime");
async function save(name, report) {
  await mkdir(evidence, { recursive: true });
  await writeFile(`${evidence}/${name}.json`, JSON.stringify(report, null, 2));
}
async function ready(page, query = "", strict = false) {
  await page.goto(`${strict ? developmentURL : ""}/runtime.html?${query}${strict ? "&strict" : ""}`);
  await page.waitForFunction(() => window.runtimeProbe?.state().mode === "gpu" && !window.runtimeProbe.state().initializing);
  await page.waitForTimeout(300);
  await page.evaluate(() => window.runtimeProbe.settle());
}
async function snap(page, name) {
  await mkdir(evidence, { recursive: true });
  const bytes = await page.locator("#frame").screenshot({ path: `${evidence}/${name}.png` });
  const png = PNG.sync.read(bytes);
  const ratio = png.width / 640;
  return (x, y) => [...png.data.subarray((Math.round(y * ratio) * png.width + Math.round(x * ratio)) * 4,
    (Math.round(y * ratio) * png.width + Math.round(x * ratio)) * 4 + 4)];
}
function zero(state) {
  expect(Object.values(state.resources).every(value => value === 0)).toBe(true);
  expect(Object.values(state.runtimeResources).every(value => value === 0)).toBe(true);
}

for (const strict of [false, true]) test(`typed layers: direct native pixels and 300 real-commit-free frames strict=${strict}`, async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await ready(page, "", strict);
  const initial = await page.evaluate(() => window.runtimeProbe.state());
  expect(initial.reactVersion).toBe(process.env.CANVAS_EXPECT_REACT_VERSION ?? "19.3.0");
  expect(initial.metrics.admission.passes).toBe(1);
  expect(initial.metrics.admission.last.nativePixels).toEqual([]);
  expect(initial.metrics.admission.last.gpuPixels).toEqual([[207, 37, 83, 255], [31, 179, 113, 255]]);
  expect(initial.metrics.admission.last.geometry.hits).toEqual([true, true, false]);
  expect(initial.resources.probeElements).toBe(0);
  expect(initial.resources.probeReadbacks).toBe(0);
  expect(initial.commits.mounts).toBe(strict ? 2 : 1);
  expect(initial.commits.count).toBeGreaterThan(0);
  expect(initial.resources.engines).toBe(1);
  const cdp = await page.context().newCDPSession(page);
  const environment = { browser: await cdp.send("Browser.getVersion"), launch: await cdp.send("Browser.getBrowserCommandLine") };
  await cdp.detach();
  const pixels = await snap(page, `independent-${strict}-initial`);
  expect(pixels(45, 340)).toEqual([240, 30, 60, 255]);
  expect(pixels(515, 155)).toEqual([20, 200, 90, 255]);
  await page.locator("#nested").click();
  await expect(page.locator("#nested")).toHaveText("Nested 1");
  await page.locator("h1").click();
  await page.waitForTimeout(300);
  await page.evaluate(() => window.runtimeProbe.settle());
  const changed = await page.evaluate(() => window.runtimeProbe.state());
  expect(changed.commits.count).toBeGreaterThan(initial.commits.count);
  expect(changed.metrics.perLayer.primary.captures).toBeGreaterThan(initial.metrics.perLayer.primary.captures);
  expect(changed.metrics.perLayer.stationary.uploads).toBeGreaterThanOrEqual(initial.metrics.perLayer.stationary.uploads);
  const warmup = await page.evaluate(() => window.runtimeProbe.animate({ x: 42, scaleX: 0.91, scaleY: 0.91, rotation: 9 }, 1));
  await page.waitForTimeout(300);
  await page.evaluate(() => window.runtimeProbe.settle());
  const motion = await page.evaluate(() => window.runtimeProbe.animate({ x: 45, scaleX: 0.9, scaleY: 0.9, rotation: 10 }, 300));
  for (const key of ["captures", "pixelCopies", "pixelReadbacks", "uploads"]) expect(motion.after.metrics[key]).toBe(motion.before.metrics[key]);
  expect(motion.after.metrics.admission).toEqual(motion.before.metrics.admission);
  expect(motion.after.commits.count).toBe(motion.before.commits.count);
  expect(motion.after.metrics.gpuFrames - motion.before.metrics.gpuFrames).toBe(300);
  expect(motion.after.metrics.frameWorkMs.length).toBe(256);
  expect(motion.after.metrics.timings.frameWorkMs.count).toBe(motion.after.metrics.gpuFrames);
  expect(motion.after.layers.find(layer => layer.id === "stationary").matrix).toEqual(initial.layers.find(layer => layer.id === "stationary").matrix);
  const after = await snap(page, `independent-${strict}-transformed`);
  expect(after(515, 155)).toEqual([20, 200, 90, 255]);
  await page.locator("#count").click();
  await expect(page.locator("#count")).toHaveText("Count 1");
  const disposed = await page.evaluate(() => window.runtimeProbe.dispose());
  zero(disposed);
  expect(errors).toEqual([]);
  await save(`independent-${strict}`, { environment, initial, changed, warmup, motion, disposed, errors });
});

for (const dpr of [1, 2]) test(`original Layer actions retain complete GPU composition DPR${dpr}`, async ({ browser }) => {
  const page = await browser.newPage({ deviceScaleFactor: dpr });
  try {
    await ready(page);
    const cdp = await page.context().newCDPSession(page);
    const environment = { browser: await cdp.send("Browser.getVersion"), launch: await cdp.send("Browser.getBrowserCommandLine") };
    await cdp.detach();
    await page.evaluate(() => { window.originalRuntimeRoot = document.querySelector(".app-container"); window.originalRuntimeCount = document.querySelector("#count"); });
    const observations = [];
    for (let index = 0; index < 8; index++) {
      await page.locator("#third").click();
      await page.evaluate(() => window.runtimeProbe.settle());
      const state = await page.evaluate(() => ({ ...window.runtimeProbe.state(),
        original: window.originalRuntimeRoot === document.querySelector(".app-container") && window.originalRuntimeCount === document.querySelector("#count"),
        owner: document.querySelector(".app-container").parentElement.id, hidden: document.querySelector("#output").hidden }));
      expect(state.mode, state.reason).toBe("gpu");
      expect(state.original).toBe(true); expect(state.owner).toBe("output"); expect(state.hidden).toBe(false);
      expect(state.metrics.admission.attempts).toBe(1);
      expect(state.publication.captures).toHaveLength(index % 2 === 0 ? 3 : 2);
      for (const capture of state.publication.captures) {
        expect(capture.pixelWidth).toBeGreaterThanOrEqual(capture.width * dpr);
        expect(capture.pixelHeight).toBeGreaterThanOrEqual(capture.height * dpr);
        expect(capture.textureWidth).toBeGreaterThanOrEqual(capture.pixelWidth);
        expect(capture.textureHeight).toBeGreaterThanOrEqual(capture.pixelHeight);
        expect(capture.capturedSlot).toBe(capture.slot);
      }
      const pixels = await snap(page, `layer-${dpr}-${index}`);
      expect(pixels(45, 340)).toEqual([240, 30, 60, 255]);
      expect(pixels(515, 155)).toEqual([20, 200, 90, 255]);
      if (index % 2 === 0) {
        expect(pixels(495, 255)).toEqual([30, 100, 220, 255]);
        await page.locator("#third-control").click();
      }
      await page.locator("#count").click();
      await expect(page.locator("#count")).toHaveText(`Count ${index + 1}`);
      observations.push(state);
    }
    zero(await page.evaluate(() => window.runtimeProbe.dispose()));
    await save(`layer-${dpr}`, { environment, observations, limitation: "Decoded source screenshots and trusted native actions, not physical display continuity" });
  } finally { await page.close(); }
});

for (const dpr of [1, 2]) test(`canonical geometry, rendered edges, native hits and resize at DPR ${dpr}`, async ({ browser }) => {
  const page = await browser.newPage({ deviceScaleFactor: dpr });
  const observations = [];
  try {
    await ready(page);
    for (const transform of [{ x: 30, y: 5 }, { x: 40, scaleX: 0.8, scaleY: 0.85 }, { x: 90, rotation: 15, scaleX: 0.8, scaleY: 0.8 }]) {
      await page.evaluate(transform => window.runtimeProbe.transform("primary", transform), transform);
      await page.evaluate(() => window.runtimeProbe.settle());
      const geometry = await page.evaluate(() => {
        const state = window.runtimeProbe.state();
        const layer = state.layers.find(layer => layer.id === "primary");
        const element = document.querySelector("#primary");
        const root = document.querySelector("#frame").getBoundingClientRect();
        const matrix = new DOMMatrix(layer.matrix);
        const rect = element.getBoundingClientRect();
        let x = 0, y = 0;
        const button = document.querySelector("#count");
        for (let node = button; node && node !== element; node = node.offsetParent) { x += node.offsetLeft; y += node.offsetTop; }
        const native = state.transforms.find(item => item.id === "primary").matrix;
        const hit = matrix.transformPoint({ x: x + button.offsetWidth / 2, y: y + button.offsetHeight / 2 });
        const edge = matrix.transformPoint({ x: element.offsetWidth / 2, y: element.offsetHeight });
        const normal = { x: -matrix.b / Math.hypot(matrix.a, matrix.b), y: matrix.a / Math.hypot(matrix.a, matrix.b) };
        const inside = { x: edge.x - normal.x, y: edge.y - normal.y };
        const outside = { x: edge.x + normal.x, y: edge.y + normal.y };
        const corners = [[0,0], [element.offsetWidth,0], [0,element.offsetHeight], [element.offsetWidth,element.offsetHeight]]
          .map(([x,y]) => matrix.transformPoint({x,y}));
        const minX = Math.min(...corners.map(p => p.x)), minY = Math.min(...corners.map(p => p.y));
        const expectedRect = { x: minX, y: minY, width: Math.max(...corners.map(p => p.x)) - minX, height: Math.max(...corners.map(p => p.y)) - minY };
        const exteriorHit = matrix.transformPoint({ x: x - 2 / Math.hypot(matrix.a, matrix.b), y: y + button.offsetHeight / 2 });
        return { matrix: layer.matrix, native: [native[0], native[1], native[4], native[5], native[12], native[13]],
          rect: { x: rect.x - root.x, y: rect.y - root.y, width: rect.width, height: rect.height },
          hit: { x: root.x + hit.x, y: root.y + hit.y },
          exteriorHit: { x: root.x + exteriorHit.x, y: root.y + exteriorHit.y },
          expectedRect, edge, inside, outside, count: state.native.count };
      });
      geometry.matrix.forEach((value, index) => expect(Math.abs(value - geometry.native[index])).toBeLessThanOrEqual(1e-5));
      for (const key of ["x", "y", "width", "height"]) expect(Math.abs(geometry.rect[key] - geometry.expectedRect[key])).toBeLessThanOrEqual(1);
      const pixels = await snap(page, `geometry-${dpr}-${observations.length}`);
      expect(pixels(geometry.inside.x, geometry.inside.y)).toEqual([240, 30, 60, 255]);
      expect(pixels(geometry.outside.x, geometry.outside.y)).toEqual([255, 255, 255, 255]);
      await page.mouse.click(geometry.hit.x, geometry.hit.y);
      const value = await page.locator("#count").textContent();
      expect(value).not.toBe(geometry.count);
      await page.mouse.click(geometry.exteriorHit.x, geometry.exteriorHit.y);
      expect(await page.locator("#count").textContent()).toBe(value);
      observations.push({ transform, geometry, count: value });
    }
    await page.setViewportSize({ width: 1000, height: 820 });
    await page.evaluate(() => { document.querySelector("#frame").style.width = "700px"; });
    await page.evaluate(() => window.runtimeProbe.settle());
    const resized = await page.evaluate(() => window.runtimeProbe.state());
    expect(resized.mode, resized.reason).toBe("gpu");
    expect(resized.metrics.admission.attempts).toBe(1);
    for (const capture of resized.publication.captures) {
      expect(capture.pixelWidth).toBe(capture.width * dpr);
      expect(capture.pixelHeight).toBe(capture.height * dpr);
      expect(capture.textureWidth).toBeGreaterThanOrEqual(capture.pixelWidth);
      expect(capture.textureHeight).toBeGreaterThanOrEqual(capture.pixelHeight);
    }
    await page.locator("#count").click({ position: { x: 10, y: 10 } });
    zero(await page.evaluate(() => window.runtimeProbe.dispose()));
    await save(`geometry-${dpr}`, { dpr, observations, resized });
  } finally { await page.close(); }
});

test("native keyboard, labels, selection, form, overlap order and explicit modal overlay", async ({ page }) => {
  await ready(page);
  await page.locator("#name-label").click();
  await expect(page.locator("#controlled")).toBeFocused();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type("typed-native");
  expect((await page.evaluate(() => window.runtimeProbe.state())).mode).toBe("gpu");
  await page.keyboard.press("Enter");
  await expect(page.locator("#saved")).toHaveText("typed-native");
  await page.keyboard.press("Home");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Shift+ArrowRight");
  const selected = await page.evaluate(() => window.runtimeProbe.state());
  expect(selected.mode).toBe("gpu");
  await page.keyboard.press("Tab");
  await expect(page.locator("#submit")).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(page.locator("#controlled")).toBeFocused();
  await page.evaluate(() => {
    window.savedContainer = document.querySelector(".app-container");
    window.savedInput = document.querySelector("#controlled");
  });
  await page.evaluate(() => window.runtimeProbe.disable());
  expect(await page.evaluate(() => window.savedInput === document.querySelector("#controlled"))).toBe(true);
  await page.locator("#uncontrolled").click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type("native-retained");
  await page.evaluate(() => window.runtimeProbe.enable());
  await page.locator("#count").focus();
  await page.keyboard.press("Space");
  await expect(page.locator("#count")).toHaveText("Count 1");
  await page.locator("#dialog-open").click();
  await expect(page.locator("#dialog")).toBeVisible();
  await page.locator("#dialog-input").click();
  await page.keyboard.type("-edited");
  expect(await page.evaluate(() => document.querySelector("#dialog").closest("#overlay") !== null && window.runtimeProbe.state().mode === "gpu")).toBe(true);
  await page.locator("#dialog-close").click();
  await expect(page.locator("#dialog")).not.toBeVisible();
  await page.locator("#popover-open").click();
  await expect(page.locator("#popover")).toBeVisible();
  await page.locator("#popover-input").click();
  await page.keyboard.type("-edited");
  expect(await page.evaluate(() => document.querySelector("#popover").closest("#overlay") !== null && window.runtimeProbe.state().mode === "gpu")).toBe(true);
  await page.locator("#popover-close").click();
  await expect(page.locator("#popover")).not.toBeVisible();
  await page.evaluate(() => window.runtimeProbe.transform("stationary", { x: -120, y: 40 }));
  await page.evaluate(() => window.runtimeProbe.settle());
  await page.locator("#badge").click();
  await expect(page.locator("#badge")).toHaveText("Badge 1");
  const final = await page.evaluate(() => window.runtimeProbe.state());
  expect(final.native.uncontrolled).toBe("native-retained");
  expect(await page.evaluate(() => window.savedContainer === document.querySelector(".app-container"))).toBe(true);
  zero(await page.evaluate(() => window.runtimeProbe.dispose()));
  await save("native-semantics", { selected, final });
});

test("nested enrollment, budgets and zero-sized layers use explicit DOM policy", async ({ page }) => {
  const results = [];
  for (const query of ["nested", "budget", "zero"]) {
    await page.goto(`/runtime.html?${query}`);
    await page.waitForFunction(() => window.runtimeProbe && !window.runtimeProbe.state().initializing);
    const state = await page.evaluate(() => window.runtimeProbe.state());
    expect(state.mode).toBe("dom");
    expect(state.reason).toMatch(/GPU admission failed/);
    expect(state.resources.engines).toBe(0);
    if (query !== "zero") {
      await page.locator("#count").click({ position: { x: 10, y: 10 } });
      await expect(page.locator("#count")).toHaveText("Count 1");
    }
    results.push({ query, state });
    zero(await page.evaluate(() => window.runtimeProbe.dispose()));
  }
  await save("conservative-policies", results);
});

test("opacity composition and repeated emulated DPR changes retain one root", async ({ page }) => {
  await ready(page);
  await page.evaluate(() => {
    window.savedContainer = document.querySelector(".app-container");
    window.runtimeProbe.transform("primary", { opacity: 0.5 });
  });
  await page.evaluate(() => window.runtimeProbe.settle());
  const pixels = await snap(page, "opacity");
  const expected = [248, 143, 158, 255];
  pixels(45, 340).forEach((value, index) => expect(Math.abs(value - expected[index])).toBeLessThanOrEqual(1));
  expect(pixels(515, 155)).toEqual([20, 200, 90, 255]);
  const client = await page.context().newCDPSession(page);
  const changes = [];
  for (const dpr of [2, 3, 1]) {
    await client.send("Emulation.setDeviceMetricsOverride", { width: 900, height: 750, deviceScaleFactor: dpr, mobile: false });
    // CDP can change DPR without delivering resolution/resize events. A normal
    // controller operation must reconcile the current backing grid.
    await page.evaluate(() => window.runtimeProbe.transform("primary", { opacity: 0.5 }));
    await page.evaluate(() => window.runtimeProbe.settle());
    const gpu = await page.evaluate(() => window.runtimeProbe.state());
    expect(gpu.mode, gpu.reason).toBe("gpu");
    expect(gpu.metrics.admission.attempts).toBe(1);
    expect(await page.evaluate(() => document.querySelector("#output").width / document.querySelector("#frame").clientWidth)).toBe(dpr);
    expect(await page.evaluate(() => window.savedContainer === document.querySelector(".app-container"))).toBe(true);
    await page.locator("#count").click();
    changes.push({ dpr, gpu });
  }
  await client.detach();
  const disposed = await page.evaluate(() => window.runtimeProbe.dispose());
  zero(disposed);
  expect(disposed.demoListeners).toBe(0);
  await save("opacity-dpr", { expected, changes, disposed, dprFixture: "CDP device-scale emulation plus normal controller operation; CDP may omit resolution events. Not physical display migration." });
});

test("registration/removal, mutation-in-flight and invalid transforms do not lose content or root", async ({ page }) => {
  await ready(page);
  const raceBefore = await page.evaluate(() => window.runtimeProbe.state());
  await page.evaluate(() => {
    window.savedContainer = document.querySelector(".app-container");
    const original = GPUQueue.prototype.drawElementImageToTexture;
    window.inFlightValues = [];
    GPUQueue.prototype.drawElementImageToTexture = function(source, target) {
      const element = source.source;
      const value = document.querySelector("#uncontrolled").value;
      original.call(this, source, target);
      if (element.id === "primary") {
        window.inFlightValues.push(value);
        if (window.inFlightValues.length === 1) {
          queueMicrotask(() => {
            document.querySelector("#uncontrolled").value = "during-capture";
            document.querySelector("#uncontrolled").dispatchEvent(new Event("input", { bubbles: true }));
          });
        }
      }
    };
    window.restoreInFlightCapture = () => { GPUQueue.prototype.drawElementImageToTexture = original; };
    window.runtimeProbe.invalidate("primary");
  });
  await page.evaluate(() => window.runtimeProbe.settle());
  const inFlight = await page.evaluate(() => window.runtimeProbe.state());
  expect(inFlight.native.uncontrolled).toBe("during-capture");
  expect(inFlight.metrics.perLayer.primary.captures - raceBefore.metrics.perLayer.primary.captures).toBeGreaterThanOrEqual(2);
  const inFlightValues = await page.evaluate(() => window.inFlightValues);
  await page.evaluate(() => window.restoreInFlightCapture());
  expect(inFlightValues[0]).toBe("native");
  expect(inFlightValues).toContain("during-capture");
  const invalidTransforms = [];
  for (const transform of [{ scaleX: 0 }, { scaleX: 1e308, scaleY: 1e308 }, { scaleX: 1e308, scaleY: 1e-308 },
    { scaleX: 1e308, scaleY: 1e-308, x: 1e308, y: 1e308 }]) {
    const result = await page.evaluate(transform => {
      const before = window.runtimeProbe.state().layers.find(layer => layer.id === "primary");
      let error;
      try { window.runtimeProbe.transform("primary", transform); } catch (caught) { error = String(caught); }
      return { transform, error, before, after: window.runtimeProbe.state().layers.find(layer => layer.id === "primary") };
    }, transform);
    expect(result.error).toMatch(/finite invertible/);
    expect(result.after).toEqual(result.before);
    invalidTransforms.push(result);
  }
  expect((await page.evaluate(() => window.runtimeProbe.state())).mode).toBe("gpu");
  await page.locator("#third").click();
  await page.evaluate(() => window.runtimeProbe.settle());
  const enrolled = await page.evaluate(() => window.runtimeProbe.state());
  expect(enrolled.publication.captures).toHaveLength(3);
  await page.locator("#third").click();
  await page.evaluate(() => window.runtimeProbe.settle());
  const removed = await page.evaluate(() => window.runtimeProbe.state());
  expect(removed.publication.captures).toHaveLength(2);
  expect(await page.evaluate(() => window.savedContainer === document.querySelector(".app-container"))).toBe(true);
  zero(await page.evaluate(() => window.runtimeProbe.dispose()));
  const identifierCases = [];
  for (const id of ["__proto__", "constructor"]) {
    await ready(page, `thirdId=${encodeURIComponent(id)}`);
    await page.locator("#third").click();
    await page.evaluate(() => window.runtimeProbe.settle());
    const admitted = JSON.parse(await page.evaluate(() => JSON.stringify(window.runtimeProbe.state())));
    expect(admitted.mode).toBe("gpu");
    expect(admitted.metrics.perLayer[id].captures).toBeGreaterThan(0);
    expect(admitted.metrics.perLayer[id].uploads).toBeGreaterThan(0);
    zero(await page.evaluate(() => window.runtimeProbe.dispose()));
    identifierCases.push({ id, admitted });
  }
  await save("registry-dirty-races", { fixture: "Microtask invalidation after actual synchronous native-paint direct upload", raceBefore, inFlightValues, inFlight, enrolled, removed, identifierCases, invalidTransforms });
});

for (const fault of ["capture-noop", "capture-error", "geometry-noop", "geometry-wrong", "geometry-forged", "content-geometry-noop", "clear-noop"]) {
  test(`functional admission rejects ${fault} and preserves usable original DOM`, async ({ page }) => {
    await page.goto(`${developmentURL}/runtime.html?dom`);
    await page.waitForFunction(() => window.runtimeProbe);
    await page.locator("#controlled").fill("kept");
    await page.locator("#uncontrolled").fill("retained-native");
    const before = await page.evaluate(() => {
      window.savedContainer = document.querySelector(".app-container");
      window.savedInput = document.querySelector("#controlled");
      return window.runtimeProbe.state();
    });
    await page.evaluate(fault => {
      const host = document.querySelector("#output");
      const update = host.updateElementGeometry.bind(host);
      const get = host.getElementTransform.bind(host);
      const clear = host.clearElementGeometry.bind(host);
      const draw = GPUQueue.prototype.drawElementImageToTexture;
      window.restoreAdmission = () => {
        host.updateElementGeometry = update; host.getElementTransform = get;
        host.clearElementGeometry = clear;
        GPUQueue.prototype.drawElementImageToTexture = draw;
      };
      if (fault === "capture-noop") GPUQueue.prototype.drawElementImageToTexture = () => {};
      if (fault === "capture-error") GPUQueue.prototype.drawElementImageToTexture = () => { throw new Error("Injected native capture error"); };
      if (fault === "geometry-noop") host.updateElementGeometry = () => {};
      if (fault === "geometry-wrong") host.updateElementGeometry = element => update(element, { canvasTransform: new DOMMatrix().translate(2, 3) });
      if (fault === "geometry-forged") {
        const requested = new WeakMap();
        host.updateElementGeometry = (element, options) => requested.set(element, new DOMMatrix(options.canvasTransform));
        host.getElementTransform = element => requested.get(element) ?? get(element);
      }
      if (fault === "content-geometry-noop") host.updateElementGeometry = (element, options) => { if (element.id !== "primary") update(element, options); };
      if (fault === "clear-noop") host.clearElementGeometry = () => {};
    }, fault);
    const failed = await page.evaluate(async () => { await window.runtimeProbe.enable(); await window.runtimeProbe.settle(); return window.runtimeProbe.state(); });
    expect(failed.mode).toBe("dom");
    expect(failed.reason).toMatch(/GPU admission failed|Native\/GPU reconciliation failed/);
    expect(failed.reason).toMatch(fault.startsWith("capture-") ? /Functional GPU capture|Injected native capture error/
      : fault === "geometry-forged" ? /interior\/clipped hit testing/ : /geometry did not apply/);
    expect(failed.resources.engines).toBe(0);
    for (const key of ["textures", "effects", "renderers", "stagingCanvases", "snapshots", "probeElements", "probeReadbacks", "scheduledFrames", "paintWaits", "pendingCleanups"]) expect(failed.resources[key]).toBe(0);
    expect(failed.commits.mounts).toBe(before.commits.mounts);
    expect(failed.native.controlled).toBe("kept");
    expect(failed.native.uncontrolled).toBe("retained-native");
    expect(await page.evaluate(() => window.savedContainer === document.querySelector(".app-container")
      && window.savedInput === document.querySelector("#controlled") && document.querySelector("#output").hidden)).toBe(true);
    const pixels = await snap(page, `admission-${fault}-dom`);
    expect(pixels(45, 340)).toEqual([240, 30, 60, 255]);
    await page.locator("#count").click();
    await expect(page.locator("#count")).toHaveText("Count 1");
    await page.locator("#name-label").click();
    await page.keyboard.press("End");
    await page.keyboard.type("-edited");
    await page.keyboard.press("Enter");
    await expect(page.locator("#saved")).toHaveText("kept-edited");
    await page.locator("h1").click();
    await page.evaluate(() => window.restoreAdmission());
    const reentered = await page.evaluate(async () => { await window.runtimeProbe.enable(); return window.runtimeProbe.state(); });
    expect(reentered.mode).toBe("gpu");
    expect(reentered.metrics.admission.passes).toBeGreaterThanOrEqual(1);
    const disposed = await page.evaluate(() => window.runtimeProbe.dispose());
    zero(disposed);
    await save(`admission-${fault}`, { fixture: "Methods exist but native calls are deliberately no-op/wrong-result, not mocked admission results", before, failed, reentered, disposed });
  });
}

test("functional probe admits an actually transparent application layer", async ({ page }) => {
  await ready(page, "transparent");
  const admitted = await page.evaluate(() => window.runtimeProbe.state());
  expect(admitted.layers).toHaveLength(1);
  expect(admitted.metrics.admission.passes).toBe(1);
  expect(admitted.metrics.uploads).toBeGreaterThan(0);
  const pixels = await snap(page, "admission-transparent");
  expect(pixels(45, 340)).toEqual([255, 255, 255, 255]);
  const disposed = await page.evaluate(() => window.runtimeProbe.dispose());
  zero(disposed);
  await save("admission-transparent", { admitted, disposed });
});

test("functional readback timeout retains healthy probe resources until its public request settles", async ({ page }) => {
  await page.goto("/runtime.html?dom");
  await page.waitForFunction(() => window.runtimeProbe);
  await page.evaluate(() => {
    const original = GPUBuffer.prototype.mapAsync;
    const held = new Promise(resolve => { window.releaseAdmissionReadback = resolve; });
    GPUBuffer.prototype.mapAsync = function(...args) {
      window.admissionReadbackStarted = true;
      return original.apply(this, args).then(() => held);
    };
    window.restoreAdmissionReadback = () => { GPUBuffer.prototype.mapAsync = original; };
    window.admissionAttempt = window.runtimeProbe.enable();
  });
  await page.waitForFunction(() => window.admissionReadbackStarted);
  const admitting = await page.evaluate(() => window.runtimeProbe.state());
  expect(admitting.mode).toBe("admitting");
  expect(await page.locator("#output").evaluate(canvas => canvas.hidden)).toBe(false);
  await page.evaluate(() => window.admissionAttempt);
  const retained = await page.evaluate(() => window.runtimeProbe.state());
  expect(retained.mode).toBe("dom");
  expect(retained.reason).toMatch(/timed out/);
  expect(retained.resources.pendingCleanups).toBe(1);
  expect(retained.resources.probeReadbacks).toBe(1);
  expect(retained.resources.engines).toBe(1);
  expect(retained.resources.probeElements).toBe(0);
  expect(retained.resources.scheduledFrames).toBe(0);
  expect(retained.metrics.admission.passes).toBe(0);
  for (const action of ["enable", "dispose"]) expect(await page.evaluate(async action => {
    try { await window.runtimeProbe[action](); } catch (error) { return String(error); }
  }, action)).toMatch(/cleanup pending/i);
  await page.locator("#count").click();
  await expect(page.locator("#count")).toHaveText("Count 1");
  await page.evaluate(() => { window.restoreAdmissionReadback(); window.releaseAdmissionReadback(); });
  await page.waitForFunction(() => window.runtimeProbe.state().resources.pendingCleanups === 0 && window.runtimeProbe.state().resources.probeReadbacks === 0);
  const released = await page.evaluate(() => window.runtimeProbe.state());
  expect(released.resources.engines).toBe(0);
  const reentered = await page.evaluate(() => window.runtimeProbe.enable());
  expect(reentered.mode).toBe("gpu");
  const disposed = await page.evaluate(() => window.runtimeProbe.dispose());
  zero(disposed);
  await save("admission-readback-timeout", { fixture: "Public buffer.mapAsync delivery artificially held after real mapping; healthy queue, not device loss", admitting, retained, released, reentered, disposed });
});

test("real destroyed-device loss during functional readback never reveals unverified output", async ({ page }) => {
  await page.goto("/runtime.html?dom");
  await page.waitForFunction(() => window.runtimeProbe);
  await page.locator("#uncontrolled").fill("admission-loss-retained");
  await page.evaluate(() => {
    window.savedContainer = document.querySelector(".app-container");
    const original = GPUBuffer.prototype.mapAsync;
    GPUBuffer.prototype.mapAsync = function(...args) {
      const pending = original.apply(this, args);
      window.admissionDevice = document.querySelector("#output").getContext("webgpu").getConfiguration().device;
      window.admissionDevice.destroy();
      return pending;
    };
    window.restoreAdmissionReadback = () => { GPUBuffer.prototype.mapAsync = original; };
  });
  await page.evaluate(() => window.runtimeProbe.enable());
  await page.waitForFunction(() => window.runtimeProbe.state().mode === "dom" && !window.runtimeProbe.state().initializing
    && window.runtimeProbe.state().resources.engines === 0 && window.runtimeProbe.state().resources.probeReadbacks === 0);
  const lost = await page.evaluate(async () => {
    const info = await window.admissionDevice.lost;
    return { reason: info.reason, message: info.message, state: window.runtimeProbe.state() };
  });
  expect(lost.reason).toBe("destroyed");
  expect(lost.state.metrics.deviceLosses[0].duringAdmission).toBe(true);
  expect(lost.state.metrics.admission.passes).toBe(0);
  expect(lost.state.resources.probeElements).toBe(0);
  expect(lost.state.native.uncontrolled).toBe("admission-loss-retained");
  expect(await page.evaluate(() => document.querySelector("#output").hidden
    && window.savedContainer === document.querySelector(".app-container"))).toBe(true);
  const pixels = await snap(page, "admission-device-loss-dom");
  expect(pixels(45, 340)).toEqual([240, 30, 60, 255]);
  await page.locator("#count").click();
  await expect(page.locator("#count")).toHaveText("Count 1");
  await page.evaluate(() => window.restoreAdmissionReadback());
  const reentered = await page.evaluate(() => window.runtimeProbe.enable());
  expect(reentered.mode).toBe("gpu");
  const disposed = await page.evaluate(() => window.runtimeProbe.dispose());
  zero(disposed);
  await save("admission-device-loss", { fixture: "Explicit public device.destroy() from diagnostic mapAsync hook; genuine destroyed-device loss during admission, not physical reset", lost, reentered, disposed });
});

test("environment policies, synthetic visibility pause, real destroyed-device loss and 20 StrictMode cycles", async ({ page }) => {
  test.setTimeout(120000);
  await ready(page, "", true);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect.poll(() => page.evaluate(() => window.runtimeProbe.state().environment.reducedMotion)).toBe(true);
  expect(await page.evaluate(async () => {
    try { await window.runtimeProbe.animate({ x: 20 }, 10); } catch (error) { return String(error); }
  })).toMatch(/reduced-motion/);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.evaluate(() => {
    const host = document.querySelector("#output");
    window.restorePaint = () => { host.requestPaint = window.realPaint; };
    window.realPaint = host.requestPaint.bind(host);
    host.requestPaint = () => {};
    window.runtimeProbe.invalidate("primary");
  });
  await page.waitForFunction(() => window.runtimeProbe.state().resources.paintWaits === 1);
  await page.evaluate(() => {
    window.hiddenFixture = true;
    Object.defineProperty(document, "hidden", { configurable: true, get: () => window.hiddenFixture });
    document.dispatchEvent(new Event("visibilitychange"));
    window.motion = window.runtimeProbe.animate({ x: 20 }, 30);
  });
  await page.waitForTimeout(150);
  const paused = await page.evaluate(() => window.runtimeProbe.state());
  expect(paused.resources.paintWaits).toBe(0);
  await page.waitForTimeout(150);
  expect((await page.evaluate(() => window.runtimeProbe.state())).metrics.gpuFrames).toBe(paused.metrics.gpuFrames);
  await page.evaluate(() => { window.restorePaint(); window.hiddenFixture = false; document.dispatchEvent(new Event("visibilitychange")); });
  await page.evaluate(() => window.motion);
  await page.emulateMedia({ forcedColors: "active" });
  await page.waitForFunction(() => window.runtimeProbe.state().mode === "gpu"
    && window.runtimeProbe.state().environment.forcedColors);
  const forced = await page.evaluate(() => window.runtimeProbe.state());
  expect(forced.environment.forcedColors).toBe(true);
  await page.emulateMedia({ forcedColors: "none" });
  await page.evaluate(() => {
    window.motion = window.runtimeProbe.animate({ x: 40 }, 300).catch(error => String(error));
  });
  await page.waitForTimeout(100);
  const loss = await page.evaluate(async () => {
    const device = document.querySelector("#output").getContext("webgpu").getConfiguration().device;
    device.destroy();
    const info = await device.lost;
    return { reason: info.reason, message: info.message };
  });
  await page.waitForFunction(() => window.runtimeProbe.state().mode === "dom" && window.runtimeProbe.state().resources.engines === 0);
  expect(loss.reason).toBe("destroyed");
  expect(await page.evaluate(() => window.motion)).toMatch(/interrupted/);
  await page.locator("#count").click();
  await expect(page.locator("#count")).toHaveText("Count 1");
  const recovered = await page.evaluate(() => window.runtimeProbe.state());
  const cycles = [];
  for (let index = 0; index < 20; index++) {
    cycles.push(await page.evaluate(() => window.runtimeProbe.cycle()));
    zero(cycles[index].retired);
    expect(cycles[index].retired.mode).toBe("disposed");
    expect(cycles[index].retired.demoListeners).toBe(0);
    expect(cycles[index].active.resources.engines).toBe(1);
    expect(cycles[index].active.runtimeResources.enrolledLayers).toBe(2);
    expect(cycles[index].active.demoListeners).toBe(4);
  }
  const disposed = await page.evaluate(() => window.runtimeProbe.dispose());
  zero(disposed);
  expect(disposed.demoListeners).toBe(0);
  for (const cycle of cycles) {
    expect(cycle.active.resources.roots).toBe(1);
    expect(cycle.active.resources.textures).toBe(2);
    expect(cycle.active.runtimeResources.environmentListeners).toBe(cycles[0].active.runtimeResources.environmentListeners);
  }
  zero(await page.evaluate(() => window.runtimeProbe.dispose()));
  await save("environment-loss-cycles", { visibilityFixture: "Synthetic hidden getter/visibilitychange and held public requestPaint; proves cancellation/restored dirty work, not actual background-tab behavior",
    paused, forced, loss, recovered, cycles, disposed });
});

test("typed disposal retains a healthy pending queue and releases only on actual loss", async ({ page }) => {
  await ready(page);
  await page.evaluate(() => {
    window.savedContainer = document.querySelector(".app-container");
    window.testDevice = document.querySelector("#output").getContext("webgpu").getConfiguration().device;
    window.testDevice.queue.onSubmittedWorkDone = () => new Promise(() => {});
  });
  const retained = await page.evaluate(() => window.runtimeProbe.disable());
  expect(retained.resources.pendingCleanups).toBe(1);
  expect(retained.resources.engines).toBe(1);
  expect(retained.metrics.deviceLossCount).toBe(0);
  for (const action of ["enable", "dispose"]) {
    expect(await page.evaluate(async action => {
      try { await window.runtimeProbe[action](); } catch (error) { return String(error); }
    }, action)).toMatch(/cleanup pending/i);
  }
  await page.locator("#uncontrolled").click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type("pending-native");
  const loss = await page.evaluate(async () => {
    window.testDevice.destroy();
    const info = await window.testDevice.lost;
    return { reason: info.reason, message: info.message };
  });
  await page.waitForFunction(() => window.runtimeProbe.state().resources.pendingCleanups === 0);
  expect(loss.reason).toBe("destroyed");
  expect(await page.evaluate(() => window.savedContainer === document.querySelector(".app-container"))).toBe(true);
  const reentered = await page.evaluate(() => window.runtimeProbe.enable());
  expect(reentered.mode).toBe("gpu");
  expect(await page.locator("#uncontrolled").inputValue()).toBe("pending-native");
  const disposed = await page.evaluate(() => window.runtimeProbe.dispose());
  zero(disposed);
  await save("typed-pending-cleanup", { syntheticFault: "Indefinitely pending healthy queue fence; subsequent destroy/lost delivery is genuine", retained, loss, reentered, disposed });
});

test("late admission after serialized disposal releases an abandoned engine", async ({ page }) => {
  await page.addInitScript(() => {
    const original = navigator.gpu.requestAdapter.bind(navigator.gpu);
    navigator.gpu.requestAdapter = async options => {
      const adapter = await original(options);
      await new Promise(resolve => setTimeout(resolve, 5600));
      return adapter;
    };
  });
  await page.goto("/runtime.html");
  await page.waitForFunction(() => window.runtimeProbe?.state().resources.pendingEngines === 1);
  const disposed = await page.evaluate(() => window.runtimeProbe.dispose());
  expect(disposed.mode).toBe("disposed");
  expect(disposed.resources.pendingEngines).toBe(1);
  await page.waitForFunction(() => window.runtimeProbe.state().resources.pendingEngines === 0);
  const late = await page.evaluate(() => window.runtimeProbe.state());
  zero(late);
  expect(await page.evaluate(() => {
    try { window.runtimeProbe.transform("primary", { x: 5 }); } catch (error) { return String(error); }
  })).toMatch(/disposed/);
  await save("typed-late-admission", { syntheticFault: "Public adapter result artificially delayed beyond admission deadline", disposed, late });
});

test("real development HMR disposes the old adapter before creating its replacement", async ({ page }) => {
  const source = "examples/playground/src/demo/runtime-demo.tsx";
  const original = await stat(source);
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await ready(page, "", true);
  await page.evaluate(() => { window.oldHMR = window.runtimeProbe; });
  let restored = false;
  try {
    await utimes(source, original.atime, new Date());
    await page.waitForFunction(() => window.runtimeProbe !== window.oldHMR && window.runtimeProbe.state().mode === "gpu" && !window.runtimeProbe.state().initializing);
    const old = await page.evaluate(() => window.oldHMR.state());
    zero(old);
    expect(old.demoListeners).toBe(0);
    await page.locator("#count").click();
    await expect(page.locator("#count")).toHaveText("Count 1");
    await page.evaluate(() => { window.secondHMR = window.runtimeProbe; });
    await utimes(source, original.atime, original.mtime);
    restored = true;
    await page.waitForFunction(() => window.runtimeProbe !== window.secondHMR && window.runtimeProbe.state().mode === "gpu" && !window.runtimeProbe.state().initializing);
    const second = await page.evaluate(() => window.secondHMR.state());
    zero(second);
    const disposed = await page.evaluate(() => window.runtimeProbe.dispose());
    zero(disposed);
    expect(errors).toEqual([]);
    await save("development-hmr", { fixture: "Real Vite file-watch HMR from timestamp-only touch; original timestamp and unchanged contents restored. HMR starts a new root lifetime, not state-preserving recovery.", old, second, disposed, errors });
  } finally {
    if (!restored) await utimes(source, original.atime, original.mtime);
  }
});

test("layer origin pivots GPU pixels, native hits and DOM presentation identically", async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await ready(page);
  // Stationary: 140x100 at (380,60); rotate 30deg about its centre (450,110).
  const placed = await page.evaluate(() => {
    window.runtimeProbe.origin("stationary", "center");
    window.runtimeProbe.transform("stationary", { rotation: 30 });
    return window.runtimeProbe.state();
  });
  expect(placed.mode).toBe("gpu");
  const layer = placed.layers.find(entry => entry.id === "stationary");
  expect(layer.origin).toBe("center");
  const [a, b, c, d, e, f] = layer.matrix;
  // The pivot stays fixed: matrix * (70,50) == (450,110).
  expect(a * 70 + c * 50 + e).toBeCloseTo(450, 6);
  expect(b * 70 + d * 50 + f).toBeCloseTo(110, 6);
  await page.waitForTimeout(200);
  await page.evaluate(() => window.runtimeProbe.settle());
  // Badge centre in layer-local pixels, mapped through the pivoted matrix.
  const hit = await page.evaluate(([a, b, c, d, e, f]) => {
    const badge = document.querySelector("#badge"), surface = document.querySelector("#stationary");
    const frame = document.querySelector("#frame").getBoundingClientRect();
    const local = { x: badge.offsetLeft - surface.clientLeft + badge.offsetWidth / 2, y: badge.offsetTop - surface.clientTop + badge.offsetHeight / 2 };
    const at = { x: frame.x + a * local.x + c * local.y + e, y: frame.y + b * local.x + d * local.y + f };
    return { ...at, target: document.elementFromPoint(at.x, at.y)?.id };
  }, layer.matrix);
  expect(hit.target).toBe("badge");
  await page.mouse.click(hit.x, hit.y);
  await expect(page.locator("#badge")).toHaveText("Badge 1");
  const corner = { x: a * 130 + c * 90 + e, y: b * 130 + d * 90 + f };
  const outside = { x: a * 70 + c * -6 + e, y: b * 70 + d * -6 + f };
  const gpu = await snap(page, "origin-gpu");
  expect(gpu(450, 110)).toEqual([20, 200, 90, 255]);
  expect(gpu(corner.x, corner.y)).toEqual([20, 200, 90, 255]);
  expect(gpu(outside.x, outside.y)).toEqual([255, 255, 255, 255]);
  await page.evaluate(() => window.runtimeProbe.disable());
  await page.waitForFunction(() => window.runtimeProbe.state().mode === "dom");
  const dom = await snap(page, "origin-dom");
  for (const at of [{ x: 450, y: 110 }, corner, outside]) expect(dom(at.x, at.y)).toEqual(gpu(at.x, at.y));
  const domMatrix = await page.evaluate(() => Array.from(new DOMMatrix(getComputedStyle(document.querySelector("#stationary")).transform).toFloat64Array()));
  [a, b, null, null, c, d, null, null, null, null, null, null, e - 380, f - 60].forEach((value, index) => {
    if (value !== null) expect(domMatrix[index]).toBeCloseTo(value, 3);
  });
  // Ordinary DOM: the origin is a fraction of the layer size, so a resize keeps the centre pivot.
  const resized = await page.evaluate(async () => {
    document.querySelector("#stationary").style.width = "200px";
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const matrix = new DOMMatrix(getComputedStyle(document.querySelector("#stationary")).transform);
    return matrix.transformPoint({ x: 100, y: 50 });
  });
  expect(resized.x).toBeCloseTo(100, 4);
  expect(resized.y).toBeCloseTo(50, 4);
  await expect(page.evaluate(() => window.runtimeProbe.origin("stationary", { x: NaN, y: 0 }))).rejects.toThrow(/Transform origin requires/);
  zero(await page.evaluate(() => window.runtimeProbe.dispose()));
  expect(errors).toEqual([]);
});

test("rotated layer crossing the frame edge stays GPU with canvas-bounded pixels and hits", async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await ready(page);
  const admitted = await page.evaluate(() => window.runtimeProbe.state());
  // Admission proves, with a rotated probe across a visible canvas edge, that hits stop at the content box.
  expect(admitted.metrics.admission.last.frameBounds.result).toBe("bounded");
  expect(admitted.metrics.admission.last.frameBounds.hits).toEqual([true, false]);
  // Stationary (140x100 at 380,60) rotated about its centre, moved so it crosses the right frame edge (640).
  const crossed = await page.evaluate(() => {
    window.runtimeProbe.origin("stationary", "center");
    window.runtimeProbe.transform("stationary", { x: 200, rotation: 25 });
    return window.runtimeProbe.state();
  });
  expect(crossed.mode).toBe("gpu");
  const [a, b, c, d, e, f] = crossed.layers.find(layer => layer.id === "stationary").matrix;
  const corners = [[0, 0], [140, 0], [0, 100], [140, 100]].map(([x, y]) => a * x + c * y + e);
  expect(Math.max(...corners)).toBeGreaterThan(640);
  expect(Math.min(...corners)).toBeLessThan(640);
  await page.waitForTimeout(200);
  await page.evaluate(() => window.runtimeProbe.settle());
  const inside = { x: 630, y: 110 }, beyond = { x: 650, y: 110 };
  const hits = await page.evaluate(([inside, beyond]) => {
    const frame = document.querySelector("#frame").getBoundingClientRect();
    const name = point => {
      const hit = document.elementFromPoint(frame.x + point.x, frame.y + point.y);
      return hit?.closest("#stationary") ? "stationary" : hit?.id || hit?.tagName;
    };
    return [name(inside), name(beyond)];
  }, [inside, beyond]);
  expect(hits).toEqual(["stationary", "BODY"]);
  const pixels = await snap(page, "frame-edge-gpu");
  expect(pixels(inside.x, inside.y)).toEqual([20, 200, 90, 255]);
  const state = await page.evaluate(() => window.runtimeProbe.state());
  expect(state.mode).toBe("gpu");
  zero(await page.evaluate(() => window.runtimeProbe.dispose()));
  expect(errors).toEqual([]);
});
