import { chromium } from "@playwright/test";
import { test, expect } from "./current-browser.mjs";
import { developmentURL, previewURL } from "./urls.mjs";
import { mkdir, writeFile, stat, utimes } from "node:fs/promises";
import { PNG } from "pngjs";

test.use({ viewport: { width: 900, height: 950 } });
import { evidenceDirectory } from "./evidence.mjs";
const directory = evidenceDirectory("todo");
async function save(name, data) {
  await mkdir(directory, { recursive: true });
  await writeFile(`${directory}/${name}.json`, JSON.stringify(data, null, 2));
}
async function ready(page, strict = false) {
  await page.goto(`${strict ? developmentURL : ""}/todo.html${strict ? "?strict" : ""}`);
  await page.waitForFunction(() => window.todoProbe && document.getElementById("new-task"));
}
function zero(state) {
  expect(Object.values(state.resources).every(value => value === 0)).toBe(true);
  expect(Object.values(state.runtimeResources).every(value => value === 0)).toBe(true);
  expect(state.transition.timers).toBe(0);
  expect(state.demoListeners).toBe(0);
}
async function add(page, title) {
  await page.getByLabel("New task", { exact: true }).fill(title);
  await page.getByLabel("New task", { exact: true }).press("Enter");
}
async function pixels(page, name) {
  await mkdir(directory, { recursive: true });
  return PNG.sync.read(await page.locator("#frame").screenshot({ path: `${directory}/${name}.png` }));
}
function differences(a, b, x, y, width, height) {
  let changed = 0;
  for (let row = y; row < y + height; row++) for (let col = x; col < x + width; col++) {
    const offset = (row * a.width + col) * 4;
    if ([0, 1, 2, 3].some(channel => a.data[offset + channel] !== b.data[offset + channel])) changed++;
  }
  return changed;
}

test("TODO app without experimental flags retains a useful real native workflow", async () => {
  const browser = await chromium.launch({ executablePath: process.env.CANVAS_BROWSER_EXECUTABLE ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    args: ["--enable-automation", "--disable-blink-features=CanvasDrawElement,ElementCanvasTransform"] });
  try {
    const page = await browser.newPage({ viewport: { width: 900, height: 750 } });
    await page.goto(`${previewURL}/todo.html`);
    await page.waitForFunction(() => window.todoProbe);
    await expect(page.locator("#diagnostic-details")).toHaveJSProperty("open", false);
    const inputBounds = await page.getByLabel("New task", { exact: true }).boundingBox();
    expect(inputBounds.y + inputBounds.height).toBeLessThan(750);
    const diagnostics = { inputBounds, status: await page.locator("#status").innerText(),
      statusBounds: await page.locator("#status").boundingBox() };
    expect(diagnostics.statusBounds.height).toBeLessThan(100);
    await page.locator("#diagnostic-details summary").click();
    await expect(page.locator("#ledger")).toContainText('"resources"');
    await page.locator("#diagnostic-details summary").click();
    const cdp = await page.context().newCDPSession(page);
    const environment = { browser: await cdp.send("Browser.getVersion"), launch: await cdp.send("Browser.getBrowserCommandLine") };
    await cdp.detach();
    await add(page, "Ordinary DOM task");
    await page.getByLabel("Complete task 3", { exact: true }).focus();
    await page.keyboard.press("Space");
    await expect(page.getByLabel("Complete task 3", { exact: true })).toBeChecked();
    await page.getByLabel("Task 3 title", { exact: true }).fill("Edited without GPU");
    await page.getByLabel("Task 3 title", { exact: true }).press("Enter");
    await page.getByRole("button", { name: "Completed", exact: true }).click();
    await expect(page.getByRole("listitem")).toHaveCount(1);
    await page.getByRole("button", { name: "Enable GPU", exact: true }).click();
    await page.waitForFunction(() => !window.todoProbe.state().initializing && window.todoProbe.state().mode === "dom");
    const refused = await page.evaluate(() => window.todoProbe.state());
    expect(refused.reason).toContain("requestPaint");
    expect(refused.reason).toContain("canvas.content");
    await expect(page.locator("#status")).toContainText(refused.reason);
    await expect(page.getByLabel("Task 3 title", { exact: true })).toHaveValue("Edited without GPU");
    await page.getByLabel("Delete task 3", { exact: true }).click();
    await expect(page.getByRole("listitem")).toHaveCount(0);
    const disposed = await page.evaluate(() => window.todoProbe.dispose());
    zero(disposed);
    await save("ordinary-no-flags", { environment, diagnostics, refused, disposed });
  } finally { await browser.close(); }
});

