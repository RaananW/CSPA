/**
 * Unit tests for effect validation and uniform packing in `packages/underglass/src/effects.ts`, plus the
 * evidence directory helper. Pure data checks, no browser. Run with `npm run test:unit`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { defineEffect, validateEffects, effectUniforms } from "../../packages/underglass/src/effects.ts";
import { evidenceDirectory, validateEvidenceRoot } from "../helpers/evidence.mjs";

// Shared fields of a valid effect; individual cases override one field to break it.
const common = { bounds: "layer", interaction: "decorative", media: "identity", fallback: "static", time: { seconds: 0 } };
const ripple = { ...common, kind: "ripple", parameters: { amplitude: 0 } };
const dissolve = { ...common, kind: "dissolve", parameters: { amount: .5, speed: 1 } };
test("entire effect chain validates order, finite ranges and exact policies without mutating input", () => {
  const original = JSON.stringify(ripple);
  assert.equal(validateEffects([ripple])[0].time.playing, false);
  assert.equal(JSON.stringify(ripple), original);
  for (const chain of [[], [ripple, ripple], [dissolve, ripple], [{ ...ripple, bounds: "expand" }],
    [{ ...ripple, parameters: { amplitude: Infinity } }], [{ ...ripple, parameters: { amplitude: 1, extra: 1 } }],
    [{ ...ripple, time: { seconds: -1 } }], [{ ...ripple, time: { seconds: 1, playing: 1 } }],
    [ripple, { ...dissolve, parameters: { amount: 2, speed: 0 } }]]) assert.throws(() => validateEffects(chain));
  assert.equal(effectUniforms(validateEffects([ripple, dissolve])).length, 24);
});
test("trusted external definition freezes exact typed numeric schema and rejects fabricated definitions", () => {
  const definition = defineEffect({ name: "tint", geometry: "color", bounds: "layer", capabilities: ["webgpu"],
    parameters: { strength: { min: 0, max: 1 } }, wgsl: "return color;" });
  assert.ok(Object.isFrozen(definition) && Object.isFrozen(definition.parameters.strength));
  const value = { ...common, kind: "custom", definition, parameters: { strength: .5 } };
  assert.equal(validateEffects([value])[0].definition, definition);
  for (const bad of [{ ...value, definition: { ...definition } }, { ...value, parameters: {} },
    { ...value, parameters: { strength: 2 } }, { ...value, parameters: { strength: 1, rate: 1 } }]) assert.throws(() => validateEffects([bad]));
  assert.throws(() => defineEffect({ ...definition, capabilities: ["webgl"] }));
});
test("normal evidence output is regenerable, not an accepted archive", () => {
  const directory = evidenceDirectory("effects");
  assert.equal(validateEvidenceRoot(directory), directory);
  assert.throws(() => evidenceDirectory("../phase7"));
});
