/**
 * Strata Phase 0 probes P0.2 (material pass), P0.3 (relief cost) and P0.5 (shadow outset) on
 * `ui-probe-relief.html` (`window.reliefProbe`; see docs/ui-library/plan.md). A panel of native controls is
 * lit by a colour-only pass over its capture. At DPR 1 and 2 the test checks that:
 * - the pass moves no pixel: inside each control the lit image is the unlit one times one brightness factor;
 * - text contrast on lit faces stays at least 4.5:1 and close to the unlit contrast;
 * - native hits match the DOM layout, and the panel's shadow outside its box is drawn but never hit;
 * - hover, press and keyboard focus change the drawn relief without a new capture, and typing does capture;
 * - the cost probe redraws 300 animated frames with 0 to 1,024 extra primitives and no capture.
 * Reports and screenshots go to the `ui-probes` evidence directory.
 */
import { test, expect } from "../helpers/current-browser.mjs";
import { evidenceDirectory } from "../helpers/evidence.mjs";
import { mkdir, writeFile } from "node:fs/promises";

const directory = evidenceDirectory("ui-probes");
const luminance = ([r, g, b]) => {
  const linear = value => { const c = value / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
};
const contrast = (a, b) => { const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (high + 0.05) / (low + 0.05); };
/** Signed distance from a point to a rounded rectangle `{ x, y, width, height, radius }`, negative inside. */
function roundedDistance(point, box) {
  const qx = Math.abs(point.x - box.x - box.width / 2) - box.width / 2 + box.radius;
  const qy = Math.abs(point.y - box.y - box.height / 2) - box.height / 2 + box.radius;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - box.radius;
}
const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

/** Text contrast in a region: the most common colour is the background, the pixel farthest from it is the text. */
function textContrast(pixels) {
  const key = pixel => pixel.slice(0, 3).join(",");
  const counts = new Map();
  for (const pixel of pixels) counts.set(key(pixel), (counts.get(key(pixel)) ?? 0) + 1);
  const background = [...counts].sort((a, b) => b[1] - a[1])[0][0].split(",").map(Number);
  return Math.max(...pixels.map(pixel => contrast(pixel, background)));
}

for (const dpr of [1, 2]) test(`P0.2/P0.3/P0.5 relief material pass keeps pixels, contrast and native hits DPR${dpr}`, async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 900, height: 750 }, deviceScaleFactor: dpr });
  const page = await context.newPage();
  await page.goto("/ui-probe-relief.html");
  await page.waitForFunction(() => window.reliefProbe);
  const error = await page.evaluate(async () => { try { await window.reliefProbe.ready; return null; } catch (failure) { return String(failure); } });
  expect(error, "probe must start: HTML-in-Canvas and WebGPU are required").toBeNull();
  const probe = (name, ...args) => page.evaluate(async ({ name, args }) => { const probe = await window.reliefProbe.ready; await probe.settle(); return probe[name](...args); }, { name, args });
  const extent = await probe("extent");
  const controls = await probe("controls");
  const tokens = await probe("tokens");
  const report = { dpr, tokens, controls };
  await mkdir(directory, { recursive: true });
  // The report is written even when a check fails, so a failure can be inspected.
  try {

    // Grid points over each control's interior, clear of its bevel, in face-local CSS pixels.
    const interior = control => {
      const inset = tokens.bevel + 3, points = [];
      for (let y = control.y + inset; y < control.y + control.height - inset; y += 1) for (let x = control.x + inset; x < control.x + control.width - inset; x += 1) points.push({ x, y });
      return points;
    };
    const project = points => page.evaluate(async points => { const probe = await window.reliefProbe.ready; return points.map(point => probe.project(point)); }, points);
    const read = async points => probe("pixels", await project(points));

    // P0.2: lit versus unlit, at the same moment, with no input in between.
    await probe("setMaterial", false);
    const unlit = {};
    for (const control of controls) unlit[control.id] = await read(interior(control));
    await page.screenshot({ path: `${directory}/relief-unlit-dpr${dpr}.png`, clip: await page.locator("#stage").boundingBox() });
    await probe("setMaterial", true);
    await page.screenshot({ path: `${directory}/relief-lit-dpr${dpr}.png`, clip: await page.locator("#stage").boundingBox() });
    report.material = [];
    for (const control of controls) {
      const lit = await read(interior(control));
      const ratios = [];
      lit.forEach((pixel, index) => { for (let c = 0; c < 3; c++) if (unlit[control.id][index][c] > 40) ratios.push(pixel[c] / unlit[control.id][index][c]); });
      const factor = median(ratios);
      // Every interior pixel is the unlit pixel times one factor, within rounding: nothing moved.
      const worst = Math.max(...lit.flatMap((pixel, index) => [0, 1, 2].map(c => Math.abs(pixel[c] - Math.min(255, unlit[control.id][index][c] * factor)))));
      const entry = { id: control.id, factor, worst, contrastUnlit: textContrast(unlit[control.id]), contrastLit: textContrast(lit) };
      report.material.push(entry);
      expect(Math.abs(factor - 1), `${control.id}: interior brightness change within the token budget`).toBeLessThanOrEqual(tokens.interiorMax + 0.01);
      expect(worst, `${control.id}: lit interior is the unlit interior times one factor`).toBeLessThanOrEqual(4);
      if (control.kind === "raised" || control.id === "name") {
        expect(entry.contrastLit, `${control.id}: text contrast on the lit face`).toBeGreaterThanOrEqual(4.5);
        expect(entry.contrastLit, `${control.id}: lit contrast close to unlit`).toBeGreaterThanOrEqual(entry.contrastUnlit * 0.9);
      }
    }
    // The pass does draw relief: bevel edges differ from the unlit image.
    const save = controls.find(control => control.id === "save");
    const edge = [{ x: save.x + 2, y: save.y + save.height / 2 }, { x: save.x + save.width - 2, y: save.y + save.height / 2 }];
    const edgeLit = await read(edge);
    await probe("setMaterial", false);
    const edgeUnlit = await read(edge);
    await probe("setMaterial", true);
    report.bevel = { lit: edgeLit, unlit: edgeUnlit };
    expect(edgeLit.some((pixel, index) => pixel.slice(0, 3).some((channel, c) => Math.abs(channel - edgeUnlit[index][c]) > 6)), "bevel shading present").toBe(true);

    // Native hits follow the DOM layout; the outset shadow is drawn but never hit (P0.5).
    const grid = [];
    for (let y = -tokens.outset + 2; y < extent.height + tokens.outset; y += 4) for (let x = -tokens.outset + 2; x < extent.width + tokens.outset; x += 4) grid.push({ x, y });
    const clients = await project(grid);
    const hits = await page.evaluate(async clients => clients.map(client => {
      const element = document.elementFromPoint(client.x, client.y);
      return { id: element?.id ?? "", inFace: !!element && document.getElementById("face").contains(element) };
    }), clients);
    const misses = [];
    grid.forEach((point, index) => {
      const hit = hits[index];
      // Native hit testing follows border-radius, so classify by rounded-box distance (negative inside). Points
    // within 2 CSS pixels of an edge are not judged: Chrome rounds corner hits slightly (1.2 px seen).
      const panel = roundedDistance(point, { x: 0, y: 0, ...extent });
      const control = controls.find(c => roundedDistance(point, c) < -2);
      const nearControl = controls.some(c => roundedDistance(point, c) < 2);
      if (panel > 2 && hit.id !== "stage") misses.push({ point, hit, expected: "stage" });
      else if (control && hit.id !== control.id) misses.push({ point, hit, expected: control.id });
      else if (panel < -2 && !nearControl && (!hit.inFace || controls.some(c => c.id === hit.id))) misses.push({ point, hit, expected: "face" });
    });
    report.hits = { points: grid.length, misses: misses.slice(0, 20), missCount: misses.length };
    expect(misses).toEqual([]);
    const shadowPoints = [{ x: extent.width + 6, y: extent.height / 2 }, { x: extent.width / 2, y: extent.height + 6 }];
    const litSide = [{ x: -6, y: extent.height / 2 }, { x: extent.width / 2, y: -6 }];
    const shadow = await read(shadowPoints), clear = await read(litSide);
    report.outset = { shadow, clear, shadowHits: await probe("hits", await project(shadowPoints)) };
    shadow.forEach(pixel => expect(Math.max(...pixel.slice(0, 3)), "panel shadow drawn outside its box").toBeLessThan(240));
    // The shadow falls away from the key light: its soft edge may reach the lit side, but at under a quarter of the strength.
    const darkness = pixel => 255 - Math.min(...pixel.slice(0, 3));
    clear.forEach(pixel => expect(darkness(pixel), "shadow mostly absent on the lit side").toBeLessThan(Math.min(...shadow.map(darkness)) / 4));
    report.outset.shadowHits.forEach(hit => expect(hit).toBe("stage"));

    // States: hover and press redraw the relief with no new capture.
    const [centre] = await project([{ x: save.x + save.width / 2, y: save.y + 8 }]);
    const [castPoint] = [{ x: save.x + save.width + 2, y: save.y + save.height + 2 }];
    const sample = async () => ({ face: (await probe("pixels", [centre]))[0], cast: (await read([castPoint]))[0], counts: await probe("counts") });
    await page.mouse.move(10, 10);
    const rest = await sample();
    await page.mouse.move(centre.x, centre.y);
    const hover = await sample();
    // While hovered, Save's interior is lit: it must be the unlit interior times one factor, text included.
    const hovered = await read(interior(save));
    const hoverRatios = [];
    hovered.forEach((pixel, index) => { for (let c = 0; c < 3; c++) if (unlit.save[index][c] > 40) hoverRatios.push(pixel[c] / unlit.save[index][c]); });
    const hoverFactor = median(hoverRatios);
    const hoverWorst = Math.max(...hovered.flatMap((pixel, index) => [0, 1, 2].map(c => Math.abs(pixel[c] - Math.min(255, unlit.save[index][c] * hoverFactor)))));
    report.hoverMaterial = { factor: hoverFactor, worst: hoverWorst, contrast: textContrast(hovered) };
    expect(hoverFactor, "hover brightens Save's interior").toBeGreaterThan(1.02);
    expect(hoverFactor - 1, "within the interior budget").toBeLessThanOrEqual(tokens.interiorMax + 0.01);
    expect(hoverWorst, "hovered interior is the unlit interior times one factor").toBeLessThanOrEqual(4);
    expect(report.hoverMaterial.contrast, "Save text contrast while hovered").toBeGreaterThanOrEqual(4.5);
    await page.mouse.down();
    const pressed = await sample();
    await page.mouse.up();
    await page.mouse.move(10, 10);
    report.states = { rest, hover, pressed };
    expect(luminance(hover.face), "hover brightens the face").toBeGreaterThan(luminance(rest.face));
    expect(luminance(pressed.face), "press darkens the face").toBeLessThan(luminance(rest.face));
    expect(luminance(pressed.cast), "press shortens the cast shadow").toBeGreaterThan(luminance(hover.cast));
    expect(pressed.counts.frames, "state changes redraw").toBeGreaterThan(rest.counts.frames);
    expect(pressed.counts.uploads - rest.counts.uploads, "hover and press need no capture").toBe(0);

    // Keyboard focus draws the emissive edge; typing is a native paint and a fresh capture.
    await page.locator("#stage").focus().catch(() => {});
    for (let tries = 0; tries < 6 && await page.evaluate(() => document.activeElement?.id) !== "name"; tries++) await page.keyboard.press("Tab");
    expect(await page.evaluate(() => document.activeElement?.id)).toBe("name");
    const name = controls.find(control => control.id === "name");
    const [ring] = await read([{ x: name.x - 2, y: name.y + name.height / 2 }]);
    report.focus = { ring };
    expect(contrast(ring, [233, 235, 239]), "focus edge stands out from the panel").toBeGreaterThanOrEqual(3);
    const typingRegion = interior(name).filter((_, index) => index % 3 === 0);
    const beforeTyping = { pixels: await read(typingRegion), counts: await probe("counts") };
    await page.keyboard.press("End");
    await page.keyboard.type(" II");
    await page.waitForFunction(async () => { const probe = await window.reliefProbe.ready; await probe.settle(); return true; });
    await page.waitForTimeout(100);
    const afterTyping = { pixels: await read(typingRegion), counts: await probe("counts") };
    expect(await page.inputValue("#name")).toBe("Ada Lovelace II");
    expect(afterTyping.counts.uploads, "typing captures fresh pixels").toBeGreaterThan(beforeTyping.counts.uploads);
    expect(afterTyping.pixels.some((pixel, index) => pixel.slice(0, 3).some((channel, c) => Math.abs(channel - beforeTyping.pixels[index][c]) > 40)), "typed text drawn").toBe(true);
    await page.keyboard.press("Tab");

    // P0.3: animated relief with extra primitives, 300 frames each, no capture.
    report.cost = [];
    for (const count of [0, 16, 64, 256, 1024]) {
      const result = await probe("measure", count, 300);
      report.cost.push(result);
      expect(result.uploads, `${result.primitives} primitives: no capture while animating`).toBe(0);
    }

  } finally {
    await writeFile(`${directory}/relief-dpr${dpr}.json`, JSON.stringify(report, null, 2));
    await context.close();
  }
});
