import { test, expect } from "../helpers/current-browser.mjs";
import { mkdir, writeFile, stat, utimes } from "node:fs/promises";
import { PNG } from "pngjs";
import { createHash } from "node:crypto";
import { developmentURL } from "../helpers/urls.mjs";
import { evidenceDirectory } from "../helpers/evidence.mjs";
// One blended effect pass per enrolled layer (panel, art) plus the background clear pass.
const EFFECT_PASSES = 3;

const directory = evidenceDirectory("effects");
async function save(name, value) {
  await mkdir(directory, { recursive: true });
  await writeFile(`${directory}/${name}.json`, JSON.stringify(value, null, 2));
}
async function ready(page, strict = false, dom = false) {
  await page.goto(`${strict ? developmentURL : ""}/effects.html?${strict ? "strict&" : ""}${dom ? "dom" : ""}`);
  await page.waitForFunction(() => window.effectsProbe && !window.effectsProbe.state().initializing);
  if (!dom) await page.waitForFunction(() => window.effectsProbe.state().mode === "gpu");
  await page.waitForTimeout(300);
  await page.evaluate(async () => { window.effectsProbe.handle().cancel(); await window.effectsProbe.controller().settle(); });
}
async function pixels(page, name) {
  await page.evaluate(() => window.effectsProbe.controller().settle());
  await mkdir(directory, { recursive: true });
  return PNG.sync.read(await page.locator("#frame").screenshot({ path: `${directory}/${name}.png` }));
}
function region(png, x, y, width, height) {
  const result = [];
  for (let row = y; row < y + height; row++) result.push(...png.data.subarray((row * png.width + x) * 4, (row * png.width + x + width) * 4));
  return Buffer.from(result);
}
function changed(a, b) { return a.reduce((sum, value, index) => sum + (value !== b[index] ? 1 : 0), 0); }
function hash(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function zero(state) {
  expect(Object.values(state.resources).every(value => value === 0)).toBe(true);
  expect(Object.values(state.runtimeResources).every(value => value === 0)).toBe(true);
  expect(state.demoListeners).toBe(0);
}

for (const strict of [false, true]) test(`decoded effect identity, time, alpha, order, bounds and original native app strict=${strict}`, async ({ page }) => {
  await ready(page, strict);
  const neutral = await pixels(page, `neutral-${strict}`);
  const essential = region(neutral, 24, 30, 260, 330);
  const art = region(neutral, 330, 50, 240, 260);
  const results = [];
  for (const kind of ["ripple", "chromatic", "dissolve", "custom"]) {
    await page.evaluate(kind => {
      const descriptor = window.effectsProbe.descriptor(kind);
      for (const key of Object.keys(descriptor.parameters)) descriptor.parameters[key] = 0;
      window.effectsProbe.apply([descriptor]);
    }, kind);
    expect(changed((await pixels(page, `${kind}-identity-${strict}`)).data, neutral.data)).toBe(0);
    const images = [];
    for (const seconds of [.2, .9]) {
      await page.evaluate(({ kind, seconds }) => window.effectsProbe.apply([window.effectsProbe.descriptor(kind, seconds)]), { kind, seconds });
      const png = await pixels(page, `${kind}-${seconds}-${strict}`);
      expect(region(png, 24, 30, 260, 330)).toEqual(essential);
      expect(region(png, 320, 40, 10, 280).every(value => value === 255)).toBe(true);
      const bytes = region(png, 330, 50, 240, 260);
      expect(changed(bytes, art)).toBeGreaterThan(500);
      images.push(bytes);
    }
    expect(changed(images[0], images[1])).toBeGreaterThan(500);
    results.push({ kind, hashes: images.map(hash), distinctBytes: changed(images[0], images[1]), essentialSha256: hash(essential) });
  }
  await page.evaluate(() => {
    const value = window.effectsProbe.descriptor("dissolve"); value.parameters.amount = 1;
    window.effectsProbe.apply([value]);
  });
  expect(region(await pixels(page, `transparent-${strict}`), 330, 50, 240, 260).every(value => value === 255)).toBe(true);
  const orders = [];
  for (const kinds of [["ripple", "chromatic", "dissolve"], ["chromatic", "ripple", "dissolve"]]) {
    await page.evaluate(kinds => window.effectsProbe.apply(kinds.map(kind => window.effectsProbe.descriptor(kind, .7))), kinds);
    orders.push(region(await pixels(page, `order-${kinds[0]}-${strict}`), 330, 50, 240, 260));
  }
  expect(changed(orders[0], orders[1])).toBeGreaterThan(100);
  const colorOrders = [];
  for (const kinds of [["custom", "dissolve"], ["dissolve", "custom"]]) {
    await page.evaluate(kinds => window.effectsProbe.apply(kinds.map(kind => window.effectsProbe.descriptor(kind, .7))), kinds);
    colorOrders.push(region(await pixels(page, `color-order-${kinds[0]}-${strict}`), 330, 50, 240, 260));
  }
  expect(changed(colorOrders[0], colorOrders[1])).toBeGreaterThan(100);
  await page.locator("#title").click();
  await page.keyboard.press("ControlOrMeta+a"); await page.keyboard.type("Native changed poster"); await page.keyboard.press("Enter");
  await expect(page.locator("#saved")).toHaveText("Native changed poster");
  await page.locator("#dialog-open").click(); await expect(page.locator("#dialog-input")).toBeFocused();
  await page.keyboard.type(" original"); await page.keyboard.press("Escape"); await expect(page.locator("#dialog-open")).toBeFocused();
  await page.locator("h1").click();
  const changedPixels = await pixels(page, `content-${strict}`);
  expect(changed(region(changedPixels, 330, 220, 240, 60), region(neutral, 330, 220, 240, 60))).toBeGreaterThan(50);
  const state = await page.evaluate(() => window.effectsProbe.state());
  expect(state.reactVersion).toBe(process.env.CANVAS_EXPECT_REACT_VERSION ?? "19.3.0");
  expect(state.resources.engines).toBe(1); expect(state.resources.effects).toBe(EFFECT_PASSES);
  expect(state.metrics.admission.last.nativePixels).toEqual([]);
  expect(state.metrics.admission.last.gpuPixels).toHaveLength(2);
  const compileSamples = await page.evaluate(() => window.effectsProbe.samples().filter(sample => sample.kind === "effectCompileMs"));
  expect(compileSamples).toHaveLength(1);
  const disposed = await page.evaluate(() => window.effectsProbe.dispose()); zero(disposed);
  await save(`pixels-${strict}`, { results, orderHashes: orders.map(hash), orderDistinctBytes: changed(...orders),
    colorOrderHashes: colorOrders.map(hash), colorOrderDistinctBytes: changed(...colorOrders), compileSamples, state, disposed });
});

for (const strict of [false, true]) test(`300 real GPU frames, incremental non-equivalent work and content update strict=${strict}`, async ({ page }) => {
  test.setTimeout(120000);
  await ready(page, strict);
  const intervals = [];
  for (const kind of ["neutral", "ripple", "chromatic", "dissolve", "custom"]) {
    await page.evaluate(kind => {
      window.effectsProbe.handle().cancel();
      if (kind !== "neutral") window.effectsProbe.apply([window.effectsProbe.descriptor(kind)]);
    }, kind);
    await page.waitForTimeout(300);
    const interval = await page.evaluate(async () => {
      const probe = window.effectsProbe;
      await probe.controller().settle(); probe.clearSamples();
      const commitsBefore = probe.state().commits.count;
      const interval = await probe.controller().advance(300);
      return { ...interval, commitsBefore, commitsAfter: probe.state().commits.count, samples: probe.samples() };
    });
    for (const key of ["captures", "pixelCopies", "pixelReadbacks", "uploads"]) expect(interval.after.metrics[key]).toBe(interval.before.metrics[key]);
    expect(interval.commitsAfter).toBe(interval.commitsBefore);
    expect(interval.after.metrics.gpuFrames - interval.before.metrics.gpuFrames).toBe(300);
    expect(interval.after.metrics.admission).toEqual(interval.before.metrics.admission);
    expect(interval.after.metrics.effectShaderCompilations).toBe(interval.before.metrics.effectShaderCompilations);
    expect(interval.after.resources.effects).toBe(EFFECT_PASSES);
    intervals.push({ kind, ...interval });
  }
  const motion = await page.evaluate(async () => {
    const probe = window.effectsProbe;
    probe.apply([probe.descriptor("ripple", 0, true), probe.descriptor("custom", 0, true)]);
    const transition = probe.controller().transition("art", { keyframes: [{ offset: 0 }, { offset: 1, x: 15 }], timing: { duration: 60000 } });
    await new Promise(resolve => setTimeout(resolve, 300)); await probe.controller().settle();
    const before = probe.state();
    for (let i = 0; i < 300; i++) await new Promise(resolve => requestAnimationFrame(resolve));
    const after = probe.state(); transition.cancel(); probe.handle().pause();
    return { before, after, result: await transition.finished };
  });
  for (const key of ["captures", "pixelCopies", "pixelReadbacks", "uploads"]) expect(motion.after.metrics[key]).toBe(motion.before.metrics[key]);
  expect(motion.after.commits.count).toBe(motion.before.commits.count);
  expect(motion.after.metrics.gpuFrames - motion.before.metrics.gpuFrames).toBeGreaterThanOrEqual(300);
  expect(motion.after.metrics.admission).toEqual(motion.before.metrics.admission);
  const before = await pixels(page, `before-update-${strict}`);
  await page.evaluate(() => window.effectsProbe.update("Changed captured content"));
  await page.waitForTimeout(200);
  const after = await pixels(page, `after-update-${strict}`);
  expect(changed(before.data, after.data)).toBeGreaterThan(50);
  const disposed = await page.evaluate(() => window.effectsProbe.dispose()); zero(disposed);
  await save(`independence-${strict}`, { claim: "Added non-equivalent effect work, not a DOM speedup; public CPU frame samples, GPU timestamps unavailable",
    intervals, motion, contentChangedBytes: changed(before.data, after.data), disposed });
});

test("whole-chain atomic refusal, immutable descriptors and precise stale-handle replacement", async ({ page }) => {
  await ready(page);
  const result = await page.evaluate(async () => {
    const probe = window.effectsProbe;
    const first = probe.apply([probe.descriptor("ripple", .5)]);
    const before = probe.state();
    const failures = [];
    const bad = probe.descriptor("dissolve"); bad.parameters.amount = 2;
    for (const operation of [
      () => probe.apply([probe.descriptor("chromatic"), bad]),
      () => probe.apply([probe.descriptor("dissolve"), probe.descriptor("ripple")]),
      () => probe.controller().setEffects("panel", [probe.descriptor("ripple")]),
      () => probe.apply([{ ...probe.descriptor("custom"), definition: { ...probe.descriptor("custom").definition } }]),
      () => first.seek(Infinity),
    ]) { try { operation(); } catch (error) { failures.push(String(error)); } }
    const refused = probe.state();
    const descriptor = probe.descriptor("chromatic", .7);
    const next = probe.apply([descriptor]); descriptor.parameters.displacement = 100;
    first.cancel(); first.dispose();
    const current = next.state(); current.effects[0].parameters.displacement = 99;
    next.seek(.9); next.play(); next.pause();
    let stale; try { first.play(); } catch (error) { stale = String(error); }
    next.cancel(); next.dispose();
    return { before, refused, failures, first: await first.finished, next: await next.finished, immutable: current, nextState: next.state(), stale };
  });
  expect(result.failures).toHaveLength(5);
  expect(result.refused.decorativeEffects).toEqual(result.before.decorativeEffects);
  expect(result.refused.runtimeResources).toEqual(result.before.runtimeResources);
  expect(result.first.status).toBe("replaced"); expect(result.next.status).toBe("cancelled");
  expect(result.nextState.effects[0].parameters.displacement).toBe(8);
  expect(result.stale).toContain("no longer active");
  zero(await page.evaluate(() => window.effectsProbe.dispose()));
  await save("atomic-handles", result);
});

test("reduced motion identity, synthetic visibility pause and forced-color GPU ownership", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await ready(page);
  const neutral = await pixels(page, "media-neutral");
  const initial = await page.evaluate(() => window.effectsProbe.state());
  expect(initial.metrics.effectShaderCompilations).toBe(1);
  const reduced = await page.evaluate(() => {
    const probe = window.effectsProbe; const handle = probe.apply([probe.descriptor("dissolve", .7, true)]);
    let error; try { handle.play(); } catch (value) { error = String(value); }
    return { state: handle.state(), error };
  });
  expect(reduced.state.effects[0].time.playing).toBe(false);
  expect(reduced.error).toContain("reduced motion");
  expect(changed((await pixels(page, "reduced-identity")).data, neutral.data)).toBe(0);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.evaluate(() => window.effectsProbe.apply([window.effectsProbe.descriptor("custom", .7)]));
  expect(changed((await pixels(page, "media-custom-resumed")).data, neutral.data)).toBeGreaterThan(500);
  expect((await page.evaluate(() => window.effectsProbe.state())).metrics.effectShaderCompilations).toBe(1);
  await page.evaluate(() => {
    window.effectsProbe.handle().play();
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  const hiddenBefore = await page.evaluate(() => window.effectsProbe.state());
  await page.waitForTimeout(200);
  const hiddenAfter = await page.evaluate(() => window.effectsProbe.state());
  expect(hiddenAfter.decorativeEffects).toEqual(hiddenBefore.decorativeEffects);
  expect(hiddenAfter.metrics.gpuFrames).toBe(hiddenBefore.metrics.gpuFrames);
  await page.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event("visibilitychange")); });
  await page.emulateMedia({ forcedColors: "active" });
  await page.evaluate(() => window.effectsProbe.controller().settle());
  const result = await page.evaluate(() => ({ mode: window.effectsProbe.state().mode, handle: window.effectsProbe.handle().state() }));
  expect(result.mode).toBe("gpu");
  await page.locator("#title").fill("Usable DOM"); await page.locator("#save").click(); await expect(page.locator("#saved")).toHaveText("Usable DOM");
  const disposed = await page.evaluate(() => window.effectsProbe.dispose()); zero(disposed);
  await save("media", { initial, reduced, fixture: "Synthetic hidden getter/event, not real background throttling", hiddenBefore, hiddenAfter, result, disposed });
});

