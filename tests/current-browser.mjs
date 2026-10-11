import { test as base, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { evidenceDirectory } from "./evidence.mjs";

export const test = base.extend({
  currentBrowserIdentity: [async ({ browser }, use, workerInfo) => {
    const cdp = await browser.newBrowserCDPSession();
    const identity = await cdp.send("Browser.getVersion");
    const launch = await cdp.send("Browser.getBrowserCommandLine");
    const directory = evidenceDirectory("browser-identity");
    await mkdir(directory, { recursive: true });
    await writeFile(`${directory}/worker-${workerInfo.workerIndex}.json`, JSON.stringify({ identity, launch }, null, 2));
    await cdp.detach();
    await use(identity);
  }, { scope: "worker", auto: true }],
});
export { expect };
