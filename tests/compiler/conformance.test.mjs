import test from "node:test";
import assert from "node:assert/strict";
import { compileStylesheet } from "../../packages/css-compiler/src/index.mjs";
import { generateModule } from "../../packages/css-compiler/src/generate.mjs";
import { validateCompiledPrograms } from "../../packages/underglass/src/compiled.ts";
import { acceptedCSS, refusedCSS, referenceTimes } from "./css-corpus.mjs";

for (const fixture of acceptedCSS) {
  test(`accepted CSS: ${fixture.label}`, async () => {
    const animations = compileStylesheet(fixture.css, [fixture.entry], { modules: fixture.modules });
    const source = generateModule(animations, 1);
    const compiled = (await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`)).default;
    validateCompiledPrograms(compiled);
    for (const time of referenceTimes(animations[0])) {
      const phase = compiled.animations[0].normalizeTime(time);
      assert.ok(Number.isFinite(phase) && phase >= 0 && phase <= (animations[0].timing.direction === "alternate" ? 2 : 1));
      const sample = compiled.animations[0].sample(time);
      assert.ok(Object.values(sample).every(Number.isFinite), `${fixture.label} at ${time}`);
      assert.ok(sample.scaleX > 0 && sample.scaleY > 0 && sample.opacity >= 0 && sample.opacity <= 1);
    }
  });
}
for (const fixture of refusedCSS) {
  test(`refused CSS: ${fixture.label}`, () => {
    assert.throws(() => compileStylesheet(fixture.css, [fixture.entry], {
      filename: "/fixture/corpus.css", modules: fixture.modules,
    }), error => error.name === "CssSyntaxError" && error.message.includes("Underglass:") && error.line > 0);
  });
}
