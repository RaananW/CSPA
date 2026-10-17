/**
 * The Knob at the Instrument level: a **stub** until core's `instrument` material (Instrument plan, core work item 1,
 * PR 4: `packages/core/src/instrument.ts`, Rendering Model part 2D) is on `main`. Nothing imports it yet, so the GPU
 * helper presents a knob at the Relief and Objects levels only (anatomy page `knob.md`, section 2).
 *
 * What is here is the part of the builder that does not depend on core's format: the premium knob's parts by the
 * names of design language section 6, their dimensions from the Instrument object table at a depth scale, and the
 * cap's turn for a value. The follow-up turns these into the 2D scene's objects (lathe profiles for the skirt and the
 * cap, the pointer as an engraved part, the pose `turn` from `t`, the box as `bounds`) and has `strataScene` emit them
 * for knobs at `data-strata-level="instrument"`.
 */
import { knobDefaults } from "../shared/knob.ts";

/** The premium knob's parts, CSS px at the given depth scale (0.6, 1 and 1.6 at 0, 50 and 100% depth). */
export interface KnobInstrumentParts {
  /** The native box: the skirt plus the printed scale, skirt + 76. */
  box: number;
  skirt: { diameter: number; height: number; edgeBreak: number; topSlope: number };
  cap: { diameter: number; height: number; crown: number; chamfer: number };
  /** The engraved line, from `from` to `to` of the top's radius. */
  pointer: { width: number; from: number; to: number };
  /** The printed scale's radii, from the centre. */
  scale: { ticks: number; numerals: number };
  /** The cap's turn at `t`, degrees clockwise from the top. */
  turn: number;
}

/**
 * The knob's parts at value position `t` (0–1). `size` is the skirt's diameter (`size.knob`, 64 at medium; a detented
 * knob is 0.8 of it); heights scale with `depthScale`, widths and angles do not.
 */
export function knobInstrumentParts(t: number, { size = 64, depthScale = 1, sweep = knobDefaults.sweep } = {}): KnobInstrumentParts {
  const r = size / 2, skirtHeight = 2.5 * depthScale;
  return {
    box: size + 76,
    skirt: { diameter: size, height: skirtHeight, edgeBreak: Math.min(0.8, skirtHeight / 2), topSlope: 7.5 },
    cap: { diameter: Math.round(size * 0.8), height: 16 * depthScale, crown: 1.2 * depthScale, chamfer: 2 },
    pointer: { width: 2.2, from: 0.28, to: 0.86 },
    scale: { ticks: r + 5, numerals: r + 20 },
    turn: (Math.min(1, Math.max(0, t)) - 0.5) * sweep,
  };
}
