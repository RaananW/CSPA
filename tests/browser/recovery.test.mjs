/**
 * Browser suite for the recovery experiment page `recovery.html`
 * (`examples/playground/src/recovery-probe.tsx`, driven through `window.recoveryProbe`). The page moves one
 * React control tree between a `content="drawable"` canvas and an ordinary DOM host using one of two
 * candidates: `move` (re-parent the same container with `Element.moveBefore`) or `remount` (unmount and create
 * a new root). The tests record what survives each move (element identity, focus, selection, controlled and
 * uncontrolled values, local React state) with and without an explicit focus restore, with and without
 * StrictMode (the StrictMode runs use the dev server), and check that capture pixels stay fresh after every
 * return to the canvas and that no roots, snapshots, effects or subscribers leak. Reports and screenshots go to
 * the `recovery` evidence directory.
 */
import { test, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { PNG } from "pngjs";

import { evidenceDirectory } from "../helpers/evidence.mjs";
import { developmentURL } from "../helpers/urls.mjs";
// Evidence directory for per-run JSON reports and screenshots.
const evidence = evidenceDirectory("recovery");
// SHA-256 of the decoded pixels, so two screenshots can be compared for equality without storing them.
const hash = (bytes) => createHash("sha256").update(PNG.sync.read(bytes).data).digest("hex");

// `move` must never fall back to `appendChild`: it would silently reset focus and selection. Without
// `Element.moveBefore` the probe must refuse to start and must not create a root.
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

/**
 * Captures the control tree into the canvas through the probe, checks the sampled pixel and the geometry
 * translation (30, 30), and returns a hash of the canvas screenshot so callers can tell whether pixels changed.
 */
async function capture(page) {
  const result = await page.evaluate(() => window.recoveryProbe.capture());
  expect(result.sample).toEqual([240, 30, 60, 255]);
  expect(result.transform.e).toBe(30);
  expect(result.transform.f).toBe(30);
  return hash(await page.locator("#capture-host").screenshot());
}

/** Replaces the value of the input `#id` with real keystrokes (click, select all, type). */
async function edit(page, id, text) {
  await page.locator(`#${id}`).click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type(text);
}

// StrictMode runs load the page from the dev server (React development build); the others use the preview build.
for (const strict of [false, true]) {
  for (const [candidate, restoreFocus] of [["move", false], ["remount", false], ["remount", true]]) {
    // Full round trip for one candidate: canvas -> DOM -> canvas, then ten more cycles. `restoreFocus` asks the
    // probe to put focus and selection back explicitly; `move` is expected to keep them without it, `remount` only
    // with it. Local React state and the uncontrolled value survive only a `move`.
    test(`recovery ${candidate} restore=${restoreFocus} StrictMode=${strict}`, async ({ page, browser }) => {
      await mkdir(evidence, { recursive: true });
      const name = `${candidate}-restore-${restoreFocus}-strict-${strict}`;
      // Collected for the evidence JSON, which is written in `finally` even when an assertion fails.
      const report = {
        candidate, restoreFocus, strict, reactBuild: strict ? "development" : "production",
        startedAt: new Date().toISOString(),
        executablePath: (test.info().project.use.launchOptions.executablePath ?? test.info().project.use.launchOptions.channel),
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
        await page.goto(strict ? new URL("/recovery.html", developmentURL).href : "/recovery.html");
        await page.waitForFunction(() => window.recoveryProbe);
        report.initial = await page.evaluate(({ candidate, strict }) => window.recoveryProbe.start(candidate, strict), { candidate, strict });
        // StrictMode mounts and cleans up effects once more in development.
        expect(report.initial.counts.effectMounts).toBe(strict ? 2 : 1);
        expect(report.initial.counts.effectCleanups).toBe(strict ? 1 : 0);
        report.firstCaptureHash = await capture(page);
        await page.locator("#local-increment").click();
        await edit(page, "controlled", "kept-controlled");
        await capture(page);
        await edit(page, "uncontrolled", "native-edited");
        report.changedCaptureHash = await capture(page);
        // Edits in the native inputs must reach the next capture.
        expect(report.changedCaptureHash).not.toBe(report.firstCaptureHash);
        await page.locator("#controlled").click();
        // Select one character in the controlled input so the move can be checked for selection preservation.
        await page.keyboard.press("Home");
        await page.keyboard.press("ArrowRight");
        await page.keyboard.press("Shift+ArrowRight");
        await page.keyboard.press("Shift+ArrowRight");
        await page.evaluate(() => {
          window.originalRecoveryContainer = document.querySelector(".app-container");
          window.originalRecoveryInput = document.querySelector("#controlled");
        });
        // Move the tree out of the canvas. `afterClear.isIdentity` shows the native geometry was cleared; the input
        // values kept in the external store always survive.
        report.canvasToDOM = await page.evaluate((restore) => window.recoveryProbe.transition("dom", restore), restoreFocus);
        expect(report.canvasToDOM.afterClear.isIdentity).toBe(true);
        expect(report.canvasToDOM.after.controlled.value).toBe("kept-controlled");
        expect(report.canvasToDOM.after.controls).toBe(1);
        expect(report.canvasToDOM.after.background).toBe("rgb(30, 100, 220)");
        expect(report.canvasToDOM.before.padding).toBe("12px");
        expect(report.canvasToDOM.after.padding).toBe("18px");
        // Identity and local state survive only when the same container is moved.
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
        // The DOM host paints its background (30, 100, 220) at the top-left corner.
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
        // Move back into the canvas, after the DOM-side edits and a submit.
        report.domToCanvas = await page.evaluate((restore) => window.recoveryProbe.transition("canvas", restore), restoreFocus);
        expect(report.domToCanvas.after.controlled.value).toBe("submitted-from-DOM");
        expect(report.domToCanvas.after.submitted).toBe("submitted-from-DOM");
        expect(report.domToCanvas.after.localCount).toBe(candidate === "move" ? "Local count: 1" : "Local count: 0");
        expect(report.domToCanvas.after.uncontrolled.value).toBe(candidate === "move" ? "edited-in-DOM" : "native");
        report.reentryFocusPreserved = report.domToCanvas.after.uncontrolled.focused;
        report.reentrySelectionPreserved = report.domToCanvas.after.uncontrolled.selectionStart === report.beforeReentry.uncontrolled.selectionStart
          && report.domToCanvas.after.uncontrolled.selectionEnd === report.beforeReentry.uncontrolled.selectionEnd;
        expect(report.reentryFocusPreserved).toBe(candidate === "move" || restoreFocus);
        // Selection is only preserved by `move`, even when focus is restored explicitly.
        expect(report.reentrySelectionPreserved).toBe(candidate === "move");
        report.reentryCaptureHash = await capture(page);
        await page.locator("#capture-host").screenshot({ path: `${evidence}/${name}-reentry.png` });
        await page.locator("#local-increment").click();
        expect((await page.evaluate(() => window.recoveryProbe.state())).localCount).toBe(candidate === "move" ? "Local count: 2" : "Local count: 1");
        await edit(page, "controlled", "edited-after-reentry");
        await page.keyboard.press("Enter");
        expect((await page.evaluate(() => window.recoveryProbe.state())).submitted).toBe("edited-after-reentry");
        // A native edit after re-entry must change the captured pixels again.
        report.reentryEditedHash = await capture(page);
        expect(report.reentryEditedHash).not.toBe(report.reentryCaptureHash);
        await capture(page);
        await page.locator("#toggle").click();
        await expect(page.getByTestId("nested")).toHaveCount(0);
        await capture(page);
        await page.locator("#toggle").click();
        await expect(page.getByTestId("nested")).toHaveCount(1);
        // Ten more round trips; on the first one the nested child is hidden while out of the canvas, which a
        // `move` keeps hidden (the nested hook token stays null); after a `remount` the nested child is present again.
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
          // Back in the canvas there is exactly one live root, no leftover snapshots and one control tree.
          expect(back.after.resources.liveRoots).toBe(1);
          expect(back.after.resources.liveSnapshots).toBe(0);
          expect(back.after.controls).toBe(1);
          expect(back.after.localCount).toBe(candidate === "move" ? `Local count: ${index + 1}` : "Local count: 0");
          report.transitions.push({ out, back });
        }
        report.final = await page.evaluate(() => window.recoveryProbe.state());
        // `move` never creates another root; `remount` creates one per move: 1 initial + 2 + 10 cycles x 2 = 23.
        expect(report.final.counts.rootsCreated).toBe(candidate === "move" ? 1 : 23);
        report.dispose = await page.evaluate(() => window.recoveryProbe.dispose());
        // Disposal leaves nothing live and no errors were reported by the page.
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
