/**
 * The Knob's value and angle maths, marks and markup data (`packages/ui/src/shared/knob.ts`, anatomy page `knob.md`),
 * and the Instrument stub's numbers (`packages/ui/src/gpu/instrument-knob.ts`, design language section 6).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { knobAngle, knobDetentStep, knobDrag, knobFraction, knobMarks, knobModel, knobNotch, knobNumber, knobRegion, knobStyle, knobValueAtAngle, knobValueText } from "../../packages/ui/src/shared/knob.ts";
import { knobInstrumentParts } from "../../packages/ui/src/gpu/instrument-knob.ts";

const volume = { min: 0, max: 100, step: 0.1 };

test("a value's place and angle: 0° at the top, clockwise over a sweep centred on it", () => {
  assert.equal(knobFraction(62, volume), 0.62);
  assert.equal(knobFraction(-5, volume), 0);
  assert.equal(knobFraction(5, { min: 1, max: 1 }), 0);
  assert.equal(knobAngle(0, volume), -135);
  assert.equal(knobAngle(50, volume), 0);
  assert.equal(knobAngle(100, volume), 135);
  assert.equal(knobAngle(100, volume, 300), 150);
  assert.equal(knobAngle(-6, { min: -12, max: 12 }), -67.5);
});

test("a ring click sets the value at its angle; the bottom gap goes to the nearer end", () => {
  assert.equal(knobValueAtAngle(0, volume), 50);
  assert.equal(knobValueAtAngle(-135, volume), 0);
  assert.equal(knobValueAtAngle(67.5, volume), 75);
  assert.equal(knobValueAtAngle(170, volume), 100);
  assert.equal(knobValueAtAngle(-170, volume), 0);
  // 180° is the gap's middle, reached from either side: the same as −180°.
  assert.equal(knobValueAtAngle(190, volume), 0);
  assert.equal(knobValueAtAngle(100, volume, { sweep: 300 }), 83.333333);
});

test("a ring click within knob.snap degrees of a printed mark sets exactly its value", () => {
  const marks = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
  // "3" is at −54°: half a degree off (a numeral on whole pixels) still sets 30.
  assert.equal(knobValueAtAngle(-53.5, volume, { marks }), 30);
  assert.equal(knobValueAtAngle(-56, volume, { marks }), 30);
  // Outside the snap the angle decides.
  assert.equal(knobValueAtAngle(-50, volume, { marks }), 31.481481);
  assert.equal(knobValueAtAngle(-50, volume, { marks, snap: 5 }), 30);
  assert.equal(knobValueAtAngle(-53.5, volume, { marks, snap: 0 }), 30.185185);
  // The nearer of two marks wins.
  assert.equal(knobValueAtAngle(-41, volume, { marks: [30, 35], snap: 5 }), 35);
});

test("a press inside the skirt is a cap tap, upper half up; outside it the ring, by angle", () => {
  assert.deepEqual(knobRegion(0, -20, 32), { cap: true, upper: true, theta: 0 });
  assert.deepEqual(knobRegion(0, 20, 32), { cap: true, upper: false, theta: 180 });
  assert.equal(knobRegion(40, 0, 32).cap, false);
  assert.equal(knobRegion(40, 0, 32).theta, 90);
  assert.equal(knobRegion(-40, 0, 32).theta, -90);
});

test("a notch is the step, at least 1% of the range; a detent's step is the range over detents − 1", () => {
  assert.equal(knobNotch(volume), 1);
  assert.equal(knobNotch({ min: 0, max: 10, step: 1 }), 1);
  assert.equal(knobNotch({ min: -24, max: 12, step: 0 }), 1);
  assert.equal(knobNotch({ min: 0, max: 1000, step: 1 }), 10);
  assert.equal(knobDetentStep(0, 10, 11), 1);
  assert.equal(knobDetentStep(-12, 12, 5), 6);
  assert.equal(knobDetentStep(0, 1, 4), 0.333333);
});

test("a vertical drag moves a full sweep per dragPx, up raises, Shift is fine, clamped to the range", () => {
  assert.equal(knobDrag(0, -50, volume), 25);
  assert.equal(knobDrag(50, 100, volume), 0);
  assert.equal(knobDrag(50, -100, volume, { shift: true }), 55);
  assert.equal(knobDrag(50, -50, volume, { dragPx: 100 }), 100);
  assert.equal(knobDrag(90, -200, volume), 100);
});

test("numbers print with a true minus sign and no float noise; units follow as written", () => {
  assert.equal(knobNumber(-6), "−6");
  assert.equal(knobNumber(0.1 + 0.2), "0.3");
  assert.equal(knobNumber(-0), "0");
  assert.equal(knobValueText(-6, " dB"), "−6 dB");
  assert.equal(knobValueText(72, "%"), "72%");
});

test("marks: a count spread over the range, values with labels, the detents by default", () => {
  assert.deepEqual(knobMarks(volume).map(mark => mark.value), [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
  assert.deepEqual(knobMarks({ min: 0, max: 4 }, undefined, 5).map(mark => mark.value), [0, 1, 2, 3, 4]);
  assert.equal(knobMarks({ min: 0, max: 23 }, undefined, 24).length, 11);
  assert.deepEqual(knobMarks(volume, [0, { value: 50, label: "Mid" }, 120]), [{ value: 0 }, { value: 50, label: "Mid" }]);
  assert.deepEqual(knobMarks(volume, 0), []);
  assert.deepEqual(knobMarks(volume, 1), [{ value: 0 }]);
});

test("the markup data: the root's and each mark's style, the detent step and aria-valuetext", () => {
  assert.equal(knobStyle(62, volume), "--strata-knob-value: 0.62;");
  assert.equal(knobStyle(1, { min: 0, max: 3 }), "--strata-knob-value: 0.3333;");
  assert.equal(knobStyle(50, volume, 300), "--strata-knob-value: 0.5; --strata-knob-sweep: 300;");
  const gain = knobModel({ value: 0, min: -12, max: 12, detents: 5, unit: " dB" });
  assert.deepEqual(gain, {
    min: -12, max: 12, step: 6, detented: true, style: "--strata-knob-value: 0.5;",
    marks: [-12, -6, 0, 6, 12].map((value, index) => ({ value, text: knobNumber(value), style: `--strata-knob-at: ${index / 4};` })),
    valueText: "0 dB",
  });
  assert.equal(knobModel({ value: 62, step: 0.1 }).step, 0.1);
  assert.equal(knobModel({ value: 62 }).valueText, undefined);
  assert.equal(knobModel({ value: 62, unit: "%", format: value => `Volume ${value / 10} of 10` }).valueText, "Volume 6.2 of 10");
});

test("the Instrument stub: the premium knob's parts from the object table, and the cap's turn", () => {
  const parts = knobInstrumentParts(0.62);
  assert.equal(parts.box, 140);
  assert.deepEqual(parts.skirt, { diameter: 64, height: 2.5, edgeBreak: 0.8, topSlope: 7.5 });
  assert.deepEqual(parts.cap, { diameter: 51, height: 16, crown: 1.2, chamfer: 2 });
  assert.deepEqual(parts.pointer, { width: 2.2, from: 0.28, to: 0.86 });
  assert.deepEqual(parts.scale, { ticks: 37, numerals: 52 });
  assert.ok(Math.abs(parts.turn - 32.4) < 1e-9);
  // Heights scale with depth; widths do not. The turn stays within the sweep.
  const deep = knobInstrumentParts(2, { depthScale: 1.6 });
  assert.equal(deep.cap.height, 25.6);
  assert.equal(deep.cap.diameter, 51);
  assert.equal(deep.turn, 135);
});
