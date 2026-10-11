import { test, expect } from "./current-browser.mjs";
import { mkdir, writeFile } from "node:fs/promises";
import { evidenceDirectory } from "./evidence.mjs";
import { PNG } from "pngjs";
const directory = evidenceDirectory("viewport");
for (const dpr of [1, 2]) test(`bounded root and enrolled NativeScroll retain GPU clip DPR${dpr}`, async ({ browser }) => {
  const page = await browser.newPage({ deviceScaleFactor: dpr });
  try {
    await page.goto("/runtime.html?strict");
    await page.waitForFunction(() => window.runtimeProbe && !window.runtimeProbe.state().initializing);
    expect(await page.evaluate(() => window.runtimeProbe.state().mode)).toBe("gpu");
    await page.locator("#controlled").fill("fresh independent native");
    await page.evaluate(() => { window.originalInput = document.querySelector("#controlled"); });
    await page.locator("#scroll-toggle").click();
    await page.evaluate(() => window.runtimeProbe.settle());
    expect(await page.evaluate(() => window.runtimeProbe.state().mode)).toBe("gpu");
    await page.evaluate(() => {
      window.originalInput.focus(); window.originalInput.setSelectionRange(5, 10);
      document.querySelector("#primary").scrollTop = document.querySelector("#primary").scrollHeight;
    });
    await page.evaluate(() => window.runtimeProbe.settle());
    expect(await page.evaluate(() => ({
      original: window.originalInput === document.querySelector("#controlled"), focused: document.activeElement === window.originalInput,
      value: window.originalInput.value, selection: [window.originalInput.selectionStart, window.originalInput.selectionEnd],
    }))).toEqual({ original: true, focused: true, value: "fresh independent native", selection: [5, 10] });
    const beforeWheel = await page.evaluate(() => window.runtimeProbe.state());
    await page.locator("#scroller").hover(); await page.mouse.wheel(0, 220);
    await expect.poll(() => page.locator("#scroller").evaluate(node => node.scrollTop)).toBeGreaterThan(100);
    await page.evaluate(() => window.runtimeProbe.settle());
    expect(await page.evaluate(() => window.runtimeProbe.state().mode)).toBe("gpu");
    const wheelState = await page.evaluate(() => window.runtimeProbe.state());
    expect(wheelState.metrics.uploads).toBeGreaterThan(beforeWheel.metrics.uploads);
    const nativePoint = await page.locator("#scroll-tail").evaluate(node => {
      const r = node.getBoundingClientRect(), output = document.querySelector("#output").getBoundingClientRect();
      return { x: r.x - output.x + r.width * 0.75, y: r.y - output.y + r.height * 0.75 };
    });
    const tailBytes = await page.locator("#output").screenshot(), tailImage = PNG.sync.read(tailBytes);
    await mkdir(directory, { recursive: true });
    await writeFile(`${directory}/native-tail-${dpr}.json`, JSON.stringify({ nativePoint, width: tailImage.width, height: tailImage.height }));
    const tailOffset = (Math.floor(nativePoint.y * dpr) * tailImage.width + Math.floor(nativePoint.x * dpr)) * 4;
    expect([...tailImage.data.subarray(tailOffset, tailOffset + 4)]).toEqual([20, 200, 90, 255]);
    await writeFile(`${directory}/native-tail-${dpr}.png`, tailBytes);
    await page.locator("#scroll-tail").click();
    await expect(page.locator("#scroll-tail")).toHaveText("Scroll count 1");
    await page.locator("#scroller").evaluate(node => { node.tabIndex = 0; node.focus(); });
    await page.keyboard.press("Home");
    await expect.poll(() => page.locator("#scroller").evaluate(node => node.scrollTop)).toBe(0);
    await page.keyboard.press("End");
    await expect.poll(() => page.locator("#scroller").evaluate(node => node.scrollTop)).toBeGreaterThan(0);
    await page.evaluate(() => window.runtimeProbe.settle());
    const result = await page.evaluate(async () => {
      const root = document.querySelector(".app-container");
      root.style.width = "250px"; root.style.overflow = "auto";
      root.tabIndex = 0;
      await window.runtimeProbe.settle();
      root.scrollLeft = 80;
      await window.runtimeProbe.settle();
      const badge = document.querySelector("#badge"), r = badge.getBoundingClientRect();
      return { state: window.runtimeProbe.state(), rootLeft: root.scrollLeft,
        clippedHit: document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) === badge };
    });

    expect(result.rootLeft).toBeGreaterThan(0);
    expect(result.state.mode).toBe("gpu");
    expect(result.clippedHit).toBe(false);
    const outputBox = await page.locator("#output").boundingBox();
    await page.mouse.move(outputBox.x + 100, outputBox.y + 100); await page.mouse.wheel(40, 0);
    await expect.poll(() => page.locator(".app-container").evaluate(node => node.scrollLeft)).toBeGreaterThan(80);
    await page.locator(".app-container").evaluate(node => node.focus());
    const beforeRootKey = await page.locator(".app-container").evaluate(node => node.scrollLeft);
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => page.locator(".app-container").evaluate(node => node.scrollLeft)).toBeGreaterThan(beforeRootKey);
    await page.evaluate(async () => { document.querySelector(".app-container").scrollLeft = 80; await window.runtimeProbe.settle(); });
    await mkdir(directory, { recursive: true });
    const bytes = await page.locator("#output").screenshot(), image = PNG.sync.read(bytes);
    const offset = (Math.floor(70 * dpr) * image.width + Math.floor(390 * dpr)) * 4;
    expect([...image.data.subarray(offset, offset + 4)]).toEqual([255, 255, 255, 255]);
    await writeFile(`${directory}/root-${dpr}.png`, bytes);
    await page.evaluate(async () => {
      document.querySelector(".app-container").scrollLeft = 250;
      await window.runtimeProbe.settle();
    });
    await page.locator("#badge").click(); await expect(page.locator("#badge")).toHaveText("Badge 1");
    await page.evaluate(() => { document.querySelector(".app-container").scrollLeft = 80; });
    await page.keyboard.press("Tab"); await page.waitForTimeout(120);
    await page.evaluate(() => window.runtimeProbe.settle());
    const motion = await page.evaluate(() => window.runtimeProbe.animate({ x: 5 }, 30));
    expect(motion.after.mode).toBe("gpu");
    expect(motion.after.commits.count).toBe(motion.before.commits.count);
    for (const key of ["captures", "uploads", "pixelReadbacks"]) expect(motion.after.metrics[key]).toBe(motion.before.metrics[key]);
    const motionBytes = await page.locator("#output").screenshot(), motionImage = PNG.sync.read(motionBytes);
    const outsideOffset = (Math.floor(70 * dpr) * motionImage.width + Math.floor(260 * dpr)) * 4;
    expect([...motionImage.data.subarray(outsideOffset, outsideOffset + 4)]).toEqual([255, 255, 255, 255]);
    await writeFile(`${directory}/motion-clip-${dpr}.png`, motionBytes);
    const cleared = await page.evaluate(async () => {
      const root = document.querySelector(".app-container");
      root.style.width = "100%"; root.style.overflow = "visible"; root.scrollLeft = 0;
      const primary = document.querySelector("#primary"); primary.scrollTop = 0;
      await window.runtimeProbe.settle();
      return window.runtimeProbe.state();
    });
    expect(cleared.mode).toBe("gpu");
    await page.locator("#scroll-toggle").click();
    await page.evaluate(() => window.runtimeProbe.settle());
    expect(await page.evaluate(() => window.runtimeProbe.state().mode)).toBe("gpu");
    await page.locator("#badge").click(); await expect(page.locator("#badge")).toHaveText("Badge 2");
    await writeFile(`${directory}/root-${dpr}.json`, JSON.stringify({ beforeWheel, wheelState, result, motion, cleared }, null, 2));
    await page.evaluate(() => window.runtimeProbe.dispose());
  } finally { await page.close(); }
});

