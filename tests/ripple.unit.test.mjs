import { test } from "node:test";
import assert from "node:assert/strict";
import { validateRipple } from "../src/canvas-spa/ripple.ts";

test("bounded decorative effect parameters reject atomically", () => {
  assert.deepEqual(validateRipple({ amplitude: 0, seconds: 10 }), { amplitude: 0, seconds: 10, playing: false });
  for (const value of [{ amplitude: 13, seconds: 0 }, { amplitude: NaN, seconds: 0 },
    { amplitude: 1, seconds: Infinity }, { amplitude: 1, seconds: -1 }, { amplitude: 1, seconds: 1e7 }, { amplitude: 1, seconds: 0, playing: 1 }]) {
    assert.throws(() => validateRipple(value), /Ripple requires/);
  }
});
