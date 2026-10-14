import test from "node:test";
import assert from "node:assert/strict";
import postcss from "postcss";
import { createCompiler, compileStylesheet, validateConfig } from "../../packages/css-compiler/src/index.mjs";
import { generateModule } from "../../packages/css-compiler/src/generate.mjs";
import { compileTimeline } from "../../packages/canvas-spa/src/timeline.ts";
import { validateCompiledPrograms } from "../../packages/canvas-spa/src/compiled.ts";

const entry = { id: "card", stylesheet: "./card.scss", selector: ".card", animations: ["float"] };
const config = { version: 1, target: "webgpu", unsupported: "error", maxLayers: 2, entries: [entry] };
const css = `.card { animation: float 1s linear infinite alternate both; }
@keyframes float {
  from { transform: translate(0px, 0px) rotate(0deg) scale(1); opacity: 1; }
  50% { transform: translate(40px, 10px) rotate(10deg) scale(0.9, 1.1); opacity: 0.8; animation-timing-function: ease-in; }
  to { transform: translate(80px, 20px) rotate(20deg) scale(0.8, 1.2); opacity: 0.6; }
}`;
test("JSON enrollment is strict, bounded and explicit", () => {
  assert.equal(validateConfig(config).maxLayers, 2);
  for (const bad of [{ ...config, target: "webgl" }, { ...config, unsupported: "ignore" },
    { ...config, unknown: true }, { ...config, maxLayers: 9 }, { ...config, entries: [] },
    { ...config, entries: [entry, entry] }, { ...config, entries: [{ ...entry, selector: ".card:hover" }] },
    { ...config, entries: [{ ...entry, animations: ["float", "other"] }] }]) assert.throws(() => validateConfig(bad));
});
test("build emits literal WGSL programs and generated native geometry samplers", async () => {
  const animations = compileStylesheet(css, [entry]);
  const source = generateModule(animations);
  const compiled = (await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`)).default;
  assert.equal(compiled.animations[0].timing.iterations, Infinity);
  // One per-layer program serves any layer count; the runtime draws it once per layer.
  assert.equal(compiled.version, 2);
  assert.equal(compiled.programs.length, 1);
  assert.match(compiled.programs[0].fragmentWGSL, /compiled_sample/);
  assert.match(compiled.programs[0].vertexWGSL, /effectFullscreenVertex/);
  assert.equal(compiled.programs[0].bindings.at(-1).uniformByteLength, (12 + 44 + 4) * 4);
  const timeline = compileTimeline(animations[0].values, animations[0].timing);
  for (const time of [0, 17.3, 250, 500, 740, 1000, 1500, 2000, 5734]) {
    const actual = compiled.animations[0].sample(time), expected = timeline.sample(Math.fround(time));
    for (const key of Object.keys(expected)) assert.ok(Math.abs(actual[key] - expected[key]) < 1e-4, `${time}:${key}`);
  }
  assert.throws(() => compiled.animations[0].sample(NaN));
  assert.throws(() => compiled.animations[0].sample(-1));
  validateCompiledPrograms(compiled);
  assert.throws(() => validateCompiledPrograms({ ...compiled, animations: [compiled.animations[0], compiled.animations[0]] }), /descriptor/);
  assert.throws(() => validateCompiledPrograms({ ...compiled, animations: [{ ...compiled.animations[0], normalizeTime: undefined }] }), /descriptor/);
  assert.throws(() => validateCompiledPrograms({ ...compiled, programs: [{ ...compiled.programs[0], bindings: [] }] }), /program/);
  assert.throws(() => validateCompiledPrograms({ ...compiled, version: 1 }), /rebuild/);
});
test("selected unsupported CSS fails with an available input location", () => {
  for (const bad of [
    css.replace("opacity: 0.6;", "opacity: 0.6; filter: blur(3px);"),
    css.replace("translate(80px, 20px)", "translate(80%, 20px)"),
    css.replace("linear infinite", "steps(2) infinite"),
    css.replace(" alternate both", " alternate forwards"),
    css.replace(".card {", "@media (min-width: 10px) { .card {") + "}",
    css + "\n.card { animation: float 2s both; }",
    css.replace("opacity: 0.6;", "opacity: var(--opacity);"),
    css.replace("opacity: 0.6;", "opacity: 0.6; opacity: 0.5;"),
    css.replace("alternate both;", "alternate both; transition: opacity 1s;"),
    css.replace("linear infinite", "linear linear infinite"),
    css + "\n@media (min-width:10px){ .card { opacity:0.4; } }",
  ]) {
    assert.throws(() => compileStylesheet(bad, [entry], { filename: "/project/card.scss" }),
      error => error.name === "CssSyntaxError" && error.message.includes("CanvasSPA:") && error.line > 0);
  }
});
test("CSS Modules mappings, untouched CSS and missing pipeline inputs are explicit", () => {
  const mapped = css.replaceAll(".card", "._card_hash").replaceAll("float", "_float_hash");
  const parsed = compileStylesheet(mapped, [entry], { modules: { card: "_card_hash", float: "_float_hash" } });
  assert.equal(parsed[0].selector, "._card_hash");
  assert.equal(parsed[0].name, "_float_hash");
  const compiler = createCompiler(config);
  assert.throws(() => compiler.generate(), /not processed/);
  const root = postcss.parse(css);
  compiler.consume("card.scss", root, [entry]);
  assert.equal(root.toString(), css);
  assert.match(compiler.generate(), /export default compiled/);
  assert.throws(() => compileStylesheet(mapped, [entry], { modules: { card: "_one _two" } }), /composition/);
  assert.equal(compileStylesheet(css.replace(".card {", ".card { /* author comment */"), [entry]).length, 1);
});
