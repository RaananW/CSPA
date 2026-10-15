/**
 * Objects level for the Strata look prototypes: the P0.4 object pass, parameterised by a look. One Babylon Lite
 * engine per canvas draws the captured panel unlit (sRGB, no tone mapping) on a slab, and PBR objects whose bases
 * are the native controls: a tapered key per button (the captured face on its top), a sliding knob in a track for
 * the switch, and a bezel just inside the text field. A key light with a shadow map and a hemispheric fill light
 * them. Native events drive travel, throw, hover and focus without a new capture.
 */
import {
  addToScene, createBox, createCapsule, createDirectionalLight, createDynamicTexture, createEngine, createFreeCamera,
  createHemisphericLight, createPbrMaterial, createPcfDirectionalShadowGenerator, createSceneContext,
  createSphere, markMaterialUboDirty, registerSceneWithShadowSupport, renderFrame, setPbrEmissive, setPbrUnlit,
  setShadowOnly, setShadowTaskCasterMeshes, vec3, type Material, type Mesh, type PbrMaterialProps,
} from "@babylonjs/lite";
import { offsetWithin, type DrawableCanvas } from "../ui-probes/common.ts";
import { band, cap, frustum } from "./geometry.ts";
import { palette, type LookTokens } from "./variants.ts";

