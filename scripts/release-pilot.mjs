/**
 * Browser pilot for the todo app served by a release validation preview: starts in DOM, optionally enables
 * GPU, edits through real native input, checks the owning canvas pixels and native title glyphs, then
 * proves `disable()` keeps the original DOM and selection and that `dispose()` leaves no resources.
 *
 * Spawned by `release-validation.mjs` once per React peer, source/package mode and DPR. It can also be run
 * by hand: `node scripts/release-pilot.mjs <url> <react-version> <native|dom> <1|2> <executable> <evidence-dir>`
 * (the executable argument is accepted but not used; the browser comes from `browserLaunchOptions`). The evidence
 * directory must be new: JSON snapshots are written there with the `wx` flag, and PNGs for the `native`
 * lane. Prints the result as one JSON line and exits 1 on any failure.
 */
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { PNG } from "pngjs";
import { writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { browserLaunchOptions } from "../tests/helpers/browser.mjs";
import { assertRuntimePeer, assertRequestedLane, assertBrowserIdentity, qualifiedBrowser } from "./release-policy.mjs";

/**
 * Runs the pilot for one lane (`native` expects GPU admission, `dom` expects the app to stay on DOM) and
 * returns the result record. `version` is the expected React peer and `dpr` the device scale factor.
 * Snapshots are numbered files in `evidence`; throws after recording a `failed` snapshot on any failure.
 */
export async function releasePilot({ url, version, lane, dpr, executable, evidence }) {
  const started = performance.now();
  const result = { lane, dpr, expectedReact: version, snapshots: [], status: "running" };
  result.expectedBrowser = qualifiedBrowser;
  let sequence = 0;
  // Writes the current result as the next numbered snapshot. `wx` makes an existing file an error, so a
  // reused evidence directory cannot be silently overwritten.
  const record = async label => writeFile(join(evidence, `${sequence++}-${label}.json`), JSON.stringify(result, null, 2), { flag: "wx" });
  let browser;
  try {
    browser = await chromium.launch(browserLaunchOptions({ native: lane === "native" ? true : "none" }));
    const context = await browser.newContext({ viewport: { width: 900, height: 950 }, deviceScaleFactor: dpr });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    result.browser = await cdp.send("Browser.getVersion");
    result.argv = await cdp.send("Browser.getBrowserCommandLine");
    await record("actual-browser");
    assertBrowserIdentity(result.browser);
    const errors = [];
    page.on("pageerror", error => errors.push(String(error)));
    await page.goto(url);
    await page.waitForFunction(() => window.packageTask && document.getElementById("new-task"));
    // The app's own state report (mode, resources, counters), read through its test hook `window.packageTask`.
    const state = () => page.evaluate(() => window.packageTask.state());
    const snapshot = async label => { result.snapshots.push({ label, elapsedMs: performance.now() - started, state: await state() }); await record(label); };
    result.runtime = await page.evaluate(() => ({ react: window.packageTask.state().version, reactDOM: window.packageTask.state().reactDOMVersion }));
    await record("actual-runtime-before-assert");
    assertRuntimePeer(result.runtime, version);
    await page.evaluate(() => {
      // Remember the original input and root, and record every trusted click, input and key event with the
      // mode it arrived in, so the end of the run can prove native events reached the originals.
      window.releaseOriginal = { input: document.getElementById("new-task"), root: window.packageTask.controller.container };
      window.releaseEvents = [];
      for (const type of ["click", "input", "keydown"]) document.addEventListener(type, event => {
        window.releaseEvents.push({ type, trusted: event.isTrusted, id: event.target.id, mode: window.packageTask.state().mode });
      }, true);
    });
    await snapshot("default-dom");
    assertRequestedLane("dom", await state());
    if (lane === "native") {
      await page.getByRole("button", { name: "Enable GPU", exact: true }).click();
      await page.waitForFunction(() => !window.packageTask.state().initializing);
    }

    assertRequestedLane(lane, await state());
    if (lane === "native") {
      // The admission record must show the geometry probe's two interior points hit natively and its clipped
      // point did not, and that two GPU pixel samples were taken.
      result.admission = (await state()).metrics.admission.last;
      assert.deepEqual(result.admission.geometry.hits, [true, true, false]);
      assert.equal(result.admission.gpuPixels.length, 2);
      await record("functional-native-admission");
    }
    await page.getByLabel("Open task 1", { exact: true }).click();
    await page.waitForFunction(() => document.activeElement?.id === "detail-title");
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.type(`Release React${version} DPR${dpr}`);
    await page.getByLabel("Task notes", { exact: true }).click();
    await page.keyboard.type("Original native release pilot notes");
    await page.getByRole("button", { name: "Save task", exact: true }).click();
    assert.match(await page.locator("#task-message").innerText(), /Saved/);
    await page.waitForTimeout(250);
    await page.evaluate(() => window.packageTask.controller.settle());
    assertRequestedLane(lane, await state());
    if (lane === "native") {
      // Sample one pixel of the owning canvas at (720, 440) in the 760px-wide layout (scaled to the screenshot).
      // That point lies inside the task detail panel, whose background is rgb(224,244,232).
      const png = PNG.sync.read(await page.locator("#output").screenshot({ path: join(evidence, "owning-output.png") }));
      const scale = png.width / 760;
      const offset = (Math.floor(440 * scale) * png.width + Math.floor(720 * scale)) * 4;
      result.owningPixel = [...png.data.subarray(offset, offset + 4)];
      assert.deepEqual(result.owningPixel, [224, 244, 232, 255]);
      // Type a wide title (W repeated) and a narrow one (I repeated) into the native title input, crop the owning
      // canvas to the input's box and count differing and dark pixels. Both must come from the same geometry,
      // differ substantially and show wider ink for the W title, which a stale or cached image would not.
      const glyphs = [];
      for (const letter of ["W", "I"]) {
        const title = letter.repeat(24);
        const hit = await page.locator("#detail-title").evaluate(node => {
          const box = node.getBoundingClientRect();
          const x = box.x + box.width / 2, y = box.y + box.height / 2;
          return { x, y, id: document.elementFromPoint(x, y)?.id };
        });
        assert.equal(hit.id, "detail-title", "Current native title geometry must hit the original control");
        await page.mouse.click(hit.x, hit.y);
        await page.keyboard.press("ControlOrMeta+a");
        await page.keyboard.type(title);
        await page.getByRole("button", { name: "Save task", exact: true }).click();
        await page.getByRole("button", { name: "Back to list", exact: true }).click();
        await page.getByLabel("Open task 1", { exact: true }).click();
        await page.waitForFunction(() => document.activeElement?.id === "detail-title");
        assert.equal(await page.locator("#detail-title").inputValue(), title);
        await page.getByLabel("Task notes", { exact: true }).click();
        await page.waitForTimeout(250);
        await page.evaluate(() => window.packageTask.controller.settle());
        assertRequestedLane("native", await state());
        const bounds = await page.locator("#detail-title").evaluate(node => {
          const box = node.getBoundingClientRect(), output = document.getElementById("output").getBoundingClientRect();
          return { x: box.x - output.x, y: box.y - output.y, width: box.width, height: box.height,
            outputWidth: output.width, outputHeight: output.height };
        });
        const image = PNG.sync.read(await page.locator("#output").screenshot({ path: join(evidence, `title-${letter}.png`) }));
        const sx = image.width / bounds.outputWidth, sy = image.height / bounds.outputHeight;
        const pixels = [], crop = {
          left: Math.ceil((bounds.x + 4) * sx), top: Math.ceil((bounds.y + 4) * sy),
          right: Math.floor((bounds.x + bounds.width - 4) * sx), bottom: Math.floor((bounds.y + bounds.height - 4) * sy),
        };
        assert.ok(crop.left >= 0 && crop.top >= 0 && crop.right <= image.width && crop.bottom <= image.height
          && crop.right > crop.left && crop.bottom > crop.top, "Current title crop must be contained in owning output");
        let dark = 0;
        for (let y = crop.top; y < crop.bottom; y++) for (let x = crop.left; x < crop.right; x++) {
          const index = (y * image.width + x) * 4;
          const rgba = [...image.data.subarray(index, index + 4)];
          pixels.push(rgba);
          if (rgba[3] === 255 && rgba.slice(0, 3).every(value => value < 100)) dark++;
        }
        glyphs.push({ letter, title, hit, bounds, crop, dark, pixels });
      }
      assert.deepEqual(glyphs[0].crop, glyphs[1].crop, "Matched title glyph crops must use identical current geometry");
      const differing = glyphs[0].pixels.filter((pixel, index) => pixel.some((value, channel) => value !== glyphs[1].pixels[index][channel])).length;
      result.titleGlyphs = { samples: glyphs.map(({ pixels, ...sample }) => sample), differing };
      await record("current-title-glyphs");
      assert.ok(differing > 100 && glyphs[1].dark > 0 && glyphs[0].dark > glyphs[1].dark * 1.5,
        "Saved W/I title must show changed owning pixels and substantially wider native W ink, not a cached sentinel");
    }
    // Put a one-character selection in the notes field before disabling GPU, to check that the kill switch
    // preserves the focused native control and its selection.
    await page.locator("#detail-notes").focus();
    await page.keyboard.press("Home");
    await page.keyboard.press("Shift+ArrowRight");
    await page.evaluate(() => { window.releaseDetail = document.getElementById("detail-notes"); });
    const original = await page.locator("#detail-notes").evaluate(node => ({
      value: node.value, start: node.selectionStart, end: node.selectionEnd, focus: document.activeElement === node,
    }));
    result.rollbackSelection = original;
    assert.equal(original.start, 0);
    assert.equal(original.end, 1);
    await snapshot("before-explicit-rollback");
    // The external kill switch must preserve the focused native selection too.
    await page.evaluate(() => window.packageTask.controller.disable());
    await page.waitForFunction(() => window.packageTask.state().mode === "dom" && !window.packageTask.state().transitioning);
    assertRequestedLane("dom", await state());
    assert.deepEqual(await page.locator("#detail-notes").evaluate(node => ({
      value: node.value, start: node.selectionStart, end: node.selectionEnd, focus: document.activeElement === node,
    })), original);
    assert.equal(await page.evaluate(() => window.releaseDetail === document.getElementById("detail-notes")
      && window.releaseOriginal.input === document.getElementById("new-task")
      && window.releaseOriginal.root === window.packageTask.controller.container), true);
    await page.keyboard.type("R");
    assert.equal(await page.locator("#detail-notes").inputValue(), `R${original.value.slice(1)}`);
    await snapshot("usable-original-dom-rollback");
    assert.deepEqual((await state()).resources, result.snapshots[0].state.resources,
      "Rollback must retire GPU work while retaining the original DOM root/canvases/lifetime listeners");
    if (lane === "native") {
      await page.evaluate(() => window.packageTask.controller.enable());
      await page.waitForFunction(() => !window.packageTask.state().initializing);
      assertRequestedLane("native", await state());
      await snapshot("explicit-visible-reentry");
    }
    result.events = await page.evaluate(() => window.releaseEvents);
    assert.ok(result.events.some(event => event.trusted && event.type === "input" && event.id === "detail-notes" && event.mode === (lane === "native" ? "gpu" : "dom")));
    assert.ok(result.events.some(event => event.trusted && event.type === "input" && event.id === "detail-notes" && event.mode === "dom"));
    if (lane === "native") {
      assert.ok(result.events.some(event => event.trusted && event.type === "click" && event.id === "detail-title" && event.mode === "gpu"));
      assert.ok(result.events.some(event => event.trusted && event.type === "input" && event.id === "detail-title" && event.mode === "gpu"));
    }
    await page.evaluate(() => window.packageTask.dispose());
    await snapshot("disposed");
    const final = await state();
    for (const resources of [final.resources, final.runtimeResources]) assert.ok(Object.values(resources).every(value => value === 0));
    assert.equal(final.timers, 0); assert.equal(final.listeners, 0);
    assert.deepEqual(errors, []);
    result.status = "passed";
    result.elapsedMs = performance.now() - started;
    await record("passed");
    return result;
  } catch (error) {
    result.status = "failed"; result.failure = String(error);
    await record("failed");
    throw error;
  } finally {
    await browser?.close();
    result.browserClosed = true;
    await record("cleanup");
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [url, version, lane, dpr, executable, evidence] = process.argv.slice(2);
  try {
    assert.ok(url && version && ["native", "dom"].includes(lane) && ["1", "2"].includes(dpr) && evidence,
      "Pilot requires url, actual peer, native|dom, DPR1|2, executable placeholder and fresh evidence directory");
    console.log(JSON.stringify(await releasePilot({ url, version, lane, dpr: Number(dpr), executable, evidence })));
  } catch (error) { console.error(error); process.exitCode = 1; }
}
