/**
 * The premium character's numbers for the Phase I1 prototype page (`ui-proto-instrument.html`,
 * docs/ui-library/instrument.md, Phase I1): one place for every proportion, height, travel, throw, spring and material
 * the three presentations (Instrument meshes, Strata Objects, CSS) read, so a variant is a set of tuning values and
 * everything else follows. Heights are the 50% depth values, scaled by Strata's `depthScale` (0.6 at 0%, 1 at 50%,
 * 1.6 at 100%); widths, travel and angles do not scale with depth. Throwaway prototype code: Phase I1's spec work
 * copies the accepted numbers into the design language and `premium.json`.
 *
 * Second iteration: the materials take I0.4's settled values (brushed base 0.86 linear, roughness 0.3, anisotropy 0.9
 * with the grain map; lacquer roughness 0.5, coat 1 at 0.03; gold through its base colour at roughness 0.18; chrome
 * 0.04), glass is the capture-refraction shader, chamfers are 2 px, the bat lever is longer with a bigger ball and a
 * wider throw, the rocker and wall paddles tip further with an accent flag, the push button travels further, and the
 * panel gains a display window.
 */

/** The tuning values a variant is made of; every one is in the page's query string. */
export interface TuningValues {
  /** 0–100. */
  depth: number;
  capMaterial: MaterialName;
  skirtMaterial: MaterialName;
  /** The faceplate and wall plate; `auto` follows the theme (brushed aluminium on light, gunmetal on dark). */
  plateMaterial: MaterialName | "auto";
  /** Knob skirt diameter, CSS px (the detented knob is 80% of it). */
  size: number;
  /** Skirt (flange) height at 50% depth, CSS px. */
  skirt: number;
  /** Cap chamfer, CSS px. */
  chamfer: number;
  /** Fader travel, CSS px. */
  travel: number;
  /** Detented knob positions. */
  detents: number;
  /** Key light intensity. */
  light: number;
  /** Studio reflections (environment intensity). */
  reflections: number;
  /** The pointer light (1 on, 0 off). */
  pointer: number;
  theme: "light" | "dark";
}

export const materialNames = ["brushed", "polished", "lacquer", "glass", "gold", "gunmetal"] as const;
export type MaterialName = (typeof materialNames)[number];
type Rgb = readonly [number, number, number];

/**
 * A material recipe: the PBR numbers the Instrument level uses, and the colours the Objects (flat face colour) and CSS
 * (base, highlight and shade of the gradients) presentations use for the same material.
 */
export interface MaterialRecipe {
  label: string;
  /** sRGB base colour (for metals, the specular colour F0). */
  colour: Rgb;
  metallic: number;
  roughness: number;
  /** Brushed-metal anisotropy 0–1 (`brush.strength`), with the grain normal map. */
  brush: number;
  coat: number;
  coatRoughness: number;
  /** How bright the studio reflections are on it. */
  environment: number;
  /** Lite's `directIntensity`: the share of the key light's direct term. */
  direct: number;
  /** Print colour on this material (pointer lines, grip lines). */
  ink: Rgb;
  /** Glass: drawn by the capture-refraction shader instead of Lite PBR. */
  glass?: boolean;
  /** CSS rendering: the colour of the face, its lit edge and its shaded edge. */
  css: { base: Rgb; light: Rgb; shade: Rgb; gloss: number };
  /** The faceplate in this material (printed text sits on it). */
  plate: { base: Rgb; ink: Rgb; muted: Rgb; grain: number };
}

