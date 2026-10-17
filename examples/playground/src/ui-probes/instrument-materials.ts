/**
 * Instrument probe I0.4, materials over the capture (docs/ui-library/instrument.md, Phase I0): do brushed metal, clear
 * coat and glass read as such over captured content, and does text under display glass keep its contrast?
 *
 * Two faceplates, one per theme (`#light`, `#dark`), each an enrolled layer of real native controls with printed
 * labels and scales, drawn by `instrument-harness.ts` with a Lite mesh scene per layer:
 * - a **Display**: an `<input type="text">` whose backlit window and text are the captured face, under a glass pane in
 *   a machined bezel. The bezel is brushed aluminium (anisotropy along x). The glass is two draws over the window: a
 *   refraction pass that loads the layer's capture through the pane (exactly the plain capture where the pane is flat;
 *   displaced by Snell's law, per colour channel, on its bevels) and a Lite PBR reflection shell (alpha blended, with
 *   iridescence for an anti-reflective coating);
 * - four knobs (`<input type="range">`): brushed aluminium skirts (anisotropy around the axis) under a clear-coated
 *   black lacquer cap (with a soft-touch sheen collar), a gold cap (metallic 1 with a reflectance tint), a glass lens
 *   with dispersion (refracting the printed target under it) and an all-chrome knob;
 * - a chrome dome (`<button>`) beside a bright beacon, for the reflection test.
 * The environment is the studio generated in code, rotated with `setEnvironmentRotation` so its softbox lies in the
 * key light's direction, and, for every reflective material, the layer's own capture as a local environment probe
 * (`instrument-environment.ts`), so metal and glass reflect the faceplate print and the neighbouring controls.
 *
 * `window.materialsProbe` drives the browser test (`tests/browser/ui-probe-instrument-materials.test.mjs`). URL
 * parameters: `?probe=studio` starts with the probe filled from the studio only, `?policy=frame` refreshes the probe
 * every frame (default: when the layer's capture is uploaded), `?transmission=lite` gives both glass parts Lite's own
 * transmission and dispersion instead of the capture refraction (the experiment that shows why it is not used: the frame
 * fails WebGPU validation and core falls back to the DOM), `?tune={"gold":{"roughness":0.3}}` overrides material
 * parameters for iteration.
 */
import {
  createDynamicTexture, updateDynamicTexture, createPbrMaterial, createShaderMaterial, enablePbrLocalCubemap, enableShaderMaterialInstanceWorld, getShaderTexture,
  getShaderUniform, onBeforeRender, setEnvironmentRotation, setPbrAnisotropy, setPbrClearCoat, setPbrDispersion, setPbrEmissive,
  setPbrIridescence, setPbrLocalEnvironment, setPbrMetallicReflectance, setPbrSheen, setPbrSubsurface, setPbrTransmission, setShaderTexture,
  setShaderUniform, type HemisphericLight, type Material, type PbrMaterialProps, type Screenshot, type ShaderMaterial, type Texture2D,
} from "@babylonjs/lite";
import { sceneSettings, strataTokens } from "@underglass/ui/tokens";
import { bar, frame as bezelFrame, frustum, revolve, revolveSmooth, superellipseProfile, type PartData, type SmoothProfilePoint } from "./instrument-parts.ts";
import { startInstrument, type InstrumentHarness, type InstrumentLayer, type PartKind, type Rect } from "./instrument-harness.ts";
import { createCaptureProbe, readCube, loadStudio, studioRotation, studioTokens, towardsLight, type CaptureProbe } from "./instrument-environment.ts";
import type { Point } from "./common.ts";

const params = new URLSearchParams(location.search);
const status = document.getElementById("status")!;
const frame = document.getElementById("frame")!;
const settings = sceneSettings(strataTokens, { theme: "light", depth: 0.5 });
document.body.style.setProperty("--stage", settings.backdrop);

/** Probe tokens, in CSS px (Phase I1 sets the real values). */
const tokens = {
  light: settings.light,
  interiorMax: settings.interior.max,
  face: { width: 600, height: 560, gap: 32, top: 24 },
  display: { x: 40, y: 64, width: 520, height: 96, radius: 14, rise: 5, taper: 2.5, border: 13, chamfer: 2.5, glass: 2.6, glassTaper: 1.4, value: "440.00 Hz" },
  knob: { y: 216, size: 104, step: 136, collar: 3, skirt: 10, skirtRadius: 46, cap: 20, capRadius: 35, fillet: 2.5, crown: 2, pointer: 0.6, sweep: (270 * Math.PI) / 180,
    lens: 16, lensRadius: 35.5, ringInner: 36, kinds: ["lacquer", "gold", "glass", "chrome"] as const },
  dome: { x: 124, y: 400, size: 72, height: 14, inset: 4, exponent: 2.8 },
  beacon: { x: 64, y: 414, away: 300 },
  probe: { size: 512, reach: 50000 },
  /** Lite PBR parameters per material (linear colours). */
  materials: {
    brushed: { base: [0.86, 0.87, 0.88], metallic: 1, roughness: 0.3, anisotropy: 0.9, grain: { strength: 0.15 } },
    lacquer: { base: [0.012, 0.012, 0.014], metallic: 0, roughness: 0.5, coat: { intensity: 1, roughness: 0.03, ior: 1.5 } },
    sheen: { base: [0.05, 0.05, 0.055], metallic: 0, roughness: 0.85, sheen: { colour: [0.55, 0.56, 0.6], roughness: 0.35, intensity: 1 } },
    gold: { base: [1.0, 0.71, 0.29], metallic: 1, roughness: 0.18, reflectance: { colour: [1.0, 0.86, 0.57], f0: 1 } },
    chrome: { base: [0.96, 0.96, 0.97], metallic: 1, roughness: 0.04 },
    glass: { ior: 1.5, dispersion: 0.05, roughness: 0.02, iridescence: { intensity: 0.7, ior: 1.3, min: 250, max: 420 } },
  },
};
// Tuning overrides for iteration: ?tune={"brushed":{"roughness":0.4}} merges into tokens.materials.
for (const [name, values] of Object.entries(JSON.parse(params.get("tune") ?? "{}") as Record<string, Record<string, unknown>>)) Object.assign((tokens.materials as Record<string, object>)[name]!, values);
type KnobKind = (typeof tokens.knob.kinds)[number];
const envelopes = [
  { height: tokens.display.rise, inset: tokens.display.taper }, { height: tokens.display.glass, inset: tokens.display.border + tokens.display.glassTaper },
  { height: tokens.knob.collar, inset: tokens.knob.size / 2 - 49 }, { height: tokens.knob.skirt, inset: tokens.knob.size / 2 - tokens.knob.skirtRadius },
  { height: tokens.knob.cap + tokens.knob.crown + tokens.knob.pointer, inset: tokens.knob.size / 2 - tokens.knob.capRadius }, { height: tokens.knob.lens, inset: tokens.knob.size / 2 - tokens.knob.lensRadius },
  { height: tokens.dome.height, inset: tokens.dome.inset },
];
const policyParam = params.get("policy") === "frame" ? "frame" : "capture";
let policy: "capture" | "frame" = policyParam;
let probeSource: "page" | "studio" = params.get("probe") === "studio" ? "studio" : "page";
const liteTransmission = params.get("transmission") === "lite";

