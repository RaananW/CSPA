/**
 * Browser suite for materials (`setMaterial`, `interaction: "material"`) on `runtime.html`, driven through
 * `window.runtimeProbe`. A material is persistent, colour-only lighting on any enrolled layer, so it may sit on the
 * interactive `primary` layer. The suite proves that GPU stays on with the material applied, that pixels stay fresh
 * and the layer's native controls keep taking input, that the change is one brightness factor within
 * `interior.max` that never depends on the captured colour, that parameters update without recompiling, that a
 * custom material and a custom effect share one pass, that the material survives DOM and readmission, and that
 * invalid materials are refused. Pixels are decoded from `#frame` screenshots.
 *
 * Specimen colours: `primary` rgb(240,30,60) at (40,50) 260x300 holding the Count button, the optional third
 * layer rgb(30,100,220) at (400,210) 100x50.
 */
import { test, expect } from "../helpers/current-browser.mjs";
import { mkdir } from "node:fs/promises";
import { PNG } from "pngjs";
import { evidenceDirectory } from "../helpers/evidence.mjs";

const evidence = evidenceDirectory("material");
const policy = { bounds: "layer", interaction: "material", media: "identity", fallback: "static" };
// Scales the colour it is given; on the runtime's neutral input its luma ratio is 1 + strength.
const brighten = "return vec4f(color.rgb * (1.0 + parameters.x), color.a);";

/** Opens `runtime.html` and waits for admitted, settled GPU. */
async function ready(page) {
  await page.goto("/runtime.html");
  await page.waitForFunction(() => window.runtimeProbe?.state().mode === "gpu" && !window.runtimeProbe.state().initializing);
  await page.waitForTimeout(300);
  await page.evaluate(() => window.runtimeProbe.settle());
}
/** Settles, screenshots `#frame` and returns a sampler of frame-local CSS pixels. */
async function snap(page, name) {
  await page.evaluate(() => window.runtimeProbe.settle());
  await mkdir(evidence, { recursive: true });
  const png = PNG.sync.read(await page.locator("#frame").screenshot({ path: `${evidence}/${name}.png` }));
  const ratio = png.width / 640;
  const at = (x, y) => (Math.round(y * ratio) * png.width + Math.round(x * ratio)) * 4;
  return Object.assign((x, y) => [...png.data.subarray(at(x, y), at(x, y) + 4)], { png, ratio });
}
/** Asserts a pixel within one unit of an expected RGB colour (GPU rounding). */
function near(actual, expected) {
  expected.forEach((value, index) => expect(Math.abs(actual[index] - value), `${actual} vs ${expected}`).toBeLessThanOrEqual(1));
  expect(actual[3]).toBe(255);
}
const scaled = (colour, factor) => colour.map(channel => Math.min(255, channel * factor));
const primary = [240, 30, 60], third = [30, 100, 220];