export const materials: Record<MaterialName, MaterialRecipe> = {
  brushed: {
    label: "Brushed aluminium", colour: [239, 240, 241], metallic: 1, roughness: 0.3, brush: 0.9, coat: 0, coatRoughness: 0, environment: 1, direct: 1,
    ink: [26, 28, 32], css: { base: [204, 206, 210], light: [248, 249, 250], shade: [128, 131, 137], gloss: 0.35 },
    plate: { base: [206, 208, 211], ink: [22, 23, 26], muted: [50, 52, 57], grain: 0.05 },
  },
  polished: {
    label: "Polished aluminium", colour: [250, 250, 251], metallic: 1, roughness: 0.04, brush: 0, coat: 0, coatRoughness: 0, environment: 1, direct: 1,
    ink: [26, 28, 32], css: { base: [214, 216, 220], light: [255, 255, 255], shade: [92, 95, 101], gloss: 0.8 },
    plate: { base: [222, 224, 227], ink: [22, 23, 26], muted: [50, 52, 57], grain: 0.015 },
  },
  lacquer: {
    label: "Black lacquer", colour: [28, 28, 30], metallic: 0, roughness: 0.5, brush: 0, coat: 1, coatRoughness: 0.03, environment: 1, direct: 1,
    ink: [236, 237, 240], css: { base: [24, 24, 27], light: [120, 122, 128], shade: [4, 4, 5], gloss: 0.9 },
    plate: { base: [24, 24, 27], ink: [236, 237, 240], muted: [196, 198, 204], grain: 0 },
  },
  glass: {
    label: "Glass", colour: [236, 240, 244], metallic: 0, roughness: 0.02, brush: 0, coat: 1, coatRoughness: 0, environment: 1.5, direct: 1, glass: true,
    ink: [30, 32, 36], css: { base: [196, 206, 212], light: [255, 255, 255], shade: [70, 82, 92], gloss: 1 },
    plate: { base: [30, 34, 39], ink: [236, 239, 243], muted: [196, 202, 210], grain: 0 },
  },
  gold: {
    label: "Gold", colour: [255, 219, 147], metallic: 1, roughness: 0.18, brush: 0, coat: 0, coatRoughness: 0, environment: 1, direct: 1,
    ink: [52, 38, 14], css: { base: [208, 178, 118], light: [252, 236, 196], shade: [128, 100, 56], gloss: 0.45 },
    plate: { base: [202, 178, 130], ink: [26, 20, 10], muted: [48, 38, 22], grain: 0.04 },
  },
  gunmetal: {
    label: "Dark gunmetal", colour: [104, 107, 114], metallic: 1, roughness: 0.36, brush: 0.9, coat: 0, coatRoughness: 0, environment: 1, direct: 1,
    ink: [236, 237, 240], css: { base: [76, 79, 86], light: [164, 168, 176], shade: [28, 30, 34], gloss: 0.3 },
    plate: { base: [56, 58, 64], ink: [238, 239, 242], muted: [198, 201, 208], grain: 0.04 },
  },
};

export const defaults: TuningValues = {
  depth: 50, capMaterial: "brushed", skirtMaterial: "polished", plateMaterial: "auto",
  size: 64, skirt: 2.5, chamfer: 2, travel: 180, detents: 11, light: 1.6, reflections: 1, pointer: 1, theme: "light",
};

/** Strata's `depthScale`: 0.6 at 0%, 1 at 50%, 1.6 at 100%, piecewise linear. */
export const depthScale = (depth: number) => { const d = Math.min(1, Math.max(0, depth / 100)); return d < 0.5 ? 0.6 + 0.8 * d : 1 + 1.2 * (d - 0.5); };
/** Strata's `shadow.strength`: 0.14, 0.24, 0.32. */
export const shadowStrength = (depth: number) => { const d = Math.min(1, Math.max(0, depth / 100)); return d < 0.5 ? 0.14 + 0.2 * d : 0.24 + 0.16 * (d - 0.5); };

