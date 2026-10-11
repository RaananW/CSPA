import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";
import { PNG } from "pngjs";
import { evidenceDirectory } from "../tests/helpers/evidence.mjs";
import { taskPixelLatency } from "./interaction-contract.mjs";

const build = resolve(process.env.CANVAS_MEASURE_BUILD ?? ".");
const port = Number(process.env.CANVAS_MEASURE_PORT ?? 5297);
const label = process.env.CANVAS_MEASURE_LABEL ?? "final";
const automatic = process.env.CANVAS_MEASURE_POLICY === "automatic";
assert.ok(["baseline", "final"].includes(label));
assert.ok(!automatic || label === "final");
assert.ok(Number.isInteger(port) && port >= 1024 && port <= 65535);
const directory = evidenceDirectory(`dynamic-measure/${label}`);
await mkdir(directory, { recursive: true });
const filename = `${directory}/report.json`;
try { await readFile(filename); throw new Error("Measurement root already contains a report; choose a fresh root"); }
catch (error) { if (error.code !== "ENOENT") throw error; }
const url = `http://127.0.0.1:${port}`;
try { await fetch(url); throw new Error("Refusing to reuse an unknown preview"); }
catch (error) { if (error.cause?.code !== "ECONNREFUSED") throw error; }
const vite = new URL("../node_modules/vite/bin/vite.js", import.meta.url).pathname;
const server = spawn(process.execPath, [vite, "preview", "--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
  cwd: build, stdio: ["ignore", "pipe", "pipe"],
});
let serverOutput = "", browser;
const closed = new Promise(done => server.once("close", done));
for (const stream of [server.stdout, server.stderr]) stream.on("data", data => { serverOutput += data; });
const report = { label, admissionPolicy: automatic ? "automatic" : "explicit", status: "running", environment: {}, runs: [], method: {
  variants: "DOM and explicit-GPU baseline/final use identical settings and operations; final opt-in is an additional result, not a matched speedup comparison",
  input: "Ten real native input replacements with 80ms spacing; real tasks add/edit/checkbox/delete; timings include automation and screenshot/readback overhead",
  structure: "Five settled membership/order/origin/size/frame changes, each manually reenabled in matched explicit-GPU cases",
  timing: "performance.now/rAF and public CPU submission/capture/readback samples; no GPU execution timestamp, physical input latency or production budget",
  memory: "Peak owned resource counters sampled each rAF, not browser heap/driver memory; every retired lifetime checked independently",
  scroll: "Actual native overflow remains diagnosed DOM, never guard suppression",
}};
const save = () => writeFile(filename, JSON.stringify(report, null, 2));
const zero = state => {
  assert.equal(state.mode, "disposed");
  assert.ok(Object.values(state.resources).every(n => n === 0));
  assert.ok(Object.values(state.runtimeResources).every(n => n === 0));
};
async function monitor(page, probe) {
  await page.evaluate(probe => {
    const state = () => window[probe].state();
    window.dynamicWindow = { start: performance.now(), previous: undefined, intervals: [], peak: {}, active: true, events: [] };
    const listener = event => window.dynamicWindow.events.push({ type: event.type, at: performance.now() });
    const root = document.querySelector(".app-container");
    root.addEventListener("input", listener, true); root.addEventListener("change", listener, true);
    window.dynamicStop = () => { root.removeEventListener("input", listener, true); root.removeEventListener("change", listener, true); };
    const tick = time => {
      const w = window.dynamicWindow;
      if (!w.active) return;
      if (w.previous !== undefined) w.intervals.push(time - w.previous);
      w.previous = time;
      const s = state();
      for (const [key, value] of Object.entries(s.resources)) w.peak[key] = Math.max(w.peak[key] ?? 0, value);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, probe);
}
async function finishWindow(page) {
  return page.evaluate(() => {
    const w = window.dynamicWindow;
    w.active = false; window.dynamicStop();
    return { start: w.start, durationMs: performance.now() - w.start, intervals: w.intervals, peak: w.peak, nativeEvents: w.events };
  });
}
async function ready(page, probe, gpu) {
  await page.waitForFunction(probe => !!window[probe], probe);
  if (gpu && probe !== "measurement") {
    const s = await page.evaluate(probe => probe === "todoProbe" ? window.todoProbe.controller().enable() : window[probe].enable(), probe);
    assert.equal(s.mode, "gpu", s.reason);
  }
  await page.evaluate(probe => probe === "todoProbe" ? window.todoProbe.controller().settle() : window[probe].settle(), probe);
}
try {
  for (let i = 0; ; i++) {
    try { if ((await fetch(`${url}/integration.html`)).ok) break; }
    catch (error) { if (error.cause?.code !== "ECONNREFUSED") throw error; }
    if (i >= 150 || server.exitCode !== null) throw new Error(`Preview readiness failed: ${serverOutput}`);
    await new Promise(done => setTimeout(done, 100));
  }
  browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    args: ["--enable-automation", "--enable-blink-features=CanvasDrawElement,ElementCanvasTransform", "--enable-experimental-web-platform-features"] });
  const cdp = await browser.newBrowserCDPSession();
  const system = await cdp.send("SystemInfo.getInfo");
  report.environment = { browser: await cdp.send("Browser.getVersion"), launch: await cdp.send("Browser.getBrowserCommandLine"),
    gpu: system.gpu.devices, renderer: system.gpu.auxAttributes?.glRenderer, gpuExecutionMs: null,
    dependencies: JSON.parse(await readFile(resolve(build, "package.json"), "utf8")), viewport: { width: 900, height: 750 } };
  await cdp.detach(); await save();
  for (const dpr of [1, 2]) for (const gpu of [false, true]) {
    const context = await browser.newContext({ viewport: { width: 900, height: 750 }, deviceScaleFactor: dpr });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(String(error)));
    try {
      await page.goto(`${url}/performance.html?layers=2&variant=${gpu ? "gpu" : "dom"}-static`);
      await ready(page, "measurement", gpu);
      const before = await page.evaluate(() => window.measurement.state());
      await monitor(page, "measurement");
      const collecting = page.evaluate(() => window.measurement.collect(2000));
      for (let i = 0; i < 10; i++) {
        await page.getByLabel("Native input", { exact: true }).fill(`edit-${i}`);
        await page.waitForTimeout(80);
      }
      const measurement = await collecting;
      assert.equal(measurement.after.mode, gpu ? "gpu" : "dom", measurement.after.reason);
      assert.equal(measurement.after.commits - before.commits, 10);
      await page.locator("#measurement-input").evaluate(node => node.blur());
      await page.evaluate(() => window.measurement.settle());
      const rendered = PNG.sync.read(await page.locator("#frame").screenshot({ path: `${directory}/input-${gpu}-${dpr}.png` }));
      await page.evaluate(() => window.measurement.disable());
      const dom = PNG.sync.read(await page.locator("#frame").screenshot({ path: `${directory}/input-${gpu}-${dpr}-dom.png` }));
      const rasterBytes = rendered.data.reduce((n, value, i) => n + Number(value !== dom.data[i]), 0);
      if (dpr === 1) assert.equal(rasterBytes, 0);
      const window = await finishWindow(page);
      const retired = await page.evaluate(() => window.measurement.dispose()); zero(retired);
      report.runs.push({ workload: "edit-heavy-input", dpr, gpu, before, measurement, window, rasterBytes, retired, errors });
      assert.deepEqual(errors, []); await save();

      await page.goto(`${url}/integration.html?dom${automatic ? "&auto" : ""}`);
      await ready(page, "integrationProbe", gpu);
      await page.locator("#name").fill("retained");
      await page.evaluate(() => { window.originalInput = document.querySelector("#name"); window.originalRoot = document.querySelector(".app-container"); });
      await monitor(page, "integrationProbe");
      const structural = [];
      for (const operation of ["add", "reorder", "move", "resize", "frame"]) {
        const started = await page.evaluate(() => performance.now());
        await page.evaluate(operation => {
          const p = window.integrationProbe;
          if (operation === "add") p.extra(1);
          if (operation === "reorder") p.reorder();
          if (operation === "move") p.layout({ left: 50 });
          if (operation === "resize") p.layout({ left: 50, width: 310 });
          if (operation === "frame") document.querySelector("#frame").style.width = "660px";
        }, operation);
        if (gpu && !automatic) {
          await page.waitForFunction(() => {
            const s = window.integrationProbe.state();
            return s.mode === "dom" && !s.initializing && !s.transitioning && s.resources.engines === 0;
          });
          const admitted = await page.evaluate(() => window.integrationProbe.enable());
          assert.equal(admitted.mode, "gpu", admitted.reason);
        } else if (gpu) {
          await page.waitForFunction(() => {
            const s = window.integrationProbe.state();
            return s.mode === "gpu" && !s.initializing && !s.transitioning && !s.admission.pending
              && document.querySelector("#output").width === document.querySelector("#frame").clientWidth * devicePixelRatio;
          });
        }
        await page.locator("#save").click();
        assert.equal(await page.locator("#saved").textContent(), "retained");
        const observation = await page.evaluate(started => ({
          durationMs: performance.now() - started, state: window.integrationProbe.state(),
          sameInput: window.originalInput === document.querySelector("#name"), sameRoot: window.originalRoot === document.querySelector(".app-container"),
          value: document.querySelector("#name").value,
        }), started);
        assert.ok(observation.sameInput && observation.sameRoot);
        structural.push({ operation, ...observation });
      }
      if (automatic && gpu) {
        const started = await page.evaluate(() => performance.now());
        await page.evaluate(async () => {
          const p = window.integrationProbe;
          window.burstMotion = p.transition({ keyframes: [{ offset: 0 }, { offset: 1, x: 5 }], timing: { duration: 60000 } });
          for (let i = 0; i < 12; i++) {
            p.layout({ left: 50 + i % 2, width: 310 + i % 2 });
            p.extra(i % 3); p.reorder();
            await new Promise(resolve => requestAnimationFrame(resolve));
          }
        });
        await page.waitForFunction(() => window.integrationProbe.state().mode === "gpu"
          && !window.integrationProbe.state().admission.pending);
        await page.locator("#save").click(); assert.equal(await page.locator("#saved").textContent(), "retained");
        const observation = await page.evaluate(started => ({
          durationMs: performance.now() - started, state: window.integrationProbe.state(),
          sameInput: window.originalInput === document.querySelector("#name"), sameRoot: window.originalRoot === document.querySelector(".app-container"),
        }), started);
        assert.ok(observation.sameInput && observation.sameRoot);
        const motion = await page.evaluate(() => window.burstMotion.finished); assert.equal(motion.status, "cancelled");
        structural.push({ operation: "12-frame-structural-burst-during-motion", motion, ...observation });
      }
      const structuralWindow = await finishWindow(page);
      const structuralRetired = await page.evaluate(() => window.integrationProbe.dispose()); zero(structuralRetired);
      report.runs.push({ workload: "structural-resizing", dpr, gpu, structural, window: structuralWindow, retired: structuralRetired, errors });
      assert.deepEqual(errors, []); await save();

      await page.goto(`${url}/todo.html`);
      await ready(page, "todoProbe", gpu);
      await monitor(page, "todoProbe");
      const taskBefore = await page.evaluate(() => window.todoProbe.state());
      for (let i = 0; i < 3; i++) {
        await page.getByLabel("New task", { exact: true }).fill(`Task ${i}`);
        await page.getByLabel("New task", { exact: true }).press("Enter");
        const id = i + 3;
        await page.getByLabel(`Task ${id} title`, { exact: true }).fill(`Edited ${i}`);
        await page.getByLabel(`Task ${id} title`, { exact: true }).press("Enter");
        await page.getByLabel(`Complete task ${id}`, { exact: true }).click();
        assert.equal(await page.getByLabel(`Complete task ${id}`, { exact: true }).isChecked(), true);
        await page.getByLabel(`Delete task ${id}`, { exact: true }).click();
      }
      assert.equal(await page.getByRole("listitem").count(), 2);
      const taskWindow = await finishWindow(page);
      const taskAfter = await page.evaluate(() => window.todoProbe.state());
      const latency = await taskPixelLatency(page, dpr, gpu, 3);
      const taskRetired = await page.evaluate(() => window.todoProbe.dispose()); zero(taskRetired);
      report.runs.push({ workload: "todo-native-actions", dpr, gpu, before: taskBefore, after: taskAfter, window: taskWindow, latency,
        latencyMethod: "Three checkbox event-to-changed-row screenshot polls outside performance windows; existing shared 100*dpr*dpr changed-pixel criterion, not physical latency",
        retired: taskRetired, errors });
      assert.deepEqual(errors, []); await save();

      await page.goto(`${url}/runtime.html?dom&scroll`);
      await page.waitForFunction(() => window.runtimeProbe);
      const refused = await page.evaluate(() => window.runtimeProbe.enable());
      assert.equal(refused.mode, "dom"); assert.match(refused.reason, /Clipped\/scroll/);
      await page.locator("#scroller").evaluate(node => { node.scrollTop = 100; });
      assert.equal(await page.locator("#scroller").evaluate(node => node.scrollTop), 100);
      const scrollRetired = await page.evaluate(() => window.runtimeProbe.dispose()); zero(scrollRetired);
      report.runs.push({ workload: "native-scroll-refusal", dpr, gpuRequested: true, refused, scrollTop: 100, retired: scrollRetired });
      await save();
    } finally { await context.close(); }
  }
  report.status = "passed"; await save();
} catch (error) { report.status = "failed"; report.failure = String(error); await save(); throw error; }
finally {
  if (browser) await browser.close();
  if (server.exitCode === null && server.signalCode === null) server.kill("SIGTERM");
  await closed;
  await writeFile(`${directory}/preview.log`, serverOutput);
  await import("./sanitize-evidence.mjs");
}