test("a material on an interactive layer: GPU stays on, pixels are fresh, native hits work, the factor stays in budget", async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await ready(page);
  near((await snap(page, "before"))(45, 340), primary);
  const before = await page.evaluate(() => window.runtimeProbe.state().registryRevision);

  // A material asking for +50% is held to interior.max (4%), and the layer stays interactive and GPU-presented.
  const started = await page.evaluate(({ policy, brighten }) => {
    const definition = window.runtimeProbe.define("material-brighten", brighten);
    window.material = window.runtimeProbe.material("primary", { kind: "custom", definition, parameters: { strength: 0.5 }, interior: { max: 0.04 }, ...policy });
    const state = window.runtimeProbe.state();
    return { mode: state.mode, reason: state.reason, materials: state.runtimeResources.materials, listed: state.materials,
      revision: state.registryRevision, inert: document.querySelector("#count").inert || document.querySelector("#primary")?.inert === true };
  }, { policy, brighten });
  expect(started.mode, started.reason).toBe("gpu");
  expect(started).toMatchObject({ materials: 1, inert: false, revision: before + 1 });
  expect(started.listed).toEqual([{ id: "primary", kind: "custom", name: "material-brighten", parameters: { strength: 0.5 }, interior: { max: 0.04 } }]);
  const lit = await snap(page, "brightened");
  near(lit(45, 340), scaled(primary, 1.04));
  near(lit(515, 155), [20, 200, 90]);

  // Native input reaches the layer's own controls, and the changed content is captured fresh under the material.
  const button = await page.locator("#count").boundingBox();
  const frame = await page.locator("#frame").boundingBox();
  const region = { x: Math.round(button.x - frame.x), y: Math.round(button.y - frame.y), width: Math.round(button.width), height: Math.round(button.height) };
  const bytes = sample => {
    const values = [];
    for (let y = region.y; y < region.y + region.height; y++) for (let x = region.x; x < region.x + region.width; x++) values.push(sample(x, y).join());
    return values;
  };
  const buttonBefore = bytes(lit);
  await page.locator("#count").click();
  await expect(page.locator("#count")).toHaveText("Count 1");
  await page.locator("#controlled").fill("Material");
  await expect(page.locator("#controlled")).toHaveValue("Material");
  const clicked = await snap(page, "clicked");
  expect(bytes(clicked).filter((value, index) => value !== buttonBefore[index]).length, "the new label is presented").toBeGreaterThan(5);
  near(clicked(45, 340), scaled(primary, 1.04));
  expect(await page.evaluate(() => window.runtimeProbe.state().mode)).toBe("gpu");

  // Parameters change per frame without recompiling; darkening is held to the same budget.
  await page.evaluate(() => window.material.update({ strength: -0.5 }));
  near((await snap(page, "darkened"))(45, 340), scaled(primary, 0.96));
  await page.evaluate(() => window.material.update({ strength: 0.02 }));
  near((await snap(page, "subtle"))(45, 340), scaled(primary, 1.02));
  expect(await page.evaluate(() => window.runtimeProbe.state().registryRevision)).toBe(before + 1);

  // The factor comes from the material on a neutral input, never from the captured colour: an inversion, which
  // would swap text and face contrast, changes nothing. It replaces the previous material on the layer.
  const replaced = await page.evaluate(policy => {
    const definition = window.runtimeProbe.define("material-invert", "return vec4f(1.0 - color.rgb, color.a);");
    const previous = window.material;
    window.material = window.runtimeProbe.material("primary", { kind: "custom", definition, parameters: { strength: 0 }, interior: { max: 0.1 }, ...policy });
    return previous.finished;
  }, policy);
  expect(replaced).toEqual({ status: "replaced", reason: "Validated successor acquired ownership" });
  near((await snap(page, "inverted"))(45, 340), primary);

  // The material persists through ordinary DOM and is applied again on readmission.
  await page.evaluate(policy => {
    window.material = window.runtimeProbe.material("primary", { kind: "custom", definition: window.runtimeProbe.define("material-again", "return vec4f(color.rgb * (1.0 + parameters.x), color.a);"),
      parameters: { strength: -1 }, interior: { max: 0.04 }, ...policy });
  }, policy);
  near((await snap(page, "readmission-before"))(45, 340), scaled(primary, 0.96));
  const dom = await page.evaluate(async () => { await window.runtimeProbe.disable(); return { mode: window.runtimeProbe.state().mode, active: window.material.state().active }; });
  expect(dom).toEqual({ mode: "dom", active: true });
  near((await snap(page, "dom"))(45, 340), primary);
  await page.evaluate(() => window.runtimeProbe.enable());
  expect(await page.evaluate(() => window.runtimeProbe.state().mode)).toBe("gpu");
  near((await snap(page, "readmitted"))(45, 340), scaled(primary, 0.96));

  // Cancelling restores the original pixels.
  await page.evaluate(() => window.material.cancel());
  expect(await page.evaluate(() => window.material.finished)).toEqual({ status: "cancelled", reason: "Material cancelled" });
  near((await snap(page, "cancelled"))(45, 340), primary);
  expect(await page.evaluate(() => window.runtimeProbe.state().runtimeResources.materials)).toBe(0);

  const disposed = await page.evaluate(() => window.runtimeProbe.dispose());
  expect(Object.values(disposed.resources).every(value => value === 0)).toBe(true);
  expect(Object.values(disposed.runtimeResources).every(value => value === 0)).toBe(true);
  expect(errors).toEqual([]);
});

