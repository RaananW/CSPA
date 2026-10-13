import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { PNG } from "pngjs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { browserLaunchOptions } from "../tests/helpers/browser.mjs";

export async function todoContract(url, major, expectedVersion, flags, dpr, directory) {
  const name = `todo-react${major}-${flags}-${dpr}`;
  const result = { major, flags, dpr, steps: [], errors: [] };
  const browser = await chromium.launch(browserLaunchOptions({ native: !!flags }));
  const record = () => writeFile(join(directory, `${name}.json`), JSON.stringify(result, null, 2));
  try {
    const context = await browser.newContext({ viewport: { width: 900, height: 950 }, deviceScaleFactor: dpr });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    result.identity = await cdp.send("Browser.getVersion");
    result.launch = await cdp.send("Browser.getBrowserCommandLine");
    await record();
    page.on("pageerror", error => result.errors.push(String(error)));
    await page.goto(url);
    await page.waitForFunction(() => window.packageTask && document.getElementById("new-task"));
    await page.evaluate(() => {
      window.taskNativeEvents = [];
      for (const type of ["pointerdown", "pointerup", "click", "keydown", "input", "submit", "focusin"]) {
        document.addEventListener(type, event => window.taskNativeEvents.push({
          type, trusted: event.isTrusted, target: event.target.id || event.target.getAttribute?.("aria-label"),
          path: event.composedPath().filter(node => node instanceof Element).map(node => node.id || node.tagName),
          mode: window.packageTask.state().mode,
        }), true);
      }
    });
    const snapshot = async label => { result.steps.push({ label, state: await page.evaluate(() => window.packageTask.state()) }); await record(); };
    await snapshot("useful-native-start");
    assert.equal(result.steps[0].state.version, expectedVersion);
    await page.getByRole("button", { name: "Enable GPU", exact: true }).click();
    await page.waitForFunction(() => !window.packageTask.state().initializing);
    const admitted = await page.evaluate(() => window.packageTask.state());
    assert.equal(admitted.mode, flags ? "gpu" : "dom", admitted.reason);
    if (!flags) assert.match(admitted.reason, /requestPaint|canvas.content|capture|WebGPU/);
    await page.getByLabel("Open task 1", { exact: true }).click();
    await page.waitForFunction(() => document.activeElement?.id === "detail-title");
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.type("Installed native task");
    await page.getByLabel("Task notes", { exact: true }).click();
    await page.keyboard.type("Installed notes\n".repeat(24));
    await page.getByRole("button", { name: "Save task", exact: true }).click();
    assert.match(await page.locator("#task-message").innerText(), /Saved/);
    await page.getByRole("button", { name: "Task information", exact: true }).click();
    assert.equal(await page.locator("#task-information").isVisible(), true);
    assert.equal(await page.locator("#task-information").evaluate(node => !window.packageTask.controller.container.contains(node)), true);
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Delete selected task", exact: true }).click();
    await page.keyboard.press("Tab");
    assert.equal(await page.evaluate(() => !!document.activeElement.closest('[role="dialog"]')), true);
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => document.activeElement.id === "detail-title");
    assert.equal(await page.evaluate(() => document.activeElement.id), "detail-title");
    await page.getByRole("button", { name: "Back to list", exact: true }).click();
    await page.waitForFunction(() => document.activeElement.id === "open-task-1");
    assert.equal(await page.evaluate(() => document.activeElement.id), "open-task-1");
    const search = page.getByLabel("Search tasks", { exact: true });
    await search.click(); await page.keyboard.type("Installed");
    assert.equal(await page.getByRole("listitem").count(), 1);
    await page.getByLabel("Open task 1", { exact: true }).click();
    assert.equal(await page.getByLabel("Task notes", { exact: true }).inputValue(), "Installed notes\n".repeat(24));
    await page.waitForTimeout(250);
    await page.evaluate(() => window.packageTask.controller.settle());
    if (flags) {
      const png = PNG.sync.read(await page.locator("#output").screenshot({ path: join(directory, `${name}-owning.png`) }));
      const scale = png.width / 760;
      const at = (Math.floor(440 * scale) * png.width + Math.floor(720 * scale)) * 4;
      result.owningPixel = [...png.data.subarray(at, at + 4)];
      assert.deepEqual(result.owningPixel, [224, 244, 232, 255]);
      await page.waitForFunction(() => window.packageTask.state().timers === 0);
      await page.getByRole("heading", { level: 1 }).click();
      await page.evaluate(async () => { for (let i = 0; i < 30; i++) await new Promise(requestAnimationFrame); await window.packageTask.controller.settle(); });
      const commits = (await page.evaluate(() => window.packageTask.state())).commits;
      result.motion = await page.evaluate(async () => {
        window.packageTask.controller.setRipple("todo-decoration", { amplitude: 4, seconds: 0, playing: false });
        return window.packageTask.controller.advance(30, 1);
      });
      for (const key of ["captures", "uploads", "pixelReadbacks", "pixelCopies"]) assert.equal(result.motion.after.metrics[key], result.motion.before.metrics[key]);
      assert.equal(result.motion.after.metrics.gpuFrames - result.motion.before.metrics.gpuFrames, 30);
      assert.equal((await page.evaluate(() => window.packageTask.state())).commits, commits);
      await record();
    }
    await snapshot("original-edit-navigation-overlays-motion");
    assert.equal(result.steps.at(-1).state.mode, flags ? "gpu" : "dom");
    assert.ok(result.steps.at(-1).state.sameRoot && result.steps.at(-1).state.sameInput);
    await page.getByRole("button", { name: "Delete selected task", exact: true }).click();
    await page.getByRole("button", { name: "Confirm delete", exact: true }).click();
    await page.waitForFunction(() => document.activeElement.id === "task-search");
    assert.equal(await page.getByLabel("Open task 1", { exact: true }).count(), 0);
    assert.equal(await page.evaluate(() => document.activeElement.id), "task-search");
    await page.evaluate(() => window.packageTask.dispose());
    result.disposed = await page.evaluate(() => window.packageTask.state());
    result.events = await page.evaluate(() => window.taskNativeEvents);
    assert.ok(Object.values(result.disposed.resources).every(value => value === 0));
    assert.ok(Object.values(result.disposed.runtimeResources).every(value => value === 0));
    assert.equal(result.disposed.timers, 0); assert.equal(result.disposed.listeners, 0);
    assert.ok(result.events.some(event => event.type === "input" && event.trusted && event.target === "detail-notes" && event.mode === (flags ? "gpu" : "dom")));
    for (const type of ["pointerdown", "pointerup", "click"]) assert.ok(result.events.some(event => event.type === type
      && event.trusted && event.path.includes("open-task-1") && event.mode === (flags ? "gpu" : "dom")));
    assert.deepEqual(result.errors, []);
    result.status = "passed";
    return result;
  } catch (error) { result.status = "failed"; result.failure = String(error); throw error; }
  finally { await record(); await browser.close(); }
}
