/**
 * Unit tests for layer materials in `packages/core/src/effects.ts` and `composition.ts`: validation, uniform
 * packing, the per-layer uniform layout and the generated shader's contrast guard. Pure data checks, no
 * browser; `tests/browser/material.test.mjs` proves the decoded pixels. Run with `npm run test:unit`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { defineEffect, validateMaterial, materialUniforms, MATERIAL_INTERIOR_CEILING } from "../../packages/core/src/effects.ts";

// `composition.ts` imports siblings as `./x.js`, which only exist as `.ts` in the source tree.
const sourceImports = registerHooks({
  resolve(specifier, context, next) {
    if (context.parentURL?.endsWith("/core/src/composition.ts") && specifier.startsWith("./") && specifier.endsWith(".js")) {
      return next(specifier.replace(/\.js$/, ".ts"), context);
    }
    return next(specifier, context);
  },
});
const { layerShader, passShaders } = await import("../../packages/core/src/composition.ts");
const { LAYER_PASS_FLOATS } = await import("../../packages/core/src/compiled.ts");
sourceImports.deregister();

const definition = defineEffect({ name: "unit-material", parameters: { strength: { min: -1, max: 1 }, tint: { min: 0, max: 1 } },
  geometry: "color", bounds: "layer", capabilities: ["webgpu"], wgsl: "return color * (1.0 + parameters.x);" });
const material = { kind: "custom", definition, parameters: { tint: 0.5, strength: 0.25 }, interior: { max: 0.04 },
  bounds: "layer", interaction: "material", media: "identity", fallback: "static" };

test("a material validates its policy, schema and interior budget without mutating input", () => {
  const original = JSON.stringify(material);
  const valid = validateMaterial(material);
  assert.equal(JSON.stringify(material), original);
  assert.deepEqual(Object.keys(valid.parameters), ["strength", "tint"], "schema order");
  assert.equal(MATERIAL_INTERIOR_CEILING, 0.1);
  for (const bad of [{ ...material, interaction: "decorative" }, { ...material, interaction: "inert" }, { ...material, bounds: "expand" },
    { ...material, kind: "ripple" }, { ...material, definition: { ...definition } }, { ...material, parameters: { strength: 0 } },
    { ...material, parameters: { strength: 2, tint: 0 } }, { ...material, interior: { max: 0.11 } }, { ...material, interior: { max: -0.01 } },
    { ...material, interior: undefined }]) assert.throws(() => validateMaterial(bad));
});

test("a material packs into two vec4s: control (code, budget, slot) and parameters", () => {
  assert.deepEqual([...materialUniforms(undefined, 0)], [0, 0, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual([...materialUniforms(validateMaterial(material), 0)].map(value => Math.round(value * 1e6) / 1e6), [1, 0.04, 0, 0, 0.25, 0.5, 0, 0]);
  assert.equal(materialUniforms(validateMaterial(material), -1)[2], -1);
});

test("the per-layer block grows to 13 vec4s with the material after the clip", () => {
  assert.equal(LAYER_PASS_FLOATS, 12 + 52 + 4);
  const shader = layerShader(undefined, undefined, definition);
  assert.equal(shader.bindings.at(-1).uniformByteLength, LAYER_PASS_FLOATS * 4);
  assert.match(shader.fragmentWGSL, /array<vec4f, 17>/);
  // Header 3 vec4s, then the block: the material control is block vec4 11, its parameters vec4 12.
  assert.match(shader.fragmentWGSL, /let materialControl = state\[14\];/);
  assert.match(shader.fragmentWGSL, /material0\(vec4f\(0\.5, 0\.5, 0\.5, 1\.0\), local, extent, 0\.0, state\[15\]\)/);
});

test("the shader's guard takes one factor from a neutral input, within the budget and the hard ceiling", () => {
  const { fragmentWGSL } = layerShader(undefined, undefined, definition);
  assert.match(fragmentWGSL, /fn material0\(color: vec4f, local: vec2f, extent: vec2f, seconds: f32, parameters: vec4f\) -> vec4f \{ return color \* \(1\.0 \+ parameters\.x\); \}/);
  assert.match(fragmentWGSL, /let budget = min\(materialControl\.y, 0\.10\);/);
  assert.match(fragmentWGSL, /let factor = clamp\(2\.0 \* dot\(lit\.rgb, vec3f\(0\.2126, 0\.7152, 0\.0722\)\), 1\.0 - budget, 1\.0 \+ budget\);/);
  // The captured sample is only ever scaled by that factor; it is never passed to the material.
  assert.match(fragmentWGSL, /sample = vec4f\(min\(sample\.rgb \* factor, vec3f\(1\.0\)\), sample\.a\);/);
  assert.doesNotMatch(fragmentWGSL, /material0\(sample/);
  // The material runs before the effect chain's colour operations.
  assert.ok(fragmentWGSL.indexOf("materialControl") < fragmentWGSL.indexOf("control.x == 3.0"));
  // Without a material definition the pass carries no material code at all.
  assert.doesNotMatch(layerShader().fragmentWGSL, /materialControl/);
});

test("a pass's custom definitions are interned, so equal pairs compare by identity", () => {
  const effect = defineEffect({ ...definition, name: "unit-effect" });
  assert.equal(passShaders(), undefined);
  assert.equal(passShaders(effect, definition), passShaders(effect, definition));
  assert.notEqual(passShaders(effect, definition), passShaders(effect));
  assert.deepEqual(passShaders(undefined, definition), { effect: undefined, material: definition });
  const both = layerShader(effect, undefined, definition).fragmentWGSL;
  assert.match(both, /fn custom0\(/);
  assert.match(both, /fn material0\(/);
});
