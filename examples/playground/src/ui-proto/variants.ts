/**
 * Strata Phase 1 look prototypes (docs/ui-library/plan.md): three candidate looks that differ only in how physical
 * they are. The light direction, palette and layout are the same in all three, so the comparison isolates depth,
 * bevel, shadow and material. These are throwaway prototype values; the accepted look becomes the Phase 1 tokens.
 */
export interface LookTokens {
  name: string;
  summary: string;
  /** Direction towards the key light in face-local CSS axes (x right, y down, z towards the viewer). */
  light: readonly [number, number, number];
  /** Relief level. */
  bevel: number; shadowStrength: number; panelHeight: number; raisedHeight: number; wellDepth: number;
  interiorMax: number; hoverLift: number; pressSink: number; hoverHeight: number; pressHeight: number;
  /** Bevel shading gain: how strongly bevel normals catch and lose the light. */
  bevelGain: number;
  /** Objects level. */
  keyHeight: number; keyTravel: number; taper: number; roughness: number; sheen: number;
  /** CSS recipe scale for edge strength (1 = the P0.6 tuning). */
  cssEdge: number;
}

const light = [-0.45, -0.6, 0.66] as const;
const shared = { light, interiorMax: 0.04, hoverLift: 0.04, pressSink: 0.06, hoverHeight: 1.6, pressHeight: 0.25 };

export const looks: LookTokens[] = [
  { name: "A · Subtle", summary: "Quiet lift: soft, short shadows and gentle bevels. Closest to a flat UI.", ...shared,
    bevel: 4, shadowStrength: 0.18, panelHeight: 6, raisedHeight: 2, wellDepth: 1.5, bevelGain: 0.3,
    keyHeight: 4, keyTravel: 3, taper: 2, roughness: 0.8, sheen: 0.05, cssEdge: 0.6 },
  { name: "B · Medium", summary: "The Phase 0 probe values: clear bevels, readable depth, crisp shadows.", ...shared,
    bevel: 6, shadowStrength: 0.32, panelHeight: 10, raisedHeight: 3, wellDepth: 2, bevelGain: 0.55,
    keyHeight: 8, keyTravel: 6, taper: 3, roughness: 0.45, sheen: 0.1, cssEdge: 1 },
  { name: "C · Bold", summary: "Hardware feel: deep bevels, long shadows, visible material and travel.", ...shared,
    bevel: 9, shadowStrength: 0.42, panelHeight: 16, raisedHeight: 5, wellDepth: 3, bevelGain: 0.75,
    keyHeight: 12, keyTravel: 9, taper: 4, roughness: 0.3, sheen: 0.25, cssEdge: 1.3 },
];

/** Palette shared by all looks (sRGB 0-255). */
export const palette = {
  panel: [233, 235, 239], text: [28, 30, 36], field: [255, 255, 255], secondary: [247, 248, 250],
  accent: [37, 99, 235], onAccent: [255, 255, 255], track: [205, 209, 217], knob: [252, 252, 253],
} as const;
export const rgb = (colour: readonly number[]) => `rgb(${colour.join(", ")})`;

/** Screen offset of a cast shadow at `height`, away from the light. */
export function shadowOffset(look: LookTokens, height: number) {
  const [x, y, z] = look.light;
  return { x: -x / z * height, y: -y / z * height };
}

/** CSS relief for a shape: the P0.6 recipe, scaled by the look's edge strength. */
export function cssRelief(look: LookTokens, kind: "raised" | "well", height: number, cast = true): string {
  const length = Math.hypot(look.light[0], look.light[1]);
  const towards = { x: look.light[0] / length, y: look.light[1] / length };
  const at = (sign: number, scale: number) => `${(sign * towards.x * scale).toFixed(2)}px ${(sign * towards.y * scale).toFixed(2)}px`;
  const blur = (look.bevel * 0.6).toFixed(2), e = look.cssEdge;
  if (kind === "well") return `inset ${at(-1, look.bevel * 0.56)} ${blur}px rgba(0, 0, 0, ${(0.55 * e).toFixed(3)}), inset ${at(1, look.bevel * 0.6)} ${blur}px rgba(255, 255, 255, ${Math.min(1, 0.19 * e).toFixed(3)})`;
  const layers = [`inset ${at(1, look.bevel * 0.56)} ${blur}px rgba(0, 0, 0, ${Math.min(1, 0.62 * e).toFixed(3)})`, `inset ${at(-1, look.bevel * 0.6)} ${blur}px rgba(255, 255, 255, ${Math.min(1, e).toFixed(3)})`];
  if (cast) { const offset = shadowOffset(look, height); layers.push(`${offset.x.toFixed(2)}px ${offset.y.toFixed(2)}px ${(1.9 * height + 1).toFixed(2)}px rgba(0, 0, 0, ${Math.min(1, look.shadowStrength * 1.56).toFixed(3)})`); }
  return layers.join(", ");
}
