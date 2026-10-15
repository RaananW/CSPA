/**
 * Strata Phase 1 look prototypes page (`ui-proto-look.html`): each candidate look from `variants.ts` in three
 * presentations — Relief (GPU material pass), Objects (GPU meshes) and CSS only — side by side. Every panel is a
 * separate copy of the same native markup with unique ids, so all controls work. Throwaway prototype code.
 */
import type { DrawableCanvas } from "../ui-probes/common.ts";
import { mountObjects } from "./objects-view.ts";
import { mountRelief } from "./relief-view.ts";
import { cssRelief, looks, rgb, palette, type LookTokens } from "./variants.ts";

const grid = document.getElementById("grid")!;
const status = document.getElementById("status")!;
const template = document.getElementById("panel") as HTMLTemplateElement;
const modes = [
  { key: "relief", title: "Relief", note: "GPU lighting over flat native controls. Default level." },
  { key: "objects", title: "Objects", note: "Native controls as 3D meshes. Opt-in level." },
  { key: "css", title: "CSS only", note: "No GPU: the fallback, from the same tokens." },
] as const;

/** A copy of the panel whose ids (and the labels and controls that refer to them) carry `suffix`. */
function panel(suffix: string): HTMLElement {
  const face = (template.content.firstElementChild as HTMLElement).cloneNode(true) as HTMLElement;
  for (const element of face.querySelectorAll<HTMLElement>("[id]")) element.id += suffix;
  for (const label of face.querySelectorAll<HTMLLabelElement>("label[for]")) label.htmlFor += suffix;
  for (const element of face.querySelectorAll<HTMLElement>("[data-relief-control]")) element.dataset.reliefControl += suffix;
  return face;
}

/** The CSS-only presentation of a look, scoped to its column. */
function cssFor(look: LookTokens, scope: string): string {
  const accent = rgb(palette.accent);
  return `
${scope} .face { box-shadow: ${cssRelief(look, "raised", look.panelHeight)}; }
${scope} .face button { box-shadow: ${cssRelief(look, "raised", look.raisedHeight)}; }
${scope} .face button:hover { box-shadow: ${cssRelief(look, "raised", look.raisedHeight * look.hoverHeight)}; filter: brightness(${1 + look.interiorMax}); }
${scope} .face button:active { box-shadow: ${cssRelief(look, "raised", look.raisedHeight * look.pressHeight)}; filter: brightness(${1 - look.interiorMax}); }
${scope} .face .field, ${scope} .face .track { box-shadow: ${cssRelief(look, "well", look.wellDepth)}; }
${scope} .face .knob { box-shadow: ${cssRelief(look, "raised", look.raisedHeight)}; }
${scope} .face button:focus-visible, ${scope} .face .field:focus-visible, ${scope} .face .switch-input:focus-visible + .track { outline: 3px solid ${accent}; outline-offset: 0.5px; }
@media (prefers-reduced-motion: no-preference) {
  ${scope} .face button, ${scope} .face .knob { transition: box-shadow 120ms ease-out, filter 120ms ease-out, left 160ms ease-out; }
}`;
}

const corner = document.createElement("div");
grid.append(corner);
looks.forEach(look => {
  const head = document.createElement("div");
  head.className = "look-head";
  head.innerHTML = `<h2></h2><p></p>`;
  head.querySelector("h2")!.textContent = look.name;
  head.querySelector("p")!.textContent = look.summary;
  grid.append(head);
});

const style = document.createElement("style");
document.head.append(style);
const mounts: Promise<unknown>[] = [];
for (const mode of modes) {
  const label = document.createElement("div");
  label.className = "mode";
  label.innerHTML = `<span></span><small></small>`;
  label.querySelector("span")!.textContent = mode.title;
  label.querySelector("small")!.textContent = mode.note;
  grid.append(label);
  looks.forEach((look, index) => {
    const face = panel(`-${mode.key}-${index}`);
    const cell = document.createElement("div");
    cell.className = `${mode.key} look-${index}`;
    // In the document before mounting: the renderers size themselves from the canvas's layout box.
    grid.append(cell);
    if (mode.key === "css") {
      const stage = document.createElement("div");
      stage.className = "stage";
      stage.append(face);
      cell.append(stage);
      style.textContent += cssFor(look, `.css.look-${index}`);
    } else {
      const canvas = document.createElement("canvas") as DrawableCanvas;
      canvas.className = "stage";
      canvas.setAttribute("content", "drawable");
      face.setAttribute("drawable", "");
      canvas.append(face);
      cell.append(canvas);
      mounts.push((mode.key === "relief" ? mountRelief(canvas, face, look) : mountObjects(canvas, face, look))
        .catch(error => { status.textContent += `${look.name} ${mode.title}: ${error}\n`; throw error; }));
    }
  });
}
const ready = Promise.allSettled(mounts).then(results => {
  const failed = results.filter(result => result.status === "rejected").length;
  status.textContent += failed ? `${failed} GPU panels unavailable; their native controls still work.` : "All panels ready.";
  return { failed };
});
declare global { interface Window { lookPrototypes: { ready: Promise<{ failed: number }> } } }
window.lookPrototypes = { ready };