test("trusted custom compiler failure has hidden output, usable original DOM and safe reentry", async ({ page }) => {
  await ready(page);
  const result = await page.evaluate(async () => {
    window.originalTitle = document.querySelector("#title");
    const failed = await window.effectsProbe.compile("return definitely_invalid_wgsl;");
    return { failed, handle: await window.effectsProbe.handle().finished, original: window.originalTitle === document.querySelector("#title"), hidden: document.querySelector("#output").hidden };
  });
  expect(result.failed.mode).toBe("dom"); expect(result.failed.reason).toContain("compilation failed");
  expect(result.original && result.hidden).toBe(true); expect(result.handle.status).toBe("fallback");
  expect(result.failed.resources.engines).toBe(0); expect(result.failed.resources.effects).toBe(0);
  await page.locator("#title").fill("After compiler failure"); await page.locator("#save").click(); await expect(page.locator("#saved")).toHaveText("After compiler failure");
  const passed = await page.evaluate(() => window.effectsProbe.compile("return color;"));
  expect(passed.mode).toBe("gpu");
  const disposed = await page.evaluate(() => window.effectsProbe.dispose()); zero(disposed);
  await save("compiler-failure", { ...result, passed, disposed });
});

test("unsupported capability and public pipeline validation failure preserve usable DOM and retire handles", async ({ page }) => {
  await ready(page);
  const capability = await page.evaluate(async () => {
    const probe = window.effectsProbe;
    await probe.controller().disable();
    const handle = probe.apply([probe.descriptor("ripple", .5)]);
    const before = probe.state();
    Object.defineProperty(navigator, "gpu", { configurable: true, value: undefined });
    let error;
    try { probe.apply([probe.descriptor("custom")]); } catch (value) { error = String(value); }
    delete navigator.gpu;
    return { before, after: probe.state(), active: handle.state().active, error };
  });
  expect(capability.error).toContain("requires WebGPU");
  expect(capability.active).toBe(true);
  expect(capability.after.decorativeEffects).toEqual(capability.before.decorativeEffects);
  const pipeline = await page.evaluate(async () => {
    const probe = window.effectsProbe;
    probe.apply([probe.descriptor("custom")]);
    const original = GPUDevice.prototype.popErrorScope;
    let calls = 0;
    GPUDevice.prototype.popErrorScope = async function () {
      const result = await original.call(this);
      return ++calls === 2 ? new GPUValidationError("Synthetic first application pipeline validation failure") : result;
    };
    try {
      const state = await probe.controller().enable();
      return { state, result: await probe.handle().finished, hidden: document.querySelector("#output").hidden };
    } finally { GPUDevice.prototype.popErrorScope = original; }
  });
  expect(pipeline.state.mode).toBe("dom"); expect(pipeline.hidden).toBe(true);
  expect(pipeline.state.reason).toContain("pipeline validation failure");
  expect(pipeline.result.status).toBe("fallback");
  expect(pipeline.state.resources.engines).toBe(0);
  await page.locator("#title").fill("After pipeline failure");
  await page.locator("#save").click(); await expect(page.locator("#saved")).toHaveText("After pipeline failure");
  const lateGeometry = await page.evaluate(async () => {
    const probe = window.effectsProbe;
    probe.apply([probe.descriptor("custom")]);
    const original = GPUDevice.prototype.popErrorScope;
    let calls = 0;
    GPUDevice.prototype.popErrorScope = async function () {
      const result = await original.call(this);
      if (++calls === 2) document.querySelector("#art").style.width = "200px";
      return result;
    };
    try {
      const state = await probe.controller().enable();
      return { state, result: probe.handle().state(), hidden: document.querySelector("#output").hidden };
    } finally {
      GPUDevice.prototype.popErrorScope = original;
      document.querySelector("#art").style.removeProperty("width");
    }
  });
  expect(lateGeometry.state.mode).toBe("dom"); expect(lateGeometry.hidden).toBe(true);
  expect(lateGeometry.state.reason).toContain("Content extends beyond enrolled capture bounds");
  expect(lateGeometry.result.active).toBe(false);
  await page.evaluate(() => window.effectsProbe.compile("return color;"));
  const retirement = await page.evaluate(async () => {
    const handle = window.effectsProbe.handle();
    const disposed = await window.effectsProbe.dispose();
    return { disposed, result: await handle.finished };
  });
  expect(retirement.result.status).toBe("disposed"); zero(retirement.disposed);
  await save("capability-pipeline", { fixture: "Synthetic missing navigator capability, public error-scope failure and late geometry mutation; genuine WGSL failure tested separately", capability, pipeline, lateGeometry, retirement });
});

