/**
 * Playwright `test` re-export with an automatic worker-scoped fixture that records which browser build
 * actually ran. Specs that import `test` and `expect` from here get the fixture; specs that import
 * `@playwright/test` directly do not.
 */
import { test as base, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { evidenceDirectory } from "./evidence.mjs";

// Auto fixture: runs once per worker even if a spec never names it, so every run leaves an identity file.
export const test = base.extend({
  currentBrowserIdentity: [async ({ browser }, use, workerInfo) => {
    // Browser-level CDP session (not page-level): version and launch command line describe the whole browser.
    const cdp = await browser.newBrowserCDPSession();
    const identity = await cdp.send("Browser.getVersion");
    const launch = await cdp.send("Browser.getBrowserCommandLine");
    // One JSON file per worker so parallel workers never overwrite each other.
    const directory = evidenceDirectory("browser-identity");
    await mkdir(directory, { recursive: true });
    await writeFile(`${directory}/worker-${workerInfo.workerIndex}.json`, JSON.stringify({ identity, launch }, null, 2));
    await cdp.detach();
    await use(identity);
  }, { scope: "worker", auto: true }],
});
export { expect };