for (const strict of [false, true]) test(`TODO GPU workflows preserve original native state through DOM recovery strict=${strict}`, async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await ready(page, strict);
  await page.evaluate(() => {
    window.originalRoot = window.todoProbe.controller().container;
    window.originalInput = document.getElementById("new-task");
  });
  await page.getByRole("button", { name: "Enable GPU", exact: true }).click();
  await page.waitForFunction(() => window.todoProbe.state().mode === "gpu");
  await add(page, "GPU native task");
  await page.getByLabel("Complete task 3", { exact: true }).focus();
  await page.keyboard.press("Space");
  await expect(page.getByLabel("Complete task 3", { exact: true })).toBeChecked();
  await page.getByLabel("Task 3 title", { exact: true }).fill("Edited by native input");
  await page.getByLabel("Task 3 title", { exact: true }).press("Enter");
  await expect(page.locator("#task-message")).toContainText("Title confirmed");
  await page.getByRole("button", { name: "Completed", exact: true }).click();
  await expect(page.getByRole("listitem")).toHaveCount(1);
  const active = await page.evaluate(() => window.todoProbe.state());
  expect(active.mode).toBe("gpu");
  expect(active.resources.engines).toBe(1);
  expect(active.layers).toHaveLength(2);
  const input = page.getByLabel("Task 3 title", { exact: true });
  await input.click();
  await input.press("Home");
  await input.press("Shift+ArrowRight");
  const before = await input.evaluate(element => ({ start: element.selectionStart, end: element.selectionEnd }));
  await page.evaluate(() => window.todoProbe.controller().disable());
  await page.waitForFunction(() => window.todoProbe.state().mode === "dom");
  const continuity = await page.evaluate(() => ({
    sameRoot: window.originalRoot === window.todoProbe.controller().container,
    sameInput: window.originalInput === document.getElementById("new-task"),
    focus: document.activeElement?.getAttribute("aria-label"),
    selection: { start: document.activeElement.selectionStart, end: document.activeElement.selectionEnd },
  }));
  expect(continuity.sameRoot && continuity.sameInput).toBe(true);
  expect(continuity.focus).toBe("Task 3 title");
  expect(continuity.selection).toEqual(before);
  await expect(input).toHaveValue("Edited by native input");
  await page.getByLabel("Delete task 3", { exact: true }).click();
  await page.getByRole("button", { name: "All", exact: true }).click();
  await expect(page.getByRole("listitem")).toHaveCount(2);
  const disposed = await page.evaluate(() => window.todoProbe.dispose());
  zero(disposed);
  expect(errors).toEqual([]);
  await save(`workflow-${strict}`, { active, continuity, disposed, errors });
});

test("real task action produces decorative pixels and a settled shader-only interval", async ({ page }) => {
  await ready(page);
  await page.getByRole("button", { name: "Enable GPU", exact: true }).click();
  await page.waitForFunction(() => window.todoProbe.state().mode === "gpu");
  const identity = await pixels(page, "identity");
  await page.getByLabel("Complete task 1", { exact: true }).click();
  await page.waitForFunction(() => window.todoProbe.state().transition.lastEvent?.kind === "completed");
  const triggered = await page.evaluate(() => window.todoProbe.state());
  expect(triggered.transition.timers).toBe(1);
  expect(triggered.decorativeEffects[0].playing).toBe(true);
  await page.evaluate(() => window.todoProbe.holdEffect(0));
  await page.getByRole("heading", { level: 1 }).click();
  await page.evaluate(() => window.todoProbe.controller().settle());
  const phase0 = await pixels(page, "task-phase-0");
  const geometry0 = await page.evaluate(() => window.todoProbe.state().layers);
  await page.evaluate(() => window.todoProbe.holdEffect(0.7));
  const phase7 = await pixels(page, "task-phase-07");
  expect(differences(identity, phase0, 460, 90, 280, 360)).toBeGreaterThan(1000);
  expect(differences(phase0, phase7, 460, 90, 280, 360)).toBeGreaterThan(1000);
  expect(differences(phase0, phase7, 20, 20, 420, 660)).toBe(0);
  expect(await page.evaluate(() => window.todoProbe.state().layers)).toEqual(geometry0);
  const interval = await page.evaluate(() => window.todoProbe.advance(300, 1));
  expect(interval.after.metrics.gpuFrames - interval.before.metrics.gpuFrames).toBe(300);
  expect(interval.after.commits.count).toBe(interval.before.commits.count);
  for (const field of ["captures", "pixelCopies", "pixelReadbacks", "uploads"]) {
    expect(interval.after.metrics[field]).toBe(interval.before.metrics[field]);
  }
  expect(interval.after.metrics.admission).toEqual(interval.before.metrics.admission);
  await page.getByLabel("Complete task 1", { exact: true }).click();
  await page.waitForFunction(() => window.todoProbe.state().transition.lastEvent?.kind === "reopened");
  await page.waitForFunction(() => window.todoProbe.state().transition.timers === 0 && window.todoProbe.state().decorativeEffects.length === 0);
  await page.evaluate(() => window.todoProbe.controller().settle());
  const finished = await pixels(page, "natural-finish");
  expect(differences(identity, finished, 460, 90, 280, 360)).toBe(0);
  const disposed = await page.evaluate(() => window.todoProbe.dispose());
  zero(disposed);
  await save("task-transition", { fixture: "real checkbox action; diagnostic timer hold/deterministic phases and 300 real RAFs at 1ms; subsequent real action ends naturally after 900ms",
    triggered, geometry0, changed: [differences(identity, phase0, 460, 90, 280, 360), differences(phase0, phase7, 460, 90, 280, 360)], interval, disposed });
});