for (const dpr of [1, 2]) test(`scrolled viewport preserves original ref membership and DPR preparation DPR${dpr}`, async ({ browser }) => {
  const page = await browser.newPage({ deviceScaleFactor: dpr });
  try {
    await page.goto("/integration.html?strict");
    await page.waitForFunction(() => window.integrationProbe && !window.integrationProbe.state().initializing);
    await page.evaluate(async () => {
      const root = document.querySelector(".app-container");
      root.style.height = "250px"; root.style.overflow = "auto"; root.scrollTop = 50;
      await window.integrationProbe.settle();
      window.retiredRef = document.querySelector("#replacement");
    });
    await page.locator("#replace").click();
    await expect(page.locator("#replacement")).toHaveText("Original ref 1");
    await page.evaluate(() => window.integrationProbe.settle());
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: 900, height: 700,
      deviceScaleFactor: dpr === 1 ? 2 : 1, mobile: false });
    await page.evaluate(() => { window.dispatchEvent(new Event("resize")); });
    await page.evaluate(() => window.integrationProbe.settle());
    const result = await page.evaluate(() => ({
      state: window.integrationProbe.state(), retired: !window.retiredRef.isConnected,
      root: { top: document.querySelector(".app-container").scrollTop },
    }));
    expect(result.state.mode).toBe("gpu");
    expect(result.root.top).toBeGreaterThan(0);
    expect(result.retired).toBe(true);
    expect(result.state.metrics.admission.attempts).toBe(1);
    for (const capture of result.state.publication.captures) expect(capture.capturedSlot).toBe(capture.slot);
    await page.locator("#replacement").click();
    await mkdir(directory, { recursive: true });
    await writeFile(`${directory}/ref-${dpr}.json`, JSON.stringify(result, null, 2));
    await writeFile(`${directory}/ref-${dpr}.png`, await page.locator("#output").screenshot());
    await cdp.detach();
    const retired = await page.evaluate(() => window.integrationProbe.dispose());
    expect(Object.values(retired.resources).every(value => value === 0)).toBe(true);
  } finally { await page.close(); }
});

