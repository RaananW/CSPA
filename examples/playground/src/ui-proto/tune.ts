/**
 * Strata tuning page (`ui-proto-tune.html`): one panel as Relief, Objects and CSS only, driven live by the Strata
 * settings — depth (blending looks A → B → C), light direction, theme and accent. Settings round-trip through the
 * URL hash so a chosen configuration can be shared. Throwaway prototype code.
 */
import type { DrawableCanvas } from "../ui-probes/common.ts";
import { mountObjects } from "./objects-view.ts";
import { finish } from "./finish.ts";
import { mountRelief } from "./relief-view.ts";
import { contrastRatio, cssMaterial, cssRelief, defaultConfig, defaultMaterial, lookAt, materialPresets, paletteFor, presetOf,
  type LookTokens, type MaterialRecipe, type Palette, type StrataConfig } from "./variants.ts";

const row = document.getElementById("row")!;
const readout = document.getElementById("readout")!;
const template = document.getElementById("panel") as HTMLTemplateElement;
const inputs = {
  depth: document.getElementById("depth") as HTMLInputElement,
  azimuth: document.getElementById("azimuth") as HTMLInputElement,
  elevation: document.getElementById("elevation") as HTMLInputElement,
  theme: document.getElementById("theme") as HTMLSelectElement,
  accent: document.getElementById("accent") as HTMLInputElement,
};
const materialInputs = {
  preset: document.getElementById("material") as HTMLSelectElement,
  roughness: document.getElementById("roughness") as HTMLInputElement,
  metallic: document.getElementById("metallic") as HTMLInputElement,
  coat: document.getElementById("coat") as HTMLInputElement,
  coatRoughness: document.getElementById("coat-roughness") as HTMLInputElement,
};
const hex = (colour: readonly number[]) => `#${colour.map(channel => channel.toString(16).padStart(2, "0")).join("")}`;
const fromHex = (value: string) => [1, 3, 5].map(index => parseInt(value.slice(index, index + 2), 16)) as [number, number, number];

/** Settings from the URL hash (`#depth=45&azimuth=323&elevation=41&theme=light&accent=2563eb`), else the defaults. */
function readConfig(): StrataConfig {
  const hash = new URLSearchParams(location.hash.slice(1));
  const number = (key: string, fallback: number) => (hash.has(key) && Number.isFinite(Number(hash.get(key))) ? Number(hash.get(key)) : fallback);
  return {
    depth: number("depth", defaultConfig.depth * 100) / 100,
    azimuth: number("azimuth", defaultConfig.azimuth),
    elevation: number("elevation", defaultConfig.elevation),
    theme: hash.get("theme") === "dark" ? "dark" : "light",
    accent: /^[0-9a-f]{6}$/i.test(hash.get("accent") ?? "") ? fromHex(`#${hash.get("accent")}`) : defaultConfig.accent,
  };
}
let config = readConfig();
/** Controls material from the hash (`mat=lacquer`, or custom `rough`, `metal`, `coat`, `coatRough` in percent). */
function readMaterial(): MaterialRecipe {
  const hash = new URLSearchParams(location.hash.slice(1));
  const preset = materialPresets[hash.get("mat") ?? ""] ?? defaultMaterial;
  const percent = (key: string, fallback: number) => (hash.has(key) && Number.isFinite(Number(hash.get(key))) ? Number(hash.get(key)) / 100 : fallback);
  return { roughness: percent("rough", preset.roughness), metallic: percent("metal", preset.metallic), coat: percent("coat", preset.coat), coatRoughness: percent("coatRough", preset.coatRoughness) };
}
let material: MaterialRecipe = readMaterial();
let look: LookTokens = lookAt(config);
let palette: Palette = paletteFor(config);

/** A copy of the panel whose ids (and the labels and controls that refer to them) carry `suffix`. */
function panel(suffix: string): HTMLElement {
  const face = (template.content.firstElementChild as HTMLElement).cloneNode(true) as HTMLElement;
  for (const element of face.querySelectorAll<HTMLElement>("[id]")) element.id += suffix;
  for (const label of face.querySelectorAll<HTMLLabelElement>("label[for]")) label.htmlFor += suffix;
  for (const element of face.querySelectorAll<HTMLElement>("[data-relief-control]")) element.dataset.reliefControl += suffix;
  return face;
}

