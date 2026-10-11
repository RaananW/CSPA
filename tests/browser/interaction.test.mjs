import { test, expect, chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { evidenceDirectory } from "../helpers/evidence.mjs";
import { previewURL } from "../helpers/urls.mjs";

const directory = evidenceDirectory("interaction");
for (const boundary of ["root-plaintext", "child-plaintext"]) {
  test(`live ${boundary} editing recovers the original native subtree`, async ({ page }) => {
    const cdp = await page.context().newCDPSession(page);
    const identity = await cdp.send("Browser.getVersion");
    const launch = await cdp.send("Browser.getBrowserCommandLine");
    await page.goto("/integration.html?dom");
    await page.waitForFunction(() => !!window.integrationProbe);
    expect((await page.evaluate(() => window.integrationProbe.enable())).mode).toBe("gpu");
    await page.evaluate(boundary => {
      window.originalEditor = document.querySelector("#replacement");
      window.originalInput = document.querySelector("#name");
      if (boundary === "root-plaintext") window.originalEditor.contentEditable = "plaintext-only";
      else {
        const child = document.createElement("span");
        child.contentEditable = "plaintext-only";
        child.id = "editable-child";
        child.textContent = "Original editing";
        window.originalEditor.appendChild(child);
      }
    }, boundary);
    await page.waitForFunction(() => {
      const state = window.integrationProbe.state();
      return state.mode === "dom" && !state.transitioning && state.resources.engines === 0;
    });
    await expect(page.locator("#output")).toBeHidden();
    const editor = page.locator(boundary === "root-plaintext" ? "#replacement" : "#editable-child");
    await editor.focus();
    await page.keyboard.press("End");
    await page.keyboard.type(" usable DOM");
    await expect(editor).toContainText("usable DOM");
    const observed = await page.evaluate(() => ({
      sameEditor: window.originalEditor === document.querySelector("#replacement"),
      sameInput: window.originalInput === document.querySelector("#name"),
      focused: document.activeElement.id,
      state: window.integrationProbe.state(),
    }));
    expect(observed.sameEditor && observed.sameInput).toBe(true);
    expect(observed.state.reason).toContain("editable/top-layer boundaries");
    await page.evaluate(boundary => {
      if (boundary === "root-plaintext") document.querySelector("#replacement").contentEditable = "false";
      else document.querySelector("#editable-child").remove();
    }, boundary);
    expect((await page.evaluate(() => window.integrationProbe.enable())).mode).toBe("gpu");
    const disposed = await page.evaluate(() => window.integrationProbe.dispose());
    expect(Object.values(disposed.resources).every(value => value === 0)).toBe(true);
    expect(Object.values(disposed.runtimeResources).every(value => value === 0)).toBe(true);
    await mkdir(directory, { recursive: true });
    await writeFile(`${directory}/${boundary}.json`, JSON.stringify({ identity, launch, observed, disposed }, null, 2));
  });
}

test("headful clean-profile real background tab pauses effects without hidden-time catch-up", async () => {
  test.skip(process.env.CANVAS_HEADFUL_INTERACTION !== "1", "Opt-in synthetic clean-profile headful execution");
  const browser = await chromium.launch({
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: false,
    ignoreDefaultArgs: ["--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows"],
    args: ["--enable-automation", "--enable-blink-features=CanvasDrawElement,ElementCanvasTransform", "--enable-experimental-web-platform-features"],
  });
  try {
    const context = await browser.newContext({ viewport: { width: 900, height: 750 } });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    const identity = await cdp.send("Browser.getVersion");
    const launch = await cdp.send("Browser.getBrowserCommandLine");
    expect(launch.arguments).not.toContain("--disable-background-timer-throttling");
    await page.goto(`${previewURL}/effects.html`);
    await page.waitForFunction(() => window.effectsProbe?.state().mode === "gpu");
    await page.bringToFront();
    await page.locator("#title").fill("Background retained");
    await page.locator("#save").click();
    await page.evaluate(() => {
      window.retainedTitle = document.querySelector("#title");
      window.visibilityEvents = [];
      document.addEventListener("visibilitychange", event => {
        window.visibilityEvents.push({ trusted: event.isTrusted, hidden: document.hidden, at: performance.now() });
      });
      window.effectsProbe.apply([window.effectsProbe.descriptor("ripple", 0, true)]);
    });
    await page.waitForTimeout(150);
    const before = await page.evaluate(() => window.effectsProbe.state());
    const { targetInfo } = await cdp.send("Target.getTargetInfo");
    const [other] = await test.step("Open same-window synthetic tab", () => Promise.all([
      context.waitForEvent("page"),
      cdp.send("Target.createTarget", { url: "data:text/html,<title>CanvasSPA synthetic background target</title><p>No user content</p>",
        browserContextId: targetInfo.browserContextId, newWindow: false }),
    ]), { timeout: 8000 });
    await test.step("Activate synthetic target", () => other.bringToFront(), { timeout: 8000 });
    try {
      await page.waitForFunction(() => document.hidden, null, { timeout: 5000 });
    } catch (error) {
      if (error.name !== "TimeoutError") throw error;
      const capability = await page.evaluate(() => ({ hidden: document.hidden, visibility: document.visibilityState,
        events: window.visibilityEvents, state: window.effectsProbe.state() }));
      const disposed = await page.evaluate(() => window.effectsProbe.dispose());
      expect(Object.values(disposed.resources).every(value => value === 0)).toBe(true);
      expect(Object.values(disposed.runtimeResources).every(value => value === 0)).toBe(true);
      await mkdir(directory, { recursive: true });
      await writeFile(`${directory}/real-background-tab-unverified.json`, JSON.stringify({ identity, launch, capability, disposed,
        limitation: "Actual page switching did not make the original document hidden in this execution environment. No synthetic visibility event substituted; background behavior remains unverified." }, null, 2));
      test.skip(true, "Actual clean-profile page switching did not produce hidden visibility");
    }
    await page.waitForTimeout(200);
    const hidden = await page.evaluate(() => ({ at: performance.now(), visibility: document.visibilityState, state: window.effectsProbe.state() }));
    await page.waitForTimeout(600);
    const held = await page.evaluate(() => ({ at: performance.now(), visibility: document.visibilityState, state: window.effectsProbe.state() }));
    expect(held.visibility).toBe("hidden");
    expect(held.at - hidden.at).toBeGreaterThanOrEqual(550);
    expect(held.state.environment.visible).toBe(false);
    expect(held.state.metrics.gpuFrames).toBe(hidden.state.metrics.gpuFrames);
    expect(held.state.decorativeEffects[0].seconds).toBe(hidden.state.decorativeEffects[0].seconds);
    await page.bringToFront();
    await page.waitForFunction(() => !document.hidden);
    const resumed = await page.evaluate(async () => {
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return { at: performance.now(), sameInput: window.retainedTitle === document.querySelector("#title"),
        value: document.querySelector("#title").value, events: window.visibilityEvents, state: window.effectsProbe.state() };
    });
    expect(resumed.sameInput).toBe(true);
    expect(resumed.value).toBe("Background retained");
    expect(resumed.events.map(event => [event.trusted, event.hidden])).toEqual([[true, true], [true, false]]);
    expect(resumed.state.decorativeEffects[0].seconds - held.state.decorativeEffects[0].seconds).toBeLessThan(.4);
    await page.locator("#title").fill("Return native edit");
    await page.locator("#save").click();
    await expect(page.locator("#saved")).toHaveText("Return native edit");
    const disposed = await page.evaluate(() => window.effectsProbe.dispose());
    expect(Object.values(disposed.resources).every(value => value === 0)).toBe(true);
    expect(Object.values(disposed.runtimeResources).every(value => value === 0)).toBe(true);
    await mkdir(directory, { recursive: true });
    await writeFile(`${directory}/real-background-tab.json`, JSON.stringify({ identity, launch, before, hidden, held, resumed, disposed,
      limits: "Installed Chrome clean-profile headful automation with real tab switching/trusted visibility. Not an everyday user profile, another-app/OS throttling, physical device or screen-reader test." }, null, 2));
  } finally { await browser.close(); }
});
