/**
 * Strata Phase 0 probe P0.6 (docs/ui-library/plan.md): the CSS presentation of the relief probe's panel. The
 * stylesheet is generated from the same tokens as the GPU material pass (`tokens.ts`): cast shadows from the light
 * and each shape's height, bevels and wells as inset light and dark edges, physical states on :hover and :active,
 * and the focus edge as an outline. The browser test compares this page with the GPU page, state by state.
 */
import { cssRecipe, reliefShadow, reliefTokens as t } from "./tokens.ts";

// Recipe constants may be overridden from the query string (?darkAlpha=0.6) while tuning against the GPU pass.
const query = new URLSearchParams(location.search);
const recipe = { ...cssRecipe };
for (const name of Object.keys(recipe) as (keyof typeof recipe)[]) if (query.has(name)) recipe[name] = Number(query.get(name));
const shadow = (kind: "raised" | "well", height: number) => reliefShadow(kind, height, true, recipe);
const accent = `rgb(${t.accent.join(", ")})`;
const css = `
#face { box-shadow: ${shadow("raised", t.panelHeight)}; }
#face [data-relief="raised"] { box-shadow: ${shadow("raised", t.raisedHeight)}; }
#face [data-relief="raised"]:hover { box-shadow: ${shadow("raised", t.raisedHeight * t.hoverHeight)}; filter: brightness(${1 + Math.min(t.hoverLift, t.interiorMax)}); }
#face [data-relief="raised"]:active { box-shadow: ${shadow("raised", t.raisedHeight * t.pressHeight)}; filter: brightness(${1 - Math.min(t.pressSink, t.interiorMax)}); }
#face [data-relief="well"] { box-shadow: ${shadow("well", t.wellDepth)}; }
#face [data-relief]:focus-visible { outline: 3px solid ${accent}; outline-offset: 0.5px; }
@media (prefers-reduced-motion: no-preference) { #face [data-relief] { transition: box-shadow 120ms ease-out, filter 120ms ease-out; } }
`;
const style = document.createElement("style");
style.textContent = css;
document.head.append(style);
document.getElementById("status")!.textContent = "CSS relief ready";
declare global { interface Window { parityProbe: { css: string; recipe: typeof cssRecipe } } }
window.parityProbe = { css, recipe };