const cells = [
  { key: "relief", title: "Relief", note: "GPU lighting over flat native controls (default level)." },
  { key: "objects", title: "Objects", note: "Native controls as 3D meshes (opt-in level)." },
  { key: "css", title: "CSS only", note: "No GPU: the fallback, from the same settings." },
] as const;
const cssStyle = document.createElement("style");
document.head.append(cssStyle);
const views: { relief?: { update(): unknown }; objects?: { update(): unknown } } = {};
const mounts: Promise<unknown>[] = [];
for (const cell of cells) {
  const container = document.createElement("div");
  container.className = cell.key;
  container.innerHTML = `<h2></h2><p></p>`;
  container.querySelector("h2")!.textContent = cell.title;
  container.querySelector("p")!.textContent = cell.note;
  row.append(container);
  const face = panel(`-${cell.key}`);
  if (cell.key === "css") {
    const stage = document.createElement("div");
    stage.className = "stage";
    stage.append(face);
    container.append(stage);
    continue;
  }
  const canvas = document.createElement("canvas") as DrawableCanvas;
  canvas.className = "stage";
  canvas.setAttribute("content", "drawable");
  face.setAttribute("drawable", "");
  canvas.append(face);
  container.append(canvas);
  const mount = cell.key === "relief" ? mountRelief(canvas, face, () => look, () => palette, () => material) : mountObjects(canvas, face, () => look, () => palette, () => material);
  mounts.push(mount.then(view => { views[cell.key] = view; }, error => { readout.textContent = `${cell.title} unavailable: ${error}\n`; throw error; }));
}

/** CSS-only presentation for the current look and palette. */
function cssFor(): string {
  const accent = `rgb(${palette.accent.join(" ")})`;
  const scope = ".css";
  const finish = cssMaterial(look, material);
  return `
${scope} .face { box-shadow: ${cssRelief(look, "raised", look.panelHeight)}; }
${scope} .face button { box-shadow: ${finish.shadow}, ${cssRelief(look, "raised", look.raisedHeight)}; background-image: ${finish.image}; }
${scope} .face button:hover { box-shadow: ${finish.shadow}, ${cssRelief(look, "raised", look.raisedHeight * look.hoverHeight)}; filter: brightness(${1 + look.interiorMax}); }
${scope} .face button:active { box-shadow: ${finish.shadow}, ${cssRelief(look, "raised", look.raisedHeight * look.pressHeight)}; filter: brightness(${1 - look.interiorMax}); }
${scope} .face .field, ${scope} .face .track { box-shadow: ${cssRelief(look, "well", look.wellDepth)}; }
${scope} .face .knob { box-shadow: ${finish.shadow}, ${cssRelief(look, "raised", look.raisedHeight)}; background-image: ${finish.image}; }
${scope} .face button:focus-visible, ${scope} .face .field:focus-visible, ${scope} .face .switch-input:focus-visible + .track { outline: 3px solid ${accent}; outline-offset: 0.5px; }
@media (prefers-reduced-motion: no-preference) { ${scope} .face button, ${scope} .face .knob { transition: box-shadow 120ms ease-out, filter 120ms ease-out, left 160ms ease-out; } }`;
}

