// Reports whether the configured browser offers WebGPU and the HTML-in-Canvas APIs the suite needs.
import { chromium } from "@playwright/test";
import { createServer } from "node:http";
import { browserLaunchOptions } from "../tests/helpers/browser.mjs";
// WebGPU needs a secure context: serve the probe page from localhost.
const server = createServer((_, response) => { response.setHeader("content-type", "text/html"); response.end("<!doctype html><title>probe</title>"); });
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const browser = await chromium.launch(browserLaunchOptions());
try {
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  const report = await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    document.body.append(canvas);
    const adapter = await navigator.gpu?.requestAdapter();
    const device = await adapter?.requestDevice();
    return { version: navigator.userAgent, webgpu: !!adapter, adapter: adapter?.info ? { vendor: adapter.info.vendor, architecture: adapter.info.architecture, description: adapter.info.description } : null,
      drawElementImageToTexture: !!device && typeof device.queue.drawElementImageToTexture === "function",
      canvasContent: "content" in canvas, updateElementGeometry: typeof canvas.updateElementGeometry === "function" };
  });
  console.log(JSON.stringify({ browser: browser.version(), ...report }, null, 2));
  if (!report.webgpu || !report.drawElementImageToTexture || !report.canvasContent) process.exitCode = 1;
} finally { await browser.close(); server.close(); }
