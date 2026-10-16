/**
 * The Strata rendering model's conformance suite (`docs/ui-library/rendering-model.md`, part 4). Each case is a scene,
 * the content captured under it (rounded rectangles painted in order over transparent) and sample points. The
 * expected colours come from the reference implementation; `tests/unit/strata-rendering-model.unit.test.mjs` checks
 * the key points by hand. A backend conforms when its decoded pixels at every sample, composited over the scene's
 * backdrop, are within the tolerance of the expected colour on every channel.
 *
 * `buildConformance()` writes the suite that ships as `@underglass/ui/conformance/relief-1.json`.
 */
import { parseHex, toHex } from "./contrast.ts";
import { strataSource } from "./source.ts";
import { sceneSettings, type ScenePrimitive, type StrataScene } from "./scene.ts";
import { roundedBoxDistance, shadePoint, type CapturedColour } from "./shade.ts";
import type { TokenGroup } from "./model.ts";

/** One painted region of the captured content. */
export interface CapturePaint {
  rect: [number, number, number, number];
  radius?: number;
  colour: string;
}

/** A point to sample, in layer-local CSS px, and what it checks. */
export interface ConformanceSample {
  at: [number, number];
  note: string;
  /** The expected colour, filled in by `buildConformance`. */
  expect?: string;
}

export interface ConformanceCase {
  name: string;
  description: string;
  scene: StrataScene;
  capture: CapturePaint[];
  samples: ConformanceSample[];
}

export interface ConformanceSuite {
  format: "strata-conformance";
  model: "strata-scene/1";
  /** The largest difference allowed on any channel, in 0–255 units. */
  tolerance: number;
  description: string;
  cases: ConformanceCase[];
}

/** The tolerance per channel, 0–255. */
export const conformanceTolerance = 3;

/** The captured content as the model reads it: the last painted region containing the point, else transparent. */
export function capturedFrom(paints: readonly CapturePaint[]): CapturedColour {
  const colours = paints.map(paint => parseHex(paint.colour).map(channel => channel / 255));
  return (x, y) => {
    for (let index = paints.length - 1; index >= 0; index--) {
      const { rect: [left, top, width, height], radius = 0 } = paints[index]!;
      const r = Math.min(radius, width / 2, height / 2);
      if (roundedBoxDistance(x - left - width / 2, y - top - height / 2, width / 2, height / 2, r) <= 0) {
        const [red, green, blue] = colours[index]!;
        return [red!, green!, blue!, 1];
      }
    }
    return [0, 0, 0, 0];
  };
}

