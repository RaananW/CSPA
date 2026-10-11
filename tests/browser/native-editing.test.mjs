import { test, expect } from "../helpers/current-browser.mjs";
import { mkdir, writeFile } from "node:fs/promises";
import { PNG } from "pngjs";
import { evidenceDirectory } from "../helpers/evidence.mjs";

const directory = evidenceDirectory("native-editing");
const state = page => page.evaluate(() => window.runtimeProbe.state());
async function save(name, data) {
  await mkdir(directory, { recursive: true });
  await writeFile(`${directory}/${name}.json`, JSON.stringify(data, null, 2));
}
async function ready(page, query = "") {
  await page.goto(`/runtime.html?strict${query}`);
  await page.waitForFunction(() => window.runtimeProbe && !window.runtimeProbe.state().initializing);
  expect((await state(page)).mode).toBe(query.includes("&dom") ? "dom" : "gpu");
  await page.evaluate(() => {
    window.editingEvents = [];
    document.querySelector(".app-container").addEventListener("scroll", event => {
      const target = event.target;
      window.editingEvents.push({ trusted: event.isTrusted, id: target.id, tag: target.tagName,
        left: target.scrollLeft, top: target.scrollTop, width: target.clientWidth, height: target.clientHeight,
        scrollWidth: target.scrollWidth, scrollHeight: target.scrollHeight,
        mode: window.runtimeProbe.state().mode,
        path: event.composedPath().filter(node => node instanceof Element).map(node => node.id || node.tagName) });
    }, true);
  });
}
async function metadata(page) {
  const cdp = await page.context().newCDPSession(page);
  const result = { identity: await cdp.send("Browser.getVersion"), launch: await cdp.send("Browser.getBrowserCommandLine") };
  await cdp.detach();
  return result;
}
async function image(page, selector, name) {
  const bytes = await page.locator(selector).screenshot({ animations: "allow" });
  await mkdir(directory, { recursive: true });
  await writeFile(`${directory}/${name}.png`, bytes);
  return PNG.sync.read(bytes);
}
function difference(a, b) {
  expect([a.width, a.height]).toEqual([b.width, b.height]);
  let changed = 0, total = 0;
  for (let index = 0; index < a.data.length; index += 4) {
    const error = Math.abs(a.data[index] - b.data[index]) + Math.abs(a.data[index + 1] - b.data[index + 1])
      + Math.abs(a.data[index + 2] - b.data[index + 2]);
    if (error > 30) changed++;
    total += error;
  }
  return { changedPixels: changed, meanChannelError: total / (a.width * a.height * 3) };
}
async function observe(page, selector) {
  return page.locator(selector).evaluate(node => ({
    original: node === window.originalEditor, value: node.value, selection: [node.selectionStart, node.selectionEnd],
    focused: document.activeElement === node, left: node.scrollLeft, top: node.scrollTop,
    rect: node.getBoundingClientRect().toJSON(),
    hit: (() => { const r = node.getBoundingClientRect(); return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) === node; })(),
    state: window.runtimeProbe.state(), events: window.editingEvents,
  }));
}
async function motion(page) {
  await page.keyboard.press("Tab");
  await page.waitForTimeout(100);
  await page.evaluate(() => window.runtimeProbe.settle());
  const result = await page.evaluate(() => window.runtimeProbe.animate({ x: 5 }, 30));
  expect(result.after.mode).toBe("gpu");
  expect(result.after.commits.count).toBe(result.before.commits.count);
  for (const key of ["captures", "uploads", "pixelReadbacks"]) expect(result.after.metrics[key]).toBe(result.before.metrics[key]);
  expect(result.after.metrics.gpuFrames - result.before.metrics.gpuFrames).toBe(30);
  return result;
}
async function dispose(page) {
  const result = await page.evaluate(() => window.runtimeProbe.dispose());
  expect(Object.values(result.resources).every(value => value === 0)).toBe(true);
}