let rebuildTimer: ReturnType<typeof setTimeout> | undefined;
/** Applies `config`: theme variables, CSS recipe, live relief redraw and a debounced objects rebuild. */
function apply() {
  look = lookAt(config);
  palette = paletteFor(config);
  const root = document.documentElement.style;
  for (const [name, colour] of Object.entries({ stage: palette.stage, panel: palette.panel, text: palette.text, muted: palette.muted, field: palette.field,
    secondary: palette.secondary, accent: palette.accent, "on-accent": palette.onAccent, track: palette.track, knob: palette.knob })) root.setProperty(`--${name}`, colour.join(" "));
  cssStyle.textContent = cssFor();
  views.relief?.update();
  clearTimeout(rebuildTimer);
  rebuildTimer = setTimeout(() => views.objects?.update(), 120);
  inputs.depth.value = String(Math.round(config.depth * 100));
  inputs.azimuth.value = String(config.azimuth);
  inputs.elevation.value = String(config.elevation);
  inputs.theme.value = config.theme;
  inputs.accent.value = hex(config.accent);
  materialInputs.preset.value = presetOf(material);
  materialInputs.roughness.value = String(Math.round(material.roughness * 100));
  materialInputs.metallic.value = String(Math.round(material.metallic * 100));
  materialInputs.coat.value = String(Math.round(material.coat * 100));
  materialInputs.coatRoughness.value = String(Math.round(material.coatRoughness * 100));
  for (const output of document.querySelectorAll<HTMLOutputElement>("output")) {
    const source = document.getElementById(output.htmlFor.value) as HTMLInputElement;
    output.textContent = source === inputs.depth ? `${source.value}%` : source === inputs.azimuth || source === inputs.elevation ? `${source.value}°` : (Number(source.value) / 100).toFixed(2);
  }
  const preset = presetOf(material);
  const materialHash = preset !== "custom" ? `mat=${preset}` : `rough=${Math.round(material.roughness * 100)}&metal=${Math.round(material.metallic * 100)}&coat=${Math.round(material.coat * 100)}&coatRough=${Math.round(material.coatRoughness * 100)}`;
  const hash = `depth=${Math.round(config.depth * 100)}&azimuth=${config.azimuth}&elevation=${config.elevation}&theme=${config.theme}&accent=${hex(config.accent).slice(1)}&${materialHash}`;
  history.replaceState(null, "", `#${hash}`);
  const textContrast = contrastRatio(palette.onAccent, palette.accent);
  const brightened = palette.accent.map(channel => Math.min(255, Math.round(channel * (1 + look.interiorMax))));
  readout.textContent = [
    `Settings: ${hash}`,
    `Depth ${Math.round(config.depth * 100)}%: bevel ${look.bevel.toFixed(1)} px, shadow ${look.shadowStrength.toFixed(2)}, panel ${look.panelHeight.toFixed(1)} px, controls ${look.raisedHeight.toFixed(1)} px, wells ${look.wellDepth.toFixed(1)} px`,
    `Objects: key ${look.keyHeight.toFixed(1)} px, travel ${look.keyTravel.toFixed(1)} px, taper ${look.taper.toFixed(1)} px, roughness ${look.roughness.toFixed(2)}, sheen ${look.sheen.toFixed(2)}`,
    `Light towards (x, y, z): ${look.light.map(value => value.toFixed(2)).join(", ")}`,
    `Controls material: ${preset} (roughness ${material.roughness.toFixed(2)}, metallic ${material.metallic.toFixed(2)}, coat ${material.coat.toFixed(2)} at roughness ${material.coatRoughness.toFixed(2)})`,
    `Accent text contrast: ${textContrast.toFixed(2)}:1 at rest, ${contrastRatio(palette.onAccent, brightened).toFixed(2)}:1 when lit${textContrast < 4.5 ? "  (below 4.5:1: choose a darker or lighter accent)" : ""}`,
  ].join("\n");
}

inputs.depth.addEventListener("input", () => { config = { ...config, depth: Number(inputs.depth.value) / 100 }; apply(); });
inputs.azimuth.addEventListener("input", () => { config = { ...config, azimuth: Number(inputs.azimuth.value) }; apply(); });
inputs.elevation.addEventListener("input", () => { config = { ...config, elevation: Number(inputs.elevation.value) }; apply(); });
inputs.theme.addEventListener("change", () => { config = { ...config, theme: inputs.theme.value === "dark" ? "dark" : "light" }; apply(); });
inputs.accent.addEventListener("input", () => { config = { ...config, accent: fromHex(inputs.accent.value) }; apply(); });
materialInputs.preset.addEventListener("change", () => { const preset = materialPresets[materialInputs.preset.value]; if (preset) { material = { ...preset }; apply(); } });
for (const key of ["roughness", "metallic", "coat", "coatRoughness"] as const) {
  materialInputs[key].addEventListener("input", () => { material = { ...material, [key]: Number(materialInputs[key].value) / 100 }; apply(); });
}
document.getElementById("reset")!.addEventListener("click", () => { config = { ...defaultConfig }; material = { ...defaultMaterial }; apply(); });
apply();

const ready = Promise.allSettled(mounts).then(results => { apply(); return { failed: results.filter(result => result.status === "rejected").length }; });
declare global { interface Window { strataTuning: { ready: Promise<{ failed: number }>; config: () => StrataConfig; set(next: Partial<StrataConfig>): void; material: () => MaterialRecipe; setMaterial(next: Partial<MaterialRecipe> | string): void; finishAt(along: number, preset?: string): [number, number] } } }
window.strataTuning = {
  ready, config: () => config, set(next) { config = { ...config, ...next }; apply(); },
  material: () => material,
  finishAt: (along: number, preset?: string) => finish(along, preset ? materialPresets[preset]! : material),
  setMaterial(next) { material = typeof next === "string" ? { ...materialPresets[next]! } : { ...material, ...next }; apply(); },
};
