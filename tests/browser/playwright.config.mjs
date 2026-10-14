import { defineConfig } from "@playwright/test";
import { developmentURL, previewURL } from "../helpers/urls.mjs";
import { evidenceRoot } from "../helpers/evidence.mjs";
import { browserLaunchOptions } from "../helpers/browser.mjs";
import { resolve } from "node:path";

const isolated = !!process.env.CANVAS_TEST_DEV_URL;

export default defineConfig({
  testDir: ".",
  // Every suite in this directory; a new suite needs no edit to a shared list.
  testMatch: "*.test.mjs",
  workers: 1,
  outputDir: resolve(evidenceRoot, "test-results"),
  timeout: 60000,
  reporter: [["list"], ["json", { outputFile: resolve(evidenceRoot, "browser-tests.json") }]],
  use: {
    baseURL: previewURL,
    viewport: { width: 900, height: 750 },
    launchOptions: {
      ...browserLaunchOptions(),
    },
  },
  webServer: [
    {
      cwd: resolve("."),
      command: `node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port ${new URL(previewURL).port} --strictPort`,
      url: previewURL,
      reuseExistingServer: !isolated,
    },
    {
      cwd: resolve("."),
      command: `node node_modules/vite/bin/vite.js --host 127.0.0.1 --port ${new URL(developmentURL).port} --strictPort`,
      url: developmentURL,
      reuseExistingServer: !isolated,
    },
  ],
});
