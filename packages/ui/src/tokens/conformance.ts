/**
 * The Strata rendering model's conformance suite (`docs/ui-library/rendering-model.md`, part 4). Each case is a scene,
 * the content captured under it (rounded rectangles painted in order over transparent) and sample points. The
 * expected colours come from the reference implementation; `tests/unit/strata-rendering-model.unit.test.mjs` checks
 * the key points by hand. A backend conforms when, rendering at a device scale of 1 over the scene's backdrop, its
 * decoded pixel at every sample (a pixel centre) is within the tolerance of the expected colour on every channel.
 *
 * `buildConformance()` writes the suite that ships as `@underglass/ui/conformance/relief-1.json` (version 1, Relief), and
 * `buildObjectsConformance()` the one that ships as `@underglass/ui/conformance/objects-2.json` (version 2, Objects). A
 * renderer conforms to version 2 when it passes both. `buildSceneConformance()` writes `scene-3.json` (version 3, Scene):
 * stage scenes, rendered over white, and object scenes that reflect an environment map.
 */
import { parseHex, toHex } from "./contrast.ts";
import { strataSource } from "./source.ts";
import { sceneSettings, type SceneEntry, type SceneObject, type ScenePrimitive, type StrataScene } from "./scene.ts";
import { roundedBoxDistance, shadePoint, type CapturedColour } from "./shade.ts";
import { environmentColumns, environmentRows, shadeStage, type StageScene } from "./stage.ts";
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
  /** A layer's scene, or (version 3) a stage scene, which renders over white and has no capture. */
  scene: StrataScene | StageScene;
  capture: CapturePaint[];
  samples: ConformanceSample[];
}

