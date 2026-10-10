import { test, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { PNG } from "pngjs";

const evidence = "evidence/recovery";
const hash = (bytes) => createHash("sha256").update(PNG.sync.read(bytes).data).digest("hex");

test("recovery refuses unsupported moveBefore without remount or append fallback", async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(Element.prototype, "moveBefore", { value: undefined, configurable: true }));
  await page.goto("/recovery.html");
  await page.waitForFunction(() => window.recoveryProbe);
  await expect(page.evaluate(() => window.recoveryProbe.start("move"))).rejects.toThrow(/appendChild fallback is forbidden/);
  const result = await page.evaluate(() => window.recoveryProbe.dispose());
  expect(result.counts.rootsCreated).toBe(0);
  expect(result.controls).toBe(0);
  expect(result.resources).toEqual({ liveRoots: 0, liveSnapshots: 0, liveEffects: 0 });
});

async function capture(page) {
  const result = await page.evaluate(() => window.recoveryProbe.capture());
  expect(result.sample).toEqual([240, 30, 60, 255]);
  expect(result.transform.e).toBe(30);
  expect(result.transform.f).toBe(30);
  return hash(await page.locator("#capture-host").screenshot());
}

async function edit(page, id, text) {
  await page.locator(`#${id}`).click();
  await page.keyboard.press("Meta+a");
  await page.keyboard.type(text);
}

