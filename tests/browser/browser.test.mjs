import { test, expect } from "@playwright/test";
import { PNG } from "pngjs";
import { previewURL } from "../helpers/urls.mjs";

async function openProbe(page) {
  await page.goto("/probe.html");
  await page.waitForFunction(() => window.nativeProbe);
}

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

test("unavailable capture and no-GPU configurations keep initial original DOM usable", async ({ browser }) => {
  const page = await browser.newPage();
  try {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "gpu", { value: undefined, configurable: true });
      Object.defineProperty(HTMLCanvasElement.prototype, "captureElementImage", { value: undefined, configurable: true });
    });
    await page.goto(`${previewURL}/`);
    await expect(page.getByRole("status", { name: "Renderer diagnostics" })).toContainText("captureElementImage");
    await page.getByRole("button", { name: "Increment", exact: true }).click();
    await expect(page.getByTestId("greeting")).toContainText("Counter: 1");
    await page.getByLabel("Name", { exact: true }).click();
    await page.keyboard.press("End");
    await page.keyboard.type("-still-DOM");
    await expect(page.getByLabel("Name", { exact: true })).toHaveValue("CanvasSPA-still-DOM");
  } finally { await page.close(); }
});

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

for (const dpr of [1, 2]) {
  test(`actual native capture, ElementCanvasTransform, pointer and editing at DPR ${dpr}`, async ({ browser }) => {
    const page = await browser.newPage({ deviceScaleFactor: dpr });
    try {
      await page.goto(`${previewURL}/probe.html`);
      await page.waitForFunction(() => window.nativeProbe);
      const captured = await page.evaluate(() => window.nativeProbe.capture());
      expect(captured.layer.sample).toEqual([240, 30, 60, 255]);
      expect(captured.nested.sample).toEqual([20, 200, 90, 255]);
      await page.mouse.click(100, 117);
      await page.keyboard.press("End");
      await page.keyboard.type("-native");
      expect((await page.evaluate(() => window.nativeProbe.state())).value).toBe("original-native");
      for (const kind of ["translate", "scale", "rotate"]) {
        const point = await page.evaluate((kind) => window.nativeProbe.transform(kind), kind);
        expect(point.nativeTransform.e).toBeCloseTo(point.matrix.e, 6);
        expect(point.nativeTransform.b).toBeCloseTo(point.matrix.b, 6);
        const before = await page.evaluate(() => window.nativeProbe.state());
        await page.mouse.click(point.x, point.y);
        expect((await page.evaluate(() => window.nativeProbe.state())).clicks).toBe(before.clicks + 1);
        await page.mouse.click(700, 500);
        expect((await page.evaluate(() => window.nativeProbe.state())).clicks).toBe(before.clicks + 1);
      }
      await expect(page.evaluate(() => window.nativeProbe.transform("bad-geometry"))).rejects.toThrow(/finite invertible/);
      const disposed = await page.evaluate(() => window.nativeProbe.dispose());
      expect(disposed.liveSnapshots).toBe(0);
      expect(disposed.listeners).toBe(0);
      expect(disposed.connected).toBe(false);
      await expect(page.evaluate(() => window.nativeProbe.capture())).rejects.toThrow(/disposed/);
    } finally { await page.close(); }
  });
}

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

test("both public backends render generated pixels serially and release owned resources over 20 cycles", async ({ page }) => {
  await openProbe(page);
  for (let cycle = 0; cycle < 20; cycle++) {
    for (const backend of ["webgpu", "webgl2"]) {
      const started = await page.evaluate((backend) => window.nativeProbe.backend.start(backend, "generated"), backend);
      expect(started.resources.engines).toBe(1);
      expect(started.resources.textures).toBe(2);
      await expect(page.evaluate(() => window.nativeProbe.backend.start("webgl2", "generated"))).rejects.toThrow(/Serial lifetimes/);
      const png = PNG.sync.read(await page.locator("#backend-output").screenshot());
      const offset = (165 * png.width + 55) * 4;
      expect([...png.data.subarray(offset, offset + 4)]).toEqual([240, 30, 60, 255]);
      expect(Object.values(await page.evaluate(() => window.nativeProbe.backend.dispose()))).toEqual([0, 0, 0, 0, 0, 0]);
    }
  }
});

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
