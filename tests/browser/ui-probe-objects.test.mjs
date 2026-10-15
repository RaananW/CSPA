/**
 * Strata Phase 0 probe P0.4 on `ui-probe-objects.html` (`window.objectsProbe`; see docs/ui-library/plan.md):
 * native controls drawn as 3D objects (a tapered key, a switch knob on a track, a slider puck on a rail) with PBR
 * materials and shadow maps on one Babylon Lite engine. At DPR 1 and 2 the test checks that:
 * - the captured panel keeps its exact colours (unlit, no tone mapping);
 * - native hits match the DOM layout, and no drawn key pixel lies outside the native button (taper > drift);
 * - pressing, switching, sliding and keyboard focus move the objects without a new capture;
 * - frame cost with 0 to 16,384 extra instanced meshes, with no capture.
 * Reports and screenshots go to the `ui-probes` evidence directory.
 */
import { test, expect } from "../helpers/current-browser.mjs";
import { evidenceDirectory } from "../helpers/evidence.mjs";
import { mkdir, writeFile } from "node:fs/promises";

const directory = evidenceDirectory("ui-probes");
const luminance = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
// Key pixels (blue top and navy sides) are strongly blue; the panel, its text and grey shadows are not.
const keyColoured = ([r, , b]) => b - r > 60;
/** Signed distance from a point to a rounded rectangle `{ x, y, width, height, radius }`, negative inside. */
function roundedDistance(point, box) {
  const radius = box.radius ?? 0;
  const qx = Math.abs(point.x - box.x - box.width / 2) - box.width / 2 + radius;
  const qy = Math.abs(point.y - box.y - box.height / 2) - box.height / 2 + radius;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - radius;
}
const close = (pixel, colour, tolerance) => colour.every((channel, c) => Math.abs(channel - pixel[c]) <= tolerance);