const srgbToLinear = (value: number) => { const c = value / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const relativeLuminance = ([r, g, b]: number[]) => 0.2126 * srgbToLinear(r!) + 0.7152 * srgbToLinear(g!) + 0.0722 * srgbToLinear(b!);
const contrast = (a: number[], b: number[]) => { const la = relativeLuminance(a), lb = relativeLuminance(b); return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05); };

// The faceplates and their controls.
const faces: HTMLElement[] = [];
const place = (element: HTMLElement, x: number, y: number, width?: number, height?: number) => {
  Object.assign(element.style, { left: `${x}px`, top: `${y}px`, ...(width === undefined ? {} : { width: `${width}px` }), ...(height === undefined ? {} : { height: `${height}px` }) });
  return element;
};
function createFace(theme: "light" | "dark", index: number) {
  const face = document.createElement("section");
  face.id = theme;
  face.className = `face ${theme}`;
  face.setAttribute("aria-label", `${theme === "light" ? "Light" : "Dark"} faceplate`);
  const f = tokens.face;
  place(face, 24 + index * (f.width + f.gap), f.top, f.width, f.height);
  const heading = document.createElement("h2");
  heading.textContent = `Materials over the capture: ${theme} face`;
  const d = tokens.display;
  const display = place(document.createElement("input"), d.x, d.y, d.width, d.height) as HTMLInputElement;
  Object.assign(display, { type: "text", value: d.value, id: `${theme}-display`, spellcheck: false, autocomplete: "off" });
  display.className = "display";
  display.dataset.part = "display";
  display.setAttribute("aria-label", "Frequency display");
  face.append(heading, display);
  const k = tokens.knob;
  tokens.knob.kinds.forEach((kind, which) => {
    const x = d.x + which * k.step;
    const scale = place(document.createElement("div"), x, k.y, k.size, k.size);
    scale.className = "scale";
    if (kind === "glass") {
      const target = place(document.createElement("div"), x + k.size / 2 - 32, k.y + k.size / 2 - 32, 64, 64);
      target.className = "target";
      face.append(target);
    }
    const input = place(document.createElement("input"), x, k.y, k.size, k.size) as HTMLInputElement;
    Object.assign(input, { type: "range", min: "0", max: "100", value: String([30, 55, 70, 42][which]), id: `${theme}-knob-${kind}` });
    input.dataset.part = "knob";
    input.dataset.material = kind;
    input.setAttribute("aria-label", `${kind[0]!.toUpperCase()}${kind.slice(1)} knob`);
    const label = place(document.createElement("p"), x - 8, k.y + k.size + 8, k.size + 16);
    label.className = "print";
    label.id = `${theme}-label-${kind}`;
    label.textContent = kind;
    face.append(scale, input, label);
  });
  const o = tokens.dome, b = tokens.beacon;
  const beacon = place(document.createElement("span"), b.x, b.y);
  beacon.className = "beacon";
  beacon.id = `${theme}-beacon`;
  beacon.textContent = "LIVE";
  const dome = place(document.createElement("button"), o.x, o.y, o.size, o.size) as HTMLButtonElement;
  Object.assign(dome, { type: "button", id: `${theme}-dome` });
  dome.className = "dome";
  dome.dataset.part = "dome";
  dome.setAttribute("aria-label", "Reset");
  dome.dataset.presses = "0";
  dome.addEventListener("click", () => { dome.dataset.presses = String(Number(dome.dataset.presses) + 1); });
  const reset = place(document.createElement("p"), o.x - 14, o.y + o.size + 8, o.size + 28);
  reset.className = "print";
  reset.id = `${theme}-label-reset`;
  reset.textContent = "Reset";
  const note = place(document.createElement("p"), 240, 404, 320);
  note.className = "note";
  note.textContent = "Brushed aluminium skirts and bezel, clear-coated lacquer, gold, a glass lens with dispersion and chrome, " +
    "lit by one key light and reflecting this faceplate through a probe filled from its own capture.";
  face.append(beacon, dome, reset, note);
  return face;
}

// Lite materials (linear colours).
type Vec3 = [number, number, number];
const rgba = (colour: readonly number[]): [number, number, number, number] => [colour[0]!, colour[1]!, colour[2]!, 1];
const asMaterial = (material: PbrMaterialProps) => material as unknown as Material;
/**
 * The `grain` layer for brushed metal: a hairline normal map generated in code. Grooves run along u (around a lathe,
 * along x on the bezel), so the perturbation is a function of v: one random groove depth per row, with a slow drift
 * along u so the lines are not ruled.
 */
