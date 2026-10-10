import { defineConfig } from "@playwright/test";
import { developmentURL, previewURL } from "./tests/urls.mjs";
import { evidenceRoot } from "./tests/evidence.mjs";

const isolated = !!process.env.CANVAS_TEST_DEV_URL;

export default defineConfig({
  testDir: "./tests",
  testMatch: ["browser.test.mjs", "recovery.test.mjs", "surface.test.mjs", "runtime.test.mjs", "animation.test.mjs", "todo.test.mjs", "performance.test.mjs", "integration.test.mjs", "effects.test.mjs"],
  workers: 1,
  timeout: 60000,
  reporter: [["list"], ["json", { outputFile: `${evidenceRoot}/browser-tests.json` }]],
  use: {
    baseURL: previewURL,
    viewport: { width: 900, height: 750 },
    launchOptions: {
      executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      args: ["--enable-automation", "--enable-blink-features=CanvasDrawElement,ElementCanvasTransform", "--enable-experimental-web-platform-features"],
    },
  },
  webServer: [
    {
      command: `npm run preview -- --port ${new URL(previewURL).port} --strictPort`,
      url: previewURL,
      reuseExistingServer: !isolated,
    },
    {
      command: `npm run dev -- --port ${new URL(developmentURL).port} --strictPort`,
      url: developmentURL,
      reuseExistingServer: !isolated,
    },
  ],
});