test("functional canvasClip ignored by native geometry is diagnosed before GPU admission", async ({ page }) => {
  await page.goto("/runtime.html?dom");
  await page.waitForFunction(() => window.runtimeProbe);
  await page.evaluate(() => {
    const output = document.querySelector("#output");
    const update = output.updateElementGeometry.bind(output);
    output.updateElementGeometry = (element, options) => update(element, { canvasTransform: options?.canvasTransform,
      preserveHitTestOrder: options?.preserveHitTestOrder });
  });

  const state = await page.evaluate(() => window.runtimeProbe.enable());
  expect(state.mode).toBe("dom");
  expect(state.reason).toMatch(/clip/);
  await page.evaluate(() => window.runtimeProbe.dispose());
});

test("typed axis-aligned clipping admits without structural DOM policy", async ({ page }) => {
  for (const query of ["clip", "childclip"]) {
    await page.goto(`/runtime.html?${query}`);
    await page.waitForFunction(() => window.runtimeProbe && !window.runtimeProbe.state().initializing);
    expect(await page.evaluate(() => window.runtimeProbe.state().mode)).toBe("gpu");
    await page.locator("#count").click();
    await expect(page.locator("#count")).toHaveText("Count 1");
    expect(await page.evaluate(() => window.runtimeProbe.state().mode)).toBe("gpu");
    await page.evaluate(() => window.runtimeProbe.dispose());
  }
});

