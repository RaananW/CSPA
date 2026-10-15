/**
 * Relief tokens shared by the Strata GPU relief probe (`relief.ts`, P0.2) and its CSS recipe (`parity.ts`, P0.6),
 * so both presentations come from one source. These are probe values; Phase 1 sets the real ones.
 */
export const reliefTokens = {
  /** Direction towards the key light in face-local CSS axes (x right, y down, z towards the viewer). */
  light: [-0.45, -0.6, 0.66] as const,
  /** Largest brightness change on a face interior, so text contrast holds. */
  interiorMax: 0.04,
  outset: 40, bevel: 6, shadowStrength: 0.32,
  panelHeight: 10, raisedHeight: 3, wellDepth: 2,
  /** Interior brightness change on hover and on press, before the `interiorMax` clamp. */
  hoverLift: 0.04, pressSink: 0.06,
  /** Height multipliers for hover and press. */
  hoverHeight: 1.6, pressHeight: 0.25,
  accent: [37, 99, 235] as const,
};

/** Screen offset of a shape's cast shadow at `height`: away from the light, longer as the light gets lower. */
export function shadowOffset(height: number) {
  const [x, y, z] = reliefTokens.light;
  return { x: -x / z * height, y: -y / z * height };
}

/**
 * Constants of the CSS approximation itself (not design tokens): strengths, offsets and blurs of the inset edges
 * and the cast shadow, as multiples of the tokens. Tuned against the GPU pass by the P0.6 probe.
 */
export const cssRecipe = {
  darkAlpha: 0.62, darkOffset: 0.56, lightAlpha: 1, lightOffset: 0.6, edgeBlur: 0.6,
  wellDarkAlpha: 0.55, wellLightAlpha: 0.19, shadowAlpha: 1.56, shadowBlur: 1.9,
};
export type CssRecipe = typeof cssRecipe;

/**
 * CSS `box-shadow` for a relief shape at `height` (raised) or `depth` (well). Cast shadows follow the same
 * light and height as the GPU pass; the bevel is approximated by inset light and dark edges along the light axis.
 */
export function reliefShadow(kind: "raised" | "well", height: number, cast = true, recipe: CssRecipe = cssRecipe): string {
  const t = reliefTokens, r = recipe;
  const length = Math.hypot(t.light[0], t.light[1]);
  // Unit vector towards the light in the face plane.
  const towards = { x: t.light[0] / length, y: t.light[1] / length };
  const edge = (scale: number) => `${(towards.x * scale).toFixed(2)}px ${(towards.y * scale).toFixed(2)}px`;
  const away = (scale: number) => `${(-towards.x * scale).toFixed(2)}px ${(-towards.y * scale).toFixed(2)}px`;
  const blur = t.bevel * r.edgeBlur;
  if (kind === "well") {
    // A well is lit on the far wall: dark along the edge nearest the light, light along the opposite edge.
    return [`inset ${away(t.bevel * r.darkOffset)} ${blur}px rgba(0, 0, 0, ${r.wellDarkAlpha})`, `inset ${edge(t.bevel * r.lightOffset)} ${blur}px rgba(255, 255, 255, ${r.wellLightAlpha})`].join(", ");
  }
  const offset = shadowOffset(height);
  const layers = [`inset ${edge(t.bevel * r.darkOffset)} ${blur}px rgba(0, 0, 0, ${r.darkAlpha})`, `inset ${away(t.bevel * r.lightOffset)} ${blur}px rgba(255, 255, 255, ${r.lightAlpha})`];
  if (cast) layers.push(`${offset.x.toFixed(2)}px ${offset.y.toFixed(2)}px ${(r.shadowBlur * height + 1).toFixed(2)}px rgba(0, 0, 0, ${(t.shadowStrength * r.shadowAlpha).toFixed(3)})`);
  return layers.join(", ");
}