for (const strict of [false, true]) {
  for (const [candidate, restoreFocus] of [["move", false], ["remount", false], ["remount", true]]) {
    test(`recovery ${candidate} restore=${restoreFocus} StrictMode=${strict}`, async ({ page, browser }) => {
      await mkdir(evidence, { recursive: true });
      const name = `${candidate}-restore-${restoreFocus}-strict-${strict}`;
      const report = {
        candidate, restoreFocus, strict, reactBuild: strict ? "development" : "production",
        startedAt: new Date().toISOString(),
        executablePath: test.info().project.use.launchOptions.executablePath,
        transitions: [], errors: [],
      };
      page.on("pageerror", (error) => report.errors.push(error.message));
      page.on("console", (message) => { if (message.type() === "error") report.errors.push(message.text()); });
      page.on("response", (response) => {
        if (response.status() >= 400) report.errors.push(`${response.status()} ${response.url()}`);
      });
      try {
        const cdp = await browser.newBrowserCDPSession();
        report.browser = await cdp.send("Browser.getVersion");
        report.commandLine = (await cdp.send("Browser.getBrowserCommandLine")).arguments;
        await page.goto(strict ? "http://127.0.0.1:5173/recovery.html" : "/recovery.html");
        await page.waitForFunction(() => window.recoveryProbe);
        report.initial = await page.evaluate(({ candidate, strict }) => window.recoveryProbe.start(candidate, strict), { candidate, strict });
        expect(report.initial.counts.effectMounts).toBe(strict ? 2 : 1);
        expect(report.initial.counts.effectCleanups).toBe(strict ? 1 : 0);
        report.firstCaptureHash = await capture(page);
        await page.locator("#local-increment").click();
        await edit(page, "controlled", "kept-controlled");
        await capture(page);
        await edit(page, "uncontrolled", "native-edited");
        report.changedCaptureHash = await capture(page);
        expect(report.changedCaptureHash).not.toBe(report.firstCaptureHash);
        await page.locator("#controlled").click();
        await page.keyboard.press("Home");
        await page.keyboard.press("ArrowRight");
        await page.keyboard.press("Shift+ArrowRight");
        await page.keyboard.press("Shift+ArrowRight");
        await page.evaluate(() => {
          window.originalRecoveryContainer = document.querySelector(".app-container");
          window.originalRecoveryInput = document.querySelector("#controlled");
        });
        report.canvasToDOM = await page.evaluate((restore) => window.recoveryProbe.transition("dom", restore), restoreFocus);
        expect(report.canvasToDOM.afterClear.isIdentity).toBe(true);
        expect(report.canvasToDOM.after.controlled.value).toBe("kept-controlled");
        expect(report.canvasToDOM.after.controls).toBe(1);
        expect(report.canvasToDOM.after.background).toBe("rgb(30, 100, 220)");
        expect(report.canvasToDOM.before.padding).toBe("12px");
        expect(report.canvasToDOM.after.padding).toBe("18px");
        expect(report.canvasToDOM.sameContainer).toBe(candidate === "move");
        report.sameInput = await page.evaluate(() => window.originalRecoveryInput === document.querySelector("#controlled"));
        expect(report.sameInput).toBe(candidate === "move");
        expect(report.canvasToDOM.after.uncontrolled.value).toBe(candidate === "move" ? "native-edited" : "native");
        expect(report.canvasToDOM.after.localCount).toBe(candidate === "move" ? "Local count: 1" : "Local count: 0");
        expect(report.canvasToDOM.after.hookToken === report.canvasToDOM.before.hookToken).toBe(candidate === "move");
        report.focusPreserved = report.canvasToDOM.after.controlled.focused;
        report.selectionPreserved = report.canvasToDOM.after.controlled.selectionStart === report.canvasToDOM.before.controlled.selectionStart
          && report.canvasToDOM.after.controlled.selectionEnd === report.canvasToDOM.before.controlled.selectionEnd;
        expect(report.focusPreserved).toBe(candidate === "move" || restoreFocus);
        expect(report.selectionPreserved).toBe(candidate === "move" || restoreFocus);
        const domImage = await page.locator(".app-container").screenshot({ path: `${evidence}/${name}-dom.png` });
        const domPixels = PNG.sync.read(domImage);
        expect([...domPixels.data.subarray((5 * domPixels.width + 5) * 4, (5 * domPixels.width + 5) * 4 + 4)]).toEqual([30, 100, 220, 255]);
        await page.locator("#local-increment").click();
        expect((await page.evaluate(() => window.recoveryProbe.state())).localCount).toBe(candidate === "move" ? "Local count: 2" : "Local count: 1");
        await edit(page, "controlled", "submitted-from-DOM");
        await page.keyboard.press("Enter");
        await expect(page.locator("output")).toHaveText("submitted-from-DOM");
        await page.locator("#toggle").click();
        await expect(page.getByTestId("nested")).toHaveCount(0);
        await page.locator("#toggle").click();
        await expect(page.getByTestId("nested")).toHaveCount(1);
        await page.locator("#local-increment").click();
        await edit(page, "uncontrolled", "edited-in-DOM");
        report.beforeReentry = await page.evaluate(() => window.recoveryProbe.state());
        report.domToCanvas = await page.evaluate((restore) => window.recoveryProbe.transition("canvas", restore), restoreFocus);
        expect(report.domToCanvas.after.controlled.value).toBe("submitted-from-DOM");
        expect(report.domToCanvas.after.submitted).toBe("submitted-from-DOM");
        expect(report.domToCanvas.after.localCount).toBe(candidate === "move" ? "Local count: 1" : "Local count: 0");
        expect(report.domToCanvas.after.uncontrolled.value).toBe(candidate === "move" ? "edited-in-DOM" : "native");
        report.reentryFocusPreserved = report.domToCanvas.after.uncontrolled.focused;
        report.reentrySelectionPreserved = report.domToCanvas.after.uncontrolled.selectionStart === report.beforeReentry.uncontrolled.selectionStart
          && report.domToCanvas.after.uncontrolled.selectionEnd === report.beforeReentry.uncontrolled.selectionEnd;
        expect(report.reentryFocusPreserved).toBe(candidate === "move" || restoreFocus);
        expect(report.reentrySelectionPreserved).toBe(candidate === "move");
        report.reentryCaptureHash = await capture(page);
        await page.locator("#capture-host").screenshot({ path: `${evidence}/${name}-reentry.png` });
        await page.locator("#local-increment").click();
        expect((await page.evaluate(() => window.recoveryProbe.state())).localCount).toBe(candidate === "move" ? "Local count: 2" : "Local count: 1");
        await edit(page, "controlled", "edited-after-reentry");
        await page.keyboard.press("Enter");
        expect((await page.evaluate(() => window.recoveryProbe.state())).submitted).toBe("edited-after-reentry");
        report.reentryEditedHash = await capture(page);
        expect(report.reentryEditedHash).not.toBe(report.reentryCaptureHash);
        await capture(page);
        await page.locator("#toggle").click();
        await expect(page.getByTestId("nested")).toHaveCount(0);
        await capture(page);
        await page.locator("#toggle").click();
        await expect(page.getByTestId("nested")).toHaveCount(1);
        const cycles = 10;
        for (let index = 0; index < cycles; index++) {
          if (index === 0) {
            await page.locator("#toggle").click();
            await expect(page.getByTestId("nested")).toHaveCount(0);
          }
          const out = await page.evaluate((restore) => window.recoveryProbe.transition("dom", restore), restoreFocus);
          if (index === 0) {
            report.hiddenChildAfterTransition = out.after.hookToken === null;
            expect(report.hiddenChildAfterTransition).toBe(candidate === "move");
            if (candidate === "move") await page.locator("#toggle").click();
          }
          await page.locator("#local-increment").click();
          const back = await page.evaluate((restore) => window.recoveryProbe.transition("canvas", restore), restoreFocus);
          await capture(page);
          expect(back.after.resources.liveRoots).toBe(1);
          expect(back.after.resources.liveSnapshots).toBe(0);
          expect(back.after.controls).toBe(1);
          expect(back.after.localCount).toBe(candidate === "move" ? `Local count: ${index + 1}` : "Local count: 0");
          report.transitions.push({ out, back });
        }
        report.final = await page.evaluate(() => window.recoveryProbe.state());
        expect(report.final.counts.rootsCreated).toBe(candidate === "move" ? 1 : 23);
        report.dispose = await page.evaluate(() => window.recoveryProbe.dispose());
        expect(report.dispose.resources).toEqual({ liveRoots: 0, liveSnapshots: 0, liveEffects: 0 });
        expect(report.dispose.subscribers).toBe(0);
        expect(report.dispose.controls).toBe(0);
        expect(report.errors).toEqual([]);
        await expect(page.evaluate(() => window.recoveryProbe.capture())).rejects.toThrow(/not mounted/);
      } finally {
        await writeFile(`${evidence}/${name}.json`, JSON.stringify(report, null, 2) + "\n");
      }
    });
  }
}