for (const dpr of [1, 2]) {
  for (const kind of ["input", "textarea"]) test(`trusted ${kind} internal caret scrolling retains fresh native GPU content DPR${dpr}`, async ({ browser }) => {
    const page = await browser.newPage({ deviceScaleFactor: dpr });
    const dom = await browser.newPage({ deviceScaleFactor: dpr });
    const selector = kind === "input" ? "#controlled" : "#editor";
    const query = kind === "input" ? "" : "&editing";
    const value = kind === "input" ? "fresh independent native"
      : ["FIRST long line ".repeat(4), "middle second line", "middle third line", "LAST visible tail ".repeat(5)].join("\n");
    const type = async target => {
      await target.locator(selector).click();
      await target.keyboard.press("Meta+a");
      for (const [index, line] of value.split("\n").entries()) {
        if (index) await target.keyboard.press("Enter");
        await target.keyboard.type(line);
      }
    };
    try {
      await ready(page, query);
      const environment = await metadata(page);
      await page.locator(selector).evaluate(node => { window.originalEditor = node; });
      if (kind === "input") {
        await page.locator(selector).click(); await page.keyboard.press("Meta+a"); await page.keyboard.type("independent");
        expect((await state(page)).mode).toBe("gpu");
      }
      const before = await state(page);
      await type(page);
      await page.evaluate(() => window.runtimeProbe.settle());
      const end = await observe(page, selector);
      expect(end.state.mode, end.state.reason).toBe("gpu");
      expect(end.original && end.focused && end.hit).toBe(true);
      expect(end.value).toBe(value); expect(end.selection).toEqual([value.length, value.length]);
      expect(end.left).toBeGreaterThan(0);
      if (kind === "textarea") expect(end.top).toBeGreaterThan(0);
      expect(end.events.some(event => event.id === selector.slice(1) && event.trusted && event.left > 0)).toBe(true);
      expect(end.events.every(event => event.mode === "gpu")).toBe(true);
      expect(end.state.metrics.uploads).toBeGreaterThan(before.metrics.uploads);
      const tail = await image(page, selector, `${kind}-${dpr}-gpu-tail`);
      await ready(dom, `${query}&dom`); await type(dom);
      const nativeTail = await image(dom, selector, `${kind}-${dpr}-ordinary-tail`);
      const reference = difference(tail, nativeTail);
      expect(reference.meanChannelError).toBeLessThan(8);
      // Only trusted caret navigation changes this image: no React value/geometry update.
      const beforeHome = await state(page);
      await page.keyboard.press(kind === "input" ? "Home" : "Meta+ArrowUp");
      await page.evaluate(() => window.runtimeProbe.settle());
      const start = await observe(page, selector);
      expect(start.state.mode).toBe("gpu"); expect(start.original && start.focused && start.hit).toBe(true);
      expect(start.value).toBe(value); expect(start.selection).toEqual([0, 0]);
      expect(start.left).toBe(0);
      if (kind === "input") expect(start.top).toBe(0);
      else { expect(start.top).toBeLessThan(end.top); expect(start.top).toBeLessThanOrEqual(2); }
      expect(start.state.commits.count).toBe(beforeHome.commits.count);
      expect(start.state.metrics.uploads).toBeGreaterThan(beforeHome.metrics.uploads);
      const head = await image(page, selector, `${kind}-${dpr}-gpu-head`);
      const freshness = difference(tail, head);
      expect(freshness.changedPixels).toBeGreaterThan(20 * dpr);
      const animated = await motion(page);
      await page.locator("#count").click(); await expect(page.locator("#count")).toHaveText("Count 1");
      await save(`${kind}-${dpr}`, { environment, before, end, start, reference, freshness, animated,
        limitation: "Trusted native keyboard/scroll and decoded GPU/ordinary-DOM images; not OS IME, physical refresh or universal text equivalence" });
      await dispose(page); await dispose(dom);
    } finally { await page.close(); await dom.close(); }
  });

  test(`bounded descendant viewport refreshes native pixels and current hits DPR${dpr}`, async ({ browser }) => {
    const page = await browser.newPage({ deviceScaleFactor: dpr });
    try {
      await ready(page, "&editing");
      const environment = await metadata(page), before = await state(page);
      const head = await image(page, "#native-viewport", `viewport-${dpr}-head`);
      await page.locator("#native-viewport").hover(); await page.mouse.wheel(0, 180);
      await expect.poll(() => page.locator("#native-viewport").evaluate(node => node.scrollTop)).toBeGreaterThan(0);
      await page.evaluate(() => window.runtimeProbe.settle());
      const after = await state(page);
      expect(after.mode, after.reason).toBe("gpu");
      expect(after.metrics.uploads).toBeGreaterThan(before.metrics.uploads);
      expect(after.layers.find(layer => layer.id === "primary").matrix).toEqual(before.layers.find(layer => layer.id === "primary").matrix);
      const tail = await image(page, "#native-viewport", `viewport-${dpr}-tail`);
      expect(difference(head, tail).changedPixels).toBeGreaterThan(1000 * dpr);
      await page.locator("#viewport-control").click(); await expect(page.locator("#viewport-control")).toHaveText("Viewport count 1");
      const events = await page.evaluate(() => window.editingEvents);
      expect(events.some(event => event.id === "native-viewport" && event.trusted && event.top > 0 && event.mode === "gpu")).toBe(true);
      await save(`viewport-${dpr}`, { environment, before, after, events,
        qualification: "Unmarked bounded descendant viewport captured/clipped natively inside unchanged enrolled boundary; enrolled/root scrolling and authored NativeScroll policy remain separate framework gaps" });
      await dispose(page);
    } finally { await page.close(); }
  });
}

test("eligible composition events refresh without cancelling existing GPU motion ownership", async ({ page }) => {
  await page.goto("/integration.html?dom");
  await page.waitForFunction(() => window.integrationProbe);
  await page.evaluate(() => window.integrationProbe.enable());
  const result = await page.evaluate(async () => {
    const input = document.querySelector("#name");
    input.focus();
    const transition = window.integrationProbe.transition({
      keyframes: [{ offset: 0 }, { offset: 1, x: 5 }], timing: { duration: 60000 },
    });
    const observed = [];
    for (const type of ["compositionstart", "compositionupdate", "compositionend"]) {
      input.addEventListener(type, event => observed.push({ type: event.type, data: event.data, trusted: event.isTrusted }));
      input.dispatchEvent(new CompositionEvent(type, { bubbles: true, data: "synthetic-contract-only" }));
    }
    await window.integrationProbe.settle();
    const state = window.integrationProbe.state();
    transition.cancel();
    return { observed, state, outcome: await transition.finished,
      original: input === document.querySelector("#name"), focused: document.activeElement === input };
  });
  expect(result.state.mode).toBe("gpu");
  expect(result.state.runtimeResources.declarativeMotions).toBe(1);
  expect(result.outcome.status).toBe("cancelled");
  expect(result.original && result.focused).toBe(true);
  expect(result.observed.map(event => event.type)).toEqual(["compositionstart", "compositionupdate", "compositionend"]);
  expect(result.observed.every(event => !event.trusted)).toBe(true);
  await save("composition-contract", { ...result, limitation: "Synthetic listener/refresh contract ONLY; manual OS IME/candidate-window certification remains open" });
  const retired = await page.evaluate(() => window.integrationProbe.dispose());
  expect(Object.values(retired.resources).every(value => value === 0)).toBe(true);
});