function grainTexture(engine: Parameters<typeof createDynamicTexture>[0]) {
  const width = 512, height = 512, g = tokens.materials.brushed.grain;
  const canvas = document.createElement("canvas");
  Object.assign(canvas, { width, height });
  const context = canvas.getContext("2d")!, image = context.createImageData(width, height);
  const random = seeded(7), rows = Array.from({ length: height }, () => (random() * 2 - 1));
  // Smooth the rows a little (grooves are a few texels wide) and keep their mean at zero.
  const groove = rows.map((_, row) => (rows[(row + height - 1) % height]! + 2 * rows[row]! + rows[(row + 1) % height]!) / 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const tilt = g.strength * (groove[y]! + 0.25 * Math.sin((x / width) * Math.PI * 6 + y * 0.37));
    const length = Math.hypot(tilt, 1), offset = (y * width + x) * 4;
    image.data[offset] = 128; image.data[offset + 1] = Math.round((tilt / length) * 127 + 128); image.data[offset + 2] = Math.round((1 / length) * 127 + 128); image.data[offset + 3] = 255;
  }
  context.putImageData(image, 0, 0);
  const texture = createDynamicTexture(engine, width, height, { addressModeU: "repeat", addressModeV: "repeat", mipMaps: true });
  updateDynamicTexture(engine, texture, canvas, { invertY: false });
  return texture;
}
/** Deterministic values, so every run draws the same grain. */
function seeded(seed: number) { let state = seed >>> 0; return () => { state = (state + 0x6d2b79f5) >>> 0; let t = state; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function createMaterials(engine: Parameters<typeof createDynamicTexture>[0]) {
  const m = tokens.materials;
  const grain = grainTexture(engine);
  const brushed = (direction: readonly [number, number]) => {
    const material = createPbrMaterial({ baseColorFactor: rgba(m.brushed.base), metallicFactor: m.brushed.metallic, roughnessFactor: m.brushed.roughness, doubleSided: true,
      normalTexture: grain, normalTextureScale: 1 });
    setPbrAnisotropy(material, { isEnabled: true, intensity: m.brushed.anisotropy, direction });
    return material;
  };
  const lacquer = createPbrMaterial({ baseColorFactor: rgba(m.lacquer.base), metallicFactor: m.lacquer.metallic, roughnessFactor: m.lacquer.roughness, doubleSided: true });
  setPbrClearCoat(lacquer, { isEnabled: true, intensity: m.lacquer.coat.intensity, roughness: m.lacquer.coat.roughness, indexOfRefraction: m.lacquer.coat.ior });
  const sheen = createPbrMaterial({ baseColorFactor: rgba(m.sheen.base), metallicFactor: m.sheen.metallic, roughnessFactor: m.sheen.roughness, doubleSided: true });
  setPbrSheen(sheen, { isEnabled: true, color: m.sheen.sheen.colour as Vec3, roughness: m.sheen.sheen.roughness, intensity: m.sheen.sheen.intensity });
  const gold = createPbrMaterial({ baseColorFactor: rgba(m.gold.base), metallicFactor: m.gold.metallic, roughnessFactor: m.gold.roughness, doubleSided: true });
  setPbrMetallicReflectance(gold, { color: m.gold.reflectance.colour as Vec3, f0Factor: m.gold.reflectance.f0 });
  const chrome = createPbrMaterial({ baseColorFactor: rgba(m.chrome.base), metallicFactor: m.chrome.metallic, roughnessFactor: m.chrome.roughness, doubleSided: true });
  // The glass reflection shell: no diffuse, fully transparent, so only the reflected radiance shows (Lite's alphaBlend
  // keeps radiance and specular over alpha).
  const shell = (iridescent: boolean) => {
    const material = createPbrMaterial({ baseColorFactor: [0, 0, 0, 1], metallicFactor: 0, roughnessFactor: m.glass.roughness, alpha: 0, alphaBlend: true, doubleSided: false });
    if (iridescent) setPbrIridescence(material, { isEnabled: true, intensity: m.glass.iridescence.intensity, indexOfRefraction: m.glass.iridescence.ior,
      minimumThickness: m.glass.iridescence.min, maximumThickness: m.glass.iridescence.max });
    return material;
  };
  const pointerLight = createPbrMaterial({ baseColorFactor: [0.92, 0.92, 0.92, 1], metallicFactor: 0, roughnessFactor: 0.5, doubleSided: true });
  setPbrEmissive(pointerLight, [0.3, 0.3, 0.3]);
  const pointerDark = createPbrMaterial({ baseColorFactor: [0.015, 0.015, 0.017, 1], metallicFactor: 0, roughnessFactor: 0.6, doubleSided: true });
  // Lite's own transmission and dispersion on the lens, for the experiment only.
  let liteGlass: PbrMaterialProps | undefined;
  if (liteTransmission) {
    liteGlass = createPbrMaterial({ baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: m.glass.roughness, doubleSided: false });
    setPbrSubsurface(liteGlass, { thickness: { min: 0, max: tokens.knob.lens } });
    setPbrTransmission(liteGlass, { intensity: 1, indexOfRefraction: m.glass.ior });
    setPbrDispersion(liteGlass, 0.5);
  }
  return { bezel: brushed([1, 0]), skirt: brushed([1, 0]), lacquer, sheen, gold, chrome, displayShell: shell(true), lensShell: shell(false), pointerLight, pointerDark, liteGlass };
}

/**
 * The glass refraction pass: each pixel loads the layer's capture through the glass. Where the surface is parallel to
 * the face, the displacement is exactly zero and the pixel is the plain capture texel; on bevels and the lens, the
 * view ray is refracted (Snell's law, one index of refraction per colour channel for dispersion) down to the face
 * plane, and the capture is read there, bilinearly. Transmission falls with Fresnel reflectance beyond normal
 * incidence (the reflection shell adds the reflected part).
 */
const glassVertex = /* wgsl */ `struct VertexOutput { @builtin(position) position: vec4<f32>, @location(0) worldPos: vec3<f32>, @location(1) normal: vec3<f32> };
@vertex fn mainVertex(input: VertexInput) -> VertexOutput {
  var out: VertexOutput;
  let world = getFinalWorld(input);
  let position = world * vec4<f32>(input.position, 1.0);
  out.position = shaderSystem.projection * (shaderSystem.view * position);
  out.worldPos = position.xyz;
  out.normal = (world * vec4<f32>(input.normal, 0.0)).xyz;
  return out;
}`;
const glassFragment = /* wgsl */ `struct VertexOutput { @builtin(position) position: vec4<f32>, @location(0) worldPos: vec3<f32>, @location(1) normal: vec3<f32> };
fn loadCapture(texel: vec2<i32>) -> vec4<f32> {
  let size = vec2<i32>(textureDimensions(capture));
  return textureLoad(capture, clamp(texel, vec2<i32>(0), size - vec2<i32>(1)), 0);
}
fn sampleCapture(base: vec2<f32>, offset: vec2<f32>) -> vec4<f32> {
  if (all(abs(offset) < vec2<f32>(1e-4))) { return loadCapture(vec2<i32>(base)); }
  let p = base + offset;
  let i = vec2<i32>(floor(p));
  let f = p - floor(p);
  return mix(mix(loadCapture(i), loadCapture(i + vec2<i32>(1, 0)), f.x), mix(loadCapture(i + vec2<i32>(0, 1)), loadCapture(i + vec2<i32>(1, 1)), f.x), f.y);
}
// Displacement on the face plane, in world units, of the ray refracted through normal n against the ray refracted
// through a flat pane at the same point: zero wherever n is the face normal.
fn shift(d: vec3<f32>, n: vec3<f32>, eta: f32, depth: f32) -> vec2<f32> {
  let flat = vec3<f32>(0.0, 0.0, -1.0);
  let tn = refract(d, n, eta);
  let tf = refract(d, flat, eta);
  let pn = tn.xy * (depth / max(tn.z, 0.15));
  let pf = tf.xy * (depth / max(tf.z, 0.15));
  return pn - pf;
}
@fragment fn mainFragment(input: VertexOutput) -> @location(0) vec4<f32> {
  var n = normalize(input.normal);
  if (n.z > 0.0) { n = -n; }
  let d = normalize(input.worldPos - shaderUniforms.camera.xyz);
  let dpr = shaderUniforms.camera.w;
  let depth = max(-input.worldPos.z, 0.0);
  let base = floor(input.position.xy - shaderUniforms.origin.xy);
  let ior = shaderUniforms.glass.x;
  let spread = shaderUniforms.glass.y;
  // World x right, y up; capture texels x right, y down.
  let sr = shift(d, n, 1.0 / (ior - spread), depth) * vec2<f32>(dpr, -dpr);
  let sg = shift(d, n, 1.0 / ior, depth) * vec2<f32>(dpr, -dpr);
  let sb = shift(d, n, 1.0 / (ior + spread), depth) * vec2<f32>(dpr, -dpr);
  let colour = vec3<f32>(sampleCapture(base, sr).r, sampleCapture(base, sg).g, sampleCapture(base, sb).b);
  // Fresnel (Schlick) beyond its value for the flat pane: 1 on flat glass, falling towards grazing bevels.
  let f0 = pow((ior - 1.0) / (ior + 1.0), 2.0);
  let schlick = f0 + (1.0 - f0) * pow(1.0 - clamp(dot(-d, n), 0.0, 1.0), 5.0);
  let flatSchlick = f0 + (1.0 - f0) * pow(1.0 - clamp(-d.z, 0.0, 1.0), 5.0);
  let transmitted = 1.0 - max(schlick - flatSchlick, 0.0);
  // A faint edge tint where the glass is tilted (its edge is seen through more glass).
  let tilt = 1.0 - clamp(-n.z, 0.0, 1.0);
  let tint = mix(vec3<f32>(1.0), shaderUniforms.tint.rgb, clamp(tilt * shaderUniforms.tint.w, 0.0, 1.0));
  return vec4<f32>(colour * tint * transmitted, 1.0);
}`;
function glassMaterial(name: string, placeholder: Texture2D, distance: number, dpr: number) {
  const g = tokens.materials.glass;
  const material = createShaderMaterial({ name, vertexSource: glassVertex, fragmentSource: glassFragment, attributes: ["position", "normal"],
    uniforms: ["world", "view", "projection", { name: "origin", type: "vec4<f32>", defaultValue: [0, 0, 0, 0] },
      { name: "camera", type: "vec4<f32>", defaultValue: [0, 0, -distance, dpr] }, { name: "glass", type: "vec4<f32>", defaultValue: [g.ior, g.dispersion, 0, 0] },
      { name: "tint", type: "vec4<f32>", defaultValue: [0.82, 0.9, 0.88, 0.9] }],
    samplers: ["capture"], backFaceCulling: true });
  enableShaderMaterialInstanceWorld(material);
  setShaderTexture(material, "capture", placeholder as never);
  return material;
}

// Per-layer state, rebuilt with each scene.
interface Built {
  layer: InstrumentLayer; parts: Record<string, PartKind>; controls: Map<HTMLElement, { kind: string; material?: KnobKind; rect: Rect }>;
  probe: CaptureProbe; source: ShaderMaterial; glass: ShaderMaterial[]; rotation: number; studio: import("@babylonjs/lite").EnvironmentTextures; device: GPUDevice;
  bound?: unknown; origin?: string; uploads: number; refreshed?: unknown; refreshMs: number[];
}
const built = new Map<string, Built>();
let harness: InstrumentHarness | undefined;
let cubemapReady: Promise<void> | undefined;
const shifted = (data: PartData, dy: number): PartData => ({ ...data, positions: data.positions.map((value, index) => (index % 3 === 1 ? value + dy : value)) });
const valueOf = (input: HTMLInputElement) => (Number(input.value) - Number(input.min)) / (Number(input.max) - Number(input.min));

/**
 * A cap: a cylinder side from the skirt to a fillet, then a shallow spherical crown `crown` px high, with smooth
 * normals. The crown spreads the reflected directions across the top, so the cap shows the studio's softbox and dark
 * room instead of one flat colour.
 */
function capProfile(radius: number, base: number, top: number, fillet: number, crown: number): SmoothProfilePoint[] {
  const points: SmoothProfilePoint[] = [[radius, base, 1, 0], [radius, top - fillet, 1, 0]];
  for (let step = 1; step <= 6; step++) {
    const angle = (step / 6) * (Math.PI / 2);
    points.push([radius - fillet + fillet * Math.cos(angle), top - fillet + fillet * Math.sin(angle), Math.cos(angle), Math.sin(angle)]);
  }
  const a = radius - fillet, sphere = (a * a + crown * crown) / (2 * crown);
  for (let step = 1; step <= 8; step++) {
    const r = a * (1 - step / 8), h = top + Math.sqrt(sphere * sphere - r * r) - (sphere - crown);
    points.push([r, h, r / sphere, Math.sqrt(1 - (r / sphere) ** 2)]);
  }
  return points;
}

async function build(layer: InstrumentLayer) {
  cubemapReady ??= enablePbrLocalCubemap();
  await cubemapReady;
  const surface = layer.scene.surface as unknown as { engine: unknown; canvas: HTMLCanvasElement };
  const engine = surface.engine as Parameters<typeof createDynamicTexture>[0];
  const device = (surface.canvas.getContext("webgpu") as unknown as { getConfiguration(): { device: GPUDevice } }).getConfiguration().device;
  // The studio, aligned with the key light, and the capture probe for this layer.
  const studio = await loadStudio(layer.scene, tokens.light);
  const rotation = studioRotation(tokens.light);
  setEnvironmentRotation(layer.scene, rotation);
  // With an environment, the environment is the fill: the harness's hemispheric fill is switched off in this scene. Its
  // specular term sits at normal incidence and painted every face-on metal surface white (zeroing `specularColor` did
  // not change the PBR output on Lite 1.33.0, measured), and its diffuse term double-counts the environment's irradiance.
  for (const light of layer.scene.lights) if (light.lightType === "hemispheric") (light as HemisphericLight).intensity = 0;
  const panel = layer.element, width = panel.offsetWidth, height = panel.offsetHeight;
  const [left, top] = layer.world(0, 0), [right, bottom] = layer.world(width, height);
  const stage = harnessStage();
  const probe = createCaptureProbe(device, studio, { size: tokens.probe.size, rotation, dpr: window.devicePixelRatio,
    panel: { minX: left, maxX: right, minY: bottom, maxY: top }, captureHeight: Math.max(width, height) / 2, reach: tokens.probe.reach,
    offsetX: stage.width / 2 - layer.origin.x, offsetY: stage.height / 2 - layer.origin.y });
  probe.refresh(undefined, false);

  const materials = createMaterials(engine);
  const reflective = [materials.bezel, materials.skirt, materials.lacquer, materials.gold, materials.chrome, materials.displayShell, materials.lensShell, materials.sheen];
  for (const material of reflective) setPbrLocalEnvironment(material, probe.environment, probe.projection);
  // A capture material the harness keeps bound to this layer's current capture: the probe and the glass read it.
  const source = layer.capture("probe-source") as unknown as ShaderMaterial;
  const placeholder = createDynamicTexture(engine, 1, 1);
  const distance = -layer.camera.position.z, dpr = window.devicePixelRatio;
  const displayGlass = glassMaterial("display-glass", placeholder, distance, dpr), lensGlass = glassMaterial("lens-glass", placeholder, distance, dpr);

  const controls = new Map<HTMLElement, { kind: string; material?: KnobKind; rect: Rect }>();
  for (const element of panel.querySelectorAll<HTMLElement>("[data-part]")) controls.set(element, { kind: element.dataset.part!, material: element.dataset.material as KnobKind | undefined, rect: layer.rectOf(element) });
  const parts: Record<string, PartKind> = {};
  const d = tokens.display, k = tokens.knob, o = tokens.dome, r = k.size / 2;
  const glassWidth = d.width - 2 * d.border, glassHeight = d.height - 2 * d.border, glassRadius = Math.max(0.5, d.radius - d.border);
  parts.bezel = layer.kind("bezel", bezelFrame(d.width, d.height, d.radius, d.rise, d.taper, d.border, d.chamfer), asMaterial(materials.bezel), 1);
  const pane = frustum(glassWidth, glassHeight, glassRadius + 3, d.glass, d.glassTaper);
  parts.displayGlass = layer.kind("display-glass", pane, materials.liteGlass ? asMaterial(materials.liteGlass) : displayGlass as unknown as Material, 1);
  parts.displayShell = layer.kind("display-shell", pane, asMaterial(materials.displayShell), 1);
  const skirt = revolve([[k.skirtRadius, 0], [k.skirtRadius, k.skirt - 1], [k.skirtRadius - 1, k.skirt], [k.capRadius + 0.5, k.skirt]], 72);
  parts.skirt = layer.kind("skirt", skirt, asMaterial(materials.skirt), 2);
  parts.chromeSkirt = layer.kind("chrome-skirt", skirt, asMaterial(materials.chrome), 1);
  parts.ring = layer.kind("ring", revolve([[k.skirtRadius, 0], [k.skirtRadius, k.skirt - 1], [k.skirtRadius - 1, k.skirt], [k.ringInner + 1, k.skirt], [k.ringInner, k.skirt - 1], [k.ringInner, 0]], 72), asMaterial(materials.skirt), 1);
  parts.collar = layer.kind("collar", revolve([[49, 0], [49, k.collar - 0.8], [48.2, k.collar], [k.skirtRadius, k.collar]], 72), asMaterial(materials.sheen), 1);
  const cap = revolveSmooth(capProfile(k.capRadius, k.skirt, k.cap, k.fillet, k.crown), 72);
  parts.lacquer = layer.kind("cap-lacquer", cap, asMaterial(materials.lacquer), 1);
  parts.gold = layer.kind("cap-gold", cap, asMaterial(materials.gold), 1);
  parts.chrome = layer.kind("cap-chrome", cap, asMaterial(materials.chrome), 1);
  const lens = revolveSmooth(superellipseProfile(k.lensRadius, k.lens, 2.2, 28), 72);
  parts.lens = layer.kind("lens", lens, (materials.liteGlass ? asMaterial(materials.liteGlass) : lensGlass as unknown as Material), 1);
  parts.lensShell = layer.kind("lens-shell", lens, asMaterial(materials.lensShell), 1);
  const pointer = shifted(bar(2.4, 13, k.cap, k.cap + k.crown * 0.8 + k.pointer), k.capRadius - 13);
  parts.pointerLight = layer.kind("pointer-light", pointer, asMaterial(materials.pointerLight), 2);
  parts.pointerDark = layer.kind("pointer-dark", pointer, asMaterial(materials.pointerDark), 2);
  parts.ringPointer = layer.kind("ring-pointer", shifted(bar(2.4, k.skirtRadius - k.ringInner - 3, k.skirt, k.skirt + k.pointer), (k.skirtRadius + k.ringInner) / 2), asMaterial(materials.pointerLight), 1);
  parts.dome = layer.kind("dome", revolveSmooth(superellipseProfile(o.size / 2 - o.inset, o.height, o.exponent, 32), 96), asMaterial(materials.chrome), 1);
  void r;

  const entry: Built = { layer, parts, controls, probe, source, glass: [displayGlass, lensGlass], rotation, studio, device, uploads: -1, refreshMs: [] };
  for (const element of controls.keys()) pose(entry, element);
  built.set(layer.id, entry);
  // Before each frame of this scene: follow the capture (texture and origin) into the glass, and refresh the probe
  // when the capture was uploaded (or every frame, under the per-frame policy).
  onBeforeRender(layer.scene, () => {
    const texture = getShaderTexture(source, "capture");
    if (texture && texture !== entry.bound) { for (const material of entry.glass) setShaderTexture(material, "capture", texture as never); entry.bound = texture; }
    const origin = getShaderUniform(source, "origin") as Float32Array;
    const key = `${origin[0]},${origin[1]}`;
    if (key !== entry.origin) { for (const material of entry.glass) setShaderUniform(material, "origin", [origin[0]!, origin[1]!, 0, 0]); entry.origin = key; }
    const uploads = layerUploads(layer.id);
    if (policy === "frame" || uploads !== entry.uploads || texture !== entry.refreshed) {
      const started = performance.now();
      probe.refresh(texture?.texture, probeSource === "page");
      entry.refreshMs.push(performance.now() - started);
      entry.uploads = uploads;
      entry.refreshed = texture;
    }
  });
}
const layerUploads = (id: string) => {
  if (!harness) return -1;
  const state = harness.controller.state() as unknown as { metrics: { perLayer?: Record<string, { uploads: number }> } };
  return state.metrics.perLayer?.[id]?.uploads ?? -1;
};
// The stage size before `harness` exists (the first build runs inside `startInstrument`).
const harnessStage = () => ({ width: frame.clientWidth, height: frame.clientHeight });

/** Writes one control's parts from its native state. */
function pose(entry: Built, element: HTMLElement) {
  const control = entry.controls.get(element);
  if (!control) return;
  const { rect } = control, parts = entry.parts, cx = rect.x + rect.width / 2, cy = rect.y + rect.height / 2;
  if (control.kind === "display") {
    parts.bezel!.pose(0, { x: cx, y: cy });
    parts.displayGlass!.pose(0, { x: cx, y: cy });
    parts.displayShell!.pose(0, { x: cx, y: cy, lift: 0.03 });
  } else if (control.kind === "dome") {
    parts.dome!.pose(0, { x: cx, y: cy });
  } else {
    const angle = (0.5 - valueOf(element as HTMLInputElement)) * tokens.knob.sweep, at = { x: cx, y: cy, angle };
    if (control.material === "lacquer") { parts.collar!.pose(0, { x: cx, y: cy }); parts.skirt!.pose(0, at); parts.lacquer!.pose(0, at); parts.pointerLight!.pose(0, at); }
    else if (control.material === "gold") { parts.skirt!.pose(1, at); parts.gold!.pose(0, at); parts.pointerDark!.pose(0, at); }
    else if (control.material === "glass") { parts.ring!.pose(0, at); parts.lens!.pose(0, { x: cx, y: cy }); parts.lensShell!.pose(0, { x: cx, y: cy, lift: 0.03 }); parts.ringPointer!.pose(0, at); }
    else { parts.chromeSkirt!.pose(0, at); parts.chrome!.pose(0, at); parts.pointerDark!.pose(1, at); }
  }
}
const flushAll = () => { for (const entry of built.values()) for (const part of Object.values(entry.parts)) part.flush(); };
const entryOf = (element: HTMLElement) => [...built.values()].find(entry => entry.controls.has(element));

let resolveReady!: (api: MaterialsProbeApi) => void;
let readyFailed!: (error: unknown) => void;
window.materialsProbe = { ready: new Promise<MaterialsProbeApi>((resolve, reject) => { resolveReady = resolve; readyFailed = reject; }) };
harness = await startInstrument({
  frame, light: tokens.light, envelopes, budgets: { layers: 8, pixels: 6_000_000 },
  onStatus: message => { status.dataset.core = message; },
  mount(root) {
    faces.push(createFace("light", 0), createFace("dark", 1));
    root.append(...faces);
    return faces;
  },
  build,
}).catch(error => {
  status.textContent = `Probe unavailable: ${error}`;
  window.materialsProbe.error = String(error);
  readyFailed(error);
  throw error;
});
const h = harness;
for (const face of faces) {
  const refresh = (event: Event) => { const element = event.target as HTMLElement, entry = entryOf(element); if (entry) { pose(entry, element); flushAll(); h.draw(); } };
  face.addEventListener("input", refresh);
  face.addEventListener("change", refresh);
}

// Analyses for the test.
let shot: Screenshot | undefined;
const canvasBox = () => h.hosts.outputCanvas.getBoundingClientRect();
async function settle() {
  await h.idle();
  for (let index = 0; index < 3; index++) { h.draw(); await new Promise(resolve => requestAnimationFrame(resolve)); }
  shot = await h.readback();
  describe();
}
const describe = () => {
  const refreshes = [...built.values()].map(entry => `${entry.layer.id} ${entry.probe.refreshes()}`).join(", ");
  status.textContent = `I0.4 materials: camera ${h.camera().distance} px, studio rotation ${(studioRotation(tokens.light) * 180 / Math.PI).toFixed(1)}°, probe ${probeSource}, policy ${policy}, refreshes ${refreshes}\n${status.dataset.core ?? ""}`;
};
interface Box { id: string; kind: string; layer: string; x: number; y: number; width: number; height: number; radius: number }
const controls = (): Box[] => [...built.values()].flatMap(entry => [...entry.controls].map(([element, control]) => {
  const box = element.getBoundingClientRect();
  return { id: element.id, kind: control.material ?? control.kind, layer: entry.layer.id, x: box.left, y: box.top, width: box.width, height: box.height, radius: Math.min(parseFloat(getComputedStyle(element).borderTopLeftRadius) || 0, box.width / 2, box.height / 2) };
}));
const faceBoxes = () => Object.fromEntries(faces.map(face => { const box = face.getBoundingClientRect(); return [face.id, { x: box.left, y: box.top, width: box.width, height: box.height, radius: 16 }]; }));
/** Signed distance from a point to a rounded rectangle, negative inside. */
const rounded = (point: Point, box: { x: number; y: number; width: number; height: number; radius: number }) => {
  const radius = Math.min(box.radius, box.width / 2, box.height / 2);
  const qx = Math.abs(point.x - box.x - box.width / 2) - box.width / 2 + radius, qy = Math.abs(point.y - box.y - box.height / 2) - box.height / 2 + radius;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - radius;
};
/** Readbacks with the mesh scenes on and off (the plain capture), returning to on. */
async function onOff() {
  h.setMeshes(true); await settle(); const on = shot!;
  h.setMeshes(false); await settle(); const off = shot!;
  h.setMeshes(true); await settle();
  return { on, off };
}
/** Device-pixel rect of a client rect, inset by `inset` CSS px. */
const deviceRect = (rect: { x: number; y: number; width: number; height: number }, inset = 0) => {
  const box = canvasBox(), dpr = h.dpr;
  return { x0: Math.ceil((rect.x + inset - box.left) * dpr), y0: Math.ceil((rect.y + inset - box.top) * dpr), x1: Math.floor((rect.x + rect.width - inset - box.left) * dpr), y1: Math.floor((rect.y + rect.height - inset - box.top) * dpr) };
};
const at = (image: Screenshot, x: number, y: number) => { const offset = (y * image.width + x) * 4; return [image.data[offset]!, image.data[offset + 1]!, image.data[offset + 2]!]; };

/** Every pixel the mesh scenes change, checked against its control's rounded box; native hits at a sample of them. */
async function meshDiff(samples = 3000) {
  const { on, off } = await onOff();
  const box = canvasBox(), dpr = h.dpr, list = controls();
  const result = { changed: 0, outside: 0, outsideSamples: [] as { x: number; y: number; distance: number }[], perKind: {} as Record<string, number>, maxDistance: -Infinity };
  const points: { x: number; y: number; id: string }[] = [];
  for (let y = 0; y < on.height; y++) for (let x = 0; x < on.width; x++) {
    const offset = (y * on.width + x) * 4;
    if (on.data[offset] === off.data[offset] && on.data[offset + 1] === off.data[offset + 1] && on.data[offset + 2] === off.data[offset + 2]) continue;
    result.changed++;
    const point = { x: box.left + (x + 0.5) / dpr, y: box.top + (y + 0.5) / dpr };
    let owner: Box | undefined, distance = Infinity;
    for (const control of list) { const value = rounded(point, control); if (value < distance) { distance = value; owner = control; } }
    if (!owner || distance > 0) {
      result.outside++;
      if (result.outsideSamples.length < 20) result.outsideSamples.push({ ...point, distance });
      continue;
    }
    result.maxDistance = Math.max(result.maxDistance, distance);
    result.perKind[owner.kind] = (result.perKind[owner.kind] ?? 0) + 1;
    if (distance <= -1) points.push({ ...point, id: owner.id });
  }
  const step = Math.max(1, Math.floor(points.length / samples)), hits: { x: number; y: number; id: string; expected: string }[] = [];
  for (let index = 0; index < points.length; index += step) {
    const point = points[index]!, hit = document.elementFromPoint(point.x, point.y);
    hits.push({ ...point, id: hit?.closest<HTMLElement>("[data-part]")?.id ?? hit?.id ?? "", expected: point.id });
  }
  const mismatches = hits.filter(sample => sample.id !== sample.expected);
  return { ...result, hitSampleCount: hits.length, hitMismatches: mismatches.length, hitMismatchSamples: mismatches.slice(0, 10) };
}

/**
 * The face outside every control with the materials on and off: the largest relative change of any pixel's luminance
 * (the guard's measure), and the decoded contrast of each printed label beside a reflective part.
 */
async function interior() {
  const { on, off } = await onOff();
  const list = controls(), box = canvasBox(), dpr = h.dpr;
  const result: Record<string, { pixels: number; changed: number; maxRelative: number; worst?: { x: number; y: number; on: number[]; off: number[] } }> = {};
  for (const face of faces) {
    const rect = face.getBoundingClientRect(), r = deviceRect({ x: rect.left, y: rect.top, width: rect.width, height: rect.height }, 2);
    const own = list.filter(control => control.layer === face.id);
    const stats = { pixels: 0, changed: 0, maxRelative: 0, worst: undefined as undefined | { x: number; y: number; on: number[]; off: number[] } };
    for (let y = r.y0; y < r.y1; y++) for (let x = r.x0; x < r.x1; x++) {
      const point = { x: box.left + (x + 0.5) / dpr, y: box.top + (y + 0.5) / dpr };
      // Outside every control's box by more than a pixel (the parts' own footprint is the control's box).
      if (own.some(control => rounded(point, control) <= 1)) continue;
      stats.pixels++;
      const a = at(on, x, y), b = at(off, x, y);
      if (a[0] === b[0] && a[1] === b[1] && a[2] === b[2]) continue;
      stats.changed++;
      const relative = Math.abs(relativeLuminance(a) - relativeLuminance(b)) / Math.max(relativeLuminance(b), 1e-4);
      if (relative > stats.maxRelative) { stats.maxRelative = relative; stats.worst = { ...point, on: a, off: b }; }
    }
    result[face.id] = stats;
  }
  const labels = [...document.querySelectorAll<HTMLElement>(".print")].map(label => {
    const rect = label.getBoundingClientRect(), range = document.createRange();
    range.selectNodeContents(label);
    const text = range.getBoundingClientRect();
    const r = deviceRect({ x: text.left, y: text.top, width: text.width, height: text.height });
    return { id: label.id, on: textContrast(on, r), off: textContrast(off, r), rect: { x: rect.left, y: rect.top, width: rect.width, height: rect.height } };
  });
  return { interiorMax: tokens.interiorMax, faces: result, labels };
}
/** Contrast of the text in a device rect: the most common colour (the ground) against the colour farthest from it in luminance. */
function textContrast(image: Screenshot, r: { x0: number; y0: number; x1: number; y1: number }) {
  const counts = new Map<string, number>();
  for (let y = r.y0; y < r.y1; y++) for (let x = r.x0; x < r.x1; x++) { const key = at(image, x, y).join(","); counts.set(key, (counts.get(key) ?? 0) + 1); }
  const ground = [...counts].sort((a, b) => b[1] - a[1])[0]![0].split(",").map(Number);
  let ink = ground, best = 0;
  for (const key of counts.keys()) { const colour = key.split(",").map(Number), value = Math.abs(relativeLuminance(colour) - relativeLuminance(ground)); if (value > best) { best = value; ink = colour; } }
  return { ground, ink, ratio: contrast(ground, ink), colours: counts.size };
}

/** The display window's flat glass: client rect of the clear area (inside the pane's bevel). */
const glassRect = (face: string) => {
  const input = document.getElementById(`${face}-display`)!.getBoundingClientRect(), d = tokens.display, inset = d.border + d.glassTaper + 1;
  return { x: input.left + inset, y: input.top + inset, width: input.width - 2 * inset, height: input.height - 2 * inset };
};
/** Text under the display glass with the materials on, against the plain capture: mismatches and contrast. */
async function display() {
  const { on, off } = await onOff();
  return Object.fromEntries(faces.map(face => {
    const r = deviceRect(glassRect(face.id));
    let compared = 0, mismatched = 0, maxDelta = 0;
    for (let y = r.y0; y < r.y1; y++) for (let x = r.x0; x < r.x1; x++) {
      const a = at(on, x, y), b = at(off, x, y);
      compared++;
      const delta = Math.max(Math.abs(a[0]! - b[0]!), Math.abs(a[1]! - b[1]!), Math.abs(a[2]! - b[2]!));
      if (delta) { mismatched++; maxDelta = Math.max(maxDelta, delta); }
    }
    return [face.id, { compared, mismatched, maxDelta, through: textContrast(on, r), plain: textContrast(off, r) }];
  }));
}
/** Device pixels of a client rect in the last settled frame (RGB triples), for diffs across states. */
function region(rect: { x: number; y: number; width: number; height: number }) {
  const r = deviceRect(rect), pixels: number[] = [];
  for (let y = r.y0; y < r.y1; y++) for (let x = r.x0; x < r.x1; x++) pixels.push(...at(shot!, x, y));
  return pixels;
}
const diff = (a: number[], b: number[]) => {
  let changed = 0, sum = 0, max = 0;
  for (let index = 0; index < a.length; index += 3) {
    const delta = Math.max(Math.abs(a[index]! - b[index]!), Math.abs(a[index + 1]! - b[index + 1]!), Math.abs(a[index + 2]! - b[index + 2]!));
    if (delta) { changed++; sum += delta; max = Math.max(max, delta); }
  }
  return { pixels: a.length / 3, changed, max, mean: changed ? sum / changed : 0 };
};
const partRect = (id: string) => { const box = document.getElementById(id)!.getBoundingClientRect(); return { x: box.left, y: box.top, width: box.width, height: box.height }; };

/**
 * The reflection test: the dome (and the chrome knob) before and after the beacon moves away, with the probe filled
 * from the page and from the studio only. The beacon's move is a native change, so it is captured and uploaded.
 */
async function reflection(face = "light") {
  const beacon = document.getElementById(`${face}-beacon`)!, home = `${tokens.beacon.x}px`;
  const read = async () => { await settle(); return { dome: region(partRect(`${face}-dome`)), chrome: region(partRect(`${face}-knob-chrome`)), counts: h.counts(), refreshes: built.get(face)!.probe.refreshes() }; };
  const run = async (source: "page" | "studio") => {
    probeSource = source;
    for (const entry of built.values()) entry.uploads = -1;
    beacon.style.left = home;
    const near = await read();
    beacon.style.left = `${tokens.beacon.away}px`;
    const far = await read();
    beacon.style.left = home;
    return { source, dome: diff(near.dome, far.dome), chrome: diff(near.chrome, far.chrome), captures: far.counts.captures - near.counts.captures, refreshes: far.refreshes - near.refreshes, mode: far.counts.mode };
  };
  const page = await run("page");
  const studio = await run("studio");
  probeSource = "page";
  // Page against studio fill with the beacon home: what the capture adds to the dome.
  await settle(); const withPage = region(partRect(`${face}-dome`));
  probeSource = "studio"; built.get(face)!.uploads = -1; await settle(); const withStudio = region(partRect(`${face}-dome`));
  probeSource = "page"; built.get(face)!.uploads = -1; await settle();
  return { page, studio, pageVsStudio: diff(withPage, withStudio) };
}
/** Frame cost with the probe refreshed every frame against only on capture (no capture during the run). */
async function probeCost(frames = 120) {
  // A focused display blinks its caret, which is a native change (a capture); measure without one.
  (document.activeElement as HTMLElement | null)?.blur();
  await settle();
  const run = async (mode: "capture" | "frame") => {
    policy = mode;
    for (const entry of built.values()) entry.refreshMs.length = 0;
    await h.idle();
    const before = h.counts(), refreshes = [...built.values()].reduce((sum, entry) => sum + entry.probe.refreshes(), 0);
    const result = await h.measure(frames, () => {});
    const after = h.counts();
    const cpu = [...built.values()].flatMap(entry => entry.refreshMs);
    return { policy: mode, refreshes: [...built.values()].reduce((sum, entry) => sum + entry.probe.refreshes(), 0) - refreshes, captures: after.captures - before.captures,
      work: result.work, cpu: result.cpu, meshPass: result.meshPass, refreshCpuMean: cpu.length ? cpu.reduce((a, b) => a + b, 0) / cpu.length : 0 };
  };
  const capture = await run("capture");
  const everyFrame = await run("frame");
  policy = policyParam;
  // GPU time of one refresh of one probe on its own: submit, then wait for the queue.
  const entry = [...built.values()][0]!, device = (h.hosts.outputCanvas.getContext("webgpu") as unknown as { getConfiguration(): { device: GPUDevice } }).getConfiguration().device;
  const texture = getShaderTexture(entry.source, "capture")?.texture, isolated: number[] = [], gpu: number[] = [];
  for (let index = 0; index < 30; index++) {
    await device.queue.onSubmittedWorkDone();
    const started = performance.now();
    entry.probe.refresh(texture, true, true);
    await device.queue.onSubmittedWorkDone();
    isolated.push(performance.now() - started);
    const ms = await entry.probe.lastGpuMs();
    if (ms !== null) gpu.push(ms);
  }
  const stats = (values: number[]) => { const sorted = [...values].sort((a, b) => a - b); return sorted.length ? { p50: sorted[Math.floor(sorted.length / 2)], min: sorted[0], max: sorted.at(-1) } : null; };
  return { capture, everyFrame, isolatedRefreshMs: stats(isolated), refreshGpuMs: stats(gpu), probe: { size: entry.probe.size, mips: entry.probe.mipLevelCount, layers: built.size } };
}
/** Brightest pixel on the chrome dome relative to its centre: the studio key's highlight, as a screen azimuth. */
function highlight(face = "light") {
  const rect = partRect(`${face}-dome`), r = deviceRect(rect), cx = (r.x0 + r.x1) / 2, cy = (r.y0 + r.y1) / 2;
  let best = -1, bx = cx, by = cy;
  for (let y = r.y0; y < r.y1; y++) for (let x = r.x0; x < r.x1; x++) { const [red, green, blue] = at(shot!, x, y); const value = red! + green! + blue!; if (value > best) { best = value; bx = x; by = y; } }
  const azimuth = ((Math.atan2(bx - cx, -(by - cy)) * 180) / Math.PI + 360) % 360;
  return { azimuth, offset: { x: (bx - cx) / h.dpr, y: (by - cy) / h.dpr }, value: best };
}

await settle();
const api = {
  dpr: h.dpr,
  tokens: () => ({ ...tokens, envelopes, studio: studioTokens, studioRotationDegrees: (studioRotation(tokens.light) * 180) / Math.PI, towardsLight: towardsLight(tokens.light), camera: h.camera(), liteTransmission, policy, probeSource }),
  settle, meshDiff, interior, display, reflection, probeCost, highlight,
  controls, faces: faceBoxes, glassRect, partRect,
  region: (rect: { x: number; y: number; width: number; height: number }) => region(rect),
  hits: (points: Point[]) => points.map(point => { const hit = document.elementFromPoint(point.x, point.y); return hit?.closest<HTMLElement>("[data-part]")?.id ?? hit?.id ?? ""; }),
  state: (id: string) => { const element = document.getElementById(id) as HTMLInputElement; return { value: element.value, presses: Number(element.dataset.presses ?? 0), focused: document.activeElement === element }; },
  setCaret: (on: boolean) => { for (const face of faces) face.querySelector("input.display")!.classList.toggle("no-caret", !on); },
  setMeshes: (on: boolean) => h.setMeshes(on),
  setProbeSource: (source: "page" | "studio") => { probeSource = source; for (const entry of built.values()) entry.uploads = -1; },
  refreshes: () => Object.fromEntries([...built.values()].map(entry => [entry.layer.id, entry.probe.refreshes()])),
  counts: () => h.counts(),
  gpuTimings: () => h.gpuTimings(),
  diagnostics: () => [...h.diagnostics],
  camera: () => h.camera(),
  browser: () => navigator.userAgent,
  /**
   * Where the studio's softbox lies as Lite samples it: the mean world direction of every sampled direction brighter than
   * half the key's radiance, read back from the loaded cube with the environment rotation applied, against the key light.
   */
  studioKey: async (face = "light") => {
    const directions: [number, number, number][] = [];
    for (let i = 0; i < 90; i++) for (let j = 0; j < 180; j++) { const p = ((i + 0.5) / 90) * Math.PI, l = (j / 180) * 2 * Math.PI; directions.push([Math.sin(p) * Math.cos(l), Math.cos(p), Math.sin(p) * Math.sin(l)]); }
    const samples = await api.sampleEnvironment(directions, face);
    const bright = samples.filter(sample => sample.studio[0] > studioTokens.key / 2), sum = [0, 0, 0];
    for (const sample of bright) for (let axis = 0; axis < 3; axis++) sum[axis]! += sample.direction[axis]!;
    const length = Math.hypot(...sum), key = sum.map(value => value / length), light = towardsLight(tokens.light);
    const angle = (Math.acos(Math.min(1, key[0]! * light[0] + key[1]! * light[1] + key[2]! * light[2])) * 180) / Math.PI;
    return { key, light, angleDegrees: angle, samples: bright.length, rotationDegrees: (studioRotation(tokens.light) * 180) / Math.PI };
  },
  /** Diagnostics: studio and probe radiance in world directions (the environment rotation applied as Lite does). */
  sampleEnvironment: async (directions: [number, number, number][], face = "light", mip = 0) => {
    const entry = built.get(face)!, studio = await readCube(entry.device, entry.studio.specularCube, mip), probe = await readCube(entry.device, entry.probe.environment.specularCube, mip);
    const { rotateY } = await import("./instrument-environment.ts");
    return directions.map(direction => { const s = rotateY(direction, entry.rotation); return { direction, studio: studio(s), probe: probe(s) }; });
  },
};
type MaterialsProbeApi = typeof api;
declare global { interface Window { materialsProbe: { ready: Promise<MaterialsProbeApi>; error?: string } } }
resolveReady(api);
