// Enables GPU on the built runtime page and prints the runtime's own verdict. A fast,
// explicit failure before the full browser suite (which would otherwise time out per test).
//
// Run by the Browser workflow (`.github/workflows/browser.yml`) after `npm run build`, and locally as
// `npm run build && node scripts/ci-gpu-smoke.mjs` (see docs/ci-gpu-runner.md). Needs the built playground
// in `examples/playground/dist` and a free port 4173. Browser selection follows the shared launch helper
// (`CANVAS_BROWSER_EXECUTABLE`, `CANVAS_BROWSER_EXTRA_ARGS`).
// Output: a JSON summary on stdout (mode, reason, enable time, last admission record) followed by up to 20
// console lines from the page. Exits 1 unless the runtime reports mode `gpu`.
import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { browserLaunchOptions } from "../tests/helpers/browser.mjs";
const vite = fileURLToPath(new URL("../node_modules/vite/bin/vite.js", import.meta.url));
const server = spawn(process.execPath, [vite, "preview", "--host", "127.0.0.1", "--port", "4173", "--strictPort"], { stdio: "ignore" });
// Fixed start-up allowance for the preview server; there is no readiness poll.
await new Promise(resolve => setTimeout(resolve, 3000));
const browser = await chromium.launch(browserLaunchOptions());
try {
  const page = await browser.newPage({ viewport: { width: 900, height: 750 } });
  const logs = [];
  page.on("console", message => logs.push(`${message.type()}: ${message.text().slice(0, 400)}`));
  // `?dom` stops the runtime page from enabling GPU on load, so the explicit `enable()` below is the
  // admission that gets timed and reported.
  await page.goto("http://127.0.0.1:4173/runtime.html?dom");
  await page.waitForFunction(() => window.runtimeProbe, null, { timeout: 20000 });
  const started = Date.now();
  const state = await page.evaluate(() => window.runtimeProbe.enable());
  console.log(JSON.stringify({ browser: browser.version(), mode: state.mode, reason: state.reason, enableMs: Date.now() - started,
    admission: state.metrics?.admission?.last ?? null }, null, 2));
  if (logs.length) console.log(logs.slice(0, 20).join("\n"));
  if (state.mode !== "gpu") process.exitCode = 1;
} finally { await browser.close(); server.kill(); }