export interface ConformanceSuite {
  format: "strata-conformance";
  model: "strata-scene/1" | "strata-scene/2" | "strata-scene/3";
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
      name: "divider",
      description: "A 2 px divider groove: its 1 px band is a shallow bevel (2.4, narrow bands), not a near-black wall.",
      scene: scene(200, 40, [panel(200, 40), { face: "groove", rect: [20, 19, 160, 2], radius: 1, height: 2, material: "matte" }]),
      capture: [panelPaint(200, 40)],
      samples: [
        { at: [100, 19.5], note: "the row nearest the light: a little darker" },
        { at: [100, 20.5], note: "the row away from the light: a little brighter" },
        { at: [100, 10], note: "panel interior" },
      ],
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
      description: "A hovered button's shadow over a label on the panel: beyond the bevel band plus the ramp, the shadow is scaled to darken by at most interior.max, uniformly for text and face.",
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

/** The Objects conformance cases (version 2), without expectations. */
export function objectsCases(source: TokenGroup = strataSource): ConformanceCase[] {
  const settings = (theme = "light") => sceneSettings(source, { theme, depth: 0.5 });
  const colour = (role: string, theme = "light") => {
    const node = (source.colour as Record<string, { $extensions?: Record<string, { themes?: Record<string, string> }> }>)[role];
    return node!.$extensions!["dev.underglass.strata"]!.themes![theme]!;
  };
  // The vanishing point sits left of every case, so sides facing it and facing away differ visibly.
  const scene = (width: number, height: number, primitives: SceneEntry[], overrides: Partial<StrataScene> = {}): StrataScene =>
    ({ format: "strata-scene", version: 2, camera: { distance: 1600, vanish: [-100, height / 2] }, environment: { source: "studio", strength: 0.6 },
      extent: { width, height }, outset: { top: 24, right: 24, bottom: 24, left: 24 }, ...settings(), ...overrides, primitives });
  const slab = (width: number, height: number): SceneObject => ({ object: "slab", rect: [0, 0, width, height], radius: 14, height: 8, taper: 3, material: "matte" });
  const slabPaint = (width: number, height: number): CapturePaint => ({ rect: [0, 0, width, height], radius: 14, colour: colour("panel") });
  const key = (x: number, y: number, extra: Partial<SceneObject> = {}): SceneObject =>
    ({ object: "key", rect: [x, y, 64, 32], radius: 8, height: 8, base: 8, taper: 3, travel: 6, material: "matte", finish: true, ...extra });
  const keyPaint = (x: number, y: number, role = "secondary"): CapturePaint => ({ rect: [x, y, 64, 32], radius: 8, colour: colour(role) });

  return [
    {
      name: "key-states",
      description: "Four keys on a slab at rest, hovered, pressed (its cap sunk by its travel) and disabled, seen from the left: the side facing the vanishing point is steeper than the side away from it.",
      scene: scene(320, 80, [slab(320, 80), key(16, 24), key(92, 24, { state: { hover: true } }), key(168, 24, { state: { pressed: true } }), key(244, 24, { state: { disabled: true } })]),
      capture: [slabPaint(320, 80), keyPaint(16, 24), keyPaint(92, 24), keyPaint(168, 24), keyPaint(244, 24)],
      samples: [16, 92, 168, 244].flatMap((x, index) => {
        const state = ["rest", "hover", "pressed", "disabled"][index];
        return [
          { at: [x + 32, 40] as [number, number], note: `${state}: cap, the captured label's place: captured × K` },
          { at: [x + 1.5, 40] as [number, number], note: `${state}: left side, facing the vanishing point` },
          { at: [x + 62.5, 40] as [number, number], note: `${state}: right side, facing away` },
          { at: [x + 32, 25.5] as [number, number], note: `${state}: top side, towards the light` },
          { at: [x + 32, 62] as [number, number], note: `${state}: shadow on the slab below` },
        ];
      }),
    },
    {
      name: "slab",
      description: "A slab (a panel at the Objects level): its cap, its four sides and its shadow in the outset.",
      scene: scene(200, 120, [slab(200, 120)]),
      capture: [slabPaint(200, 120)],
      samples: [
        { at: [100, 60], note: "cap: captured × (1 + gloss)" },
        { at: [100, 1.5], note: "top side" },
        { at: [100, 118.5], note: "bottom side" },
        { at: [1.5, 60], note: "left side, facing the vanishing point" },
        { at: [198.5, 60], note: "right side" },
        { at: [100, 121], note: "shadow just below" },
        { at: [-20, -20], note: "outset corner: backdrop" },
      ],
    },
    {
      name: "switch",
      description: "A switch: a well sunk into the slab, with a dome knob standing on its floor in the knob's own colour.",
      scene: scene(160, 64, [slab(160, 64),
        { object: "well", rect: [40, 20, 64, 28], radius: 14, height: 3, base: 8, taper: 2, material: "matte" },
        { object: "knob", rect: [74, 22, 24, 24], height: 10, base: 5, material: "satin", colour: colour("knob"), bounds: [40, 20, 64, 28] }]),
      capture: [slabPaint(160, 64), { rect: [40, 20, 64, 28], radius: 14, colour: colour("accent") }],
      samples: [
        { at: [56, 34], note: "well floor: captured × K" },
        { at: [56, 21], note: "well wall nearest the light: dark" },
        { at: [56, 46.5], note: "well wall away from the light: brighter" },
        { at: [41.5, 34], note: "well wall facing away from the vanishing point" },
        { at: [86, 34], note: "knob near its apex: its colour, lit" },
        { at: [81, 28], note: "knob towards the light" },
        { at: [92, 41], note: "knob away from the light" },
      ],
    },
    {
      name: "bezel",
      description: "A text field at the Objects level: a bezel ring standing just inside its well, with the text on the face.",
      scene: scene(200, 64, [slab(200, 64),
        { face: "well", rect: [20, 16, 160, 32], radius: 8, height: 2, material: "matte" },
        { object: "bezel", rect: [20, 16, 160, 32], radius: 8, height: 2, base: 8, taper: 1, width: 4, material: "satin" }]),
      capture: [slabPaint(200, 64), { rect: [20, 16, 160, 32], radius: 8, colour: colour("field") }, { rect: [40, 28, 40, 8], colour: colour("text") }],
      samples: [
        { at: [100, 16.5], note: "bezel, outer side towards the light" },
        { at: [100, 18], note: "bezel cap" },
        { at: [100, 19.5], note: "bezel, inner side" },
        { at: [44, 31], note: "text on the face: guarded" },
        { at: [140, 32], note: "field face" },
      ],
    },
    {
      name: "rail-and-puck",
      description: "A slider at the Objects level: a metal rail and a puck, a flattened dome in its own colour.",
      scene: scene(200, 56, [slab(200, 56),
        { object: "rail", rect: [16, 24, 168, 8], radius: 4, height: 2, base: 8, taper: 1, material: "metal" },
        { object: "puck", rect: [90, 14, 28, 28], height: 6, base: 10, material: "satin", colour: colour("knob"), bounds: [16, 12, 168, 32] }]),
      capture: [slabPaint(200, 56), { rect: [16, 24, 168, 8], radius: 4, colour: colour("track") }],
      samples: [
        { at: [50, 28], note: "rail cap" },
        { at: [50, 24.5], note: "rail, top side: metal reflects the studio" },
        { at: [50, 31.5], note: "rail, bottom side" },
        { at: [105, 28], note: "puck near its top" },
        { at: [97, 20], note: "puck towards the light" },
        { at: [112, 36], note: "puck away from the light" },
      ],
    },
    {
      name: "relief-equivalents",
      description: "Objects that would break hit safety are drawn at the Relief level: a knob whose projection leaves its bounds becomes a relief knob in its colour, and a key whose taper is under its drift becomes a raised face.",
      scene: scene(240, 64, [slab(240, 64),
        { object: "knob", rect: [24, 20, 24, 24], height: 12, base: 8, material: "satin", colour: colour("knob"), bounds: [24, 20, 24, 24] },
        key(120, 16, { taper: 0.5 })]),
      capture: [slabPaint(240, 64), keyPaint(120, 16)],
      samples: [
        { at: [36, 32], note: "the knob as a relief knob: flat top of the dome, in its colour" },
        { at: [29, 25], note: "relief knob towards the light" },
        { at: [152, 32], note: "the key as a raised face: interior" },
        { at: [152, 18], note: "raised face, top bevel" },
      ],
    },
    {
      name: "environment",
      description: "Metal and matte keys side by side: metal's steep sides reflect the studio's dark horizon.",
      scene: scene(176, 64, [slab(176, 64), key(16, 16, { material: "metal", finish: false }), key(96, 16, { finish: false })]),
      capture: [slabPaint(176, 64), keyPaint(16, 16), keyPaint(96, 16)],
      samples: [
        { at: [48, 46.5], note: "metal, bottom side" },
        { at: [48, 17.5], note: "metal, top side" },
        { at: [128, 46.5], note: "matte, bottom side" },
        { at: [128, 17.5], note: "matte, top side" },
      ],
    },
  ];
}

/** Fills in every sample's expected colour with the reference implementation. */
function expectations(cases: ConformanceCase[]): ConformanceCase[] {
  return cases.map(entry => {
    const captured = capturedFrom(entry.capture);
    const samples = entry.samples.map(sample => {
      // The centre of the device pixel containing the point, at a device scale of 1: what a renderer evaluates.
      const at = sample.at.map(value => Math.floor(value) + 0.5) as [number, number];
      const scene = entry.scene;
      // A stage scene renders over white (2C.5).
      const colour = scene.format === "strata-stage"
        ? (([r, g, b, a]) => [r * a + 1 - a, g * a + 1 - a, b * a + 1 - a])(shadeStage(scene, ...at))
        : shadePoint(scene, captured, ...at);
      return { at, note: sample.note, expect: toHex(colour.map(channel => channel * 255) as unknown as [number, number, number]) };
    });
    return { ...entry, samples };
  });
}

/** The version 1 suite with every expected colour computed by the reference implementation. */
export function buildConformance(source: TokenGroup = strataSource): ConformanceSuite {
  const cases = expectations(conformanceCases(source));
  return {
    format: "strata-conformance",
    model: "strata-scene/1",
    tolerance: conformanceTolerance,
    description: "Strata rendering model, version 1: Relief. Paint each case's capture (rounded rectangles in order, over transparent) as the layer's content, render the scene over its backdrop at a device scale of 1 (one device pixel per CSS px), and compare the decoded pixel whose centre is each sample's `at` with `expect`: every channel within `tolerance` (0–255).",
    cases,
  };
}

/** The Scene conformance cases (version 3), without expectations. */
export function sceneCases(source: TokenGroup = strataSource): ConformanceCase[] {
  const settings = sceneSettings(source, { theme: "light", depth: 0.5 });
  const colour = (role: string) => (source.colour as Record<string, { $extensions?: Record<string, { themes?: Record<string, string> }> }>)[role]!.$extensions!["dev.underglass.strata"]!.themes!.light!;
  const camera = { distance: 1600, vanish: [160, 100] as [number, number] };
  const stage = (overrides: Partial<StageScene>): StageScene =>
    ({ format: "strata-stage", version: 3, extent: { width: 320, height: 200 }, light: settings.light, camera, particles: [], ...overrides });
  // Where a point at height z over (x, y) appears on the screen.
  const seen = (x: number, y: number, z: number): [number, number] => [camera.vanish[0] + (x - camera.vanish[0]) * 1600 / (1600 - z), camera.vanish[1] + (y - camera.vanish[1]) * 1600 / (1600 - z)];
  // A mid-grey stage, so both the pool and the vignette show.
  const backdrop = { colour: "#8c95a3", pool: 0.6, vignette: 0.5 };
  // An environment map with a bright ring at the horizon and a dim sky and floor.
  const grid = Array.from({ length: environmentColumns * environmentRows }, (_, index) => (Math.floor(index / environmentColumns) === 7 || Math.floor(index / environmentColumns) === 8 ? 1.2 : 0.3));
  const keyScene = (environment: StrataScene["environment"]): StrataScene => ({ format: "strata-scene", version: 3, camera: { distance: 1600, vanish: [-100, 32] }, environment,
    extent: { width: 176, height: 64 }, outset: { top: 24, right: 24, bottom: 24, left: 24 }, ...settings,
    primitives: [{ object: "slab", rect: [0, 0, 176, 64], radius: 14, height: 8, taper: 3, material: "matte" },
      { object: "key", rect: [16, 16, 64, 32], radius: 8, height: 8, base: 8, taper: 3, material: "metal" },
      { object: "key", rect: [96, 16, 64, 32], radius: 8, height: 8, base: 8, taper: 3, material: "lacquer" }] });
  const keyCapture: CapturePaint[] = [{ rect: [0, 0, 176, 64], radius: 14, colour: colour("panel") },
    { rect: [16, 16, 64, 32], radius: 8, colour: colour("secondary") }, { rect: [96, 16, 64, 32], radius: 8, colour: colour("accent") }];
  return [
    {
      name: "backdrop",
      description: "The lit stage: a pool of the light towards the top left, falling off into a vignette at the edges.",
      scene: stage({ backdrop }), capture: [],
      samples: [
        { at: [160, 100], note: "the stage's centre" },
        { at: [100, 30], note: "in the pool, towards the light" },
        { at: [316, 196], note: "the far corner: the vignette" },
        { at: [4, 196], note: "the near corner" },
      ],
    },
    {
      name: "backdrop-tint",
      description: "A tinted stage: the backdrop colour mixed towards the tint.",
      scene: stage({ backdrop: { ...backdrop, tint: colour("accent"), tintStrength: 0.15 } }), capture: [],
      samples: [{ at: [160, 100], note: "centre, tinted" }, { at: [316, 4], note: "a corner, tinted and vignetted" }],
    },
    {
      name: "particles",
      description: "Particles with no backdrop, over white: a flat card, a card tilted towards the light, a disc, two overlapping cards (the higher one in front) and a half-transparent card.",
      scene: stage({ particles: [
        { shape: "card", position: [60, 60, 20], size: [24, 16], colour: colour("accent") },
        { shape: "card", position: [120, 60, 20], size: [24, 16], tilt: [40, -20], colour: colour("accent") },
        { shape: "disc", position: [180, 60, 20], size: [20, 20], colour: colour("danger") },
        { shape: "card", position: [250, 64, 40], size: [24, 16], rotation: 30, colour: colour("success") },
        { shape: "card", position: [246, 60, 10], size: [24, 16], colour: colour("warning") },
        { shape: "card", position: [160, 150, 20], size: [30, 20], opacity: 0.5, colour: colour("accent") },
      ] }), capture: [],
      samples: [
        { at: seen(60, 60, 20), note: "flat card: its colour" },
        { at: seen(120, 60, 20), note: "a card tilted towards the light: brighter" },
        { at: seen(180, 60, 20), note: "a disc" },
        { at: seen(250, 64, 40), note: "where two cards overlap, the higher one is in front" },
        { at: seen(160, 150, 20), note: "a half-transparent card over white" },
        { at: [20, 180], note: "no particle: white" },
      ],
    },
    {
      name: "particles-over-backdrop",
      description: "A particle over the lit backdrop.",
      scene: stage({ backdrop, particles: [{ shape: "disc", position: [160, 100, 30], size: [24, 24], colour: colour("accent"), roughness: 0.2 }] }), capture: [],
      samples: [{ at: seen(160, 100, 30), note: "the disc, with its specular" }, { at: [160, 140], note: "the backdrop around it" }],
    },
    {
      name: "environment-map",
      description: "Metal and lacquer keys reflecting an environment map with a bright horizon instead of the studio.",
      scene: keyScene({ source: "map", strength: 0.6, grid }), capture: keyCapture,
      samples: [
        { at: [48, 46.5], note: "metal, bottom side: reflects the bright horizon" },
        { at: [48, 17.5], note: "metal, top side" },
        { at: [48, 32], note: "metal cap: no environment term" },
        { at: [128, 46.5], note: "lacquer, bottom side" },
      ],
    },
  ];
}

/** The version 3 (Scene) suite with every expected colour computed by the reference implementation. */
export function buildSceneConformance(source: TokenGroup = strataSource): ConformanceSuite {
  return {
    format: "strata-conformance",
    model: "strata-scene/3",
    tolerance: conformanceTolerance,
    description: "Strata rendering model, version 3: Scene. Stage scenes (format strata-stage) have no capture: render each over white at a device scale of 1. Object scenes render as in version 2. Compare the decoded pixel whose centre is each sample's `at` with `expect`, every channel within `tolerance` (0–255). A renderer conforms to version 3 when it passes this suite, objects-2.json and relief-1.json.",
    cases: expectations(sceneCases(source)),
  };
}

/** The version 2 (Objects) suite with every expected colour computed by the reference implementation. */
export function buildObjectsConformance(source: TokenGroup = strataSource): ConformanceSuite {
  return {
    format: "strata-conformance",
    model: "strata-scene/2",
    tolerance: conformanceTolerance,
    description: "Strata rendering model, version 2: Objects. As version 1: paint each case's capture as the layer's content, render the scene over its backdrop at a device scale of 1, and compare the decoded pixel whose centre is each sample's `at` with `expect`, every channel within `tolerance` (0–255). A renderer conforms to version 2 when it passes this suite and relief-1.json.",
    cases: expectations(objectsCases(source)),
  };
}