test("effects retire through public device loss, twenty StrictMode lifetimes and real HMR", async ({ page }) => {
  test.setTimeout(120000);
  await ready(page, true);
  const loss = await page.evaluate(async () => {
    window.effectsProbe.apply([window.effectsProbe.descriptor("custom", .4, true)]);
    window.originalTitle = document.querySelector("#title");
    document.querySelector("#output").getContext("webgpu").getConfiguration().device.destroy();
    await new Promise(resolve => setTimeout(resolve, 400));
    return { state: window.effectsProbe.state(), result: await window.effectsProbe.handle().finished, original: window.originalTitle === document.querySelector("#title") };
  });

  expect(loss.state.mode).toBe("dom"); expect(loss.result.status).toBe("fallback"); expect(loss.original).toBe(true);
  const cycles = [];
  for (let i = 0; i < 20; i++) {
    const cycle = await page.evaluate(() => window.effectsProbe.cycle()); zero(cycle.retired);
    expect(cycle.active.resources.effects).toBe(EFFECT_PASSES); expect(cycle.active.runtimeResources.decorativeEffects).toBe(1); cycles.push(cycle);
  }
  const old = await page.evaluate(() => { window.oldEffectsProbe = window.effectsProbe; return window.effectsProbe.state(); });
  const path = "examples/playground/src/demo/effects-demo.tsx";
  const before = await stat(path);
  try {
    await utimes(path, new Date(), new Date());
    await page.waitForFunction(() => window.oldEffectsProbe !== window.effectsProbe);
    await page.waitForFunction(() => window.effectsProbe.state().mode === "gpu");
    zero(await page.evaluate(() => window.oldEffectsProbe.state()));
  } finally { await utimes(path, before.atime, before.mtime); }
  const disposed = await page.evaluate(() => window.effectsProbe.dispose()); zero(disposed);
  await save("loss-hmr-retirement", { fixture: "Public configured-device destruction, not physical reset", loss, cycles, old, disposed });
});

