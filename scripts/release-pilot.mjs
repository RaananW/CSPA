import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { PNG } from "pngjs";
import { writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { assertRuntimePeer, assertRequestedLane, assertBrowserIdentity, qualifiedBrowser } from "./release-policy.mjs";

export async function releasePilot({ url, version, lane, dpr, executable, evidence }) {
  const started = performance.now();
  const result = { lane, dpr, expectedReact: version, snapshots: [], status: "running" };
  result.expectedBrowser = qualifiedBrowser;
  let sequence = 0;
  const record = async label => writeFile(join(evidence, `${sequence++}-${label}.json`), JSON.stringify(result, null, 2), { flag: "wx" });
  let browser;
  try {
    browser = await chromium.launch({ executablePath: executable, args: [
    "--enable-automation",
    ...(lane === "native" ? ["--enable-blink-features=CanvasDrawElement,ElementCanvasTransform", "--enable-experimental-web-platform-features"] : []),
    ] });
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
    const state = () => page.evaluate(() => window.packageTask.state());
    const snapshot = async label => { result.snapshots.push({ label, elapsedMs: performance.now() - started, state: await state() }); await record(label); };
    result.runtime = await page.evaluate(() => ({ react: window.packageTask.state().version, reactDOM: window.packageTask.state().reactDOMVersion }));
    await record("actual-runtime-before-assert");
    assertRuntimePeer(result.runtime, version);
    await page.evaluate(() => {
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
    await page.getByLabel("Open task 1", { exact: true }).click();
    await page.waitForFunction(() => document.activeElement?.id === "detail-title");
    await page.keyboard.press("Meta+a");
    await page.keyboard.type(`Release React${version} DPR${dpr}`);
    await page.getByLabel("Task notes", { exact: true }).click();
    await page.keyboard.type("Original native release pilot notes");
    await page.getByRole("button", { name: "Save task", exact: true }).click();
    assert.match(await page.locator("#task-message").innerText(), /Saved/);
    await page.waitForTimeout(250);
    await page.evaluate(() => window.packageTask.controller.settle());
    assertRequestedLane(lane, await state());
    if (lane === "native") {
      const png = PNG.sync.read(await page.locator("#output").screenshot({ path: join(evidence, "owning-output.png") }));
      const scale = png.width / 760;
      const offset = (Math.floor(440 * scale) * png.width + Math.floor(720 * scale)) * 4;
      result.owningPixel = [...png.data.subarray(offset, offset + 4)];
      assert.deepEqual(result.owningPixel, [224, 244, 232, 255]);
    }
    await page.locator("#detail-notes").focus();
    await page.keyboard.press("Meta+ArrowLeft");
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
    assert.ok(url && version && ["native", "dom"].includes(lane) && ["1", "2"].includes(dpr) && executable && evidence,
      "Pilot requires url, actual peer, native|dom, DPR1|2, provisioned executable and fresh evidence directory");
    console.log(JSON.stringify(await releasePilot({ url, version, lane, dpr: Number(dpr), executable, evidence })));
  } catch (error) { console.error(error); process.exitCode = 1; }
}