/** The conformance cases, without expectations. */
export function conformanceCases(source: TokenGroup = strataSource): ConformanceCase[] {
  const settings = (theme = "light") => sceneSettings(source, { theme, depth: 0.5 });
  const colour = (role: string, theme = "light") => {
    const node = (source.colour as Record<string, { $extensions?: Record<string, { themes?: Record<string, string> }> }>)[role];
    return node!.$extensions!["dev.underglass.strata"]!.themes![theme]!;
  };
  const scene = (width: number, height: number, primitives: ScenePrimitive[], theme = "light", overrides: Partial<StrataScene> = {}): StrataScene =>
    ({ format: "strata-scene", version: 1, extent: { width, height }, outset: { top: 24, right: 24, bottom: 24, left: 24 }, ...settings(theme), ...overrides, primitives });
  const panel = (width: number, height: number): ScenePrimitive => ({ face: "raised", rect: [0, 0, width, height], radius: 14, height: 8, material: "matte" });
  const panelPaint = (width: number, height: number, theme = "light"): CapturePaint => ({ rect: [0, 0, width, height], radius: 14, colour: colour("panel", theme) });
  const button = (x: number, y: number, extra: Partial<ScenePrimitive> = {}): ScenePrimitive => ({ face: "raised", rect: [x, y, 64, 32], radius: 8, height: 3, material: "matte", finish: true, ...extra });
  const buttonPaint = (x: number, y: number, role = "secondary", theme = "light"): CapturePaint => ({ rect: [x, y, 64, 32], radius: 8, colour: colour(role, theme) });

  const cases: ConformanceCase[] = [
    {
      name: "panel",
      description: "A floating panel: its interior, its four bevels and its shadow cast into the outset.",
      scene: scene(200, 120, [panel(200, 120)]),
      capture: [panelPaint(200, 120)],
      samples: [
        { at: [100, 60], note: "interior: captured × (1 + gloss)" },
        { at: [100, 2], note: "top bevel, towards the light: brighter" },
        { at: [100, 118], note: "bottom bevel, away from the light: darker" },
        { at: [2, 60], note: "left bevel" },
        { at: [198, 60], note: "right bevel" },
        { at: [100, 121], note: "full shadow just below the panel: backdrop × (1 − strength)" },
        { at: [100, 130], note: "shadow falling off" },
        { at: [100, -12], note: "outset on the light side: backdrop" },
        { at: [-20, -20], note: "outset corner: backdrop" },
      ],
    },
    {
      name: "button-states",
      description: "Four buttons at rest, hovered, pressed and disabled: height, interior light and shadow by state.",
      scene: scene(320, 80, [panel(320, 80), button(16, 24), button(92, 24, { state: { hover: true } }), button(168, 24, { state: { pressed: true } }), button(244, 24, { state: { disabled: true } })]),
      capture: [panelPaint(320, 80), buttonPaint(16, 24), buttonPaint(92, 24), buttonPaint(168, 24), buttonPaint(244, 24)],
      samples: [16, 92, 168, 244].flatMap((x, index) => {
        const state = ["rest", "hover", "pressed", "disabled"][index];
        return [
          { at: [x + 32, 40] as [number, number], note: `${state}: interior` },
          { at: [x + 32, 26] as [number, number], note: `${state}: top bevel` },
          { at: [x + 32, 59] as [number, number], note: `${state}: shadow below` },
        ];
      }),
    },
    {
      name: "well-and-groove",
      description: "A field well and a metal groove: the inverted bevel is dark nearest the light.",
      scene: scene(200, 96, [panel(200, 96), { face: "well", rect: [20, 16, 160, 32], radius: 8, height: 2, material: "matte" }, { face: "groove", rect: [20, 68, 160, 8], radius: 4, height: 2, material: "metal" }]),
      capture: [panelPaint(200, 96), { rect: [20, 16, 160, 32], radius: 8, colour: colour("field") }, { rect: [20, 68, 160, 8], radius: 4, colour: colour("track") }],
      samples: [
        { at: [100, 32], note: "well interior" },
        { at: [100, 18], note: "well top bevel, nearest the light: darker" },
        { at: [100, 46], note: "well bottom bevel: brighter" },
        { at: [100, 72], note: "groove centre, all bevel at 8 px high" },
        { at: [100, 58], note: "panel interior between them" },
      ],
    },
    {
      name: "knob",
      description: "A satin knob on a groove: a dome lit from the light, casting onto the groove, hiding the groove's bevel under it.",
      scene: scene(120, 64, [panel(120, 64), { face: "groove", rect: [12, 28, 96, 8], radius: 4, height: 2, material: "metal" }, { face: "knob", rect: [48, 20, 24, 24], height: 3, material: "satin" }]),
      capture: [panelPaint(120, 64), { rect: [12, 28, 96, 8], radius: 4, colour: colour("track") }, { rect: [48, 20, 24, 24], radius: 12, colour: colour("knob") }],
      samples: [
        { at: [60, 32], note: "knob centre: flat top of the dome" },
        { at: [54, 25], note: "knob, towards the light" },
        { at: [67, 39], note: "knob, away from the light" },
        { at: [70, 46], note: "the knob's shadow, below and right of it" },
      ],
    },
    {
      name: "ring",
      description: "A ring groove with an accent arc over its first quarter, clockwise from the top.",
      scene: scene(80, 80, [panel(80, 80), { face: "ring", rect: [16, 16, 48, 48], height: 2, material: "matte", ring: { thickness: 6, start: 0, sweep: 90, colour: colour("accent") } }]),
      capture: [panelPaint(80, 80), { rect: [16, 16, 48, 48], radius: 24, colour: colour("track") }, { rect: [22, 22, 36, 36], radius: 18, colour: colour("panel") }],
      samples: [
        { at: [40 + 21 * Math.SQRT1_2, 40 - 21 * Math.SQRT1_2], note: "on the arc, at 45°: the arc colour" },
        { at: [40 - 21 * Math.SQRT1_2, 40 + 21 * Math.SQRT1_2], note: "on the ring, at 225°: the groove" },
        { at: [40, 40], note: "inside the ring: panel interior" },
      ],
    },
    {
      name: "focus",
      description: "A focused button: the focus edge from offset to offset + width outside the shape.",
      scene: scene(112, 64, [panel(112, 64), button(24, 16, { state: { focus: true } })]),
      capture: [panelPaint(112, 64), buttonPaint(24, 16)],
      samples: [
        { at: [22, 32], note: "2 px outside the left edge: the focus colour" },
        { at: [16, 32], note: "8 px outside the left edge: no edge" },
        { at: [56, 32], note: "interior" },
      ],
    },
    {
      name: "finish",
      description: "Finish zones on lacquer and metal buttons: the coat's reflection band at the top, metal's dark half at the bottom.",
      scene: scene(176, 64, [panel(176, 64), button(16, 8, { material: "lacquer", rect: [16, 8, 64, 48] }), button(96, 8, { material: "metal", rect: [96, 8, 64, 48] })]),
      capture: [panelPaint(176, 64), { rect: [16, 8, 64, 48], radius: 8, colour: colour("accent") }, { rect: [96, 8, 64, 48], radius: 8, colour: colour("secondary") }],
      samples: [
        { at: [48, 8 + 48 * 0.12], note: "lacquer, top zone: the reflection band" },
        { at: [48, 32], note: "lacquer, centre: interior budget only" },
        { at: [128, 8 + 48 * 0.12], note: "metal, top zone: the bright half" },
        { at: [128, 32], note: "metal, centre" },
        { at: [128, 8 + 48 * 0.86], note: "metal, bottom zone: the dark half" },
      ],
    },
    {
      name: "emissive",
      description: "An emissive mark is unlit: no bevel light and no interior change, but it still casts.",
      scene: scene(96, 48, [panel(96, 48), { face: "mark", rect: [24, 16, 48, 16], radius: 4, height: 2, material: "emissive" }]),
      capture: [panelPaint(96, 48), { rect: [24, 16, 48, 16], radius: 4, colour: colour("accent") }],
      samples: [
        { at: [48, 24], note: "centre: the captured colour" },
        { at: [48, 18], note: "edge band: still the captured colour" },
        { at: [48, 34], note: "its shadow below" },
      ],
    },
    {
      name: "contrast-guard",
      description: "A hovered button's shadow over a label on the panel: beyond the bevel band plus the ramp, darkening stops at interior.max, uniformly for text and face.",
      scene: scene(112, 80, [panel(112, 80), button(24, 8, { state: { hover: true } })]),
      capture: [panelPaint(112, 80), buttonPaint(24, 8), { rect: [40, 46, 32, 8], colour: colour("text") }],
      samples: [
        { at: [44, 49], note: "label 9 px below the button, past the bevel band and the ramp: text × (1 − interior.max)" },
        { at: [76, 49], note: "panel beside the label: panel × (1 − interior.max)" },
        { at: [56, 43], note: "3 px below the button, inside the bevel band: the shadow, unguarded" },
      ],
    },
    {
      name: "light-direction",
      description: "The light from the bottom right (azimuth 135°, elevation 30°): bevels and the shadow flip.",
      scene: scene(112, 64, [panel(112, 64), button(24, 16)], "light", { light: { azimuth: 135, elevation: 30 } }),
      capture: [panelPaint(112, 64), buttonPaint(24, 16)],
      samples: [
        { at: [56, 18], note: "top bevel, away from the light: darker" },
        { at: [56, 46], note: "bottom bevel, towards the light: brighter" },
        { at: [56, 13], note: "the shadow above the button" },
      ],
    },
    ...(["quarter-round", "chamfer", "cove"] as const).map(profile => ({
      name: `profile-${profile}`,
      description: `The ${profile} bevel profile on a raised button.`,
      scene: scene(112, 64, [panel(112, 64), button(24, 16)], "light", { bevel: { ...settings().bevel, profile } }),
      capture: [panelPaint(112, 64), buttonPaint(24, 16)],
      samples: [
        { at: [56, 17] as [number, number], note: "top bevel near the edge" },
        { at: [56, 20] as [number, number], note: "top bevel, middle" },
        { at: [56, 46] as [number, number], note: "bottom bevel, middle" },
      ],
    })),
    {
      name: "dark",
      description: "The dark theme: a panel, an accent button and a well.",
      scene: scene(200, 96, [panel(200, 96), button(16, 16), { face: "well", rect: [16, 60, 168, 24], radius: 8, height: 2, material: "matte" }], "dark"),
      capture: [panelPaint(200, 96, "dark"), buttonPaint(16, 16, "accent", "dark"), { rect: [16, 60, 168, 24], radius: 8, colour: colour("field", "dark") }],
      samples: [
        { at: [48, 32], note: "button interior" },
        { at: [48, 18], note: "button top bevel" },
        { at: [100, 72], note: "well interior" },
        { at: [100, 62], note: "well top bevel" },
        { at: [140, 32], note: "panel interior" },
      ],
    },
  ];
  return cases;
}

/** The suite with every expected colour computed by the reference implementation. */
export function buildConformance(source: TokenGroup = strataSource): ConformanceSuite {
  const cases = conformanceCases(source).map(entry => {
    const captured = capturedFrom(entry.capture);
    const samples = entry.samples.map(sample => {
      const at = sample.at.map(value => Math.round(value * 1000) / 1000) as [number, number];
      const colour = shadePoint(entry.scene, captured, ...at);
      return { at, note: sample.note, expect: toHex(colour.map(channel => channel * 255) as unknown as [number, number, number]) };
    });
    return { ...entry, samples };
  });
  return {
    format: "strata-conformance",
    model: "strata-scene/1",
    tolerance: conformanceTolerance,
    description: "Strata rendering model, version 1: Relief. Paint each case's capture (rounded rectangles in order, over transparent) as the layer's content, render the scene over its backdrop, and compare each sample's decoded pixel with `expect`: every channel within `tolerance` (0–255).",
    cases,
  };
}
