/**
 * Objects level for the Strata look prototypes: the P0.4 object pass, parameterised by a look. One Babylon Lite
 * engine per canvas draws the captured panel unlit (sRGB, no tone mapping) on a rounded slab, and PBR objects whose
 * bases are the native controls: a rounded tapered key per button (the captured face on its top), a sliding knob in
 * a track for the switch, and a bezel just inside the text field. Shadows are analytic (the Relief formula on each
 * caster's rounded footprint, so every presentation casts the same shadow), and a key light, a
 * hemispheric fill light them. Native events drive travel, throw, hover and focus without a new capture.
 * `update()` swaps the scene's meshes, materials, light and clear colour for the current look and palette (for live
 * tuning); control states live outside the meshes, so an update keeps them.
 */
import {
  addToScene, createCapsule, createDirectionalLight, createDynamicTexture, createEngine, createFreeCamera,
  createHemisphericLight, createPbrMaterial, createSceneContext, createSphere,
  loadHdrEnvironment, markMaterialUboDirty, registerScene, removeFromScene, renderFrame, setPbrClearCoat, setPbrEmissive,
  createShaderMaterial, setPbrUnlit, setShaderUniform, vec3, type ShaderMaterial,
  type Material, type Mesh, type PbrMaterialProps,
} from "@babylonjs/lite";
import { offsetWithin, type DrawableCanvas } from "../ui-probes/common.ts";
import { band, cap, frustum, type Rect } from "./geometry.ts";
import { finishWgsl } from "./finish.ts";
import { studioUrl } from "./studio.ts";
import { defaultMaterial, palette as lightPalette, type LookTokens, type MaterialRecipe, type Palette } from "./variants.ts";

