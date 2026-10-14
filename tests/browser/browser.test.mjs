/**
 * Browser suite for the lowest layers: the app page `/` (original React controls and diagnostics) and the
 * native fixture `probe.html` (`examples/playground/src/probe.ts`, driven through `window.nativeProbe`).
 * It proves that the real HTML-in-Canvas capture, `ElementCanvasTransform` geometry and native pointer and
 * keyboard input work on the installed browser at DPR 1 and 2, that unsupported configurations leave the
 * original DOM usable with a diagnosed reason, and that backend and fixture lifetimes release every resource.
 * Tests use the production preview build and the Canary launch flags from `tests/helpers/browser.mjs`.
 */
import { test, expect } from "@playwright/test";
import { PNG } from "pngjs";
import { previewURL } from "../helpers/urls.mjs";

/** Opens the native fixture page and waits for its `window.nativeProbe` API. */
async function openProbe(page) {
  await page.goto("/probe.html");
  await page.waitForFunction(() => window.nativeProbe);
}

// The app page starts in ordinary DOM mode; clicking each "Diagnose" button shows an alert while the original
// input element and its typed value stay untouched.
test("original React DOM controls, keyboard, submit and diagnostics retain identity/state", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("status", { name: "Renderer diagnostics" })).toContainText("ordinary DOM");
  await page.getByRole("button", { name: "Increment", exact: true }).click();
  await expect(page.getByTestId("greeting")).toContainText("Counter: 1");
  await page.getByLabel("Name", { exact: true }).click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type("Real keyboard");
  await page.keyboard.press("Enter");
  await expect(page.locator("output")).toHaveText("Real keyboard");
  await page.evaluate(() => { window.original = document.querySelector("#name"); });
  for (const reason of ["unavailable capture", "no GPU", "bad geometry", "timeout", "disposal"]) {
    await page.getByRole("button", { name: `Diagnose ${reason}`, exact: true }).click();
    await expect(page.getByRole("alert")).toContainText(`Requested ${reason}`);
    expect(await page.evaluate(() => window.original === document.querySelector("#name"))).toBe(true);
    await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Real keyboard");
  }
});

// Removing `navigator.gpu` and `getElementImageDefaultSize` simulates a browser without WebGPU or a usable
// capture path: the diagnostics must name `getElementImageDefaultSize` and the original controls must stay usable.
test("unavailable capture and no-GPU configurations keep initial original DOM usable", async ({ browser }) => {
  const page = await browser.newPage();
  try {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "gpu", { value: undefined, configurable: true });
      // getElementImageDefaultSize is required by the current capture path (captureElementImage is worker-only).
      Object.defineProperty(HTMLCanvasElement.prototype, "getElementImageDefaultSize", { value: undefined, configurable: true });
    });
    await page.goto(`${previewURL}/`);
    await expect(page.getByRole("status", { name: "Renderer diagnostics" })).toContainText("getElementImageDefaultSize");
    await page.getByRole("button", { name: "Increment", exact: true }).click();
    await expect(page.getByTestId("greeting")).toContainText("Counter: 1");
    await page.getByLabel("Name", { exact: true }).click();
    await page.keyboard.press("End");
    await page.keyboard.type("-still-DOM");
    await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Underglass-still-DOM");
  } finally { await page.close(); }
});

// With `navigator.gpu` removed, starting the WebGPU backend must reject and leave no partially created
// resources behind (all six counters from `dispose()` are zero).
test("real WebGPU initialization failure disposes partial generated-pixel resources", async ({ browser }) => {
  const page = await browser.newPage();
  try {
    await page.addInitScript(() => Object.defineProperty(navigator, "gpu", { value: undefined, configurable: true }));
    await page.goto(`${previewURL}/probe.html`);
    await page.waitForFunction(() => window.nativeProbe);
    await expect(page.evaluate(() => window.nativeProbe.backend.start("webgpu", "generated"))).rejects.toThrow();
    expect(Object.values(await page.evaluate(() => window.nativeProbe.backend.dispose()))).toEqual([0, 0, 0, 0, 0, 0]);
  } finally { await page.close(); }
});

