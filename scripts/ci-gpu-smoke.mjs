// Enables GPU on the built runtime page and prints the runtime's own verdict. A fast,
// explicit failure before the full browser suite (which would otherwise time out per test).
import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { browserLaunchOptions } from "../tests/helpers/browser.mjs";
const vite = fileURLToPath(new URL("../node_modules/vite/bin/vite.js", import.meta.url));
const server = spawn(process.execPath, [vite, "preview", "--host", "127.0.0.1", "--port", "4173", "--strictPort"], { stdio: "ignore" });
await new Promise(resolve => setTimeout(resolve, 3000));
const browser = await chromium.launch(browserLaunchOptions());
try {
  const page = await browser.newPage({ viewport: { width: 900, height: 750 } });
  const logs = [];
  page.on("console", message => logs.push(`${message.type()}: ${message.text().slice(0, 400)}`));
  await page.goto("http://127.0.0.1:4173/runtime.html?dom");
  await page.waitForFunction(() => window.runtimeProbe, null, { timeout: 20000 });
  const started = Date.now();
  const state = await page.evaluate(() => window.runtimeProbe.enable());
  console.log(JSON.stringify({ browser: browser.version(), mode: state.mode, reason: state.reason, enableMs: Date.now() - started,
    admission: state.metrics?.admission?.last ?? null }, null, 2));
  if (logs.length) console.log(logs.slice(0, 20).join("\n"));
  if (state.mode !== "gpu") process.exitCode = 1;
} finally { await browser.close(); server.kill(); }