test("custom effects preserve a healthy pending fence until real completion without device destruction", async ({ page }) => {
  await ready(page);
  await page.evaluate(() => {
    const probe = window.effectsProbe; probe.apply([probe.descriptor("custom", .8, true)]);
    window.device = document.querySelector("#output").getContext("webgpu").getConfiguration().device;
    const original = window.device.queue.onSubmittedWorkDone.bind(window.device.queue);
    window.releaseFence = undefined;
    window.device.queue.onSubmittedWorkDone = () => new Promise(resolve => { window.releaseFence = () => { window.device.queue.onSubmittedWorkDone = original; original().then(resolve); }; });
  });
  const retained = await page.evaluate(() => window.effectsProbe.controller().disable());
  expect(retained.resources.pendingCleanups).toBe(1); expect(retained.resources.engines).toBe(1); expect(retained.metrics.deviceLossCount).toBe(0);
  expect((await page.evaluate(() => window.effectsProbe.handle().finished)).status).toBe("fallback");
  const failures = await page.evaluate(async () => {
    const errors = [];
    for (const operation of [() => window.effectsProbe.apply([window.effectsProbe.descriptor("ripple")]), () => window.effectsProbe.dispose()]) {
      try { await operation(); } catch (error) { errors.push(String(error)); }
    }
    return errors;
  });
  expect(failures).toHaveLength(2);
  await page.locator("#title").fill("Healthy retained DOM");
  await page.evaluate(() => window.releaseFence());
  await page.waitForFunction(() => window.effectsProbe.state().resources.pendingCleanups === 0);
  const released = await page.evaluate(() => window.effectsProbe.state());
  expect(released.resources.engines).toBe(0); expect(released.metrics.deviceLossCount).toBe(0);
  const disposed = await page.evaluate(() => window.effectsProbe.dispose()); zero(disposed);
  await save("healthy-fence", { fixture: "Synthetic delayed public fence; released by genuine queue completion, no destroy", retained, failures, released, disposed });
});

