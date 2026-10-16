/**
 * Material finish on a raised face (design language section 4, finish zones), shared by every presentation so they
 * agree. A centred single-line label sits between 35% and 65% of the face height, so a finish works only in the
 * zones labels never reach: the top zone, 0–32% (a coat's reflection band and the dark horizon under it, a gloss
 * sheen, the bright half of brushed metal), and the bottom zone, 70–100% (the dark half of brushed metal).
 */
import { flatten, numeric, valueOf, type ResolveOptions, type TokenGroup } from "./model.ts";

/** The parameters of a material that shape its finish. */
export interface FinishRecipe {
  roughness: number;
  metallic: number;
  /** Clear-coat strength, 0–1. */
  coat: number;
  coatRoughness: number;
}

const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** The finish at `along` (0 at the top of the face, 1 at the bottom): how far to mix towards white and towards black. */
export function finish(along: number, recipe: FinishRecipe): [brighten: number, darken: number] {
  const rise = 0.008 + (0.05 - 0.008) * recipe.coatRoughness;
  const band = recipe.coat * 0.6 * smooth(0.03, 0.03 + rise, along) * (1 - smooth(0.15, 0.26, along));
  const horizon = recipe.coat * 0.16 * smooth(0.24, 0.27, along) * (1 - smooth(0.28, 0.32, along));
  const sheen = Math.max(0, 0.5 - recipe.roughness) * 0.8 * (1 - smooth(0, 0.27, along));
  const metalTop = recipe.metallic * 0.4 * (1 - smooth(0.05, 0.28, along));
  const metalBottom = recipe.metallic * 0.36 * smooth(0.72, 0.97, along);
  return [Math.max(band, sheen, metalTop), Math.max(metalBottom, horizon)];
}

/** The finish as a CSS `background-image`: the profile sampled into gradient stops over the face height. */
export function finishGradient(recipe: FinishRecipe): string {
  const stops: string[] = [];
  let visible = false;
  for (let step = 0; step <= 40; step++) {
    const along = step / 40, [bright, dark] = finish(along, recipe);
    if (bright > 0.001 || dark > 0.001) visible = true;
    const colour = bright >= dark ? `rgb(255 255 255 / ${bright.toFixed(3)})` : `rgb(0 0 0 / ${dark.toFixed(3)})`;
    stops.push(`${colour} ${(along * 100).toFixed(1)}%`);
  }
  return visible ? `linear-gradient(to bottom, ${stops.join(", ")})` : "none";
}

/** Each material preset's finish recipe at a depth and theme, from the token source. */
export function finishRecipes(source: TokenGroup, options: ResolveOptions = {}): Record<string, FinishRecipe> {
  const values = new Map(flatten(source).map(token => [token.path, valueOf(token, options)]));
  const at = (path: string) => (values.has(path) ? numeric(values.get(path)!) : 0);
  const presets = new Set([...values.keys()].filter(path => path.startsWith("material.presets.")).map(path => path.split(".")[2]!));
  return Object.fromEntries([...presets].map(preset => {
    const base = `material.presets.${preset}`;
    return [preset, { roughness: values.has(`${base}.base.roughness`) ? at(`${base}.base.roughness`) : 1, metallic: at(`${base}.base.metallic`), coat: at(`${base}.coat.strength`), coatRoughness: at(`${base}.coat.roughness`) }];
  }));
}
