/**
 * Unit tests for capture coverage (`publication.ts`) and the composition uniform and shader builders
 * (`composition.ts`) that decide what the GPU presents. Pure data checks. Run with `npm run test:unit`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { completeCoverage } from "../../packages/core/src/publication.ts";
import { registerHooks } from "node:module";
// `composition.ts` imports siblings as `./x.js`, which only exist as `.ts` in the source tree.
// This hook maps those specifiers to `.ts` for the dynamic import below, then is removed.
const sourceImports = registerHooks({
  resolve(specifier, context, next) {
    if (context.parentURL?.endsWith("/core/src/composition.ts") && specifier.startsWith("./") && specifier.endsWith(".js")) {
      return next(specifier.replace(/\.js$/, ".ts"), context);
    }
    return next(specifier, context);
  },
});
const { compositionUniforms, compositionShader } = await import("../../packages/core/src/composition.ts");
sourceImports.deregister();

// A capture of slot 1 at 100x80 CSS pixels backed by 200x160 device pixels (device pixel ratio 2).
const capture = { slot: 1, capturedSlot: 1, width: 100, height: 80, pixelWidth: 200, pixelHeight: 160 };
test("cached publication requires every logical slot and current native extent", () => {
  assert.ok(completeCoverage(capture, { width: 100, height: 80, pixelWidth: 200, pixelHeight: 160 }));
  assert.ok(completeCoverage(capture, { width: 80, height: 70, pixelWidth: 160, pixelHeight: 140 }));
  assert.equal(completeCoverage({ ...capture, slot: 2 }, capture), false);
  assert.equal(completeCoverage({ ...capture, capturedSlot: -1 }, capture), false);
  assert.equal(completeCoverage(capture, { width: 101, height: 80, pixelWidth: 202, pixelHeight: 160 }), false);
  assert.equal(completeCoverage(capture, { width: 100, height: 80, pixelWidth: 300, pixelHeight: 240 }), false);
});

test("retained pipeline capacity leaves removed lanes empty, not stale pixels", () => {
  const uniforms = compositionUniforms([], 2, 0, 0, 5);
  assert.equal(uniforms.length, 4 + 5 * 44);
  assert.deepEqual([...uniforms.slice(0, 4)], [2, 0, 0, 0]);
  assert.ok(uniforms.slice(4).every(value => value === 0));
});

test("prepared custom functions remain addressable after cached order/removal changes", () => {
  const shader = compositionShader(3, [undefined, { wgsl: "return color;" }]);
  assert.match(shader.fragmentWGSL, /fn custom1/);
  assert.equal(shader.fragmentWGSL.match(/sample = clamp\(custom1/g).length, 3);
  for (const lane of [3, 14, 25]) assert.ok(shader.fragmentWGSL.includes(`state[${lane}].w == 1.0`));
});