for (const dpr of [1, 2]) for (const fault of [false, true]) test(`offscreen clipping stays unproven until visible admission DPR${dpr} noop=${fault}`, async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 900, height: 750 }, deviceScaleFactor: dpr });
  try {
    await page.goto("/runtime.html?dom");
    await page.waitForFunction(() => window.runtimeProbe);
    await page.locator("#controlled").fill("kept");
    await page.evaluate(fault => {
      document.activeElement?.blur();
      const output = document.querySelector("#output"), update = output.updateElementGeometry.bind(output);
      window.savedOffscreenInput = document.querySelector("#controlled");
      window.restoreOffscreenClip = () => { output.updateElementGeometry = update; };
      if (fault) output.updateElementGeometry = (element, options) => update(element, {
        canvasTransform: options?.canvasTransform, preserveHitTestOrder: options?.preserveHitTestOrder,
      });
      document.querySelector("#frame").style.left = "1100px";
      window.scrollTo(0, 0);
    }, fault);
    const deferred = await page.evaluate(() => window.runtimeProbe.enable());
    expect(deferred.mode).toBe("dom");
    expect(deferred.reason).toMatch(/clipping is unproven.*deferred/);
    for (const key of ["engines", "textures", "effects", "renderers", "probeElements", "probeReadbacks", "paintWaits", "pendingCleanups"]) expect(deferred.resources[key]).toBe(0);
    await page.setViewportSize({ width: 2000, height: 750 });
    const visible = await page.evaluate(async () => {
      const root = document.querySelector(".app-container");
      root.style.width = "250px"; root.style.overflow = "auto"; root.scrollLeft = 80;
      await window.runtimeProbe.settle();
      return window.runtimeProbe.state();
    });
    expect(visible.mode).toBe("dom");
    expect(await page.evaluate(() => window.savedOffscreenInput === document.querySelector("#controlled")
      && window.savedOffscreenInput.value === "kept" && document.querySelector("#output").hidden)).toBe(true);
    const attempt = await page.evaluate(() => window.runtimeProbe.enable());
    if (fault) {
      expect(attempt.mode).toBe("dom");
      expect(attempt.reason).toMatch(/interior\/clipped hit testing/);
      expect(attempt.resources.engines).toBe(0);
      await page.evaluate(() => window.restoreOffscreenClip());
    } else {
      expect(attempt.mode).toBe("gpu");
      await page.evaluate(() => window.runtimeProbe.disable());
    }
    const qualified = await page.evaluate(async () => { await window.runtimeProbe.enable(); await window.runtimeProbe.settle(); return window.runtimeProbe.state(); });
    expect(qualified.mode).toBe("gpu");
    expect(qualified.metrics.admission.last.geometry.hitCheck).not.toMatch(/Skipped/);
    const exclusion = await page.locator("#badge").evaluate(badge => {
      const r = badge.getBoundingClientRect(), output = document.querySelector("#output").getBoundingClientRect();
      const x = r.x + r.width / 2, y = r.y + r.height / 2;
      window.offscreenClicks = [];
      document.addEventListener("click", event => window.offscreenClicks.push({ trusted: event.isTrusted, target: event.target.id }));
      return { x, y, localX: x - output.x, localY: y - output.y,
        hit: document.elementFromPoint(x, y)?.id };
    });
    expect(exclusion.hit).toBe("output");
    const bytes = await page.locator("#output").screenshot(), image = PNG.sync.read(bytes);
    const offset = (Math.floor(exclusion.localY * dpr) * image.width + Math.floor(exclusion.localX * dpr)) * 4;
    expect([...image.data.subarray(offset, offset + 4)]).toEqual([255, 255, 255, 255]);
    await page.mouse.click(exclusion.x, exclusion.y);
    expect(await page.evaluate(() => window.offscreenClicks)).toEqual([{ trusted: true, target: "output" }]);
    // A previously qualified renderer is not revoked by ordinary offscreen movement.
    await page.setViewportSize({ width: 900, height: 750 });
    expect(await page.evaluate(() => window.runtimeProbe.state().mode)).toBe("gpu");
    await page.setViewportSize({ width: 2000, height: 750 });
    await page.evaluate(() => window.runtimeProbe.settle());
    await page.locator(".app-container").evaluate(root => { root.style.width = "100%"; root.style.overflow = "visible"; root.scrollLeft = 0; });
    await page.evaluate(() => window.runtimeProbe.settle());
    await page.locator("#count").click();
    await expect(page.locator("#count")).toHaveText("Count 1");
    await mkdir(directory, { recursive: true });
    await writeFile(`${directory}/offscreen-${dpr}-${fault}.json`, JSON.stringify({ deferred, visible, attempt, qualified, exclusion }, null, 2));
    await writeFile(`${directory}/offscreen-${dpr}-${fault}.png`, bytes);
    const disposed = await page.evaluate(() => window.runtimeProbe.dispose());
    expect(Object.values(disposed.resources).every(value => value === 0)).toBe(true);
  } finally { await page.close(); }
});