test("capture failure and continuous viewport reconciliation preserve TODO edits", async ({ page }) => {
  await ready(page);
  await page.getByRole("button", { name: "Enable GPU", exact: true }).click();
  await page.waitForFunction(() => window.todoProbe.state().mode === "gpu");
  await page.evaluate(() => {
    window.originalCapture = GPUQueue.prototype.drawElementImageToTexture;
    GPUQueue.prototype.drawElementImageToTexture = () => { throw new Error("TODO diagnostic capture failure"); };
    window.taskInput = document.querySelector('[aria-label="Task 1 title"]');
    window.taskRoot = window.todoProbe.controller().container;
  });
  await page.getByLabel("Task 1 title", { exact: true }).fill("Survives capture failure");
  await page.waitForFunction(() => window.todoProbe.state().mode === "dom");
  const failure = await page.evaluate(() => window.todoProbe.state());
  expect(failure.reason).toContain("TODO diagnostic capture failure");
  await expect(page.getByLabel("Task 1 title", { exact: true })).toHaveValue("Survives capture failure");
  expect(await page.evaluate(() => window.taskInput === document.querySelector('[aria-label="Task 1 title"]') && window.taskRoot === window.todoProbe.controller().container)).toBe(true);
  await page.evaluate(() => { GPUQueue.prototype.drawElementImageToTexture = window.originalCapture; });
  await page.getByRole("button", { name: "Enable GPU", exact: true }).click();
  await page.waitForFunction(() => window.todoProbe.state().mode === "gpu");
  await page.setViewportSize({ width: 800, height: 980 });
  await page.evaluate(() => window.todoProbe.controller().settle());
  const resized = await page.evaluate(() => window.todoProbe.state());
  expect(resized.mode).toBe("gpu");
  expect(resized.resources.engines).toBe(1);
  expect(await page.evaluate(() => window.taskInput === document.querySelector('[aria-label="Task 1 title"]')
    && window.taskRoot === window.todoProbe.controller().container)).toBe(true);
  await add(page, "After fresh admission");
  await expect(page.getByRole("listitem")).toHaveCount(3);
  const disposed = await page.evaluate(() => window.todoProbe.dispose());
  zero(disposed);
  await save("fallback-reentry", { fixture: "synthetic capture exception and explicit reentry; subsequent real viewport resize remains GPU", failure, resized, disposed });
});

test("six-task capacity stays one engine/two layers and rejects extra tasks explicitly", async ({ page }) => {
  await ready(page);
  await page.getByRole("button", { name: "Enable GPU", exact: true }).click();
  await page.waitForFunction(() => window.todoProbe.state().mode === "gpu");
  for (let index = 3; index <= 6; index++) await add(page, `Bounded task ${index}`);
  await expect(page.getByRole("listitem")).toHaveCount(6);
  await add(page, "One too many");
  await expect(page.locator("#task-message")).toContainText("six tasks");
  await expect(page.getByRole("listitem")).toHaveCount(6);
  const active = await page.evaluate(() => window.todoProbe.state());
  expect(active.mode).toBe("gpu");
  expect(active.resources.engines).toBe(1);
  expect(active.layers).toHaveLength(2);
  const disposed = await page.evaluate(() => window.todoProbe.dispose());
  zero(disposed);
  await save("capacity", { active, disposed });
});

test("TODO development HMR retires active transition timers and old GPU resources", async ({ page }) => {
  await ready(page, true);
  await page.getByRole("button", { name: "Enable GPU", exact: true }).click();
  await page.waitForFunction(() => window.todoProbe.state().mode === "gpu");
  await page.getByLabel("Complete task 1", { exact: true }).click();
  await page.waitForFunction(() => window.todoProbe.state().transition.timers === 1);
  await page.evaluate(() => { window.oldTodoProbe = window.todoProbe; });
  const path = "src/demo/todo-demo.tsx", original = await stat(path);
  try {
    await utimes(path, original.atime, new Date());
    await page.waitForFunction(() => window.todoProbe !== window.oldTodoProbe && document.getElementById("new-task"));
    const retired = await page.evaluate(() => window.oldTodoProbe.state());
    zero(retired);
    await expect(page.getByLabel("Complete task 1", { exact: true })).not.toBeChecked();
    await add(page, "After HMR");
    await expect(page.getByRole("listitem")).toHaveCount(3);
    const disposed = await page.evaluate(() => window.todoProbe.dispose());
    zero(disposed);
    await save("hmr", { fixture: "real timestamp-only Vite replacement; HMR intentionally creates a new root and resets task state", retired, disposed });
  } finally { await utimes(path, original.atime, original.mtime); }
});
