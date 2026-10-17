/**
 * Instrument probe I0.8, the post chain and reflections (docs/ui-library/instrument.md, Phase I0, decisions 4 and
 * 10, "Light: emitters" and "Materials are configuration"): what do TAA (or SMAA), contact shadows, bloom, SSGI and a
 * per-layer local environment probe cost at 250 controls, and does the captured text stay untouched by all of them?
 *
 * The page is the I0.1 density layout (two overlapping enrolled panels of native controls, 50 meters and 20 knobs
 * animating) with faceplate labels in every cell and lamps as bloom sources (one lamp in each repeat of 25 controls,
 * lit lamps carry a Lite clustered point light). It runs in two routes:
 * - `direct` (the I0.1 baseline): every part is in the layer's scene and the harness's render task draws it straight
 *   into the swapchain right after the layer's own pass.
 * - `target` (the post chain): the parts are not in the scene's auto-mirrored list; a render task of this page draws
 *   them into the layer's own colour + depth target (`rgba16float` + `depth24plus`, cleared to transparent), the
 *   enabled stages run on that target in the plan's order (TAA or SMAA, contact shadows, SSGI, bloom), and a
 *   composite effect task draws the result over the swapchain with premultiplied alpha, so the captured face below
 *   is never an input or an output of a stage. With `clip` the composite multiplies by a mask of the controls' rounded
 *   boxes (a mask task draws one flat plate per control into an `r8unorm` target), so no stage (bloom halos included)
 *   can draw outside its control. The captured key tops (and the LED on each key) stay in the scene and are drawn by
 *   the harness's own task after the composite, unfiltered, so cap labels are texel-exact whatever the chain does.
 * The local environment probe is a material change: metal parts get `setPbrLocalEnvironment` (box projection over
 * the panel) with a per-layer cube filled on the GPU from the layer's capture (directions that reach the face plane
 * inside the panel see the capture, others a small generated studio); the cube is refilled when the capture changes.
 *
 * `window.postProbe` drives the browser test (`tests/browser/ui-probe-instrument-post.test.mjs`): `setChain(config)`
 * rebuilds the layer scenes for a stage set, `measure(frames)` animates and returns per-task GPU timings, `meshDiff`,
 * `regions`/`compare` the text safety, `ghosting` the TAA trail on turning knobs, `probeRefresh` the probe's fill cost.
 * Query: `?chain=taa,contact,ssgi,bloom,probe` (or `full`, `none`), `?aa=taa|smaa|none`, `?route=direct|target`,
 * `?clip=0`, `?density=n` (250), `?relief=0`.
 */
import {
  addClusteredLightContainer, addMeshToTask, addTaskAfter, addTaskAtStart, createBloomPostProcessTask, createClusteredLightContainer,
  createClusteredPointLight, createEffectRenderTask, createEffectWrapper, createPbrMaterial, createRenderTask,
  createScreenSpaceContactShadowsPostProcessTask, createScreenSpaceGlobalIlluminationPostProcessTask, createSceneContext,
  createShaderMaterial, createSmaaPostProcessTask, createSurfaceRenderTargetTexture, createTaaPostProcessTask,
  captureScreenshot, disposeEffectWrapper, disposeMeshGpu, enablePbrLocalCubemap, enableShaderMaterialInstanceWorld,
  flushThinInstances, getRenderTaskGpuTimings, isGpuTimingSupported, loadHdrEnvironment, setEffectTexture, setEffectUniforms,
  setGpuTimingEnabled, setPbrEmissive, setPbrLocalEnvironment, setRenderTaskGpuTimingEnabled, setThinInstances, withSampledDepthTexture,
  type EffectWrapper, type EngineContext, type EnvironmentTextures, type Material, type Mesh, type PbrMaterialProps,
  type RenderTargetTextureResult, type RenderTask, type Screenshot, type Task, type Texture2D,
} from "@babylonjs/lite";
import { sceneSettings, strataTokens } from "@underglass/ui/tokens";
import { frustum, partMesh, plate, revolve, bar, type PartData } from "./instrument-parts.ts";
import { startInstrument, type InstrumentLayer, type PartKind, type Rect } from "./instrument-harness.ts";
import type { Point } from "./common.ts";

const params = new URLSearchParams(location.search);
const status = document.getElementById("status")!;
const frame = document.getElementById("frame")!;
const settings = sceneSettings(strataTokens, { theme: "light", depth: 0.5 });
document.body.style.setProperty("--stage", settings.backdrop);

/** Probe tokens (the I0.1 values, plus lamps and the post chain's settings), in CSS px. */
const tokens = {
  light: settings.light,
  knob: { collar: 1.8, skirt: 8, cap: 14.2, pointer: 14.8, sweep: (270 * Math.PI) / 180, collarInset: 1, skirtInset: 4.5, capInset: 9 },
  fader: { rise: 9, taper: 2.5, inset: 2, length: 14 },
  key: { rise: 6, taper: 3, travel: 4 },
  switch: { track: 2.5, thumb: 7, thumbTaper: 2.5 },
  meter: { segments: 16, window: 1.2, segment: 1.4 },
  /** A lamp: a bezel ring and a lens dome inside a square box, room left for its glow (fractions of the box). */
  lamp: { box: 0.6, bezel: 0.34, lens: 0.25, ring: 3.5, dome: 7.6, emissive: [6, 3.4, 1.1] as [number, number, number], light: { height: 12, intensity: 1.5, reach: 6 } },
  // I0.1's repeat of 25 with one key (index 12) made a lamp: 5 meters, 7 knobs, 4 faders, 4 keys, 4 switches, 1 lamp.
  pattern: ["meter", "knob", "key", "knob", "fader", "meter", "switch", "knob", "key", "meter", "knob", "fader", "lamp",
    "switch", "meter", "knob", "key", "fader", "knob", "switch", "meter", "key", "fader", "switch", "knob"] as const,
  partsPerKind: { meter: 17, knob: 4, fader: 3, key: 3, switch: 2, lamp: 2 },
  post: {
    taa: { factor: 0.1, samples: 8 },
    smaa: { threshold: 0.05, maxSearchSteps: 16 },
    // World units are CSS px: contact rays reach 8 px towards the key light.
    contact: { intensity: 0.7, stepCount: 12, maxDistance: 8, thickness: 3, bias: 0.15, normalBias: 0.4, resolutionScale: 1 },
    ssgi: { intensity: 1, stepCount: 12, rayCount: 1, rayLength: 24, thickness: 4, bias: 0.2, fadeStart: 4, fadeEnd: 24, resolutionScale: 0.5, composition: "additive" as const },
    // Only HDR values (the lit lenses, emissive above 1) pass the threshold.
    bloom: { threshold: 1, weight: 0.6, kernel: 48, bloomScale: 0.5, exposure: 1 },
    probe: { size: 128, height: 24 },
  },
};
type ControlKind = (typeof tokens.pattern)[number];
// Tallest point of each part and its inset from the control's box: the camera distance follows from these.
const envelopes = [
  { height: tokens.knob.collar, inset: tokens.knob.collarInset }, { height: tokens.knob.skirt, inset: tokens.knob.skirtInset },
  { height: tokens.knob.pointer, inset: tokens.knob.capInset }, { height: tokens.key.rise, inset: tokens.key.taper },
  { height: tokens.fader.rise + 0.5, inset: tokens.fader.inset + tokens.fader.taper }, { height: tokens.switch.thumb, inset: 2 + tokens.switch.thumbTaper },
  { height: tokens.meter.window + tokens.meter.segment, inset: 3 }, { height: tokens.lamp.ring, inset: 6 }, { height: tokens.lamp.dome, inset: 10 },
];

/** The post chain configuration: route, anti-aliasing and the stages (see the header). */
export interface Chain { route: "direct" | "target"; aa: "none" | "taa" | "smaa"; contact: boolean; ssgi: boolean; bloom: boolean; probe: boolean; clip: boolean }
const fromQuery = (): Chain => {
  const listed = new Set((params.get("chain") ?? "none").split(",").map(value => value.trim()));
  const full = listed.has("full");
  const aa = (params.get("aa") ?? (listed.has("smaa") ? "smaa" : listed.has("taa") || full ? "taa" : "none")) as Chain["aa"];
  const chain: Chain = { route: (params.get("route") ?? "target") as Chain["route"], aa, contact: full || listed.has("contact"), ssgi: full || listed.has("ssgi"),
    bloom: full || listed.has("bloom"), probe: full || listed.has("probe"), clip: params.get("clip") !== "0" };
  return chain;
};
let chain = fromQuery();
const postStages = (value: Chain) => value.aa !== "none" || value.contact || value.ssgi || value.bloom;