interface DrawableQueue extends GPUQueue { drawElementImageToTexture(source: { source: Element }, destination: { texture: GPUTexture }): void }
const srgbToLinear = (value: number) => { const c = value / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const linear = (colour: readonly number[]): [number, number, number, number] => [srgbToLinear(colour[0]!), srgbToLinear(colour[1]!), srgbToLinear(colour[2]!), 1];
const asMaterial = (material: Partial<PbrMaterialProps>) => material as unknown as Material;
const distance = 1600;
const query = new URLSearchParams(location.search);
// Winding: Lite's front faces are reversed relative to the geometry builder's default.
const flip = query.get("flip") !== "0";

// Finish overlay: the shared finish zones (finish.ts) blended over a key top, in the key top's own UV space.
const finishVertex = /* wgsl */ `struct VertexOutput { @builtin(position) position: vec4<f32>, @location(0) vUv: vec2<f32> };
@vertex fn mainVertex(input: VertexInput) -> VertexOutput {
  var out: VertexOutput;
  out.position = shaderSystem.projection * (shaderSystem.view * (shaderSystem.world * vec4<f32>(input.position, 1.0)));
  out.vUv = input.uv;
  return out;
}`;
const finishFragment = /* wgsl */ `struct VertexOutput { @builtin(position) position: vec4<f32>, @location(0) vUv: vec2<f32> };
${finishWgsl}
@fragment fn mainFragment(input: VertexOutput) -> @location(0) vec4<f32> {
  let zones = finish(input.vUv.y, shaderUniforms.recipe);
  if (zones.x >= zones.y) { return vec4<f32>(1.0, 1.0, 1.0, zones.x); }
  return vec4<f32>(0.0, 0.0, 0.0, zones.y);
}`;

// Analytic soft shadow of one rounded footprint (face-local CSS pixels in uv): Relief's formula, so all presentations
// cast the same shadow, without a shadow map's resolution, bias or clipping artefacts.
const shadowFragment = /* wgsl */ `struct VertexOutput { @builtin(position) position: vec4<f32>, @location(0) vUv: vec2<f32> };
fn roundedBox(p: vec2f, half: vec2f, radius: f32) -> f32 {
  let q = abs(p) - half + vec2f(radius);
  return length(max(q, vec2f(0.0))) + min(max(q.x, q.y), 0.0) - radius;
}
@fragment fn mainFragment(input: VertexOutput) -> @location(0) vec4<f32> {
  let caster = shaderUniforms.caster; let shape = shaderUniforms.shape;
  let light = normalize(shaderUniforms.light.xyz);
  let half = caster.zw * 0.5; let centre = caster.xy + half; let height = max(shape.y, 0.0);
  let offset = -light.xy / light.z * height;
  let d = roundedBox(input.vUv - centre, half, shape.x);
  let ds = roundedBox(input.vUv - centre - offset, half, shape.x);
  let alpha = (1.0 - smoothstep(-0.5 * height, 1.5 * height + 1.0, ds)) * shape.z * smoothstep(-1.0, 0.5, d);
  return vec4<f32>(0.0, 0.0, 0.0, alpha);
}`;

interface ControlState { hover: number; pressed: number; focus: number; depth: number }

/** Mounts the objects level for `face` (a drawable child of `canvas`); `look` and `palette` may be live getters. */
export async function mountObjects(canvas: DrawableCanvas, face: HTMLElement, lookSource: LookTokens | (() => LookTokens), paletteSource: Palette | (() => Palette) = lightPalette as unknown as Palette,
  materialSource: MaterialRecipe | (() => MaterialRecipe) = defaultMaterial) {
  const currentMaterial = () => (typeof materialSource === "function" ? materialSource() : materialSource);
  const currentLook = () => (typeof lookSource === "function" ? lookSource() : lookSource);
  const currentPalette = () => (typeof paletteSource === "function" ? paletteSource() : paletteSource);
  const width = canvas.clientWidth, height = canvas.clientHeight, dpr = window.devicePixelRatio;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const engine = await createEngine(canvas, { msaaSamples: 4 });
  const device = (canvas.getContext("webgpu") as unknown as { getConfiguration(): { device: GPUDevice } }).getConfiguration().device;
  const queue = device.queue as DrawableQueue;
  if (typeof queue.drawElementImageToTexture !== "function") throw new Error("HTML-in-Canvas: drawElementImageToTexture is missing");

  const origin = { x: (width - face.offsetWidth) / 2, y: (height - face.offsetHeight) / 2 };
  const world = (x: number, y: number, z = 0): [number, number, number] => [origin.x + x - width / 2, height / 2 - (origin.y + y), z];
  // Screen-locked geometry for raised parts: a point at height h is pre-scaled towards the vanishing point by
  // (D − h) / D, so it projects exactly onto the face-local pixel it came from. Key labels then map one texel to one
  // pixel (no resampling blur), and raised tops never drift outside their native control.
  const locked = (x: number, y: number, z = 0): [number, number, number] => { const [wx, wy] = world(x, y); const scale = (distance + z) / distance; return [wx * scale, wy * scale, z]; };
  const rectOf = (element: HTMLElement): Rect => ({ ...offsetWithin(element, face), width: element.offsetWidth, height: element.offsetHeight });
  const radiusOf = (element: Element) => parseFloat(getComputedStyle(element).borderTopLeftRadius) || 0;
  const extent = { width: face.offsetWidth, height: face.offsetHeight };
  const capture = createDynamicTexture(engine, Math.ceil(face.offsetWidth * dpr), Math.ceil(face.offsetHeight * dpr), { minFilter: "linear", magFilter: "linear", srgb: true });

  // Native state, kept across rebuilds.
  const buttons = [...face.querySelectorAll<HTMLButtonElement>("button")];
  const fields = [...face.querySelectorAll<HTMLInputElement>("input[type=text]")];
  const switches = [...face.querySelectorAll<HTMLInputElement>("input[role=switch]")];
  const states = new Map<HTMLElement, ControlState>([...buttons, ...fields, ...switches].map(control => [control, { hover: 0, pressed: 0, focus: 0, depth: 0 }]));
  const knobs = new Map<HTMLInputElement, number>(switches.map(input => [input, input.checked ? 1 : 0]));

  // One scene for the canvas's lifetime: the surface takes its clear from the scene registered first, so tuning
  // changes swap meshes, materials and the light in place instead of registering a new scene.
  const scene = createSceneContext(engine);
  scene.imageProcessing = { exposure: 1, contrast: 1, toneMappingEnabled: false };
  const camera = createFreeCamera(vec3(0, 0, -distance), vec3(0, 0, 0));
  camera.nearPlane = 1; camera.farPlane = 20000;
  camera.fov = 2 * Math.atan(height / 2 / distance);
  scene.camera = camera;
  const initialLight = currentLook().light;
  // Lite's light direction is the way light travels: away from the light, in world axes (y up, +z away).
  const light = createDirectionalLight([-initialLight[0], initialLight[1], initialLight[2]], 1.6);
  // The studio environment adds fill light, so the hemispheric fill is lower than without it.
  const ambient = createHemisphericLight([0, 0, -1], 0.3);
  addToScene(scene, light); addToScene(scene, ambient);
  // Reflections for glossy, coated and metal materials: the studio panorama generated in code, no asset.
  const environment = studioUrl();
  try { await loadHdrEnvironment(scene, environment, { skipSkybox: true, skipGround: true, faceSize: 128 }); } finally { URL.revokeObjectURL(environment); }
  // Loading an environment resets image processing; unlit captured faces need it off to keep exact colours.
  scene.imageProcessing = { exposure: 1, contrast: 1, toneMappingEnabled: false };
  let registered = false;

  /** Adds meshes for the current look and palette to the scene, and points the light and clear colour at them. */
  async function build() {
    const look = currentLook(), palette = currentPalette();
    const [r, g, b] = palette.stage.map(channel => channel / 255);
    scene.clearColor = { r: r!, g: g!, b: b!, a: 1 };
    light.direction.set(-look.light[0], look.light[1], look.light[2]);

    const meshes: Mesh[] = [];
    const add = (mesh: Mesh, material: Partial<PbrMaterialProps>, _cast = true) => { mesh.material = asMaterial(material); addToScene(scene, mesh); meshes.push(mesh); return mesh; };
    /**
     * An analytic shadow for a rounded footprint at `height` above the surface it falls on, drawn on a quad at `z`
     * (height above the face; negative is behind it). The quad covers `travel` (the caster's whole range of motion,
     * by default its footprint) plus the shadow's reach.
     */
    const castShadow = (name: string, caster: Rect, radius: number, height: number, z: number, travel: Rect = caster): ShaderMaterial => {
      const reach = height * Math.hypot(look.light[0], look.light[1]) / Math.max(0.2, look.light[2]) + 1.5 * height + 4;
      const area = { x: travel.x - reach, y: travel.y - reach, width: travel.width + 2 * reach, height: travel.height + 2 * reach };
      const material = createShaderMaterial({ name: "strata-shadow", vertexSource: finishVertex, fragmentSource: shadowFragment, attributes: ["position", "uv"],
        uniforms: ["world", "view", "projection",
          { name: "caster", type: "vec4<f32>", defaultValue: [caster.x, caster.y, caster.width, caster.height] },
          { name: "shape", type: "vec4<f32>", defaultValue: [radius, height, look.shadowStrength, 0] },
          { name: "light", type: "vec4<f32>", defaultValue: [...look.light, 0] }],
        needAlphaBlending: true, blendMode: "alpha", backFaceCulling: false, depthWrite: false });
      const quad = cap(engine, locked, name, area, 0, z, (x, y) => [x, y], flip);
      quad.material = material as unknown as Material;
      addToScene(scene, quad);
      meshes.push(quad);
      return material;
    };
    const unlit = () => { const material = createPbrMaterial({ doubleSided: true, baseColorTexture: capture }); setPbrUnlit(material); return material; };
    const pbr = (colour: readonly number[], roughness = look.roughness, metallic = look.sheen) => createPbrMaterial({ baseColorFactor: linear(colour), metallicFactor: metallic, roughnessFactor: roughness, doubleSided: true, environmentIntensity: 0.6 });
    // Controls use the configured material recipe: base roughness and metallic plus a clear coat (always present,
    // so the coat extension is registered before the scene is first built).
    const recipe = currentMaterial();
    const controlPbr = (colour: readonly number[]) => {
      const material = createPbrMaterial({ baseColorFactor: linear(colour), metallicFactor: recipe.metallic, roughnessFactor: recipe.roughness, doubleSided: true, environmentIntensity: 0.8 });
      setPbrClearCoat(material, { isEnabled: true, intensity: recipe.coat, roughness: recipe.coatRoughness, indexOfRefraction: 1.5 });
      return material;
    };
    // Panel slab, captured panel face, and the panel's drop shadow on the stage behind it.
    const panelRect = { x: 0, y: 0, ...extent }, panelRadius = radiusOf(face);
    add(frustum(engine, world, "slab", panelRect, panelRadius, -look.panelHeight, 0, flip), pbr(palette.panel, 0.8, 0));
    add(cap(engine, world, "face", panelRect, panelRadius, 0.05, extent, flip), unlit(), false);
    castShadow("panel-shadow", panelRect, panelRadius, look.panelHeight, -(look.panelHeight + 0.3));

    const glows = new Map<object, [number, number, number]>();
    const glowing = (material: Partial<PbrMaterialProps>) => { const glow: [number, number, number] = [0, 0, 0]; glows.set(material, glow); setPbrEmissive(material, glow); return material; };
    const movers: { meshes: Mesh[]; control: HTMLElement; material: Partial<PbrMaterialProps>; travel: number; lift: number; shadow?: { material: ShaderMaterial; radius: number; height: number } }[] = [];
    for (const button of buttons) {
      const r = rectOf(button), t = look.taper, radius = radiusOf(button);
      const material = glowing(controlPbr(button.classList.contains("primary") ? palette.accent : palette.secondary));
      const sides = add(frustum(engine, locked, "key", r, radius, look.keyHeight, t, flip), material);
      const topRect = { x: r.x + t, y: r.y + t, width: r.width - 2 * t, height: r.height - 2 * t };
      const top = add(cap(engine, locked, "key-top", topRect, Math.max(1, radius - t), look.keyHeight + 0.05, extent, flip), unlit(), false);
      // The coat and metal also reflect the studio environment on the key's sides; the finish zones on the top use
      // the same profile as Relief and CSS, clear of the centred label.
      const finishMaterial = createShaderMaterial({ name: "strata-finish", vertexSource: finishVertex, fragmentSource: finishFragment, attributes: ["position", "uv"],
        uniforms: ["world", "view", "projection", { name: "recipe", type: "vec4<f32>", defaultValue: [recipe.roughness, recipe.metallic, recipe.coat, recipe.coatRoughness] }],
        needAlphaBlending: true, blendMode: "alpha", backFaceCulling: false, depthWrite: false });
      const overlay = cap(engine, locked, "key-finish", topRect, Math.max(1, radius - t), look.keyHeight + 0.12,
        (x, y) => [(x - topRect.x) / topRect.width, (y - topRect.y) / topRect.height], flip);
      overlay.material = finishMaterial as unknown as Material;
      addToScene(scene, overlay);
      meshes.push(overlay);
      const shadow = { material: castShadow("key-shadow", r, radius, look.keyHeight, 0.08), radius, height: look.keyHeight };
      movers.push({ meshes: [sides, top, overlay], control: button, material, travel: look.keyTravel, lift: look.keyHeight * 0.25, shadow });
    }
    for (const field of fields) {
      const h = Math.max(1.5, look.keyHeight * 0.3);
      const material = glowing(controlPbr(palette.secondary));
      castShadow("bezel-shadow", rectOf(field), radiusOf(field), h, 0.08);
      movers.push({ meshes: [add(band(engine, locked, "bezel", rectOf(field), radiusOf(field), 4, h, Math.min(1.2, h / 2), flip), material)], control: field, material, travel: 0, lift: 0 });
    }
    const toggles = switches.map(input => {
      const box = rectOf(input.parentElement as HTMLElement);
      const trackMaterial = pbr(palette.track, 0.7, 0);
      const track = add(createCapsule(engine, { height: box.width - 2, radius: box.height / 2 - 1, tessellation: 32 }), trackMaterial);
      track.rotation.set(0, 0, Math.PI / 2);
      const trackScale = Math.max(0.15, look.keyHeight / box.height * 0.6), trackHeight = (box.height / 2 - 1) * trackScale;
      track.scaling.set(1, 1, trackScale);
      castShadow("track-shadow", { x: box.x + 1, y: box.y + 1, width: box.width - 2, height: box.height - 2 }, box.height / 2 - 1, trackHeight, 0.08);
      track.position.set(...world(box.x + box.width / 2, box.y + box.height / 2, 0));
      const knobMaterial = glowing(controlPbr(palette.knob));
      const knob = add(createSphere(engine, { diameter: box.height - 6, segments: 32 }), knobMaterial);
      const knobScale = Math.min(1, 0.35 + look.keyHeight / 20), knobRadius = (box.height - 6) / 2;
      knob.scaling.set(1, 1, knobScale);
      movers.push({ meshes: [], control: input, material: knobMaterial, travel: 0, lift: 0 });
      const knobHeight = Math.max(3, look.keyHeight * 0.45);
      // The knob's shadow falls on the track's top, so its quad sits there and its height is above the track.
      const knobShadow = castShadow("knob-shadow", { x: box.x, y: box.y + 3, width: knobRadius * 2, height: knobRadius * 2 }, knobRadius,
        knobHeight + knobRadius * knobScale - trackHeight, trackHeight + 0.1, box);
      return { input, box, knob, trackMaterial, knobHeight, knobRadius, knobShadow };
    });
    if (!registered) { await registerScene(scene); registered = true; }
    return { meshes, movers, toggles, glows, palette, look };
  }

  let built: Awaited<ReturnType<typeof build>> | undefined;
  let captured = false, queued = false;
  function step(): boolean {
    if (!built) return false;
    let moving = false;
    for (const mover of built.movers) {
      const state = states.get(mover.control)!;
      const goal = state.pressed ? mover.travel : -state.hover * mover.lift;
      const difference = goal - state.depth;
      state.depth = Math.abs(difference) < 0.01 ? goal : state.depth + difference * 0.35;
      if (state.depth !== goal) moving = true;
      for (const mesh of mover.meshes) mesh.position.set(0, 0, state.depth);
      if (mover.shadow) setShaderUniform(mover.shadow.material, "shape", [mover.shadow.radius, mover.shadow.height - state.depth, built.look.shadowStrength, 0]);
      const glow = built.glows.get(mover.material);
      const target = state.focus ? [0.06, 0.14, 0.5] : [0, 0, 0];
      if (glow?.some((value, index) => value !== target[index])) { glow.splice(0, 3, ...target); markMaterialUboDirty(asMaterial(mover.material)); }
    }
    for (const toggle of built.toggles) {
      const goal = toggle.input.checked ? 1 : 0, position = knobs.get(toggle.input)!, difference = goal - position;
      const next = Math.abs(difference) < 0.002 ? goal : position + difference * 0.3;
      knobs.set(toggle.input, next);
      if (next !== goal) moving = true;
      const inset = toggle.box.height / 2;
      const knobX = toggle.box.x + inset + next * (toggle.box.width - 2 * inset);
      toggle.knob.position.set(...world(knobX, toggle.box.y + toggle.box.height / 2, -toggle.knobHeight));
      setShaderUniform(toggle.knobShadow, "caster", [knobX - toggle.knobRadius, toggle.box.y + toggle.box.height / 2 - toggle.knobRadius, toggle.knobRadius * 2, toggle.knobRadius * 2]);
      const colour = linear(next > 0.5 ? built.palette.accent : built.palette.track);
      if (toggle.trackMaterial.baseColorFactor?.some((value, index) => value !== colour[index])) { toggle.trackMaterial.baseColorFactor = colour; markMaterialUboDirty(asMaterial(toggle.trackMaterial)); }
    }
    return moving;
  }
  function frame() { queued = false; if (!captured || !built) return; const moving = step(); renderFrame(engine, 16.67); if (moving) request(); }
  function request() { if (!queued) { queued = true; requestAnimationFrame(frame); } }

  canvas.addEventListener("paint", () => { captured = true; queue.drawElementImageToTexture({ source: face }, { texture: capture.texture }); request(); });
  for (const [control, state] of states) {
    const set = (change: Partial<ControlState>) => { Object.assign(state, change); request(); };
    control.addEventListener("pointerenter", () => set({ hover: 1 }));
    control.addEventListener("pointerleave", () => set({ hover: 0, pressed: 0 }));
    control.addEventListener("pointerdown", () => set({ pressed: 1 }));
    control.addEventListener("pointerup", () => set({ pressed: 0 }));
    control.addEventListener("keydown", event => { if (event.key === " " || event.key === "Enter") set({ pressed: 1 }); });
    control.addEventListener("keyup", () => set({ pressed: 0 }));
    control.addEventListener("focus", () => set({ focus: control.matches(":focus-visible") ? 1 : 0 }));
    control.addEventListener("blur", () => set({ focus: 0 }));
  }
  for (const input of switches) input.addEventListener("change", request);

  // Rebuilds are serialised; the newest request wins and the old scene is retired after the new one is registered.
  let rebuilding: Promise<void> = Promise.resolve(), pending = false;
  function update() {
    if (pending) return rebuilding;
    pending = true;
    rebuilding = rebuilding.then(async () => {
      pending = false;
      const next = await build();
      const previous = built;
      built = next;
      // The previous meshes leave the scene after the new ones are in, so no frame shows an empty panel.
      if (previous) for (const mesh of previous.meshes) removeFromScene(scene, mesh);
      step();
      request();
    });
    return rebuilding;
  }

  canvas.updateElementGeometry(face, { canvasTransform: new DOMMatrix().translate(origin.x, origin.y) });
  await update();
  await new Promise<void>(resolve => { canvas.addEventListener("paint", () => resolve(), { once: true }); canvas.requestPaint(); });
  return { update, request };
}