test("occluded initial native clipping witness refuses useful DOM and allows unobstructed reentry", async ({ page }) => {
  await page.goto("/runtime.html?dom");
  await page.waitForFunction(() => window.runtimeProbe);
  await page.evaluate(() => {
    const blocker = document.createElement("div");
    blocker.id = "admission-occluder";
    blocker.style.cssText = "position:fixed;inset:0;background:white;z-index:9999";
    document.body.append(blocker);
  });
  const refused = await page.evaluate(() => window.runtimeProbe.enable());
  expect(refused.mode).toBe("dom");
  expect(refused.reason).toMatch(/interior\/clipped hit testing.*occluded/);
  expect(refused.resources.engines).toBe(0);
  await page.locator("#admission-occluder").evaluate(node => node.remove());
  await page.locator("#count").click();
  await expect(page.locator("#count")).toHaveText("Count 1");
  expect((await page.evaluate(() => window.runtimeProbe.enable())).mode).toBe("gpu");
  const disposed = await page.evaluate(() => window.runtimeProbe.dispose());
  expect(Object.values(disposed.resources).every(value => value === 0)).toBe(true);
});

for (const dpr of [1, 2]) test(`scrolled root additions retain complete current native slots DPR${dpr}`, async ({ browser }) => {
  const page = await browser.newPage({ deviceScaleFactor: dpr });
  try {
    await page.goto("/runtime.html?strict");
    await page.waitForFunction(() => window.runtimeProbe && !window.runtimeProbe.state().initializing);
    await page.evaluate(async () => {
      const root = document.querySelector(".app-container");
      root.style.width = "460px"; root.style.overflow = "auto"; root.scrollLeft = 60;
      await window.runtimeProbe.settle();
    });
    const generations = [];
    for (let addition = 0; addition < 2; addition++) {
      await page.locator("#third").click();
      await page.evaluate(() => window.runtimeProbe.settle());
      const state = await page.evaluate(() => window.runtimeProbe.state());
      expect(state.mode).toBe("gpu");
      expect(state.publication.pending).toBe(false);
      expect(state.publication.captures).toHaveLength(3);
      const fresh = state.publication.captures.find(item => item.id === "third-layer");
      expect(fresh.capturedSlot).toBe(fresh.slot);
      if (addition) expect(fresh.slot).not.toBe(generations[0].fresh.slot);
      const left = await page.locator(".app-container").evaluate(node => node.scrollLeft);
      expect(left).toBeGreaterThan(0);
      const bytes = await page.locator("#output").screenshot(), image = PNG.sync.read(bytes);
      const offset = (Math.floor(245 * dpr) * image.width + Math.floor((495 - left) * dpr)) * 4;
      expect([...image.data.subarray(offset, offset + 4)]).toEqual([30, 100, 220, 255]);
      await page.locator("#third-control").click();
      generations.push({ state, fresh, left });
      await page.locator("#third").click();
      await page.evaluate(() => window.runtimeProbe.settle());
      expect(await page.evaluate(() => window.runtimeProbe.state().mode)).toBe("gpu");
    }
    await mkdir(directory, { recursive: true });
    await writeFile(`${directory}/scrolled-add-${dpr}.json`, JSON.stringify(generations, null, 2));
    await page.evaluate(() => window.runtimeProbe.dispose());
  } finally { await page.close(); }
});