/** Deterministic values, so every run lays out the same states. */
function seeded(seed: number) { let state = seed >>> 0; return () => { state = (state + 0x6d2b79f5) >>> 0; let t = state; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

let lower!: HTMLElement, upper!: HTMLElement;
let density = Math.max(1, Number(params.get("density") ?? 250));
const srgbToLinear = (value: number) => { const c = value / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const linear = (r: number, g: number, b: number): [number, number, number, number] => [srgbToLinear(r), srgbToLinear(g), srgbToLinear(b), 1];
// Materials that reflect, so the local environment probe is assigned to them when it is on.
const reflective = new Set<PbrMaterialProps>();
const pbr = (colour: [number, number, number, number], metallic: number, roughness: number, emissive?: [number, number, number], reflects = false) => {
  const material = createPbrMaterial({ baseColorFactor: colour, metallicFactor: metallic, roughnessFactor: roughness, doubleSided: true });
  if (emissive) setPbrEmissive(material as unknown as PbrMaterialProps, emissive);
  if (reflects) reflective.add(material as unknown as PbrMaterialProps);
  return material as unknown as Material;
};

/** The largest cell edge that fits `count` cells in a `width` × `height` area. */
function fitCell(width: number, height: number, count: number) {
  let cell = Math.max(8, Math.floor(Math.sqrt((width * height) / Math.max(1, count))));
  while (cell > 8 && Math.floor(width / cell) * Math.floor(height / cell) < count) cell--;
  return cell;
}
const prefix: Record<ControlKind, string> = { meter: "M", knob: "N", fader: "F", key: "K", switch: "S", lamp: "L" };
/** Fills `panel` with `count` controls of the pattern, starting at pattern index `first`; each cell carries a label. */
function fill(panel: HTMLElement, count: number, first: number, title: string, random: () => number) {
  panel.replaceChildren();
  const heading = document.createElement("h2");
  heading.textContent = title;
  const grid = document.createElement("div");
  grid.className = "instrument-grid";
  panel.append(heading, grid);
  const width = panel.clientWidth - 32, height = panel.clientHeight - 24 - 26;
  const cell = fitCell(width, height, count);
  grid.style.gridTemplateColumns = `repeat(${Math.floor(width / cell)}, ${cell}px)`;
  grid.style.gridAutoRows = `${cell}px`;
  for (let index = 0; index < count; index++) {
    const kind = tokens.pattern[(first + index) % tokens.pattern.length]!;
    const id = `${panel.id}-${kind}-${index}`;
    const wrapper = document.createElement("div");
    wrapper.className = "instrument-cell";
    let control: HTMLElement;
    if (kind === "knob" || kind === "fader") {
      const input = document.createElement("input");
      Object.assign(input, { type: "range", min: "0", max: "100", value: String(Math.round(10 + random() * 80)) });
      input.setAttribute("aria-label", `${kind === "knob" ? "Knob" : "Fader"} ${index + 1}`);
      const size = kind === "knob" ? Math.round(cell * 0.78) : 0;
      Object.assign(input.style, kind === "knob" ? { width: `${size}px`, height: `${size}px` } : { width: `${Math.max(16, Math.round(cell * 0.34))}px`, height: `${Math.round(cell * 0.9)}px` });
      if (kind === "fader") input.setAttribute("aria-orientation", "vertical");
      control = input;
    } else if (kind === "key") {
      const button = document.createElement("button");
      button.type = "button";
      const label = document.createElement("span");
      label.className = "instrument-label";
      label.textContent = `K${index + 1}`;
      button.append(label);
      Object.assign(button.style, { width: `${Math.round(cell * 0.84)}px`, height: `${Math.round(cell * 0.56)}px`, fontSize: `${Math.max(9, Math.round(cell * 0.2))}px` });
      button.dataset.presses = "0";
      button.addEventListener("click", () => { button.dataset.presses = String(Number(button.dataset.presses) + 1); });
      control = button;
    } else if (kind === "switch" || kind === "lamp") {
      const input = document.createElement("input");
      Object.assign(input, { type: "checkbox", checked: random() < (kind === "lamp" ? 0.7 : 0.5) });
      input.setAttribute("role", "switch");
      input.setAttribute("aria-label", `${kind === "lamp" ? "Lamp" : "Switch"} ${index + 1}`);
      if (kind === "lamp") {
        const s = Math.round(cell * tokens.lamp.box);
        Object.assign(input.style, { width: `${s}px`, height: `${s}px`, borderRadius: "50%" });
      } else {
        const w = Math.max(32, Math.round(cell * 0.6)), h = Math.max(16, Math.round(cell * 0.3));
        Object.assign(input.style, { width: `${w}px`, height: `${h}px`, borderRadius: `${h / 2}px` });
      }
      control = input;
    } else {
      const meter = document.createElement("meter");
      Object.assign(meter, { min: 0, max: 1, value: Math.round(random() * 100) / 100 });
      meter.setAttribute("aria-label", `Level ${index + 1}`);
      Object.assign(meter.style, { width: `${Math.max(10, Math.round(cell * 0.24))}px`, height: `${Math.round(cell * 0.9)}px` });
      control = meter;
    }
    control.id = id;
    control.dataset.part = kind;
    // Faceplate print: the control's short name in the cell's bottom-left corner, outside the control's box.
    const print = document.createElement("span");
    print.className = "post-label";
    print.id = `${id}-label`;
    print.textContent = `${prefix[kind]}${index + 1}`;
    wrapper.append(control, print);
    grid.append(wrapper);
  }
  return cell;
}
/** Lays out `count` controls over both panels; the upper panel's left edge crosses one of the lower panel's knobs. */
function layout(count: number) {
  const width = frame.clientWidth, height = frame.clientHeight;
  Object.assign(lower.style, { left: "16px", top: "16px", width: `${width - 32}px`, height: `${height - 32}px` });
  const upperSize = { width: Math.round(width * 0.34), height: Math.round(height * 0.42) };
  const areaLower = (width - 64) * (height - 82), areaUpper = (upperSize.width - 32) * (upperSize.height - 50);
  const upperCount = Math.max(5, Math.round((count * areaUpper) / (areaLower + areaUpper))), lowerCount = Math.max(1, count - upperCount);
  const random = seeded(17);
  fill(lower, lowerCount, 0, "Lower panel: relief face, mesh pass and post chain after it", random);
  const knobs = [...lower.querySelectorAll<HTMLElement>("[data-part=knob]")];
  const target = { x: width * 0.5, y: height * 0.32 };
  const centre = (element: HTMLElement) => { const box = element.getBoundingClientRect(); return { x: box.left + box.width / 2, y: box.top + box.height / 2, top: box.top }; };
  const straddled = knobs.reduce((best, knob) => (Math.hypot(centre(knob).x - target.x, centre(knob).y - target.y) < Math.hypot(centre(best).x - target.x, centre(best).y - target.y) ? knob : best), knobs[0]!);
  const at = centre(straddled);
  const frameBox = frame.getBoundingClientRect();
  const left = Math.round(at.x - frameBox.left), top = Math.max(24, Math.round(at.top - frameBox.top - 36));
  Object.assign(upper.style, { left: `${left}px`, top: `${top}px`, width: `${Math.min(upperSize.width, width - left - 24)}px`, height: `${Math.min(upperSize.height, height - top - 24)}px` });
  upper.dataset.straddles = straddled.id;
  fill(upper, upperCount, lowerCount, "Upper panel: plain face", random);
}

/** The relief material's scene for the lower panel (as on the I0.1 page). */
const reliefScene = () => ({
  format: "strata-scene" as const, version: 1 as const, extent: { width: lower.offsetWidth, height: lower.offsetHeight },
  outset: { top: 14, right: 14, bottom: 14, left: 14 }, ...settings,
  primitives: [{ face: "raised" as const, rect: [0, 0, lower.offsetWidth, lower.offsetHeight] as [number, number, number, number], radius: 14, height: 8, material: "matte" }],
});
const reliefMaterial = () => ({ kind: "relief" as const, scene: reliefScene(), bounds: "layer" as const, interaction: "material" as const, media: "identity" as const, fallback: "static" as const });

// ---- GPU resources that outlive a rebuild: per-layer targets, the probe cubes, the composite effects. ----

const transparent = { r: 0, g: 0, b: 0, a: 0 };
interface Targets { mesh: RenderTargetTextureResult; ping: RenderTargetTextureResult; pong: RenderTargetTextureResult; mask: RenderTargetTextureResult }
const targets = new Map<string, Targets>();
/** The layer's surface-sized targets, made once and reused by every rebuild (they follow surface resizes). */
function targetsOf(id: string, engine: EngineContext): Targets {
  let entry = targets.get(id);
  if (!entry) {
    const colour = (name: string) => createSurfaceRenderTargetTexture(engine, { lbl: `${id}-post-${name}`, format: "rgba16float", samples: 1, size: engine });
    entry = {
      mesh: createSurfaceRenderTargetTexture(engine, { lbl: `${id}-post-mesh`, format: "rgba16float", dFormat: "depth24plus", samples: 1, size: engine }, withSampledDepthTexture),
      ping: colour("ping"), pong: colour("pong"),
      mask: createSurfaceRenderTargetTexture(engine, { lbl: `${id}-post-mask`, format: "r8unorm", samples: 1, size: engine }),
    };
    targets.set(id, entry);
  }
  return entry;
}
// Composite: the chain's result over the swapchain, premultiplied (a halo with colour and no coverage adds light),
// times the control mask when clipping.
const compositeWGSL = /* wgsl */ `@group(0) @binding(0) var meshColour: texture_2d<f32>;
@group(0) @binding(1) var meshMask: texture_2d<f32>;
@group(0) @binding(2) var<uniform> composite: vec4f;
@fragment fn effectFragment(input: EffectVertexOutput) -> @location(0) vec4f {
  let texel = vec2i(floor(input.position.xy));
  let colour = textureLoad(meshColour, texel, 0);
  let keep = select(1.0, textureLoad(meshMask, texel, 0).r, composite.x > 0.5);
  return vec4f(min(colour.rgb, vec3f(1.0)), min(colour.a, 1.0)) * keep;
}`;
const premultiplied: GPUBlendState = {
  color: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" },
  alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" },
};
// Mask plates: flat at the face, one per control, drawn 1.
const maskVertex = /* wgsl */ `struct VertexOutput { @builtin(position) position: vec4<f32> };
@vertex fn mainVertex(input: VertexInput) -> VertexOutput {
  var out: VertexOutput;
  out.position = shaderSystem.projection * (shaderSystem.view * (getFinalWorld(input) * vec4<f32>(input.position, 1.0)));
  return out;
}`;
const maskFragment = /* wgsl */ `struct VertexOutput { @builtin(position) position: vec4<f32> };
@fragment fn mainFragment(input: VertexOutput) -> @location(0) vec4<f32> { return vec4<f32>(1.0, 1.0, 1.0, 1.0); }`;
let liveEffects: EffectWrapper[] = [], retiredEffects: EffectWrapper[] = [];
let liveMeshes: Mesh[] = [], retiredMeshes: Mesh[] = [];

// ---- The local environment probe: a generated studio as the base IBL, a per-layer cube filled from the capture. ----

/** A small studio panorama as a flat Radiance `.hdr` (a dark floor rising to a bright ceiling, and a softbox at the key light). */
function studioHdr(width = 64) {
  const height = width / 2;
  const header = new TextEncoder().encode(`#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y ${height} +X ${width}\n`);
  const bytes = new Uint8Array(header.length + width * height * 4);
  bytes.set(header);
  for (let row = 0; row < height; row++) for (let column = 0; column < width; column++) {
    const y = Math.cos(((row + 0.5) / height) * Math.PI);
    const value = 0.04 + 0.5 * Math.min(1, Math.max(0, (y + 0.3) / 1.2));
    const exponent = Math.floor(Math.log2(value)) + 1, scale = 256 / 2 ** exponent, offset = header.length + (row * width + column) * 4;
    bytes.set([Math.floor(value * 0.97 * scale), Math.floor(value * 0.99 * scale), Math.floor(value * scale), exponent + 128], offset);
  }
  return bytes;
}
let probeBase: Promise<EnvironmentTextures> | undefined;
/** Enables Lite's local cubemap path (once) and loads the base environment on a scene that is never registered. */
function baseEnvironment(engine: EngineContext) {
  probeBase ??= (async () => {
    await enablePbrLocalCubemap();
    const holder = createSceneContext(engine, { defaultRenderTask: false });
    const url = URL.createObjectURL(new Blob([studioHdr()]));
    try { return await loadHdrEnvironment(holder, url, { faceSize: 64, skipSkybox: true, skipGround: true }); }
    finally { URL.revokeObjectURL(url); }
  })();
  return probeBase;
}
const probeWGSL = /* wgsl */ `struct Params { panel: vec4f, capture: vec4f, origin: vec4f, face: vec4f, key: vec4f };
@group(0) @binding(0) var source: texture_2d<f32>;
@group(0) @binding(1) var sourceSampler: sampler;
@group(0) @binding(2) var cube: texture_storage_2d_array<rgba16float, write>;
@group(0) @binding(3) var<uniform> params: Params;
fn faceDirection(face: u32, s: f32, t: f32) -> vec3f {
  switch face {
    case 0u: { return vec3f(1.0, -t, -s); }
    case 1u: { return vec3f(-1.0, -t, s); }
    case 2u: { return vec3f(s, 1.0, t); }
    case 3u: { return vec3f(s, -1.0, -t); }
    case 4u: { return vec3f(s, -t, 1.0); }
    default: { return vec3f(-s, -t, -1.0); }
  }
}
fn studio(d: vec3f) -> vec3f {
  var value = mix(0.04, 0.54, smoothstep(-0.3, 0.9, d.y));
  value += 6.0 * smoothstep(0.93, 0.98, dot(d, params.key.xyz));
  return vec3f(value * 0.97, value * 0.99, value);
}
// A direction that reaches the face plane (z = 0) inside the panel sees the capture there; any other the studio.
fn radiance(d: vec3f) -> vec3f {
  if (d.z > 1e-4) {
    let p = params.capture.xy + d.xy * (-params.capture.z / d.z);
    if (p.x >= params.panel.x && p.x <= params.panel.z && p.y >= params.panel.y && p.y <= params.panel.w) {
      let local = vec2f(p.x - params.origin.x, params.origin.y - p.y) * params.capture.w;
      let colour = textureSampleLevel(source, sourceSampler, local / params.origin.zw, 0.0).rgb;
      return pow(colour, vec3f(2.2));
    }
  }
  return studio(d);
}
@compute @workgroup_size(8, 8, 1) fn main(@builtin(global_invocation_id) id: vec3u) {
  let size = u32(params.face.x);
  if (id.x >= size || id.y >= size) { return; }
  let n = u32(params.face.y);
  var sum = vec3f(0.0);
  for (var j = 0u; j < n; j++) {
    for (var i = 0u; i < n; i++) {
      let s = (f32(id.x) + (f32(i) + 0.5) / f32(n)) / f32(size) * 2.0 - 1.0;
      let t = (f32(id.y) + (f32(j) + 0.5) / f32(n)) / f32(size) * 2.0 - 1.0;
      sum += radiance(normalize(faceDirection(id.z, s, t)));
    }
  }
  textureStore(cube, vec2u(id.xy), id.z, vec4f(sum / f32(n * n), 1.0));
}`;
interface Probe { cube: GPUTexture; env?: EnvironmentTextures; source?: Material; bound?: Texture2D; captures: number; refreshes: number; lastMs: number }
const probes = new Map<string, Probe>();
let probePipeline: GPUComputePipeline | undefined;
let probeQuery: { set: GPUQuerySet; resolve: GPUBuffer; read: GPUBuffer } | undefined;
const deviceOf = (): GPUDevice => {
  for (const canvas of frame.querySelectorAll("canvas")) {
    const context = canvas.getContext("webgpu") as unknown as { getConfiguration?(): { device: GPUDevice } | null } | null;
    const device = context?.getConfiguration?.()?.device;
    if (device) return device;
  }
  throw new Error("No configured WebGPU canvas");
};
const mipCount = (size: number) => Math.floor(Math.log2(size)) + 1;
// WebGPU usage flags (the playground's types declare the interfaces, not these globals).
const usage = { mapRead: 1, copySrc: 4, copyDst: 8, uniform: 64, queryResolve: 512, textureBinding: 4, storageBinding: 8, textureCopyDst: 2 };
/** The capture the harness last bound to a layer's probe-source material (Lite keeps it on the material's slot). */
const boundCapture = (material: Material) => (material as unknown as { _textureSlots: Map<string, { current: Texture2D | null }> })._textureSlots.get("capture")?.current ?? null;
/** Fills a layer's probe cube from its capture: every mip from the mapping, `n × n` samples per texel (a box blur by mip). */
async function refreshProbe(layer: InstrumentLayer, probe: Probe, timed = false) {
  const source = probe.source && boundCapture(probe.source);
  if (!source) return null;
  const device = deviceOf();
  probePipeline ??= device.createComputePipeline({ layout: "auto", compute: { module: device.createShaderModule({ code: probeWGSL }), entryPoint: "main" } });
  const { width: W, height: H } = { width: frame.clientWidth, height: frame.clientHeight };
  const box = layer.element.getBoundingClientRect(), base = frame.getBoundingClientRect();
  const left = box.left - base.left - W / 2, top = H / 2 - (box.top - base.top);
  const towards = towardsLight();
  const encoder = device.createCommandEncoder();
  if (timed && device.features.has("timestamp-query")) probeQuery ??= { set: device.createQuerySet({ type: "timestamp", count: 2 }),
    resolve: device.createBuffer({ size: 16, usage: usage.queryResolve | usage.copySrc }), read: device.createBuffer({ size: 16, usage: usage.mapRead | usage.copyDst }) };
  const pass = encoder.beginComputePass(timed && probeQuery ? { timestampWrites: { querySet: probeQuery.set, beginningOfPassWriteIndex: 0, endOfPassWriteIndex: 1 } } : {});
  pass.setPipeline(probePipeline);
  const size = tokens.post.probe.size, buffers: GPUBuffer[] = [];
  for (let mip = 0; mip < mipCount(size); mip++) {
    const edge = Math.max(1, size >> mip);
    const data = new Float32Array([left, top - box.height, left + box.width, top,
      left + box.width / 2, top - box.height / 2, -tokens.post.probe.height, window.devicePixelRatio,
      left, top, source.width, source.height,
      edge, Math.min(8, 1 << mip), 0, 0, towards[0], towards[1], towards[2], 0]);
    const uniforms = device.createBuffer({ size: data.byteLength, usage: usage.uniform | usage.copyDst });
    device.queue.writeBuffer(uniforms, 0, data);
    buffers.push(uniforms);
    pass.setBindGroup(0, device.createBindGroup({ layout: probePipeline.getBindGroupLayout(0), entries: [
      { binding: 0, resource: source.view }, { binding: 1, resource: source.sampler },
      { binding: 2, resource: probe.cube.createView({ dimension: "2d-array", baseMipLevel: mip, mipLevelCount: 1 }) },
      { binding: 3, resource: { buffer: uniforms } }] }));
    pass.dispatchWorkgroups(Math.ceil(edge / 8), Math.ceil(edge / 8), 6);
  }
  pass.end();
  if (timed && probeQuery) { encoder.resolveQuerySet(probeQuery.set, 0, 2, probeQuery.resolve, 0); encoder.copyBufferToBuffer(probeQuery.resolve, 0, probeQuery.read, 0, 16); }
  device.queue.submit([encoder.finish()]);
  probe.bound = source;
  probe.refreshes++;
  await device.queue.onSubmittedWorkDone();
  for (const buffer of buffers) buffer.destroy();
  if (timed && probeQuery) {
    await probeQuery.read.mapAsync(1);
    const stamps = new BigUint64Array(probeQuery.read.getMappedRange().slice(0));
    probeQuery.read.unmap();
    probe.lastMs = Number(stamps[1]! - stamps[0]!) / 1e6;
    return probe.lastMs;
  }
  return null;
}
/** World direction towards the key light (the harness's axes: y up, +z away from the viewer). */
function towardsLight(): [number, number, number] {
  const a = (tokens.light.azimuth * Math.PI) / 180, e = (tokens.light.elevation * Math.PI) / 180;
  return [Math.sin(a) * Math.cos(e), Math.cos(a) * Math.cos(e), -Math.sin(e)];
}

// ---- Part kinds outside the scene's list (target route): the harness's pose maths, drawn by an explicit task. ----

/** A thin-instanced part kind drawn only by `task` (not in the scene's auto-mirrored list); the harness's pose maths. */
function taskKind(layer: InstrumentLayer, engine: EngineContext, task: RenderTask, name: string, data: PartData, material: Material, capacity: number): PartKind {
  const mesh = partMesh(engine, `${layer.id}-${name}`, data);
  mesh.material = material;
  const matrices = new Float32Array(Math.max(1, capacity) * 16);
  setThinInstances(mesh, matrices, Math.max(1, capacity));
  addMeshToTask(task, mesh);
  liveMeshes.push(mesh);
  // The harness's stage camera stands at distance D (its near plane is D / 4).
  const D = layer.camera.nearPlane * 4;
  let dirty = false;
  const kind: PartKind = {
    name, mesh, capacity,
    pose(index, pose) {
      const [wx, wy] = layer.world(pose.x, pose.y);
      const lift = pose.lift ?? 0, c = Math.cos(pose.angle ?? 0), s = Math.sin(pose.angle ?? 0);
      const lock = pose.locked === undefined ? 1 : (D - (pose.locked + lift)) / D, k = lock * (pose.scale ?? 1);
      matrices.set([k * c, k * s, 0, 0, -k * s, k * c, 0, 0, 0, 0, 1, 0, lock * wx, lock * wy, -lift, 1], index * 16);
      dirty = true;
    },
    hide(index) { matrices.fill(0, index * 16, index * 16 + 16); dirty = true; },
    flush() { if (dirty) { flushThinInstances(mesh); dirty = false; } },
  };
  layer.kinds.push(kind);
  return kind;
}

// ---- Building a layer: parts, then (target route) the mask, mesh, stage and composite tasks. ----

interface StageRecord { stage: string; calls: string[]; error?: string }
interface Built { layer: InstrumentLayer; parts: Record<string, PartKind>; controls: Map<HTMLElement, { kind: ControlKind; index: number; rect: Rect }>; stages: StageRecord[]; tasks: string[] }
const built = new Map<string, Built>();
const shifted = (data: PartData, dy: number): PartData => ({ ...data, positions: data.positions.map((value, index) => (index % 3 === 1 ? value + dy : value)) });
const pressed = new Set<HTMLElement>();
const valueOf = (control: HTMLElement) => control instanceof HTMLMeterElement ? control.value : control instanceof HTMLInputElement
  ? control.type === "checkbox" ? Number(control.checked) : (Number(control.value) - Number(control.min)) / (Number(control.max) - Number(control.min)) : Number(pressed.has(control));

async function build(layer: InstrumentLayer) {
  const engine = layer.scene.surface.engine as EngineContext;
  const config = chain;
  const target = config.route === "target";
  const controls = new Map<HTMLElement, { kind: ControlKind; index: number; rect: Rect }>();
  const counts: Record<ControlKind, number> = { meter: 0, knob: 0, fader: 0, key: 0, switch: 0, lamp: 0 };
  for (const element of layer.element.querySelectorAll<HTMLElement>("[data-part]")) {
    const kind = element.dataset.part as ControlKind;
    controls.set(element, { kind, index: counts[kind]++, rect: layer.rectOf(element) });
  }
  const first = (kind: ControlKind) => [...controls.values()].find(control => control.kind === kind)?.rect;
  const upperLayer = layer.id === "upper";
  const stages: StageRecord[] = [], tasks: string[] = [];
  reflective.clear();
  // Target route: this page's mesh task draws every part except the captured key tops and their LEDs.
  let meshTask: RenderTask | undefined, maskTask: RenderTask | undefined;
  const rts = target ? targetsOf(layer.id, engine) : undefined;
  if (rts) {
    layer.scene.clearColor = transparent;
    // `sharedRt`: the page owns the target (reused by every rebuild), so disposing an old scene's task leaves it alone.
    meshTask = createRenderTask({ name: "post-mesh", rt: rts.mesh.rt, sharedRt: true, clr: true, clrColor: transparent, autoMirror: false }, engine, layer.scene);
    stages.push({ stage: "mesh", calls: ["createSurfaceRenderTargetTexture(rgba16float + depth24plus, withSampledDepthTexture)", "createRenderTask({ rt, sharedRt: true, clr: true, clrColor: transparent, autoMirror: false })", "addMeshToTask per part kind"] });
  }
  const kind = (name: string, data: PartData, material: Material, capacity: number, filtered = true) =>
    meshTask && filtered ? taskKind(layer, engine, meshTask, name, data, material, capacity) : layer.kind(name, data, material, capacity);
  const parts: Record<string, PartKind> = {};
  const knob = first("knob");
  if (knob) {
    const r = knob.width / 2, k = tokens.knob, rc = Math.max(3, r - k.capInset);
    parts.collar = kind("collar", revolve([[r - k.collarInset, 0], [r - k.collarInset, k.collar - 0.6], [r - k.collarInset - 0.6, k.collar], [r - k.skirtInset, k.collar]]), pbr(linear(150, 152, 158), 0.3, 0.5, undefined, true), counts.knob);
    parts.skirt = kind("skirt", revolve([[r - k.skirtInset, k.collar], [r - k.skirtInset, k.skirt - 1], [r - k.skirtInset - 1, k.skirt], [rc + 0.5, k.skirt]]), pbr(linear(28, 29, 32), 0.2, 0.45, undefined, true), counts.knob);
    parts.cap = kind("cap", revolve([[rc, k.skirt], [rc, k.cap - 1.2], [rc - 1.2, k.cap], [0, k.cap]]), pbr(linear(200, 202, 207), config.probe ? 0.9 : 0.25, config.probe ? 0.22 : 0.32, undefined, true), counts.knob);
    parts.pointer = kind("pointer", shifted(bar(1.6, rc * 0.55, k.cap, k.pointer), rc * 0.4), pbr(linear(250, 250, 250), 0, 0.6, [0.35, 0.35, 0.35]), counts.knob);
  }
  const fader = first("fader");
  if (fader) {
    const f = tokens.fader, w = fader.width - 2 * f.inset;
    parts.slot = kind("slot", frustum(3, fader.height - f.length, 1.5, 0.4, 0), pbr(linear(8, 8, 10), 0, 0.9), counts.fader);
    parts.faderCap = kind("fader-cap", frustum(w, f.length, 2.5, f.rise, f.taper), pbr(linear(52, 54, 60), config.probe ? 0.8 : 0.2, 0.4, undefined, true), counts.fader);
    parts.grip = kind("grip", bar(Math.max(2, w - 2 * f.taper - 4), 1.4, f.rise, f.rise + 0.5), pbr(linear(245, 245, 245), 0, 0.5, [0.3, 0.3, 0.3]), counts.fader);
  }
  const key = first("key");
  if (key) {
    const t = tokens.key, radius = 6;
    const body = upperLayer ? linear(196, 202, 212) : linear(30, 80, 200);
    parts.keyBody = kind("key-body", frustum(key.width, key.height, radius, t.rise, t.taper, 0, true), pbr(body, 0.1, 0.4), counts.key);
    // The captured top and the LED on it are drawn by the harness's task after the composite: never filtered.
    parts.keyTop = kind("key-top", plate(key.width - 2 * t.taper, key.height - 2 * t.taper, Math.max(0.5, radius - t.taper), t.rise), layer.capture("key-top"), counts.key, false);
    parts.led = kind("led", revolve([[2.2, t.rise], [2.2, t.rise + 0.4], [1.2, t.rise + 1.1], [0, t.rise + 1.2]], 16), pbr(linear(20, 60, 30), 0, 0.3, [0.1, 0.9, 0.3]), counts.key, false);
  }
  const toggle = first("switch");
  if (toggle) {
    const s = tokens.switch, d = toggle.height - 4;
    parts.track = kind("track", frustum(toggle.width - 2, toggle.height - 2, (toggle.height - 2) / 2, s.track, 0.8), pbr(linear(110, 114, 122), 0, 0.7), counts.switch);
    parts.thumb = kind("thumb", frustum(d, d, d / 2, s.thumb, s.thumbTaper), pbr(linear(236, 238, 242), config.probe ? 0.85 : 0.1, 0.3, undefined, true), counts.switch);
  }
  const meter = first("meter");
  if (meter) {
    const m = tokens.meter, segment = (meter.height - 6) / m.segments;
    const segmentData = frustum(meter.width - 6, segment - 1.2, 0.8, m.segment, 0.3, m.window);
    parts.window = kind("window", frustum(meter.width, meter.height, 2, m.window, 0.6), pbr(linear(10, 10, 12), 0, 0.3), counts.meter);
    parts.lit = kind("segment-lit", segmentData, pbr(linear(30, 160, 70), 0, 0.35, [0.1, 0.85, 0.3]), counts.meter * m.segments);
    parts.dark = kind("segment-dark", segmentData, pbr(linear(18, 30, 22), 0, 0.4), counts.meter * m.segments);
  }
  const lamp = first("lamp");
  if (lamp) {
    const l = tokens.lamp, rb = lamp.width * l.bezel, rl = lamp.width * l.lens;
    parts.bezel = kind("lamp-bezel", revolve([[rb, 0], [rb, l.ring - 1], [rb - 1, l.ring], [rl, l.ring]]), pbr(linear(170, 172, 178), 0.9, 0.3, undefined, true), counts.lamp);
    const dome = revolve([[rl, l.ring], [rl * 0.92, l.ring + 2], [rl * 0.6, l.dome - 0.6], [0, l.dome]]);
    parts.lensOn = kind("lamp-lens-on", dome, pbr(linear(255, 200, 120), 0, 0.2, l.emissive), counts.lamp);
    parts.lensOff = kind("lamp-lens-off", dome, pbr(linear(40, 34, 30), 0, 0.15), counts.lamp);
    // Lit lamps are clustered point lights for the parts around them (I0.3).
    const container = createClusteredLightContainer();
    let lights = 0;
    for (const [element, control] of controls) {
      if (control.kind !== "lamp" || !(element as HTMLInputElement).checked) continue;
      const { x, y, width, height } = control.rect;
      createClusteredPointLight(container, { position: layer.world(x + width / 2, y + height / 2, l.light.height), diffuse: [1, 0.62, 0.22], range: rl * 2 * l.light.reach, intensity: l.light.intensity });
      lights++;
    }
    if (lights) addClusteredLightContainer(layer.scene, container);
  }
  // The local environment probe: metal parts reflect this layer's capture.
  if (config.probe) {
    const base = await baseEnvironment(engine);
    let probe = probes.get(layer.id);
    const device = deviceOf();
    if (!probe) {
      const size = tokens.post.probe.size;
      probe = { cube: device.createTexture({ label: `${layer.id}-probe-cube`, size: [size, size, 6], format: "rgba16float", mipLevelCount: mipCount(size),
        usage: usage.textureBinding | usage.storageBinding | usage.textureCopyDst }), captures: -1, refreshes: 0, lastMs: 0 };
      probes.set(layer.id, probe);
    }
    probe.env ??= { ...base, specularCube: probe.cube, specularCubeView: probe.cube.createView({ dimension: "cube" }) };
    probe.source = layer.capture("probe-source");
    probe.bound = undefined;
    const box = layer.element.getBoundingClientRect(), origin = layer.world(box.width / 2, box.height / 2, 0), depth = 4 * tokens.post.probe.height;
    for (const material of reflective) setPbrLocalEnvironment(material, probe.env, { shape: "box", projectionPosition: [origin[0], origin[1], -depth / 2],
      projectionSize: [box.width, box.height, depth], capturePosition: [origin[0], origin[1], -tokens.post.probe.height] });
    stages.push({ stage: "probe", calls: ["enablePbrLocalCubemap()", "loadHdrEnvironment(unregistered scene, generated studio .hdr) for the BRDF table and irradiance",
      `GPU cube ${tokens.post.probe.size}² × 6, ${mipCount(tokens.post.probe.size)} mips, filled from the capture by a compute pass`, `setPbrLocalEnvironment(${reflective.size} metal materials, box projection over the panel)`] });
  }
  if (rts && meshTask) {
    // Mask plates: every control's rounded box, flat at the face.
    maskTask = createRenderTask({ name: "post-mask", rt: rts.mask.rt, sharedRt: true, clr: true, clrColor: transparent, autoMirror: false }, engine, layer.scene);
    const maskMaterial = createShaderMaterial({ name: `${layer.id}-mask`, vertexSource: maskVertex, fragmentSource: maskFragment, attributes: ["position"], uniforms: ["world", "view", "projection"], backFaceCulling: false });
    enableShaderMaterialInstanceWorld(maskMaterial);
    for (const kindName of Object.keys(counts) as ControlKind[]) {
      const rect = first(kindName);
      if (!rect) continue;
      const sample = [...controls].find(([, control]) => control.kind === kindName)![0];
      const radius = parseFloat(getComputedStyle(sample).borderTopLeftRadius) || 0;
      const plates = taskKind(layer, engine, maskTask, `mask-${kindName}`, plate(rect.width, rect.height, Math.min(radius, rect.width / 2, rect.height / 2), 0), maskMaterial as unknown as Material, counts[kindName]);
      parts[`mask-${kindName}`] = plates;
    }
    stages.push({ stage: "mask", calls: ["createSurfaceRenderTargetTexture(r8unorm)", "createRenderTask({ sharedRt: true, autoMirror: false })", "createShaderMaterial (returns 1) + enableShaderMaterialInstanceWorld", "one plate() per control box, thin-instanced per kind"] });
    const chainTasks: Task[] = [maskTask, meshTask];
    let source = rts.mesh, flip = false;
    const next = () => (flip = !flip) ? rts.ping : rts.pong;
    const stage = (name: string, calls: string[], make: (output: RenderTargetTextureResult) => Task) => {
      const output = next();
      try { chainTasks.push(make(output)); source = output; stages.push({ stage: name, calls }); }
      catch (error) { flip = !flip; stages.push({ stage: name, calls, error: String(error) }); }
    };
    const camera = layer.camera, [lx, ly, lz] = towardsLight(), travel = { x: -lx, y: -ly, z: -lz };
    const post = tokens.post;
    if (config.aa === "taa") stage("taa", [`createTaaPostProcessTask({ sourceTexture: mesh, sourceRenderTask: mesh task, factor: ${post.taa.factor}, samples: ${post.taa.samples} })`],
      output => createTaaPostProcessTask({ name: "post-taa", sourceTexture: source.rt, sourceRenderTask: meshTask!, targetTexture: output.rt, factor: post.taa.factor, samples: post.taa.samples }, engine, layer.scene));
    if (config.aa === "smaa") stage("smaa", [`createSmaaPostProcessTask({ threshold: ${post.smaa.threshold}, maxSearchSteps: ${post.smaa.maxSearchSteps} })`],
      output => createSmaaPostProcessTask({ name: "post-smaa", sourceTexture: source.rt, targetTexture: output.rt, threshold: post.smaa.threshold, maxSearchSteps: post.smaa.maxSearchSteps }, engine, layer.scene));
    if (config.contact) stage("contact", [`createScreenSpaceContactShadowsPostProcessTask({ depthTexture: mesh, camera, lightDirection: key light, composition: "multiply", ${JSON.stringify(post.contact)} })`],
      output => createScreenSpaceContactShadowsPostProcessTask({ name: "post-contact", sourceTexture: source.rt, depthTexture: rts.mesh.rt, camera, lightDirection: travel, targetTexture: output.rt, composition: "multiply", ...post.contact }, engine, layer.scene));
    if (config.ssgi) stage("ssgi", [`createScreenSpaceGlobalIlluminationPostProcessTask({ depthTexture: mesh, camera, ${JSON.stringify(post.ssgi)} })`],
      output => createScreenSpaceGlobalIlluminationPostProcessTask({ name: "post-ssgi", sourceTexture: source.rt, depthTexture: rts.mesh.rt, camera, targetTexture: output.rt, ...post.ssgi }, engine, layer.scene));
    if (config.bloom) stage("bloom", [`createBloomPostProcessTask(${JSON.stringify(post.bloom)}) (extract highlights, blur x, blur y, merge)`],
      output => createBloomPostProcessTask({ name: "post-bloom", sourceTexture: source.rt, targetTexture: output.rt, ...post.bloom }, engine, layer.scene));
    const effect = createEffectWrapper(engine, { name: `${layer.id}-post-composite`, fragmentWGSL: compositeWGSL, blend: premultiplied, bindings: [
      { binding: 0, kind: "texture", name: "meshColour" }, { binding: 1, kind: "texture", name: "meshMask" }, { binding: 2, kind: "uniform", name: "composite", uniformByteLength: 16 }] });
    liveEffects.push(effect);
    setEffectTexture(effect, "meshColour", source.texture);
    setEffectTexture(effect, "meshMask", rts.mask.texture);
    setEffectUniforms(effect, new Float32Array([config.clip ? 1 : 0, 0, 0, 0]));
    chainTasks.push(createEffectRenderTask({ name: "post-composite", effect, target: engine.scRT, clear: false }, engine, layer.scene));
    stages.push({ stage: "composite", calls: ["createEffectWrapper(textureLoad of the last stage's target and the mask; blend one, one-minus-src-alpha)",
      `createEffectRenderTask({ target: engine.scRT, clear: false })${config.clip ? ", times the control mask" : ""}`] });
    // Before the harness's own task (which now draws only the captured tops and their LEDs, after the composite).
    addTaskAtStart(layer.scene, chainTasks[0]!);
    for (let index = 1; index < chainTasks.length; index++) addTaskAfter(layer.scene, chainTasks[index]!, chainTasks[index - 1]!);
    tasks.push(...chainTasks.map(task => task.name));
  }
  tasks.push("scene");
  const entry: Built = { layer, parts, controls, stages, tasks };
  for (const [element] of controls) pose(entry, element);
  built.set(layer.id, entry);
}
/** Writes one control's parts (and its mask plate) from its native state; `level` and `turn` override meters and knobs. */
function pose(entry: Built, element: HTMLElement, override?: { level?: number; turn?: number }) {
  const control = entry.controls.get(element);
  if (!control) return;
  const { kind, index, rect } = control, parts = entry.parts;
  const cx = rect.x + rect.width / 2, cy = rect.y + rect.height / 2, value = valueOf(element);
  parts[`mask-${kind}`]?.pose(index, { x: cx, y: cy });
  if (kind === "knob") {
    const angle = (0.5 - (override?.turn ?? value)) * tokens.knob.sweep;
    parts.collar!.pose(index, { x: cx, y: cy });
    for (const part of [parts.skirt!, parts.cap!, parts.pointer!]) part.pose(index, { x: cx, y: cy, angle });
  } else if (kind === "fader") {
    const f = tokens.fader, travel = rect.height - f.length;
    parts.slot!.pose(index, { x: cx, y: cy });
    const y = rect.y + f.length / 2 + (1 - value) * travel;
    parts.faderCap!.pose(index, { x: cx, y });
    parts.grip!.pose(index, { x: cx, y });
  } else if (kind === "key") {
    const t = tokens.key, lift = value ? -t.travel : 0;
    parts.keyBody!.pose(index, { x: cx, y: cy, lift });
    parts.keyTop!.pose(index, { x: cx, y: cy, lift, locked: t.rise });
    parts.led!.pose(index, { x: rect.x + rect.width - t.taper - 5, y: rect.y + t.taper + 5, lift });
  } else if (kind === "switch") {
    const d = rect.height - 4;
    parts.track!.pose(index, { x: cx, y: cy });
    parts.thumb!.pose(index, { x: rect.x + 2 + d / 2 + value * (rect.width - 4 - d), y: cy });
  } else if (kind === "lamp") {
    parts.bezel!.pose(index, { x: cx, y: cy });
    if (value) { parts.lensOn!.pose(index, { x: cx, y: cy }); parts.lensOff!.hide(index); } else { parts.lensOff!.pose(index, { x: cx, y: cy }); parts.lensOn!.hide(index); }
  } else {
    const m = tokens.meter, segment = (rect.height - 6) / m.segments, lit = Math.round((override?.level ?? value) * m.segments);
    parts.window!.pose(index, { x: cx, y: cy });
    for (let step = 0; step < m.segments; step++) {
      const slot = index * m.segments + step, at = { x: cx, y: rect.y + 3 + (m.segments - 1 - step + 0.5) * segment };
      if (step < lit) { parts.lit!.pose(slot, at); parts.dark!.hide(slot); } else { parts.dark!.pose(slot, at); parts.lit!.hide(slot); }
    }
  }
}
const flushAll = () => { for (const entry of built.values()) for (const part of Object.values(entry.parts)) part.flush(); };
const entryOf = (element: HTMLElement) => [...built.values()].find(entry => entry.controls.has(element));

let resolveReady!: (api: PostProbeApi) => void;
let readyFailed!: (error: unknown) => void;
window.postProbe = { ready: new Promise<PostProbeApi>((resolve, reject) => { resolveReady = resolve; readyFailed = reject; }) };
const harness = await startInstrument({
  frame, light: tokens.light, envelopes, budgets: { layers: 8, pixels: 4_000_000 },
  onStatus: message => { status.dataset.core = message; },
  mount(root) {
    lower = document.createElement("section");
    upper = document.createElement("section");
    lower.id = "lower"; upper.id = "upper";
    for (const panel of [lower, upper]) { panel.className = "instrument-panel"; panel.setAttribute("aria-label", panel.id === "lower" ? "Lower panel" : "Upper panel"); }
    root.append(lower, upper);
    layout(density);
    return [lower, upper];
  },
  build,
}).catch(error => {
  status.textContent = `Probe unavailable: ${error}`;
  window.postProbe.error = String(error);
  readyFailed(error);
  throw error;
});

let relief = params.get("relief") !== "0" ? harness.controller.setMaterial("lower", reliefMaterial()) : undefined;
for (const panel of [lower, upper]) {
  const refresh = (event: Event) => { const element = event.target as HTMLElement, entry = entryOf(element); if (entry) { pose(entry, element); flushAll(); draw(); } };
  panel.addEventListener("input", refresh);
  panel.addEventListener("change", refresh);
  panel.addEventListener("pointerdown", event => { const key = (event.target as HTMLElement).closest("button"); if (key) { pressed.add(key); refresh({ target: key } as unknown as Event); } });
  for (const type of ["pointerup", "pointerleave", "pointercancel"]) panel.addEventListener(type, event => {
    const key = (event.target as HTMLElement).closest("button");
    if (key && pressed.delete(key)) refresh({ target: key } as unknown as Event);
  }, true);
}

// ---- Frames: the probe cubes follow the capture, then core draws. ----

const nextFrame = () => new Promise<number>(resolve => requestAnimationFrame(resolve));
const pendingRefresh = new Set<Promise<unknown>>();
/** Refills a layer's probe cube when its capture was replaced or recaptured (the probe is a capture consumer). */
function syncProbes() {
  if (!chain.probe) return;
  const captures = harness.counts().captures;
  for (const entry of built.values()) {
    const probe = probes.get(entry.layer.id);
    if (!probe?.source) continue;
    const source = boundCapture(probe.source);
    if (!source || (probe.bound === source && probe.captures === captures)) continue;
    probe.captures = captures;
    const run = refreshProbe(entry.layer, probe).finally(() => pendingRefresh.delete(run));
    pendingRefresh.add(run);
  }
}
function draw() { syncProbes(); harness.draw(); }

let shot: Screenshot | undefined;
const canvasBox = () => harness.hosts.outputCanvas.getBoundingClientRect();
const controlCount = () => [...built.values()].reduce((sum, entry) => sum + entry.controls.size, 0);
const partCount = () => [...built.values()].reduce((sum, entry) => sum + [...entry.controls.values()].reduce((total, control) => total + tokens.partsPerKind[control.kind], 0), 0);
const describe = () => {
  const on = [chain.route, chain.aa !== "none" ? chain.aa : "", chain.contact ? "contact" : "", chain.ssgi ? "ssgi" : "", chain.bloom ? "bloom" : "", chain.probe ? "probe" : "", chain.clip ? "clip" : "no clip"].filter(Boolean).join(", ");
  status.textContent = `I0.8 post chain: ${controlCount()} controls, ${partCount()} parts; ${on}\n${status.dataset.core ?? ""}`;
};
/** Resolves a decoded frame; `step` keeps animating while the readback completes (so a frame is never held still). */
async function readback(step?: (index: number) => void, start = 0) {
  const engine = harness.engine();
  if (!engine) throw new Error("GPU presentation is not active");
  let done = false, index = start, at = -1;
  const pending = captureScreenshot(engine.surfaces[0]!).then(result => { done = true; return result; });
  for (let guard = 0; !done && guard < 120; guard++) {
    if (step) { step(index); flushAll(); }
    if (at < 0) at = index;
    draw(); index++;
    await nextFrame();
  }
  if (!done) throw new Error("GPU readback did not complete");
  return { shot: await pending, frames: index - start, first: at };
}
async function settle(frames = 40) {
  await harness.idle();
  for (let index = 0; index < frames; index++) { draw(); await nextFrame(); }
  await Promise.all([...pendingRefresh]);
  for (let index = 0; index < 3; index++) { draw(); await nextFrame(); }
  shot = (await readback()).shot;
  describe();
  return shot;
}
/** Rebuilds the layer scenes for `next` and reports what built each stage and any validation error of the first frames. */
async function setChain(next: Partial<Chain>) {
  chain = { ...chain, ...next };
  if (chain.route === "direct" && postStages(chain)) throw new Error("The direct route has no post stages");
  const device = deviceOf();
  retiredEffects = liveEffects; liveEffects = [];
  retiredMeshes = liveMeshes; liveMeshes = [];
  device.pushErrorScope("validation");
  let error: string | null = null;
  try { await harness.rebuild(); }
  catch (failure) { error = String(failure); }
  for (let index = 0; index < 3; index++) { draw(); await nextFrame(); }
  const validation = await device.popErrorScope();
  // The previous generation is off the surface: its effects and task-only meshes can go.
  await harness.idle();
  for (const effect of retiredEffects) disposeEffectWrapper(effect);
  for (const mesh of retiredMeshes) disposeMeshGpu(mesh);
  retiredEffects = []; retiredMeshes = [];
  await settle();
  return { chain: { ...chain }, error, validation: validation?.message ?? null, stages: Object.fromEntries([...built].map(([id, entry]) => [id, entry.stages])),
    tasks: Object.fromEntries([...built].map(([id, entry]) => [id, entry.tasks])), counts: harness.counts(), controls: controlCount(), parts: partCount() };
}

// ---- Analyses. ----

/** Client-space box and corner radius of every control, and of the panels. */
const controls = () => [...built.values()].flatMap(entry => [...entry.controls].map(([element, control]) => {
  const box = element.getBoundingClientRect();
  return { id: element.id, kind: control.kind, layer: entry.layer.id, x: box.left, y: box.top, width: box.width, height: box.height, radius: parseFloat(getComputedStyle(element).borderTopLeftRadius) || 0 };
}));
const panelBoxes = () => Object.fromEntries([lower, upper].map(panel => { const box = panel.getBoundingClientRect(); return [panel.id, { x: box.left, y: box.top, width: box.width, height: box.height, radius: 14 }]; }));
const rounded = (point: Point, box: { x: number; y: number; width: number; height: number; radius: number }) => {
  const radius = Math.min(box.radius, box.width / 2, box.height / 2);
  const qx = Math.abs(point.x - box.x - box.width / 2) - box.width / 2 + radius, qy = Math.abs(point.y - box.y - box.height / 2) - box.height / 2 + radius;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - radius;
};
/**
 * The current chain on, and the meshes off (core's frame alone), compared pixel for pixel: every changed pixel must lie
 * inside its own control's rounded box; outside pixels are counted with their distance (the overshoot in CSS px) and the
 * nearest control's kind. A sample of drawn pixels is hit-tested natively.
 */
async function meshDiff(samples = 3000) {
  harness.setMeshes(true);
  const on = await settle();
  harness.setMeshes(false);
  const off = await settle();
  harness.setMeshes(true);
  await settle();
  const box = canvasBox(), dpr = harness.dpr, list = controls(), panels = panelBoxes(), upperBox = panels.upper!;
  const result = { changed: 0, outside: 0, maxOvershoot: 0, outsideByKind: {} as Record<string, { pixels: number; maxOvershoot: number }>, outsideSamples: [] as { x: number; y: number; distance: number; kind: string; on: number[]; off: number[] }[],
    lowerUnderUpper: 0, perKind: {} as Record<string, number>, hitSampleCount: 0, hitMismatches: 0, hitMismatchSamples: [] as { x: number; y: number; id: string; expected: string }[] };
  const band = 64, rows = new Map<number, typeof list>();
  for (const control of list) for (let row = Math.floor(control.y / band); row <= Math.floor((control.y + control.height) / band); row++) { if (!rows.has(row)) rows.set(row, []); rows.get(row)!.push(control); }
  const drawn: { x: number; y: number; id: string }[] = [];
  for (let y = 0; y < on.height; y++) for (let x = 0; x < on.width; x++) {
    const offset = (y * on.width + x) * 4;
    if (on.data[offset] === off.data[offset] && on.data[offset + 1] === off.data[offset + 1] && on.data[offset + 2] === off.data[offset + 2]) continue;
    result.changed++;
    const point = { x: box.left + (x + 0.5) / dpr, y: box.top + (y + 0.5) / dpr };
    const edge = rounded(point, upperBox);
    // Look a few bands around for the nearest box, so an overshoot is measured to its own control.
    let owner: (typeof list)[number] | undefined, distance = Infinity;
    for (let row = Math.floor(point.y / band) - 1; row <= Math.floor(point.y / band) + 1; row++) for (const control of rows.get(row) ?? []) {
      if (edge < -1 && control.layer !== "upper") continue;
      const d = rounded(point, control);
      if (d < distance) { distance = d; owner = control; }
    }
    if (!owner || distance > 0) {
      result.outside++;
      const kind = owner?.kind ?? "none", overshoot = Number.isFinite(distance) ? distance : band;
      result.maxOvershoot = Math.max(result.maxOvershoot, overshoot);
      const slot = (result.outsideByKind[kind] ??= { pixels: 0, maxOvershoot: 0 });
      slot.pixels++; slot.maxOvershoot = Math.max(slot.maxOvershoot, overshoot);
      if (edge < -1 && list.some(control => control.layer === "lower" && rounded(point, control) <= 0)) result.lowerUnderUpper++;
      if (result.outsideSamples.length < 12) result.outsideSamples.push({ ...point, distance: overshoot, kind, on: [...on.data.subarray(offset, offset + 4)], off: [...off.data.subarray(offset, offset + 4)] });
      continue;
    }
    result.perKind[owner.kind] = (result.perKind[owner.kind] ?? 0) + 1;
    if (distance <= -1 && Math.abs(edge) > 1) drawn.push({ ...point, id: owner.id });
  }
  const step = Math.max(1, Math.floor(drawn.length / samples));
  for (let index = 0; index < drawn.length; index += step) {
    const point = drawn[index]!, hit = document.elementFromPoint(point.x, point.y);
    const id = hit?.closest<HTMLElement>("[data-part]")?.id ?? hit?.id ?? "";
    result.hitSampleCount++;
    if (id !== point.id) { result.hitMismatches++; if (result.hitMismatchSamples.length < 10) result.hitMismatchSamples.push({ ...point, id, expected: point.id }); }
  }
  return result;
}
interface Region { id: string; kind: "face" | "cap"; x0: number; y0: number; x1: number; y1: number }
const regionShots = new Map<string, Screenshot>();
/** Device-pixel rects of the text: every visible faceplate label and every visible key cap label. */
function regions(): Region[] {
  const box = canvasBox(), dpr = harness.dpr, upperBox = upper.getBoundingClientRect();
  const covered = (rect: DOMRect, layer: HTMLElement) => layer === lower && rect.right > upperBox.left && rect.left < upperBox.right && rect.bottom > upperBox.top && rect.top < upperBox.bottom;
  const list: Region[] = [];
  for (const [selector, kind] of [[".post-label", "face"], [".instrument-label", "cap"]] as const) for (const element of document.querySelectorAll<HTMLElement>(selector)) {
    const rect = element.getBoundingClientRect(), layer = element.closest<HTMLElement>(".instrument-panel")!;
    if (covered(rect, layer)) continue;
    list.push({ id: element.id || element.closest("button")!.id, kind, x0: Math.ceil((rect.left - box.left) * dpr), y0: Math.ceil((rect.top - box.top) * dpr), x1: Math.floor((rect.right - box.left) * dpr), y1: Math.floor((rect.bottom - box.top) * dpr) });
  }
  return list;
}
/** Settles and keeps the decoded frame under `name` for `compare`; `meshes: false` keeps core's frame alone; `relief: false` drops the relief material. */
async function snapshot(name: string, options: { meshes?: boolean; relief?: boolean } = {}) {
  if (options.relief === false && relief) { relief.cancel(); relief = undefined; }
  harness.setMeshes(options.meshes !== false);
  regionShots.set(name, await settle());
  harness.setMeshes(true);
  if (options.relief === false && params.get("relief") !== "0") { relief = harness.controller.setMaterial("lower", reliefMaterial()); await settle(); }
  return { name, width: regionShots.get(name)!.width, height: regionShots.get(name)!.height };
}
/** Text regions of two kept frames, pixel for pixel: compared, differing and largest channel difference, per kind. */
function compare(a: string, b: string, kinds: Region["kind"][] = ["face", "cap"]) {
  const one = regionShots.get(a)!, two = regionShots.get(b)!;
  const result = Object.fromEntries(kinds.map(kind => [kind, { regions: 0, compared: 0, differing: 0, maxDelta: 0, textured: 0, samples: [] as { id: string; x: number; y: number; a: number[]; b: number[] }[] }]));
  for (const region of regions()) {
    const slot = result[region.kind];
    if (!slot) continue;
    slot.regions++;
    const colours = new Set<number>();
    for (let y = region.y0; y < region.y1; y++) for (let x = region.x0; x < region.x1; x++) {
      const offset = (y * one.width + x) * 4;
      slot.compared++;
      colours.add((one.data[offset]! << 16) | (one.data[offset + 1]! << 8) | one.data[offset + 2]!);
      const delta = Math.max(Math.abs(one.data[offset]! - two.data[offset]!), Math.abs(one.data[offset + 1]! - two.data[offset + 1]!), Math.abs(one.data[offset + 2]! - two.data[offset + 2]!));
      if (!delta) continue;
      slot.differing++;
      slot.maxDelta = Math.max(slot.maxDelta, delta);
      if (slot.samples.length < 6) slot.samples.push({ id: region.id, x, y, a: [...one.data.subarray(offset, offset + 4)], b: [...two.data.subarray(offset, offset + 4)] });
    }
    // A region with text has several colours (glyphs and their antialiasing over the face).
    if (colours.size > 4) slot.textured++;
  }
  return result;
}

/** Animation of the I0.1 probe: `meters` meters and `knobs` knobs, poses only. */
function animator(options: { meters?: number; knobs?: number } = {}) {
  const all = [...built.values()].flatMap(entry => [...entry.controls].map(([element, control]) => ({ entry, element, kind: control.kind })));
  const meters = all.filter(control => control.kind === "meter").slice(0, options.meters ?? 50);
  const knobs = all.filter(control => control.kind === "knob").slice(0, options.knobs ?? 20);
  return {
    meters, knobs,
    step(index: number) {
      meters.forEach((meter, which) => pose(meter.entry, meter.element, { level: 0.5 + 0.45 * Math.sin(index / 6 + which) }));
      knobs.forEach((knob, which) => pose(knob.entry, knob.element, { turn: 0.5 + 0.45 * Math.sin(index / 20 + which) }));
    },
    reset() { for (const control of [...meters, ...knobs]) pose(control.entry, control.element); flushAll(); draw(); },
  };
}
const statistics = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b), at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] ?? 0;
  return { n: values.length, mean: values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length), p50: at(0.5), p95: at(0.95), max: sorted.at(-1) ?? 0 };
};
/**
 * Animates the I0.1 set (50 meters, 20 knobs) for `frames` frames: each frame poses, core draws, the GPU is awaited.
 * Returns frame work, Lite's GPU frame time and the per-task GPU timings (summed over the layers, per task name).
 */
