/**
 * Unit tests for the Strata rendering model (`docs/ui-library/rendering-model.md`) as `@underglass/ui/tokens` ships
 * it: the scene format and its JSON Schema agree, scene settings resolve from the tokens, the reference
 * implementation gives the values the standard states at key points (computed here by hand, not by the
 * implementation), the contrast guard changes text and face by one factor, and the committed conformance suite is
 * what the reference implementation produces. Run with `npm run test:unit`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildConformance, capturedFrom, conformanceCases, lightVector, parseHex, renderScene, sceneSettings, shadePoint, shadingTerms, strataTokens, toHex, validateScene } from "../../packages/ui/src/tokens/index.ts";

const schema = JSON.parse(readFileSync(new URL("../../packages/ui/src/tokens/strata-scene.schema.json", import.meta.url), "utf8"));
const committed = JSON.parse(readFileSync(new URL("../../packages/ui/conformance/relief-1.json", import.meta.url), "utf8"));
const cases = Object.fromEntries(conformanceCases().map(entry => [entry.name, entry]));
const colour = (role, theme = "light") => strataTokens.colour[role].$extensions["dev.underglass.strata"].themes[theme];
const at = (name, x, y) => { const entry = cases[name]; return toHex(shadePoint(entry.scene, capturedFrom(entry.capture), x, y).map(channel => channel * 255)); };
const scaled = (hex, factor) => toHex(parseHex(hex).map(channel => channel * factor));
const luma = hex => { const [r, g, b] = parseHex(hex); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };

test("every conformance scene is a valid version 1 scene", () => {
  for (const entry of conformanceCases()) assert.deepEqual(validateScene(entry.scene), [], entry.name);
});

test("the validator and the JSON Schema agree on required and known keys", () => {
  const valid = cases.panel.scene;
  for (const key of Object.keys(schema.properties)) {
    if (!(key in valid)) continue;
    const without = structuredClone(valid);
    delete without[key];
    assert.equal(validateScene(without).length > 0, schema.required.includes(key), `removing ${key}`);
  }
  for (const key of schema.required) assert.ok(key in valid, `the panel scene has ${key}`);
  const primitive = valid.primitives[0];
  for (const key of Object.keys(schema.$defs.primitive.properties)) {
    if (!(key in primitive)) continue;
    const without = structuredClone(valid);
    delete without.primitives[0][key];
    assert.equal(validateScene(without).length > 0, schema.$defs.primitive.required.includes(key), `removing primitives[0].${key}`);
  }
  assert.deepEqual(Object.keys(schema.$defs.material.properties).sort(), ["base", "coat", "emissive", "iridescence", "sheen", "transmission"]);
  assert.deepEqual(schema.$defs.primitive.properties.face.enum, ["raised", "well", "groove", "knob", "mark", "ring", "flat"]);
});

test("the validator reports each kind of broken scene at its path", () => {
  const broken = (change, path) => {
    const scene = structuredClone(cases.ring.scene);
    change(scene);
    const paths = validateScene(scene).map(issue => issue.path);
    assert.ok(paths.includes(path), `${path} in ${JSON.stringify(paths)}`);
  };
  broken(scene => { scene.version = 2; }, "version");
  broken(scene => { scene.surprise = true; }, "surprise");
  broken(scene => { scene.extent.depth = 1; }, "extent.depth");
  broken(scene => { scene.backdrop = "white"; }, "backdrop");
  broken(scene => { scene.interior.max = 0.2; }, "interior.max");
  broken(scene => { scene.bevel.profile = "ogee"; }, "bevel.profile");
  broken(scene => { scene.materials.matte.gold = {}; }, "materials.matte.gold");
  broken(scene => { scene.primitives[0].face = "bump"; }, "primitives[0].face");
  broken(scene => { scene.primitives[0].rect = [0, 0, 10]; }, "primitives[0].rect");
  broken(scene => { scene.primitives[0].material = "chrome"; }, "primitives[0].material");
  broken(scene => { scene.primitives[0].state = { hover: 1 }; }, "primitives[0].state.hover");
  broken(scene => { scene.primitives[0].ring = cases.ring.scene.primitives[1].ring; }, "primitives[0].ring");
  broken(scene => { delete scene.primitives[1].ring; }, "primitives[1].ring");
  broken(scene => { delete scene.primitives[1].ring.thickness; }, "primitives[1].ring.thickness");
  broken(scene => { scene.primitives = Array.from({ length: 257 }, () => scene.primitives[0]); }, "primitives");
});

test("scene settings resolve from the tokens for a depth and theme", () => {
  const middle = sceneSettings(strataTokens), subtle = sceneSettings(strataTokens, { depth: 0 }), dark = sceneSettings(strataTokens, { theme: "dark" });
  assert.deepEqual(middle.light, { azimuth: 323, elevation: 41 });
  assert.deepEqual(middle.bevel, { width: 6, gain: 0.55, profile: "quarter-round" });
  assert.equal(middle.shadow.strength, 0.24);
  assert.equal(subtle.shadow.strength, 0.14);
  assert.equal(subtle.bevel.width, 4);
  assert.equal(middle.interior.max, 0.04);
  assert.deepEqual(middle.state, { hoverHeight: 1.6, pressHeight: 0.25, hoverLift: 0.04, pressSink: 0.06 });
  assert.deepEqual(middle.focus, { colour: colour("accent"), width: 3, offset: 0.5 });
  assert.equal(middle.backdrop, colour("stage"));
  assert.equal(dark.backdrop, colour("stage", "dark"));
  assert.deepEqual(middle.materials.lacquer, { base: { roughness: 0.45, metallic: 0 }, coat: { strength: 1, roughness: 0.04, ior: 1.5 } });
  assert.deepEqual(middle.materials.emissive, { emissive: { strength: 1 } });
  assert.deepEqual(Object.keys(middle.materials).sort(), ["emissive", "glass", "gloss", "lacquer", "matte", "metal", "satin"]);
});

test("the light vector points towards the light in panel axes", () => {
  const [x, y, z] = lightVector(323, 41);
  assert.ok(x < 0 && y < 0 && z > 0, "top left, above the panel");
  assert.ok(Math.abs(Math.hypot(x, y, z) - 1) < 1e-12);
  const [, down] = lightVector(180, 41);
  assert.ok(down > 0, "azimuth 180 is the bottom of the screen");
});

// Key points, computed by hand from the standard's formulas (section numbers refer to rendering-model.md).
test("key points: interiors, outsets and shadows", () => {
  const panel = colour("panel"), stage = colour("stage"), secondary = colour("secondary");
  // 2.6: a matte interior is captured × (1 + (1 − roughness) × 0.01) = × 1.0055.
  assert.equal(at("panel", 100, 60), scaled(panel, 1.0055));
  // 2.11: the outset on the light side takes no shadow.
  assert.equal(at("panel", 100, -12), stage);
  // 2.8: 1 px below the panel the shifted shape still covers the point by more than half the height: S = strength.
  assert.equal(at("panel", 100, 121), scaled(stage, 1 - 0.24));
  // 2.6: hover adds hoverLift, press subtracts pressSink, both clamped to interior.max.
  assert.equal(at("button-states", 124, 40), scaled(secondary, 1.04));
  assert.equal(at("button-states", 200, 40), scaled(secondary, 0.96));
  // 2.3: a disabled primitive has no bevel, no interior change and no shadow, and hides the panel's gloss.
  assert.equal(at("button-states", 276, 40), secondary);
  assert.equal(at("button-states", 276, 26), secondary);
  assert.equal(at("button-states", 276, 59), scaled(panel, 1.0055));
});

test("key points: the bevel is lit from the light, and inverted in wells", () => {
  assert.ok(luma(at("panel", 100, 2)) > luma(at("panel", 100, 118)), "raised: top brighter than bottom");
  assert.ok(luma(at("panel", 2, 60)) > luma(at("panel", 198, 60)), "raised: left brighter than right");
  assert.ok(luma(at("well-and-groove", 100, 18)) < luma(at("well-and-groove", 100, 46)), "well: top darker than bottom");
  assert.ok(luma(at("light-direction", 56, 18)) < luma(at("light-direction", 56, 46)), "light from the bottom right: bottom brighter");
  assert.ok(luma(at("light-direction", 56, 13)) < luma(colour("panel")), "light from the bottom right: shadow above");
  // 2.4: 2 px in from the bottom edge (s = 1/3) the slopes are 0.8 (quarter-round), 0.6 (chamfer) and 0.4 rad
  // (cove), so the bevel facing away from the light darkens most under the quarter-round and least under the cove.
  const bottom = profile => luma(at(`profile-${profile}`, 56, 46));
  assert.ok(bottom("quarter-round") < bottom("chamfer") && bottom("chamfer") < bottom("cove"));
});

test("key points: emissive, ring arc, focus edge and finish", () => {
  const accent = colour("accent");
  // 2.3: an emissive material is unlit.
  assert.equal(at("emissive", 48, 24), accent);
  assert.equal(at("emissive", 48, 18), accent);
  assert.ok(luma(at("emissive", 48, 34)) < luma(colour("panel")), "an emissive mark still casts");
  // 2.7: the middle of the arc is the arc colour.
  assert.equal(at("ring", 40 + 21 * Math.SQRT1_2, 40 - 21 * Math.SQRT1_2), accent);
  assert.notEqual(at("ring", 40 - 21 * Math.SQRT1_2, 40 + 21 * Math.SQRT1_2), accent);
  // 2.10: the focus edge covers offset to offset + width outside the shape.
  assert.equal(at("focus", 22, 32), accent);
  assert.equal(at("focus", 16, 32), scaled(colour("panel"), 1.0055));
  // 2.6: the lacquer's reflection band brightens the top zone; metal darkens the bottom zone.
  assert.ok(luma(at("finish", 48, 8 + 48 * 0.12)) > luma(at("finish", 48, 32)));
  assert.ok(luma(at("finish", 128, 8 + 48 * 0.86)) < luma(at("finish", 128, 32)));
});

test("key points: a knob hides the groove's bevel under it", () => {
  const { scene } = cases.knob;
  const alone = { ...scene, primitives: [scene.primitives[0], scene.primitives[2]] };
  for (const [x, y] of [[60, 32], [54, 25], [67, 39]]) assert.ok(Math.abs(shadingTerms(scene, x, y).shade - shadingTerms(alone, x, y).shade) < 1e-9, `${x}, ${y}`);
});

test("the contrast guard changes text and face by one factor within interior.max", () => {
  // Hand-checked: 9 px below a hovered button, the shadow would darken by more than interior.max.
  assert.equal(at("contrast-guard", 44, 49), scaled(colour("text"), 0.96));
  assert.equal(at("contrast-guard", 76, 49), scaled(colour("panel"), 0.96));
  // Inside the bevel band the shadow is not limited.
  assert.ok(luma(at("contrast-guard", 56, 43)) < luma(scaled(colour("panel"), 0.96)));
  // Wherever the guard holds fully and nothing exempt applies, every channel is captured × one factor k, |k − 1| ≤ m.
  let checked = 0;
  for (const name of ["button-states", "contrast-guard", "well-and-groove", "dark"]) {
    const { scene, capture } = cases[name];
    const captured = capturedFrom(capture), m = scene.interior.max;
    for (let y = 0.5; y < scene.extent.height; y += 1.5) {
      for (let x = 0.5; x < scene.extent.width; x += 1.5) {
        const terms = shadingTerms(scene, x, y);
        if (terms.guard < 1 || terms.band || terms.dark || terms.edge || terms.arcs.some(arc => arc.coverage)) continue;
        const input = captured(x, y), output = shadePoint(scene, captured, x, y);
        const factors = [0, 1, 2].filter(channel => input[channel] > 0.05 && output[channel] < 1).map(channel => output[channel] / input[channel]);
        for (const factor of factors) {
          assert.ok(Math.abs(factor - factors[0]) < 1e-9, `${name} ${x},${y}: one factor`);
          assert.ok(Math.abs(factor - 1) <= m + 1e-9, `${name} ${x},${y}: within interior.max`);
        }
        checked++;
      }
    }
  }
  assert.ok(checked > 2000, `guarded points checked: ${checked}`);
});

test("renderScene covers the extent and the outset at the device scale", () => {
  const { scene, capture } = cases.ring;
  const image = renderScene(scene, capturedFrom(capture), 2);
  assert.deepEqual([image.width, image.height], [(80 + 48) * 2, (80 + 48) * 2]);
  const pixel = (x, y) => toHex([...image.data.slice(((y + 24) * 2 * image.width + (x + 24) * 2) * 4, ((y + 24) * 2 * image.width + (x + 24) * 2) * 4 + 3)]);
  assert.equal(pixel(40, 40), at("ring", 40.25, 40.25));
});

test("the committed conformance suite is what the reference implementation produces", () => {
  assert.deepEqual(committed, JSON.parse(JSON.stringify(buildConformance())), "run npm run build:conformance --workspace @underglass/ui");
  assert.equal(committed.model, "strata-scene/1");
  assert.ok(committed.cases.length >= 12 && committed.cases.every(entry => entry.samples.length && entry.samples.every(sample => /^#[0-9a-f]{6}$/.test(sample.expect))));
});
