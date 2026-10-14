/**
 * Engineering probe of the installed Chrome's HTML-in-Canvas support, run against the playground's
 * `probe.html` page (`window.nativeProbe`). It captures an element, edits a native input, checks that native
 * clicks still land after translate, scale and rotate transforms, renders generated pixels through the
 * WebGPU and WebGL2 backends, and tries a list of DOM-fallback transitions to see whether the original
 * controls stay usable.
 *
 * Invoked as `npm run probe` against a running preview server. Environment: `PROBE_URL` (default: the preview
 * URL from `tests/helpers/urls.mjs`), `NO_NATIVE_FLAGS` (launch without the HTML-in-Canvas flags),
 * `DPR` (device scale factor, default 1), `EVIDENCE_DIR` (output directory, which must be an allowed
 * evidence root; default `<evidence root>/chrome`).
 *
 * Output: `report.json` plus PNG screenshots in the evidence directory, and the same report on stdout. The
 * process exits 0 even when a probe step fails; failures are recorded in the report (`captureError`,
 * `nativeClickPassed`, `generatedPixelsPassed`, `verdict`).
 */
import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { PNG } from "pngjs";
import { evidenceDirectory, validateEvidenceRoot } from "../tests/helpers/evidence.mjs";
import { browserLaunchOptions } from "../tests/helpers/browser.mjs";
import { previewURL } from "../tests/helpers/urls.mjs";

const url = process.env.PROBE_URL || previewURL;
// Headless launch; the HTML-in-Canvas flags are enabled unless NO_NATIVE_FLAGS is set.
const launchOptions = browserLaunchOptions({ native: !process.env.NO_NATIVE_FLAGS, headless: true });
const executablePath = launchOptions.executablePath ?? launchOptions.channel;
const args = launchOptions.args;
const directory = validateEvidenceRoot(process.env.EVIDENCE_DIR || evidenceDirectory("chrome"));
await mkdir(directory, { recursive: true });
const browser = await chromium.launch(launchOptions);
// The report starts with the exact browser, flags and URL so a result can be tied to the build tested.
const report = { executablePath, version: browser.version(), headless: true, requestedFlags: args, defaultArgs: chromium.defaultArgs?.(), url, startedAt: new Date().toISOString(), results: [] };
// RGBA of the pixel at (x, y) in a decoded PNG.
function pixel(png, x, y) { return [...png.data.subarray((y * png.width + x) * 4, (y * png.width + x) * 4 + 4)]; }
// SHA-256 of raw bytes, used to tell whether two screenshots differ.
function digest(data) { return createHash("sha256").update(data).digest("hex"); }
// Screenshots the backend fixture's output canvas and samples fixed points: the red and green marker
// squares and the background. The coordinates are specific to the layout of the backend fixture in `probe.html`.
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
  // `capability.available` reports whether the page found the capture API. The capture, editing, geometry and
  // backend steps run only when it is true; the fallback transitions at the end run regardless.
  report.capability = await page.evaluate(() => window.nativeProbe.capability);
  if (report.capability.available) {
    try {
      // First capture of the element tree into a snapshot, then a screenshot as the baseline.
      report.capture = await page.evaluate(() => window.nativeProbe.capture());
      await page.screenshot({ path: `${directory}/native-capture.png` });
      report.captureScreenshot = `${directory}/native-capture.png`;
      report.nativeInitialPixelHash = digest(PNG.sync.read(await page.locator("#host").screenshot()).data);
      // Type into the native input through real pointer and keyboard events, then recapture. The host's
      // pixels must change, proving edits in the original control reach the captured image.
      await page.mouse.click(100, 117);
      await page.keyboard.press("End");
      await page.keyboard.type("-edited");
      report.nativeEditing = await page.evaluate(() => window.nativeProbe.state());
      await page.evaluate(() => window.nativeProbe.capture());
      await page.screenshot({ path: `${directory}/native-editing.png` });
      report.nativeEditedPixelHash = digest(PNG.sync.read(await page.locator("#host").screenshot()).data);
      report.nativeEditingPixelsChanged = report.nativeEditedPixelHash !== report.nativeInitialPixelHash;
      // A captured snapshot must not be drawable from an OffscreenCanvas; the expected result is an error.
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
      // For each transform, ask the page where its button now is and click that screen point. The native click
      // must register exactly once, which shows hit-testing follows the transformed geometry.
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
    // The generated-pixels check runs per backend (WebGPU, then WebGL2) on a freshly loaded page.
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
          // Pass criteria: marker colours within +/-2 per channel of the expected values, the update changed the
          // image, the effect darkened the green marker, no new captures or uploads while only frames ran, and no
          // console errors.
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
  // Each fallback transition is applied to a fresh page. Afterwards the button's centre is clicked natively
  // and the input's identity and selection are compared with the state before, to see whether the original
  // controls survive the transition.
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
  // A summary label only: it says whether any tested fallback kept the original controls clickable.
  report.verdict = report.results.some((result) => result.fallback && result.nativeClickPassed)
    ? "Candidate needs visual/state validation; not approved for app use"
    : "BLOCKED: no tested usable in-place runtime DOM fallback; real app remains DOM";
} finally {
  await browser.close();
  // Always written, even if a step threw, so a partial run still leaves a report.
  await writeFile(`${directory}/report.json`, `${JSON.stringify(report, null, 2)}\n`);
}
console.log(JSON.stringify(report, null, 2));
