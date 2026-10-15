/**
 * Material finish on a raised control's face, shared by every presentation so they agree. A centred single-line
 * label sits between 35% and 65% of the face height, so a finish works in the zones labels never reach: the top
 * zone, 0–32% (a coat's reflection band and the dark horizon line under it, a gloss sheen, the bright half of
 * brushed metal), and the bottom zone, 70–100% (the dark half of brushed metal).
 * `along` runs from 0 at the top of the face to 1 at the bottom. The result is (brighten, darken): mix towards
 * white by the first, towards black by the second. `finishWgsl` (Relief pass and the Objects overlay) and
 * `finishCss` (the CSS presentation) implement the same profile.
 */
import type { MaterialRecipe } from "./variants.ts";

/** WGSL: `finish(along, recipe)` with recipe = (roughness, metallic, coat, coat roughness). */
export const finishWgsl = /* wgsl */ `
fn finish(along: f32, recipe: vec4f) -> vec2f {
  let roughness = recipe.x; let metallic = recipe.y; let coat = recipe.z; let coatRoughness = recipe.w;
  // Coat band: a reflection from 3% to 27% of the face, crisper as the coat gets smoother.
  let rise = mix(0.008, 0.05, coatRoughness);
  let band = coat * 0.6 * smoothstep(0.03, 0.03 + rise, along) * (1 - smoothstep(0.15, 0.26, along));
  // Horizon: the reflection's dark lower edge, which also shows the coat on light faces.
  let horizon = coat * 0.16 * smoothstep(0.24, 0.27, along) * (1 - smoothstep(0.28, 0.32, along));
  // Gloss sheen: a soft fade from the top, stronger as the base gets smoother.
  let sheen = max(0.0, 0.5 - roughness) * 0.8 * (1 - smoothstep(0.0, 0.27, along));
  // Brushed metal: bright across the top quarter, dark across the bottom quarter.
  let metalTop = metallic * 0.4 * (1 - smoothstep(0.05, 0.28, along));
  let metalBottom = metallic * 0.36 * smoothstep(0.72, 0.97, along);
  return vec2f(max(max(band, sheen), metalTop), max(metalBottom, horizon));
}
`;

/** The same profile in JavaScript (for CSS gradients and tests). */
export function finish(along: number, recipe: MaterialRecipe): [number, number] {
  const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const rise = 0.008 + (0.05 - 0.008) * recipe.coatRoughness;
  const band = recipe.coat * 0.6 * smooth(0.03, 0.03 + rise, along) * (1 - smooth(0.15, 0.26, along));
  const horizon = recipe.coat * 0.16 * smooth(0.24, 0.27, along) * (1 - smooth(0.28, 0.32, along));
  const sheen = Math.max(0, 0.5 - recipe.roughness) * 0.8 * (1 - smooth(0, 0.27, along));
  const metalTop = recipe.metallic * 0.4 * (1 - smooth(0.05, 0.28, along));
  const metalBottom = recipe.metallic * 0.36 * smooth(0.72, 0.97, along);
  return [Math.max(band, sheen, metalTop), Math.max(metalBottom, horizon)];
}

/** CSS `background-image` for the finish: the profile sampled into gradient stops over the face height. */
export function finishCss(recipe: MaterialRecipe): string {
  const stops: string[] = [];
  for (let step = 0; step <= 40; step++) {
    const along = step / 40, [bright, dark] = finish(along, recipe);
    const colour = bright >= dark ? `rgba(255, 255, 255, ${bright.toFixed(3)})` : `rgba(0, 0, 0, ${dark.toFixed(3)})`;
    stops.push(`${colour} ${(along * 100).toFixed(1)}%`);
  }
  return `linear-gradient(to bottom, ${stops.join(", ")})`;
}