for (const dpr of [1, 2]) test(`P0.4 objects keep native hits inside their bases and move without capture DPR${dpr}`, async ({ browser }) => {
  test.setTimeout(240000);
  const context = await browser.newContext({ viewport: { width: 900, height: 750 }, deviceScaleFactor: dpr });
  const page = await context.newPage();
  await page.goto("/ui-probe-objects.html");
  await page.waitForFunction(() => window.objectsProbe);
  const error = await page.evaluate(async () => { try { await window.objectsProbe.ready; return null; } catch (failure) { return String(failure); } });
  expect(error, "probe must start: HTML-in-Canvas and WebGPU are required").toBeNull();
  const call = (name, ...args) => page.evaluate(async ({ name, args }) => (await window.objectsProbe.ready)[name](...args), { name, args });
  const settled = async (name, ...args) => { await call("settle"); return call(name, ...args); };
  const project = points => page.evaluate(async points => { const probe = await window.objectsProbe.ready; return points.map(point => probe.project(point)); }, points);
  const read = async points => settled("pixels", await project(points));
  const tokens = await call("tokens");
  const extent = await call("extent");
  const controls = await call("controls");
  const byId = Object.fromEntries(controls.map(control => [control.id, control]));
  const report = { dpr, tokens, controls };
  await mkdir(directory, { recursive: true });

  try {
    await call("settle");
    await page.screenshot({ path: `${directory}/objects-dpr${dpr}.png`, clip: await page.locator("#stage").boundingBox() });

    // The captured panel is drawn unlit with its exact colours.
    const [panel] = await read([{ x: 300, y: 30 }]);
    report.panel = panel;
    expect(close(panel, [233, 235, 239], 3), `panel colour ${panel}`).toBe(true);

    // Native hits follow the DOM layout.
    const grid = [];
    for (let y = -20; y < extent.height + 20; y += 4) for (let x = -20; x < extent.width + 20; x += 4) grid.push({ x, y });
    const hits = await page.evaluate(async clients => clients.map(client => {
      const element = document.elementFromPoint(client.x, client.y);
      return { id: element?.id ?? "", inFace: !!element && document.getElementById("face").contains(element) };
    }), await project(grid));
    const inside = (point, r, margin) => point.x > r.x + margin && point.x < r.x + r.width - margin && point.y > r.y + margin && point.y < r.y + r.height - margin;
    const misses = [];
    grid.forEach((point, index) => {
      const hit = hits[index];
      // Native hit testing follows border-radius: classify by rounded-box distance, 2 px clear of every edge.
      const control = controls.find(c => roundedDistance(point, c) < -2);
      const nearControl = controls.some(c => roundedDistance(point, c) < 2);
      if (!inside(point, { x: 0, y: 0, ...extent }, -2)) { if (hit.id !== "stage") misses.push({ point, hit, expected: "stage" }); }
      else if (control) { if (hit.id !== control.id) misses.push({ point, hit, expected: control.id }); }
      else if (!nearControl && inside(point, { x: 0, y: 0, ...extent }, 2) && (!hit.inFace || controls.some(c => c.id === hit.id))) misses.push({ point, hit, expected: "face" });
    });
    report.hits = { points: grid.length, missCount: misses.length, misses: misses.slice(0, 20) };
    expect(misses).toEqual([]);

    // Containment: just outside the native button, no pixel belongs to the key, and hits never land on it.
    const key = byId.launch;
    report.drift = { keyHeight: tokens.keyHeight, drift: await call("drift", tokens.keyHeight), taper: tokens.taper };
    expect(report.drift.drift, "taper covers the perspective drift").toBeLessThan(tokens.taper);
    const ring = [];
    for (const out of [1.5, 3, 5]) {
      for (let x = key.x; x <= key.x + key.width; x += 2) ring.push({ x, y: key.y - out }, { x, y: key.y + key.height + out });
      for (let y = key.y; y <= key.y + key.height; y += 2) ring.push({ x: key.x - out, y }, { x: key.x + key.width + out, y });
    }
    const ringPixels = await read(ring);
    const ringHits = await call("hits", await project(ring));
    const escaped = ring.filter((_, index) => keyColoured(ringPixels[index]));
    report.containment = { points: ring.length, escaped: escaped.slice(0, 20), escapedCount: escaped.length, hitOnKey: ringHits.filter(hit => hit === "launch").length };
    expect(escaped, "drawn key pixels outside the native button").toEqual([]);
    expect(report.containment.hitOnKey).toBe(0);
    const [keyTop] = await read([{ x: key.x + tokens.taper + 4, y: key.y + tokens.taper + 4 }]);
    expect(keyColoured(keyTop), `key top drawn inside its base ${keyTop}`).toBe(true);

    // Press: the key travels and its cast shadow shortens, with no capture.
    const shadowPoint = { x: key.x + key.width + 2, y: key.y + key.height / 2 };
    const [centre] = await project([{ x: key.x + key.width / 2, y: key.y + key.height / 2 }]);
    await page.mouse.move(centre.x, centre.y);
    const rest = { shadow: (await read([shadowPoint]))[0], counts: await call("counts") };
    await page.mouse.down();
    const pressed = { shadow: (await read([shadowPoint]))[0], state: await call("state"), counts: await call("counts") };
    await page.mouse.up();
    report.press = { rest, pressed };
    expect(pressed.state.keyDepth).toBe(tokens.keyTravel);
    expect(luminance(pressed.shadow), "pressed key casts a shorter shadow").toBeGreaterThan(luminance(rest.shadow) + 5);
    expect(pressed.counts.uploads - rest.counts.uploads, "press needs no capture").toBe(0);

    // Switch: a real click toggles the native checkbox and slides the knob.
    const power = byId.power;
    const onSpot = { x: power.x + power.width - power.height / 2, y: power.y + power.height / 2 };
    const before = { pixel: (await read([onSpot]))[0], counts: await call("counts") };
    const [powerCentre] = await project([{ x: power.x + power.width / 2, y: power.y + power.height / 2 }]);
    await page.mouse.click(powerCentre.x, powerCentre.y);
    const after = { pixel: (await read([onSpot]))[0], state: await call("state"), counts: await call("counts") };
    report.switch = { before, after };
    expect(after.state.checked).toBe(true);
    expect(Math.abs(luminance(after.pixel) - luminance(before.pixel)), "knob drawn at the on position").toBeGreaterThan(20);

    // Slider: a real click sets the native value and the puck follows; arrow keys move it again.
    const level = byId.level;
    const thumb = level.height, at = fraction => ({ x: level.x + thumb / 2 + fraction * (level.width - thumb), y: level.y + level.height / 2 });
    const [eighty] = await project([at(0.8)]);
    await page.mouse.click(eighty.x, eighty.y);
    const slidPixel = (await read([at(0.8)]))[0];
    const slid = { state: await call("state"), pixel: slidPixel };
    expect(Math.abs(slid.state.value - 80)).toBeLessThanOrEqual(2);
    expect(Math.abs(slid.state.puck - slid.state.value / 100)).toBeLessThan(0.01);
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    const stepped = await settled("state");
    report.slider = { slid, stepped };
    expect(stepped.value).toBe(slid.state.value - 2);
    expect(after.counts.uploads, "switching needs no capture").toBe(before.counts.uploads);

    // Keyboard focus lights the focused object.
    await page.mouse.click(5, 5);
    const knobSpot = { x: power.x + power.width - power.height / 2, y: power.y + power.height / 2 - 4 };
    const unfocused = (await read([knobSpot]))[0];
    for (let tries = 0; tries < 6 && await page.evaluate(() => document.activeElement?.id) !== "power"; tries++) await page.keyboard.press("Tab");
    expect(await page.evaluate(() => document.activeElement?.id)).toBe("power");
    const focused = (await read([knobSpot]))[0];
    report.focus = { unfocused, focused };
    expect(focused[2] - unfocused[2], "focus glow on the knob").toBeGreaterThan(15);

    // Cost: instanced extra meshes, 120 frames each, no capture.
    report.cost = [];
    for (const count of [0, 256, 1024, 4096, 16384]) {
      const result = await call("measure", count, 120);
      report.cost.push(result);
      expect(result.uploads, `${count} extra meshes: no capture`).toBe(0);
    }
    report.driftTable = [];
    for (const distance of [800, 1600, 2400, 4000]) {
      await call("setDistance", distance);
      const row = { distance };
      for (const height of [2, 4, 8, 12, 16]) row[height] = await call("drift", height);
      report.driftTable.push(row);
    }
  } finally {
    await writeFile(`${directory}/objects-dpr${dpr}.json`, JSON.stringify(report, null, 2));
    await context.close();
  }
});