interface DrawableQueue extends GPUQueue { drawElementImageToTexture(source: { source: Element }, destination: { texture: GPUTexture }): void }
interface Rect { x: number; y: number; width: number; height: number }
const srgbToLinear = (value: number) => { const c = value / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const linear = (colour: readonly number[]): [number, number, number, number] => [srgbToLinear(colour[0]!), srgbToLinear(colour[1]!), srgbToLinear(colour[2]!), 1];
const asMaterial = (material: Partial<PbrMaterialProps>) => material as unknown as Material;
const distance = 1600;

/** Mounts the objects level for `face` (a drawable child of `canvas`) with the given look. */
export async function mountObjects(canvas: DrawableCanvas, face: HTMLElement, look: LookTokens) {
  const width = canvas.clientWidth, height = canvas.clientHeight, dpr = window.devicePixelRatio;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const engine = await createEngine(canvas, { msaaSamples: 4 });
  const device = (canvas.getContext("webgpu") as unknown as { getConfiguration(): { device: GPUDevice } }).getConfiguration().device;
  const queue = device.queue as DrawableQueue;
  if (typeof queue.drawElementImageToTexture !== "function") throw new Error("HTML-in-Canvas: drawElementImageToTexture is missing");

  const origin = { x: (width - face.offsetWidth) / 2, y: (height - face.offsetHeight) / 2 };
  const world = (x: number, y: number, z = 0): [number, number, number] => [origin.x + x - width / 2, height / 2 - (origin.y + y), z];
  const rectOf = (element: HTMLElement): Rect => ({ ...offsetWithin(element, face), width: element.offsetWidth, height: element.offsetHeight });
  const scene = createSceneContext(engine);
  scene.clearColor = { r: 1, g: 1, b: 1, a: 1 };
  scene.imageProcessing = { exposure: 1, contrast: 1, toneMappingEnabled: false };
  const camera = createFreeCamera(vec3(0, 0, -distance), vec3(0, 0, 0));
  camera.nearPlane = 1; camera.farPlane = 20000;
  camera.fov = 2 * Math.atan(height / 2 / distance);
  scene.camera = camera;
  // Babylon's light direction is the direction light travels: away from the light, y up.
  const light = createDirectionalLight([-look.light[0], look.light[1], look.light[2]], 1.6);
  const ambient = createHemisphericLight([0, 0, -1], 0.55);
  // Soft shadows: PCF on a deliberately coarse map, so its filter spans a few CSS pixels (a cheap penumbra).
  const shadows = createPcfDirectionalShadowGenerator(engine, light, { mapSize: Number(new URLSearchParams(location.search).get("map") ?? 256), bias: 5e-4, normalBias: 0.05 });
  light.shadowGenerator = shadows;
  addToScene(scene, light); addToScene(scene, ambient);

  const capture = createDynamicTexture(engine, Math.ceil(face.offsetWidth * dpr), Math.ceil(face.offsetHeight * dpr), { minFilter: "linear", magFilter: "linear", srgb: true });
  const extent = { width: face.offsetWidth, height: face.offsetHeight };
  const radiusOf = (element: Element) => parseFloat(getComputedStyle(element).borderTopLeftRadius) || 0;
  // Winding: Lite's front faces are reversed relative to the builder's default here.
  const flip = new URLSearchParams(location.search).get("flip") !== "0";
  const casters: Mesh[] = [];
  const add = (mesh: Mesh, material: Partial<PbrMaterialProps>, cast = true) => { mesh.material = asMaterial(material); addToScene(scene, mesh); if (cast) casters.push(mesh); return mesh; };
  const unlit = () => { const material = createPbrMaterial({ doubleSided: true, baseColorTexture: capture }); setPbrUnlit(material); return material; };
  const pbr = (colour: readonly number[], roughness = look.roughness, metallic = look.sheen) => createPbrMaterial({ baseColorFactor: linear(colour), metallicFactor: metallic, roughnessFactor: roughness, doubleSided: true });
  const shadowOnly = (opacity: number) => { const material = createPbrMaterial({ doubleSided: true }); setShadowOnly(material, { color: [0, 0, 0], opacity }); return material; };

  // Backdrop catcher, panel slab, captured panel face and a catcher on it.
  const backdrop = createBox(engine, { width: 4000, height: 4000, depth: 1 });
  backdrop.position.set(0, 0, look.panelHeight + 0.5); backdrop.receiveShadows = true;
  add(backdrop, shadowOnly(look.shadowStrength * Number(new URLSearchParams(location.search).get("opacity") ?? 0.4)), false);
  const panelRect = { x: 0, y: 0, ...extent }, panelRadius = radiusOf(face);
  add(frustum(engine, world, "slab", panelRect, panelRadius, -look.panelHeight, 0, flip), pbr(palette.panel, 0.8, 0));
  add(cap(engine, world, "face", panelRect, panelRadius, 0.05, extent, flip), unlit(), false);
  const catcher = cap(engine, world, "face-shadow", panelRect, panelRadius, 0.1, undefined, flip);
  catcher.receiveShadows = true;
  add(catcher, shadowOnly(look.shadowStrength * Number(new URLSearchParams(location.search).get("opacity") ?? 0.4)), false);

  const glows = new Map<object, [number, number, number]>();
  const glowing = (material: Partial<PbrMaterialProps>) => { const glow: [number, number, number] = [0, 0, 0]; glows.set(material, glow); setPbrEmissive(material, glow); return material; };
  const movers: { meshes: Mesh[]; control: HTMLElement; material: Partial<PbrMaterialProps>; travel: number; lift: number; depth: number; hover: number; pressed: number; focus: number }[] = [];

  // Keys: one per button, tapered sides plus the captured button face on top.
  for (const button of face.querySelectorAll<HTMLButtonElement>("button")) {
    const r = rectOf(button), t = look.taper, radius = radiusOf(button);
    const material = glowing(pbr(button.classList.contains("primary") ? palette.accent : palette.secondary));
    const sides = add(frustum(engine, world, "key", r, radius, look.keyHeight, t, flip), material);
    const topRect = { x: r.x + t, y: r.y + t, width: r.width - 2 * t, height: r.height - 2 * t };
    const top = add(cap(engine, world, "key-top", topRect, Math.max(1, radius - t), look.keyHeight + 0.05, extent, flip), unlit(), false);
    movers.push({ meshes: [sides, top], control: button, material, travel: look.keyTravel, lift: look.keyHeight * 0.25, depth: 0, hover: 0, pressed: 0, focus: 0 });
  }
  // Text field: a low tapered bezel just inside the field's box.
  for (const field of face.querySelectorAll<HTMLInputElement>("input[type=text]")) {
    const r = rectOf(field), h = Math.max(1.5, look.keyHeight * 0.3);
    const material = glowing(pbr(palette.secondary));
    const parts = [add(band(engine, world, "bezel", r, radiusOf(field), 4, h, Math.min(1.2, h / 2), flip), material)];
    movers.push({ meshes: parts, control: field, material, travel: 0, lift: 0, depth: 0, hover: 0, pressed: 0, focus: 0 });
  }
  // Switch: a flattened capsule track and a knob that slides with the native checkbox.
  const toggles = [...face.querySelectorAll<HTMLInputElement>("input[role=switch]")].map(input => {
    const box = rectOf(input.parentElement as HTMLElement);
    const trackMaterial = pbr(palette.track, 0.7, 0);
    const track = add(createCapsule(engine, { height: box.width - 2, radius: box.height / 2 - 1, tessellation: 32 }), trackMaterial);
    track.rotation.set(0, 0, Math.PI / 2);
    track.scaling.set(1, 1, Math.max(0.15, look.keyHeight / box.height * 0.6));
    track.position.set(...world(box.x + box.width / 2, box.y + box.height / 2, 0));
    const knobMaterial = glowing(pbr(palette.knob, Math.max(0.2, look.roughness - 0.2), look.sheen));
    const knob = add(createSphere(engine, { diameter: box.height - 6, segments: 32 }), knobMaterial);
    knob.scaling.set(1, 1, Math.min(1, 0.35 + look.keyHeight / 20));
    movers.push({ meshes: [], control: input, material: knobMaterial, travel: 0, lift: 0, depth: 0, hover: 0, pressed: 0, focus: 0 });
    return { input, box, track, trackMaterial, knob, position: input.checked ? 1 : 0 };
  });

  setShadowTaskCasterMeshes(shadows, casters);
  await registerSceneWithShadowSupport(scene);

  let captured = false, queued = false;
  function step(): boolean {
    let moving = false;
    for (const mover of movers) {
      const goal = mover.pressed ? mover.travel : -mover.hover * mover.lift;
      const difference = goal - mover.depth;
      mover.depth = Math.abs(difference) < 0.01 ? goal : mover.depth + difference * 0.35;
      if (mover.depth !== goal) moving = true;
      for (const mesh of mover.meshes) mesh.position.set(0, 0, mover.depth);
      const glow = glows.get(mover.material);
      if (glow) {
        const target = mover.focus ? [0.06, 0.14, 0.5] : [0, 0, 0];
        if (glow.some((value, index) => value !== target[index])) { glow.splice(0, 3, ...target); markMaterialUboDirty(asMaterial(mover.material)); }
      }
    }
    for (const toggle of toggles) {
      const goal = toggle.input.checked ? 1 : 0, difference = goal - toggle.position;
      toggle.position = Math.abs(difference) < 0.002 ? goal : toggle.position + difference * 0.3;
      if (toggle.position !== goal) moving = true;
      const inset = toggle.box.height / 2;
      toggle.knob.position.set(...world(toggle.box.x + inset + toggle.position * (toggle.box.width - 2 * inset), toggle.box.y + toggle.box.height / 2, -Math.max(3, look.keyHeight * 0.45)));
      const colour = linear(toggle.position > 0.5 ? palette.accent : palette.track);
      if (toggle.trackMaterial.baseColorFactor?.some((value, index) => value !== colour[index])) { toggle.trackMaterial.baseColorFactor = colour; markMaterialUboDirty(asMaterial(toggle.trackMaterial)); }
    }
    return moving;
  }
  function frame() { queued = false; if (!captured) return; const moving = step(); renderFrame(engine, 16.67); if (moving) request(); }
  function request() { if (!queued) { queued = true; requestAnimationFrame(frame); } }
  canvas.addEventListener("paint", () => { captured = true; queue.drawElementImageToTexture({ source: face }, { texture: capture.texture }); request(); });
  for (const mover of movers) {
    const set = (change: Partial<typeof mover>) => { Object.assign(mover, change); request(); };
    mover.control.addEventListener("pointerenter", () => set({ hover: 1 }));
    mover.control.addEventListener("pointerleave", () => set({ hover: 0, pressed: 0 }));
    mover.control.addEventListener("pointerdown", () => set({ pressed: 1 }));
    mover.control.addEventListener("pointerup", () => set({ pressed: 0 }));
    mover.control.addEventListener("keydown", event => { if (event.key === " " || event.key === "Enter") set({ pressed: 1 }); });
    mover.control.addEventListener("keyup", () => set({ pressed: 0 }));
    mover.control.addEventListener("focus", () => set({ focus: mover.control.matches(":focus-visible") ? 1 : 0 }));
    mover.control.addEventListener("blur", () => set({ focus: 0 }));
  }
  for (const toggle of toggles) toggle.input.addEventListener("change", request);
  canvas.updateElementGeometry(face, { canvasTransform: new DOMMatrix().translate(origin.x, origin.y) });
  await new Promise<void>(resolve => { canvas.addEventListener("paint", () => resolve(), { once: true }); canvas.requestPaint(); });
  step();
  return { request };
}