/** Everything the presentations draw, resolved from the tuning values. CSS px, radians. */
export function resolveTokens(values: TuningValues) {
  const s = depthScale(values.depth);
  const plateName: MaterialName = values.plateMaterial === "auto" ? (values.theme === "dark" ? "gunmetal" : "brushed") : values.plateMaterial;
  const knob = (size: number) => {
    const cap = Math.round(size * 0.8);
    return {
      /** Skirt diameter, cap diameter and the native box (the dial: skirt plus the printed scale). */
      size, cap, box: size + 76,
      skirtHeight: values.skirt * s, capHeight: 16 * s, chamfer: Math.min(values.chamfer, cap / 2 - 2),
      /** The top's spun crown (a shallow dome, so the top shows the studio, not one grey). */
      crown: 1.2 * s,
      /** Edge break on the skirt's rim. */
      skirtBreak: Math.min(0.8, (values.skirt * s) / 2),
      /** The skirt top's slope (a shallow cone), radians. */
      skirtSlope: (7.5 * Math.PI) / 180,
      /** Engraved pointer line, from `from` to `to` of the top's radius. */
      pointer: { width: 2.2, from: 0.28, to: 0.86, rise: 0.08 },
      /** A glass cap: a short wall and a superellipse dome (a plano-convex lens over the printed hub). */
      dome: { wall: 2 * s, exponent: 2, height: 22 * s, radius: Math.round(cap * 0.45) },
      /** The printed hub ring under the cap's centre (seen through a glass cap). */
      hub: 7,
      sweep: (270 * Math.PI) / 180,
    };
  };
  return {
    values, depthScale: s, shadow: { strength: shadowStrength(values.depth), contact: 0.22 },
    light: { azimuth: 323, elevation: 41, intensity: values.light, ambient: 0.35, environment: values.reflections },
    materials: { cap: values.capMaterial, skirt: values.skirtMaterial, plate: plateName },
    knob: knob(values.size), small: knob(Math.round(values.size * 0.8)),
    detents: Math.max(2, Math.round(values.detents)),
    fader: { travel: values.travel, width: 30, length: 42, height: 12 * s, taper: 0.6, chamfer: 2, radius: 3, box: 46, grip: { width: 1.6, rise: 0.08 } },
    slide: { box: [64, 28] as const, block: [24, 20] as const, height: 6 * s, taper: 0.4, chamfer: 2, radius: 3, inset: 6, slot: [50, 8] as const, flag: 0.06 },
    rocker: { box: [38, 62] as const, bezel: [38, 62] as const, bezelHeight: 2 * s, bezelTaper: 0.8, paddle: [28, 50] as const, end: 12 * s, centre: 4 * s, flag: [18, 9] as const },
    bat: { box: [48, 92] as const, nut: 12, nutHeight: 3 * s, bushing: 7, bushingHeight: 7 * s, length: 40 * Math.min(s, 1.15), pivot: 5 * s, base: 3.4, neck: 2.7, ball: 5.6, throw: (40 * Math.PI) / 180 },
    wall: { box: [66, 92] as const, plateHeight: 3 * s, plateTaper: 1, radius: 6, paddle: [30, 54] as const, paddleHeight: 7 * s, paddleTaper: 0.6, chamfer: 2, crown: 1.6, throw: (9 * Math.PI) / 180, flag: [12, 4] as const },
    button: { box: 64, cap: 40, height: 6 * s, taper: 0.6, chamfer: 2, travel: 4 * s, latch: 1.8 * s, bezel: [27, 22.6] as const, bezelHeight: 3.2 * s, ring: [22.6, 20.6] as const },
    /** The display window: a bezel (border, rise, chamfer) round a flat glass pane over the backlit window. */
    display: { box: [236, 58] as const, radius: 8, edge: 0.5, border: 7, rise: 2.4 * s, taper: 1.2, chamfer: 2, glass: 2.4 * s, glassTaper: 2.6, band: 0.3, horizon: 0.25 },
    accent: [255, 146, 40] as Rgb,
    /** Springs (stiffness, damping, per unit mass) and the reduced-motion form: an instant pose. */
    springs: {
      knob: { stiffness: 420, damping: 41 }, detent: { stiffness: 900, damping: 42 }, fader: { stiffness: 420, damping: 41 },
      slide: { stiffness: 600, damping: 49 }, rocker: { stiffness: 1200, damping: 58 }, bat: { stiffness: 1400, damping: 45 },
      wall: { stiffness: 1200, damping: 58 }, button: { stiffness: 1600, damping: 80 },
    },
  };
}
export type ResolvedTokens = ReturnType<typeof resolveTokens>;

/** Reads tuning values from a query string, falling back to the defaults for anything missing or invalid. */
export function parseValues(search: string): TuningValues {
  const params = new URLSearchParams(search), values: TuningValues = { ...defaults };
  const number = (key: keyof TuningValues, min: number, max: number) => {
    const raw = params.get(key);
    if (raw !== null && Number.isFinite(Number(raw))) (values as unknown as Record<string, number>)[key] = Math.min(max, Math.max(min, Number(raw)));
  };
  number("depth", 0, 100); number("size", 40, 96); number("skirt", 0, 8); number("chamfer", 0, 6); number("travel", 100, 260); number("detents", 2, 24); number("light", 0.5, 3); number("reflections", 0, 2); number("pointer", 0, 1);
  for (const key of ["capMaterial", "skirtMaterial"] as const) { const raw = params.get(key); if (raw && (materialNames as readonly string[]).includes(raw)) values[key] = raw as MaterialName; }
  const plate = params.get("plateMaterial");
  if (plate && (plate === "auto" || (materialNames as readonly string[]).includes(plate))) values.plateMaterial = plate as TuningValues["plateMaterial"];
  if (params.get("theme") === "dark") values.theme = "dark";
  return values;
}
/** The query string for `values` (only what differs from the defaults). */
export function queryOf(values: TuningValues): string {
  const params = new URLSearchParams();
  for (const key of Object.keys(defaults) as (keyof TuningValues)[]) if (values[key] !== defaults[key]) params.set(key, String(values[key]));
  const text = params.toString();
  return text ? `?${text}` : "";
}