test("a new custom definition compiles while GPU keeps presenting", async ({ page }) => {
  await ready(page);
  const box = await page.evaluate(() => {
    const frame = document.querySelector("#frame").getBoundingClientRect(), art = document.querySelector("#art").getBoundingClientRect();
    return { x: Math.round(art.x - frame.x + art.width * 0.3), y: Math.round(art.y - frame.y + art.height * 0.3), width: 40, height: 20 };
  });
  const before = await pixels(page, "live-custom-before");
  const admitted = await page.evaluate(() => window.effectsProbe.state());
  // Invert colours: an obvious per-pixel change no CSS filter chain is needed to verify.
  const applied = await page.evaluate(async () => {
    window.effectsProbe.live("return vec4f(vec3f(1.0) - color.rgb, color.a);");
    const controller = window.effectsProbe.controller();
    for (let i = 0; i < 60 && (controller.state().publication.pending || controller.state().metrics.effectShaderCompilations === 0); i++) await new Promise(r => requestAnimationFrame(r));
    await controller.settle();
    return window.effectsProbe.state();
  });
  expect(applied.mode, applied.reason).toBe("gpu");
  expect(applied.metrics.admission.passes).toBe(admitted.metrics.admission.passes);
  expect(applied.metrics.effectShaderCompilations).toBe(admitted.metrics.effectShaderCompilations + 1);
  const after = await pixels(page, "live-custom-after");
  expect(changed(region(before, box.x, box.y, box.width, box.height), region(after, box.x, box.y, box.width, box.height))).toBeGreaterThan(1000);
  await page.locator("#title").fill("Live effect"); await page.locator("#save").click();
  await expect(page.locator("#saved")).toHaveText("Live effect");
  // An invalid live definition is still a diagnosed GPU failure with usable original DOM.
  const failed = await page.evaluate(async () => {
    window.effectsProbe.live("return definitely_invalid_wgsl;");
    await page_wait();
    async function page_wait() { for (let i = 0; i < 120 && window.effectsProbe.state().mode === "gpu"; i++) await new Promise(r => setTimeout(r, 25)); }
    return window.effectsProbe.state();
  });
  expect(failed.mode).toBe("dom");
  expect(failed.reason).toMatch(/compilation failed/);
  const disposed = await page.evaluate(() => window.effectsProbe.dispose()); zero(disposed);
  await save("live-custom", { admitted: admitted.metrics.admission, applied: applied.metrics.effectShaderCompilations, failed: failed.reason });
});
