import test from "node:test";
import assert from "node:assert/strict";
import { compileStylesheet } from "../../packages/css-compiler/src/index.mjs";
import { sameEasing } from "../../packages/canvas-spa/src/compiled.ts";

const frames = (name = "float") => `@keyframes ${name} {
  from { transform: translate(0px, 0px) rotate(0deg) scale(1); opacity: 1; }
  to { transform: translate(10px, 0px) rotate(0deg) scale(1); opacity: 0.5; }
}`;
const entry = (name = "float") => ({ id: "card", stylesheet: "./card.css", selector: ".card", animations: [name] });
const compile = (css, name = "float") => compileStylesheet(css, [entry(name)], { filename: "/p/card.css" });
const refused = css => assert.throws(() => compile(css), error => error.name === "CssSyntaxError" && error.message.includes("CanvasSPA:"));

test("overlap check compares selector boundaries, not substrings", () => {
  const base = `.card { animation: float 1s linear both; }\n${frames()}`;
  assert.equal(compile(`${base}\n.card-header { transform: none; }`).length, 1);
  assert.equal(compile(`${base}\n.card2 { opacity: 0.5; }`).length, 1);
  refused(`${base}\n.card { opacity: 0.5; }`.replace(".card { opacity", ".card:hover { opacity"));
  refused(`${base}\n.wrap .card.hot { opacity: 0.5; }`);
  refused(`${base}\n.a, .card { opacity: 0.5; }`);
});

test("animation shorthand resets earlier longhands per the cascade", () => {
  const ok = compile(`.card { animation-duration: 2s; animation: float 1s linear both; }\n${frames()}`);
  assert.equal(ok[0].timing.duration, 1000);
  refused(`.card { animation-duration: 2s; animation: float linear both; }\n${frames()}`);
  const later = compile(`.card { animation: float 1s linear both; animation-duration: 2s; }\n${frames()}`);
  assert.equal(later[0].timing.duration, 2000);
  const reset = compile(`.card { animation-iteration-count: 5; animation: float 1s linear both; }\n${frames()}`);
  assert.equal(reset[0].timing.iterations, 1);
});

test("CSS-wide keywords match whole tokens only", () => {
  const named = compile(`.card { animation: initial-fade 1s linear both; }\n${frames("initial-fade")}`, "initial-fade");
  assert.equal(named[0].name, "initial-fade");
  for (const keyword of ["initial", "inherit", "unset", "revert", "revert-layer"]) {
    refused(`.card { animation: float 1s linear both; animation-duration: ${keyword}; }\n${frames()}`);
  }
});

test("vendor-prefixed animation declarations in a selected target fail clearly", () => {
  assert.throws(() => compile(`.card { animation: float 1s linear both; -webkit-animation-duration: 2s; }\n${frames()}`),
    error => /Vendor-prefixed -webkit-animation-duration/.test(error.message));
});

test("cubic-bezier easings are canonical numbers and compare numerically with browser serialization", () => {
  const css = `.card { animation: float 1s cubic-bezier(.1, .8, .7, 1) both; }\n${frames()}`;
  const [animation] = compile(css);
  assert.equal(animation.frames[0].easing, "cubic-bezier(0.1,0.8,0.7,1)");
  assert.ok(sameEasing("cubic-bezier(0.1, 0.8, 0.7, 1)", animation.frames[0].easing));
  assert.ok(sameEasing("ease", "cubic-bezier(0.25, 0.1, 0.25, 1)"));
  assert.ok(sameEasing("linear", "cubic-bezier(0,0,1,1)"));
  assert.ok(!sameEasing("ease-in", "ease-out"));
  assert.ok(!sameEasing("steps(2)", "linear"));
});
