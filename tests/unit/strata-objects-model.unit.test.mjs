/**
 * Unit tests for the Objects part of the Strata rendering model (`docs/ui-library/rendering-model.md`, part 2B,
 * version 2) as `@underglass/ui/tokens` ships it: version 2 scenes validate as the format and the JSON Schema say,
 * the reference implementation gives the values the standard states at key points (side normals, caps, domes and
 * the hit-safety rule, computed here by hand), a version 2 scene without objects shades as version 1, and the
 * committed `objects-2.json` is what the reference implementation produces. Run with `npm run test:unit`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildObjectsConformance, capturedFrom, conformanceCases, domeHit, environmentTerm, objectDrawable, objectsCases, parseHex,
  resolveObject, shadePoint, shadingTerms, sideNormal, strataTokens, toHex, validateScene,
} from "../../packages/ui/src/tokens/index.ts";

const schema = JSON.parse(readFileSync(new URL("../../packages/ui/src/tokens/strata-scene.schema.json", import.meta.url), "utf8"));
const committed = JSON.parse(readFileSync(new URL("../../packages/ui/conformance/objects-2.json", import.meta.url), "utf8"));
const cases = Object.fromEntries(objectsCases().map(entry => [entry.name, entry]));
const colour = (role, theme = "light") => strataTokens.colour[role].$extensions["dev.underglass.strata"].themes[theme];
const at = (name, x, y) => { const entry = cases[name]; return toHex(shadePoint(entry.scene, capturedFrom(entry.capture), x, y).map(channel => channel * 255)); };
const scaled = (hex, factor) => toHex(parseHex(hex).map(channel => channel * factor));
const close = (actual, expected, tolerance = 1e-4) => actual.forEach((value, index) => assert.ok(Math.abs(value - expected[index]) <= tolerance, `${actual} vs ${expected}`));

test("every Objects conformance scene is a valid version 2 scene", () => {
  for (const entry of objectsCases()) assert.deepEqual(validateScene(entry.scene), [], entry.name);
});

test("the validator and the JSON Schema agree on objects", () => {
  const object = cases["key-states"].scene.primitives[1];
  for (const key of Object.keys(schema.$defs.object.properties)) {
    if (!(key in object)) continue;
    const scene = structuredClone(cases["key-states"].scene);
    delete scene.primitives[1][key];
    assert.equal(validateScene(scene).length > 0, schema.$defs.object.required.includes(key), `removing primitives[1].${key}`);
  }
  assert.deepEqual(schema.$defs.object.properties.object.enum, ["key", "slab", "bezel", "well", "rail", "mark", "knob", "puck"]);
  assert.deepEqual(schema.properties.version.enum, [1, 2]);
});

test("the validator reports broken version 2 scenes at their paths", () => {
  const broken = (name, change, path) => {
    const scene = structuredClone(cases[name].scene);
    change(scene);
    const paths = validateScene(scene).map(issue => issue.path);
    assert.ok(paths.includes(path), `${path} in ${JSON.stringify(paths)}`);
  };
  broken("slab", scene => { delete scene.camera; }, "camera");
  broken("slab", scene => { scene.camera.distance = 50; }, "camera.distance");
  broken("slab", scene => { scene.camera.vanish = [0]; }, "camera.vanish");
  broken("slab", scene => { scene.environment.source = "https://example.com/sky.hdr"; }, "environment.source");
  broken("slab", scene => { scene.version = 1; }, "camera");
  broken("slab", scene => { scene.version = 1; delete scene.camera; delete scene.environment; }, "primitives[0].object");
  broken("slab", scene => { scene.primitives[0].object = "lever"; }, "primitives[0].object");
  broken("slab", scene => { scene.primitives[0].colour = "#ffffff"; }, "primitives[0].colour");
  broken("slab", scene => { scene.primitives[0].travel = 2; }, "primitives[0].travel");
  broken("slab", scene => { scene.primitives[0].width = 2; }, "primitives[0].width");
  broken("switch", scene => { delete scene.primitives[2].colour; }, "primitives[2].colour");
  broken("switch", scene => { scene.primitives[2].taper = 1; }, "primitives[2].taper");
  broken("bezel", scene => { delete scene.primitives[2].width; }, "primitives[2].width");
  broken("bezel", scene => { scene.primitives[2].bounds = [0, 0, 10]; }, "primitives[2].bounds");
  broken("bezel", scene => { scene.primitives[2].state = { hover: "yes" }; }, "primitives[2].state.hover");
});

test("a solid's side normal follows the screen-locked base and cap (2B.4), by hand", () => {
  // The rest key of key-states: base 8, cap 16, taper 3, seen from V = (-100, 40) at D = 1600.
  const scene = cases["key-states"].scene, key = resolveObject(scene.primitives[1]);
  assert.deepEqual([key.z0, key.z1, key.taper], [8, 16, 3]);
  // Left side at x = 17.5: B = (16, y), T = (19, y). P0.x = -100 + 116 · 0.995 = 15.42, P1.x = -100 + 119 · 0.99 = 17.81.
  close(sideNormal(scene, key, 17.5, 40.5), [-8 / Math.hypot(8, 2.39), 0, 2.39 / Math.hypot(8, 2.39)]);
  // Right side at x = 78.5: B = (80, y), T = (77, y). P0.x = 79.1, P1.x = 75.23, so Δ.x = -3.87.
  close(sideNormal(scene, key, 78.5, 40.5), [8 / Math.hypot(8, 3.87), 0, 3.87 / Math.hypot(8, 3.87)]);
  // The side facing the vanishing point is the steeper one.
  assert.ok(sideNormal(scene, key, 17.5, 40.5)[2] < sideNormal(scene, key, 78.5, 40.5)[2]);
  // A pressed key's cap sinks by its travel: z1 = 8 + 8 - 6.
  assert.equal(resolveObject(scene.primitives[3]).z1, 10);
});

test("caps keep the captured content, scaled by the interior factor alone (2B.4, 2.6)", () => {
  // Matte at 50% depth: gloss (1 − 0.45) · 0.01 = 0.0055. The finish zones are 0 mid-cap on matte.
  assert.equal(at("slab", 100.5, 60.5), scaled(colour("panel"), 1.0055));
  assert.equal(at("key-states", 48.5, 40.5), scaled(colour("secondary"), 1.0055));
  // Pressed: −pressSink + gloss, held to −interior.max = −0.04.
  assert.equal(at("key-states", 200.5, 40.5), scaled(colour("secondary"), 0.96));
  // A disabled key is unlit: its sides show the captured colour as it is.
  const disabled = cases["key-states"].capture[4].colour;
  assert.equal(at("key-states", 245.5, 40.5), disabled);
  assert.equal(at("key-states", 306.5, 40.5), disabled);
  // The guard protects text on a face beside a bezel: text × 1.0055 (the field well's gloss).
  assert.equal(at("bezel", 44.5, 31.5), scaled(colour("text"), 1.0055));
});

test("a dome is ray-cast: its apex faces the viewer and its colour replaces the content (2B.5)", () => {
  const scene = cases.switch.scene, knob = resolveObject(scene.primitives[2]);
  // The apex (86, 34, 15) appears at V + (c − V) · D / (D − 15).
  const scale = 1600 / 1585, apex = [-100 + 186 * scale, 32 + 2 * scale];
  const hit = domeHit(scene, knob, ...apex);
  assert.equal(hit.coverage, 1);
  close(hit.normal, [0, 0, 1], 1e-6);
  assert.ok(Math.abs(hit.z - 15) < 1e-6);
  // Relative to a flat face, the apex gets no Lambert and no environment term.
  assert.equal(environmentTerm(scene, hit.normal, 0.3, 1), 0);
  const terms = shadingTerms(scene, ...apex);
  assert.equal(terms.surface.alpha, 1);
  assert.deepEqual(terms.surface.colour.map(channel => Math.round(channel * 255)), parseHex(colour("knob")));
  // Off the dome, nothing is hit.
  assert.equal(domeHit(scene, knob, 60, 34).coverage, 0);
});

test("objects that would break hit safety are drawn at the Relief level (2B.6)", () => {
  const entry = cases["relief-equivalents"];
  assert.equal(objectDrawable(entry.scene, entry.scene.primitives[1]), false, "the knob leaves its bounds");
  assert.equal(objectDrawable(entry.scene, entry.scene.primitives[2]), false, "the key's taper is under its drift");
  for (const name of ["key-states", "slab", "switch", "bezel", "rail-and-puck", "environment"]) {
    for (const object of cases[name].scene.primitives.filter(entry => "object" in entry)) assert.equal(objectDrawable(cases[name].scene, object), true, `${name}: ${object.object}`);
  }
  // The taper rule by hand: taper · (D − 16) ≥ 8 · R; at R = 600 a 3 px taper needs D ≥ 1616.
  const key = { object: "key", rect: [0, 0, 0, 0], height: 8, base: 8, taper: 3, material: "matte" };
  const scene = distance => ({ ...cases.slab.scene, camera: { distance, vanish: [-600, 0] } });
  assert.equal(objectDrawable(scene(1616), key), true);
  assert.equal(objectDrawable(scene(1615), key), false);
  // The relief knob keeps its colour on its footprint.
  assert.equal(shadingTerms(entry.scene, 36.5, 32.5).surface.alpha, 1);
});

test("a version 2 scene without objects shades exactly as version 1", () => {
  for (const entry of conformanceCases()) {
    const scene = { ...entry.scene, version: 2, camera: { distance: 1600, vanish: [0, 0] } }, captured = capturedFrom(entry.capture);
    for (const sample of entry.samples) assert.deepEqual(shadePoint(scene, captured, ...sample.at), shadePoint(entry.scene, captured, ...sample.at), `${entry.name} at ${sample.at}`);
  }
});

test("the committed Objects suite is what the reference implementation produces", () => {
  assert.deepEqual(committed, JSON.parse(JSON.stringify(buildObjectsConformance())), "run npm run build:conformance --workspace @underglass/ui");
  assert.equal(committed.model, "strata-scene/2");
  assert.ok(committed.cases.every(entry => entry.samples.length >= 4));
});