async function measure(frames = 300, options: { meters?: number; knobs?: number } = {}) {
  const engine = harness.engine();
  if (!engine) throw new Error("GPU presentation is not active");
  const timed = isGpuTimingSupported(engine);
  if (timed) setGpuTimingEnabled(engine, true);
  await setRenderTaskGpuTimingEnabled(engine, true);
  const device = deviceOf(), motion = animator(options);
  await harness.idle();
  const before = harness.counts();
  const work: number[] = [], cpu: number[] = [], gpu: number[] = [], totals: number[] = [], perTask = new Map<string, number[]>();
  let lastIndex = -1, dropped = 0, statusSeen = "";
  for (let index = 0; index < frames; index++) {
    await nextFrame();
    const started = performance.now();
    motion.step(index); flushAll();
    draw();
    cpu.push(performance.now() - started);
    await device.queue.onSubmittedWorkDone();
    work.push(performance.now() - started);
    if (timed && engine.gpuFrameTimeMs > 0) gpu.push(engine.gpuFrameTimeMs);
    const snapshot = getRenderTaskGpuTimings(engine);
    statusSeen = snapshot.status;
    if (snapshot.status === "available" && snapshot.frameIndex !== lastIndex) {
      lastIndex = snapshot.frameIndex;
      dropped = Math.max(dropped, snapshot.droppedTaskCount);
      totals.push(snapshot.totalDurationMs);
      const frameTasks = new Map<string, number>();
      for (const task of snapshot.tasks) frameTasks.set(task.name, (frameTasks.get(task.name) ?? 0) + task.durationMs);
      for (const [name, value] of frameTasks) { if (!perTask.has(name)) perTask.set(name, []); perTask.get(name)!.push(value); }
    }
  }
  const after = harness.counts();
  motion.reset();
  const last = getRenderTaskGpuTimings(engine);
  return { frames, chain: { ...chain }, meters: motion.meters.length, knobs: motion.knobs.length, controls: controlCount(), parts: partCount(),
    captures: after.captures - before.captures, uploads: after.uploads - before.uploads, geometryUpdates: after.geometryUpdates - before.geometryUpdates,
    gpuFrames: after.gpuFrames - before.gpuFrames, mode: after.mode, reason: after.reason,
    work: statistics(work), cpu: statistics(cpu), gpu: gpu.length ? statistics(gpu) : null, tasksTotal: totals.length ? statistics(totals) : null,
    tasks: Object.fromEntries([...perTask].map(([name, values]) => [name, statistics(values)])), timingStatus: statusSeen, droppedTasks: dropped,
    lastFrameTasks: last.tasks.map(task => ({ name: task.name, ms: task.durationMs })) };
}
/**
 * TAA trail on turning knobs: the same deterministic animation (I0.1's 50 meters and 20 knobs) runs `frames` frames
 * under the current chain, then a frame is read back while the animation continues. Returns that frame's knob, meter
 * and key-cap regions (device px) for `trail` to compare against another chain's frame at the same animation index.
 */