// Real capture at the device pixel ratio: the sampled pixels come from the browser's own element capture, the
// transform kinds check that the transform the browser reports matches the matrix we set, and clicks must land
// on the button only inside its transformed area.
for (const dpr of [1, 2]) {
  test(`actual native capture, ElementCanvasTransform, pointer and editing at DPR ${dpr}`, async ({ browser }) => {
    const page = await browser.newPage({ deviceScaleFactor: dpr });
    try {
      await page.goto(`${previewURL}/probe.html`);
      await page.waitForFunction(() => window.nativeProbe);
      const captured = await page.evaluate(() => window.nativeProbe.capture());
      // Sample colours of the two captured fixture layers.
      expect(captured.layer.sample).toEqual([240, 30, 60, 255]);
      expect(captured.nested.sample).toEqual([20, 200, 90, 255]);
      // A real mouse click and real keystrokes must edit the native input inside the captured element.
      await page.mouse.click(100, 117);
      await page.keyboard.press("End");
      await page.keyboard.type("-native");
      expect((await page.evaluate(() => window.nativeProbe.state())).value).toBe("original-native");
      for (const kind of ["translate", "scale", "rotate"]) {
        const point = await page.evaluate((kind) => window.nativeProbe.transform(kind), kind);
        // The transform reported by `getElementTransform` must equal the matrix we applied (components `e` and `b`).
        expect(point.nativeTransform.e).toBeCloseTo(point.matrix.e, 6);
        expect(point.nativeTransform.b).toBeCloseTo(point.matrix.b, 6);
        const before = await page.evaluate(() => window.nativeProbe.state());
        await page.mouse.click(point.x, point.y);
        expect((await page.evaluate(() => window.nativeProbe.state())).clicks).toBe(before.clicks + 1);
        // A click far outside the transformed layer must not reach the button.
        await page.mouse.click(700, 500);
        expect((await page.evaluate(() => window.nativeProbe.state())).clicks).toBe(before.clicks + 1);
      }
      // A non-invertible matrix (scale 0) must be refused before it reaches the browser.
      await expect(page.evaluate(() => window.nativeProbe.transform("bad-geometry"))).rejects.toThrow(/finite invertible/);
      const disposed = await page.evaluate(() => window.nativeProbe.dispose());
      expect(disposed.liveSnapshots).toBe(0);
      expect(disposed.listeners).toBe(0);
      expect(disposed.connected).toBe(false);
      await expect(page.evaluate(() => window.nativeProbe.capture())).rejects.toThrow(/disposed/);
    } finally { await page.close(); }
  });
}

// A captured element image belongs to the canvas that captured it: drawing it into the backend's staging
// canvas or an OffscreenCanvas must throw a "different canvas" error.
test("current native input is rejected by unrelated HTML and Offscreen staging canvases", async ({ page }) => {
  await openProbe(page);
  await page.evaluate(() => window.nativeProbe.capture());
  await expect(page.evaluate(() => window.nativeProbe.backend.start("webgpu"))).rejects.toThrow(/different canvas/);
  const result = await page.evaluate(() => {
    const host = document.querySelector("#host");
    const image = host.captureElementImage(document.querySelector("#layer"));
    try {
      new OffscreenCanvas(200, 140).getContext("2d").drawElementImage(image, 0, 0, { preserveElementGeometry: true });
      return { unexpectedSuccess: true };
    } catch (error) { return { error: error.message }; }
    finally { image.close(); }
  });
  expect(result.error).toContain("different canvas");
  expect(Object.values(await page.evaluate(() => window.nativeProbe.backend.dispose()))).toEqual([0, 0, 0, 0, 0, 0]);
});

// Each candidate puts the host into a state where it is not a usable drawable canvas. Clearing geometry always
// reports identity transforms, so identity alone proves nothing; the real check is that a native click at the
// button's rectangle must not reach it.
test("runtime DOM fallback gate stays blocked after cleared geometry; identity alone is not a pass", async ({ page }) => {
  for (const kind of ["content-fallback", "remove-content", "display-contents", "display-block", "zero-bitmap", "visibility-hidden-child-visible", "layout-subtree-off", "display-none"]) {
    await openProbe(page);
    await page.evaluate(() => window.nativeProbe.capture());
    const result = await page.evaluate((kind) => window.nativeProbe.fallback(kind), kind);
    expect(result.sameParent).toBe(true);
    expect(result.afterClear.layer.isIdentity).toBe(true);
    expect(result.afterClear.nested.isIdentity).toBe(true);
    const rect = await page.locator("#button").evaluate((element) => element.getBoundingClientRect().toJSON());
    await page.mouse.click(rect.x + rect.width / 2, rect.y + rect.height / 2);
    expect((await page.evaluate(() => window.nativeProbe.state())).clicks).toBe(0);
  }
});

// Serial lifetimes: only one backend may be live at a time, starting a second is rejected, and the generated
// pixel (240, 30, 60) must appear in the canvas screenshot on both WebGPU and WebGL2. Repeated 20 times to
// catch resource leaks.
test("both public backends render generated pixels serially and release owned resources over 20 cycles", async ({ page }) => {
  await openProbe(page);
  for (let cycle = 0; cycle < 20; cycle++) {
    for (const backend of ["webgpu", "webgl2"]) {
      const started = await page.evaluate((backend) => window.nativeProbe.backend.start(backend, "generated"), backend);
      expect(started.resources.engines).toBe(1);
      expect(started.resources.textures).toBe(2);
      await expect(page.evaluate(() => window.nativeProbe.backend.start("webgl2", "generated"))).rejects.toThrow(/Serial lifetimes/);
      const png = PNG.sync.read(await page.locator("#backend-output").screenshot());
      // Pixel at (55, 165) in the screenshot.
      const offset = (165 * png.width + 55) * 4;
      expect([...png.data.subarray(offset, offset + 4)]).toEqual([240, 30, 60, 255]);
      expect(Object.values(await page.evaluate(() => window.nativeProbe.backend.dispose()))).toEqual([0, 0, 0, 0, 0, 0]);
    }
  }
});

// Repeats open/capture/dispose to prove each lifetime closes its snapshots and removes its listeners.
test("20 native fixture lifetimes close snapshots and remove owned listeners", async ({ page }) => {
  for (let index = 0; index < 20; index++) {
    await openProbe(page);
    await page.evaluate(() => window.nativeProbe.capture());
    const disposed = await page.evaluate(() => window.nativeProbe.dispose());
    expect(disposed.liveSnapshots).toBe(0);
    expect(disposed.listeners).toBe(0);
    expect(disposed.connected).toBe(false);
  }
});