test("a custom material and a custom transition effect share one pass, material first", async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await ready(page);
  await page.locator("#third").click();
  await page.locator("#third-control").waitFor();
  await page.evaluate(() => window.runtimeProbe.settle());
  near((await snap(page, "third-before"))(490, 252), third);
  const result = await page.evaluate(({ policy, brighten }) => {
    const material = window.runtimeProbe.material("third-layer", { kind: "custom", definition: window.runtimeProbe.define("material-third", brighten),
      parameters: { strength: 1 }, interior: { max: 0.04 }, ...policy });
    const swap = window.runtimeProbe.define("effect-swap", "return vec4f(color.bgr, color.a);");
    window.thirdEffect = window.runtimeProbe.effects("third-layer", [{ kind: "custom", definition: swap, parameters: { strength: 0 },
      time: { seconds: 0 }, bounds: "layer", interaction: "inert", media: "identity", fallback: "static" }]);
    const state = window.runtimeProbe.state();
    return { mode: state.mode, reason: state.reason, material: material.state().active };
  }, { policy, brighten });
  expect(result.mode, result.reason).toBe("gpu");
  expect(result.material).toBe(true);
  // The material scales by 1.04, then the effect swaps red and blue.
  near((await snap(page, "third-both"))(490, 252), scaled(third, 1.04).reverse());
  await page.evaluate(() => window.thirdEffect.cancel());
  near((await snap(page, "third-material"))(490, 252), scaled(third, 1.04));
  expect(await page.evaluate(() => window.runtimeProbe.state().mode)).toBe("gpu");
  expect(errors).toEqual([]);
});

test("invalid materials are refused without changing anything", async ({ page }) => {
  await ready(page);
  const refusals = await page.evaluate(policy => {
    const definition = window.runtimeProbe.define("material-refusals", "return color;");
    const base = { kind: "custom", definition, parameters: { strength: 0 }, interior: { max: 0.04 }, ...policy };
    const failures = {};
    for (const [name, id, descriptor] of [
      ["unknown layer", "missing", base],
      ["effect interaction", "primary", { ...base, interaction: "decorative" }],
      ["budget over the ceiling", "primary", { ...base, interior: { max: 0.2 } }],
      ["unregistered definition", "primary", { ...base, definition: { ...definition } }],
      ["parameter schema", "primary", { ...base, parameters: { other: 1 } }],
      ["kind", "primary", { ...base, kind: "bump" }],
      ["relief without a scene", "primary", { ...base, kind: "relief" }],
    ]) {
      try { window.runtimeProbe.material(id, descriptor); failures[name] = "accepted"; } catch (error) { failures[name] = String(error); }
    }
    const state = window.runtimeProbe.state();
    return { failures, materials: state.runtimeResources.materials, mode: state.mode };
  }, policy);
  expect(refusals.failures["unknown layer"]).toMatch(/Unknown Surface/);
  expect(refusals.failures["effect interaction"]).toMatch(/material interaction/);
  expect(refusals.failures["budget over the ceiling"]).toMatch(/interior\.max requires 0\.\.0\.1/);
  expect(refusals.failures["unregistered definition"]).toMatch(/defineEffect/);
  expect(refusals.failures["parameter schema"]).toMatch(/schema/);
  expect(refusals.failures.kind).toMatch(/Unsupported material kind/);
  expect(refusals.failures["relief without a scene"]).toMatch(/Relief scene/);
  expect(refusals).toMatchObject({ materials: 0, mode: "gpu" });
  near((await snap(page, "refused"))(45, 340), primary);
});