async function ghosting(frames = 90) {
  const motion = animator();
  await settle();
  await readback();
  for (let index = 0; index < frames; index++) { motion.step(index); flushAll(); draw(); await nextFrame(); }
  const { shot: frameShot, first } = await readback(index => motion.step(index), frames);
  motion.reset();
  regionShots.set(`ghost-${chain.aa}`, frameShot);
  return { aa: chain.aa, frame: first };
}
/** Knob and meter regions of two kept frames: mean absolute difference and pixels differing by more than `threshold`. */
function trail(a: string, b: string, threshold = 32) {
  const one = regionShots.get(a)!, two = regionShots.get(b)!, box = canvasBox(), dpr = harness.dpr;
  const motion = animator();
  const result: Record<string, { pixels: number; sum: number; over: number; mean: number; overShare: number }> = {};
  for (const [kind, list] of [["knob", motion.knobs], ["meter", motion.meters]] as const) {
    const slot = (result[kind] = { pixels: 0, sum: 0, over: 0, mean: 0, overShare: 0 });
    for (const control of list) {
      const rect = control.element.getBoundingClientRect();
      for (let y = Math.ceil((rect.top - box.top) * dpr); y < Math.floor((rect.bottom - box.top) * dpr); y++) for (let x = Math.ceil((rect.left - box.left) * dpr); x < Math.floor((rect.right - box.left) * dpr); x++) {
        const offset = (y * one.width + x) * 4;
        const delta = Math.max(Math.abs(one.data[offset]! - two.data[offset]!), Math.abs(one.data[offset + 1]! - two.data[offset + 1]!), Math.abs(one.data[offset + 2]! - two.data[offset + 2]!));
        slot.pixels++; slot.sum += delta; if (delta > threshold) slot.over++;
      }
    }
    slot.mean = slot.sum / Math.max(1, slot.pixels); slot.overShare = slot.over / Math.max(1, slot.pixels);
  }
  return result;
}
/** The probe's fill cost: GPU time of one refresh (every mip of one layer's cube), `repeats` times. */
async function probeRefresh(repeats = 30) {
  const entry = built.get("lower");
  const probe = probes.get("lower");
  if (!entry || !probe || !chain.probe) return null;
  const times: number[] = [];
  for (let index = 0; index < repeats; index++) { const ms = await refreshProbe(entry.layer, probe, true); if (ms !== null) times.push(ms); }
  return { size: tokens.post.probe.size, mips: mipCount(tokens.post.probe.size), refreshes: probe.refreshes, gpu: statistics(times) };
}

