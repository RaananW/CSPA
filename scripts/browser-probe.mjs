import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { PNG } from "pngjs";

const url = process.env.PROBE_URL || "http://127.0.0.1:5174";
const executablePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const args = ["--enable-automation", ...(process.env.NO_NATIVE_FLAGS ? [] : ["--enable-blink-features=CanvasDrawElement,ElementCanvasTransform", "--enable-experimental-web-platform-features"])];
const directory = process.env.EVIDENCE_DIR || "evidence/chrome";
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ executablePath, headless: true, args });
const report = { executablePath, version: browser.version(), headless: true, requestedFlags: args, defaultArgs: chromium.defaultArgs?.(), url, startedAt: new Date().toISOString(), results: [] };
function pixel(png, x, y) { return [...png.data.subarray((y * png.width + x) * 4, (y * png.width + x) * 4 + 4)]; }
function digest(data) { return createHash("sha256").update(data).digest("hex"); }
async function backendImage(page, path) {
  const bytes = await page.locator("#backend-output").screenshot({ path });
  const png = PNG.sync.read(bytes);
  return { path, hash: digest(png.data), red: pixel(png, 15 + 40, 125 + 40), green: pixel(png, 285, 55), background: pixel(png, 350, 200) };
}
try {
  const session = await browser.newBrowserCDPSession();
  report.build = await session.send("Browser.getVersion");
  report.commandLine = (await session.send("Browser.getBrowserCommandLine")).arguments;
  const page = await browser.newPage({ viewport: { width: 900, height: 750 }, deviceScaleFactor: Number(process.env.DPR || 1) });
  page.on("pageerror", (error) => report.results.push({ pageError: error.message }));
  await page.goto(`${url}/probe.html`);
  await page.waitForFunction(() => window.nativeProbe);
  report.capability = await page.evaluate(() => window.nativeProbe.capability);
  if (report.capability.available) {
    try {
      report.capture = await page.evaluate(() => window.nativeProbe.capture());
      await page.screenshot({ path: `${directory}/native-capture.png` });
      report.captureScreenshot = `${directory}/native-capture.png`;
      report.nativeInitialPixelHash = digest(PNG.sync.read(await page.locator("#host").screenshot()).data);
      await page.mouse.click(100, 117);
      await page.keyboard.press("End");
      await page.keyboard.type("-edited");
      report.nativeEditing = await page.evaluate(() => window.nativeProbe.state());
      await page.evaluate(() => window.nativeProbe.capture());
      await page.screenshot({ path: `${directory}/native-editing.png` });
      report.nativeEditedPixelHash = digest(PNG.sync.read(await page.locator("#host").screenshot()).data);
      report.nativeEditingPixelsChanged = report.nativeEditedPixelHash !== report.nativeInitialPixelHash;
      report.offscreenTransfer = await page.evaluate(() => {
        const host = document.querySelector("#host");
        const snapshot = host.captureElementImage(document.querySelector("#layer"));
        try {
          new OffscreenCanvas(200, 140).getContext("2d").drawElementImage(snapshot, 0, 0, { preserveElementGeometry: true });
          return { unexpectedSuccess: true };
        } catch (error) {
          return { error: error.message };
        } finally { snapshot.close(); }
      });
      for (const kind of ["translate", "scale", "rotate"]) {
        const point = await page.evaluate((kind) => window.nativeProbe.transform(kind), kind);
        const before = await page.evaluate(() => window.nativeProbe.state());
        await page.mouse.click(point.x, point.y);
        const after = await page.evaluate(() => window.nativeProbe.state());
        report.results.push({ geometry: kind, point, before, after, nativeClickPassed: after.clicks === before.clicks + 1 });
        await page.screenshot({ path: `${directory}/geometry-${kind}.png` });
      }
    } catch (error) {
      report.results.push({ captureError: error.message });
    }
    report.backends = [];
    if (report.capture) {
      await page.goto(`${url}/probe.html`);
      await page.waitForFunction(() => window.nativeProbe);
      for (const backend of ["webgpu", "webgl2"]) {
        const result = { backend, errors: [] };
        const onError = (message) => { if (message.type() === "error") result.errors.push(message.text()); };
        page.on("console", onError);
        try {
          try {
            result.nativeStart = await page.evaluate((backend) => window.nativeProbe.backend.start(backend), backend);
            await page.evaluate(() => window.nativeProbe.backend.dispose());
          } catch (error) {
            result.nativeInputError = error.message;
            result.nativeInputMetrics = await page.evaluate(() => structuredClone(window.nativeProbe.backend.metrics));
            result.nativeInputCleanup = await page.evaluate(() => window.nativeProbe.backend.dispose());
          }
          result.start = await page.evaluate(async (backend) => {
            if (!window.nativeProbe.backend) throw new Error("Native backend fixture unavailable");
            return window.nativeProbe.backend.start(backend, "generated");
          }, backend);
          result.identity = await backendImage(page, `${directory}/${backend}-identity.png`);
          await page.evaluate(() => window.nativeProbe.backend.update(0));
          result.changed = await backendImage(page, `${directory}/${backend}-changed.png`);
          result.frames = await page.evaluate(() => window.nativeProbe.backend.frames(300));
          result.effect = await backendImage(page, `${directory}/${backend}-effect.png`);
          result.generatedPixelsPassed = result.identity.red.slice(0, 3).every((v, i) => Math.abs(v - [240, 30, 60][i]) <= 2)
            && result.identity.green.slice(0, 3).every((v, i) => Math.abs(v - [20, 200, 90][i]) <= 2)
            && result.changed.hash !== result.identity.hash
            && result.effect.green[1] < result.identity.green[1] - 40
            && result.frames.newCaptures === 0 && result.frames.newUploads === 0
            && result.errors.length === 0;
        } catch (error) {
          result.error = error.message;
          result.generatedPixelsPassed = false;
        } finally {
          result.disposal = await page.evaluate(() => window.nativeProbe.backend?.dispose());
          page.off("console", onError);
          report.backends.push(result);
        }
      }
    }
  }
  for (const kind of ["content-fallback", "remove-content", "display-contents", "display-block", "zero-bitmap", "visibility-hidden-child-visible", "layout-subtree-off", "display-none"]) {
    await page.goto(`${url}/probe.html`);
    await page.waitForFunction(() => window.nativeProbe);
    if (report.capability.available) {
      try { await page.evaluate(() => window.nativeProbe.capture()); } catch (error) { report.results.push({ setupError: error.message, kind }); }
    }
    const before = await page.evaluate(() => {
      const input = document.querySelector("#editing");
      input.focus();
      input.setSelectionRange(2, 5);
      window.originalInput = input;
      return window.nativeProbe.state();
    });
    const transition = await page.evaluate((kind) => window.nativeProbe.fallback(kind), kind);
    const rect = await page.locator("#button").evaluate((element) => element.getBoundingClientRect().toJSON());
    const target = await page.evaluate(({ x, y, width, height }) => document.elementFromPoint(x + width / 2, y + height / 2)?.id, rect);
    await page.mouse.click(rect.x + rect.width / 2, rect.y + rect.height / 2);
    const after = await page.evaluate(() => ({ ...window.nativeProbe.state(), sameInput: window.originalInput === document.querySelector("#editing") }));
    await page.screenshot({ path: `${directory}/fallback-${kind}.png` });
    report.results.push({ fallback: kind, before, transition, target: target || null, after, nativeClickPassed: after.clicks === 1, screenshot: `${directory}/fallback-${kind}.png` });
  }
  report.disposal = await page.evaluate(() => window.nativeProbe.dispose());
  report.verdict = report.results.some((result) => result.fallback && result.nativeClickPassed)
    ? "Candidate needs visual/state validation; not approved for app use"
    : "BLOCKED: no tested usable in-place runtime DOM fallback; real app remains DOM";
} finally {
  await browser.close();
  await writeFile(`${directory}/report.json`, `${JSON.stringify(report, null, 2)}\n`);
}
console.log(JSON.stringify(report, null, 2));