await settle();
const api = {
  dpr: harness.dpr,
  tokens: () => ({ ...tokens, envelopes, camera: harness.camera() }),
  chain: () => ({ ...chain }),
  settle: async () => { await settle(); },
  setChain, measure, meshDiff, regions, snapshot, compare, ghosting, trail, probeRefresh,
  /** Pixels at client points from the last settled frame. */
  pixels: (points: Point[]) => points.map(point => harness.pixel(shot!, point)),
  hits: (points: Point[]) => points.map(point => { const hit = document.elementFromPoint(point.x, point.y); return hit?.closest<HTMLElement>("[data-part]")?.id ?? hit?.id ?? ""; }),
  controls, panels: panelBoxes, straddled: () => upper.dataset.straddles,
  state: (id: string) => { const element = document.getElementById(id) as HTMLInputElement; return { value: element.value, checked: element.checked, presses: Number(element.dataset.presses ?? 0) }; },
  setDensity: async (count: number) => {
    density = count;
    // A new layout replaces every control: the old parts leave the surface first (as on the I0.1 page).
    harness.setMeshes(false);
    layout(count);
    if (relief) relief.update(reliefScene());
    await harness.controller.settle();
    harness.setMeshes(true);
    return setChain({});
  },
  counts: () => harness.counts(),
  probes: () => Object.fromEntries([...probes].map(([id, probe]) => [id, { refreshes: probe.refreshes, lastMs: probe.lastMs }])),
  diagnostics: () => [...harness.diagnostics],
  browser: () => navigator.userAgent,
};
type PostProbeApi = typeof api;
declare global { interface Window { postProbe: { ready: Promise<PostProbeApi>; error?: string } } }
resolveReady(api);
