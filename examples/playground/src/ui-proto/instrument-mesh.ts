/**
 * The Instrument level of the Phase I1 prototype page: the premium character's parts as Babylon Lite meshes in the
 * chassis panel's layer scene (the I0 harness, `ui-probes/instrument-harness.ts`), posed from native state.
 * Second iteration (docs/ui-library/instrument-phase0.md, "I1 prototype, second iteration"):
 * - **Surfaces** (`instrument-surfaces.ts`): I0.4's studio rotated to the key light, a capture probe per layer, brushed
 *   metal with the grain map, and glass as a capture-refraction shader with its reflection built in.
 * - **Light** (`instrument-light.ts`): analytic face shadows plus I0.5's PCF map, I0.8's chain (SMAA, emitter bloom, a
 *   composite clipped to the controls' boxes; captured tops after it) and I0.3's pointer light.
 * - **Parts:**
 *   - knob: a skirt (flange), a cap with a brushed side, a 2 px polished chamfer and a spun crowned top, and an
 *     engraved pointer line following the crown; a glass cap is a domed lens over the printed hub. The cap turns
 *     through `sweep`;
 *   - fader: a machined carriage (brushed body, polished chamfer, brushed top) with an index line;
 *   - switches: `slide` (a chamfered block with a lit flag), `rocker` (a faceted paddle tipping so the pressed end lies
 *     level, a lit accent flag on its On end), `bat` (a lever with a ball on a nut and bushing, thrown over centre) and
 *     `wall` (a chamfered paddle tipping on a wall plate, a lit dot);
 *   - push button: a bezel, a lit ring (an emitter) and a cap whose top is the screen-locked capture, so its label
 *     stays texel-exact; it travels on press and holds at `latch` while `aria-pressed` is true;
 *   - display: a polished bezel and a flat glass pane over the backlit native `<output>`.
 * - **Shadows:** Strata's analytic formula (design language section 7) on each part's footprint, as a quad per caster
 *   on the face, plus a contact line; a lever casts a capsule. They are face shading, not objects: `setShadows(false)`
 *   hides them for the containment check. The PCF map shades parts only and stays on.
 * Moving parts follow springs (stiffness, damping per unit mass); under reduced motion poses are instant. Poses are
 * thin-instance matrix writes: they never capture. Throwaway prototype code.
 */
import {
  addToScene, flushThinInstances, getShaderTexture, getShaderUniform, markMaterialUboDirty, onBeforeRender, onSceneDispose,
  createShaderMaterial, enableShaderMaterialInstanceWorld, setPbrEmissive, setShaderUniform, setThinInstances, createPbrMaterial,
  type EngineContext, type Material, type Mesh, type PbrMaterialProps, type ShaderMaterial,
} from "@babylonjs/lite";
import { bar, frame as bezelFrame, frustum, partMesh, plate, revolve, revolveSmooth, superellipseProfile, type PartData, type SmoothProfilePoint } from "../ui-probes/instrument-parts.ts";
import { lever, prism } from "./instrument-shapes.ts";
import type { Envelope, InstrumentLayer, Rect } from "../ui-probes/instrument-harness.ts";
import { lightVector } from "./instrument-css.ts";
import { createChain, createPointerLight, createShadowMap, flatMaterial, lightTokens, type PointerLight } from "./instrument-light.ts";
import { createSurfaces, linear, type LayerSurfaces } from "./instrument-surfaces.ts";
import { materials, type MaterialRecipe, type ResolvedTokens } from "./instrument-tokens.ts";

type Rgb = readonly [number, number, number];

// The analytic shadow of a caster on the face, in the quad's local px (y up, centred on the caster): Strata's formula
// (offset −light.xy / light.z · h, grown over 2h + 1 px) for up to two stacked rounded footprints (the first shifted
// by `segment.xy`, a tipped paddle's high end), or for a capsule (a lever), plus a contact line just outside the
// footprint (and, for a push button, round its cap as it goes in); optionally clipped to a receiving surface.
const shadowVertex = /* wgsl */ `struct VertexOutput { @builtin(position) position: vec4<f32>, @location(0) local: vec2<f32> };
@vertex fn mainVertex(input: VertexInput) -> VertexOutput {
  var out: VertexOutput;
  out.position = shaderSystem.projection * (shaderSystem.view * (getFinalWorld(input) * vec4<f32>(input.position, 1.0)));
  out.local = input.position.xy;
  return out;
}`;
const shadowFragment = /* wgsl */ `struct VertexOutput { @builtin(position) position: vec4<f32>, @location(0) local: vec2<f32> };
fn roundedBox(p: vec2f, half: vec2f, radius: f32) -> f32 {
  let r = min(radius, min(half.x, half.y));
  let q = abs(p) - half + vec2f(r);
  return length(max(q, vec2f(0.0))) + min(max(q.x, q.y), 0.0) - r;
}
fn segment(p: vec2f, a: vec2f, b: vec2f) -> f32 {
  let pa = p - a; let ba = b - a;
  return length(pa - ba * clamp(dot(pa, ba) / max(dot(ba, ba), 1e-4), 0.0, 1.0));
}
fn castShadow(p: vec2f, shape: vec4f, offset: vec2f) -> f32 {
  let h = max(shape.w, 0.0);
  return 1.0 - smoothstep(-0.5 * h, 1.5 * h + 1.0, roundedBox(p - offset * h, shape.xy, shape.z));
}
@fragment fn mainFragment(input: VertexOutput) -> @location(0) vec4<f32> {
  let look = shaderUniforms.look; let mode = shaderUniforms.mode; let p = input.local;
  var alpha: f32;
  if (mode.x > 0.5) {
    let h = max(shaderUniforms.first.w, 0.0);
    let seg = shaderUniforms.segment;
    alpha = (1.0 - smoothstep(-0.5 * h, 1.5 * h + 1.0, segment(p, seg.xy, seg.zw) - shaderUniforms.first.z)) * look.x;
  } else {
    let d = roundedBox(p, shaderUniforms.first.xy, shaderUniforms.first.z);
    let d2 = roundedBox(p - shaderUniforms.segment.xy, shaderUniforms.second.xy, shaderUniforms.second.z);
    // A contact line round the first footprint, and (segment.z) round the second: a pressed cap's deeper gap.
    let contact = max((1.0 - smoothstep(0.0, 1.6, d)) * step(0.0, d) * look.y, (1.0 - smoothstep(0.0, 1.2, d2)) * step(0.0, d2) * shaderUniforms.segment.z);
    alpha = max(max(castShadow(p, shaderUniforms.first, look.zw), castShadow(p - shaderUniforms.segment.xy, shaderUniforms.second, look.zw)) * look.x, contact);
  }
  if (mode.y > 0.0) { alpha = alpha * (1.0 - smoothstep(-0.5, 0.5, roundedBox(p - shaderUniforms.receiver.xy, mode.yz, mode.w))); }
  return vec4<f32>(0.0, 0.0, 0.0, alpha);
}`;

/** Where a part kind is drawn: the mesh target (filtered, composited), the face (shadows), the mask, the emitter target, or after the composite (captured content). */
type Route = "mesh" | "shade" | "mask" | "emit" | "top";
interface PartPose { x: number; y: number; lift?: number; angle?: number; tilt?: number; pivot?: number; locked?: number }
interface Part { name: string; mesh: Mesh; pose(index: number, pose: PartPose): void; hide(index: number): void; flush(): void }
interface Spring { x: number; v: number; target: number; stiffness: number; damping: number }
interface Shadow { material: ShaderMaterial; part: Part }
interface Control { element: HTMLElement; type: string; rect: Rect; springs: Spring[]; pose(): void; shadows: Shadow[] }
interface Glow { colour: [number, number, number]; materials: { pbr?: PbrMaterialProps; flat?: ShaderMaterial }; base: Rgb; strength: () => number }

/** A chamfered block: a body with a small taper, a polished 45° chamfer band, and a flat top. */
function block(width: number, length: number, radius: number, height: number, taper: number, chamfer: number, base = 0) {
  const c = Math.min(chamfer, height / 2, width / 4, length / 4), w = width - 2 * taper, l = length - 2 * taper, r = Math.max(0.5, radius - taper);
  return {
    body: frustum(width, length, radius, height - c, taper, base, true),
    chamfer: frustum(w, l, r, c, c, base + height - c, true),
    top: plate(w - 2 * c, l - 2 * c, Math.max(0.5, r - c), base + height),
  };
}
/**
 * A rectangle `width` by `length` whose top is crowned along its length (a cylinder section `crown` px high at the
 * middle, standing at `height`), with smooth normals: a paddle's top shows a reflection band that moves as it tips.
 */
function crowned(width: number, length: number, height: number, crown: number, rows = 24): PartData {
  const data: PartData = { positions: [], normals: [], uvs: [], indices: [] };
  for (let row = 0; row <= rows; row++) {
    const v = row / rows, y = (v - 0.5) * length, t = (2 * y) / length, h = height + crown * (1 - t * t), slope = (-2 * crown * 2 * t) / length;
    const n = Math.hypot(slope, 1);
    for (const x of [-width / 2, width / 2]) { data.positions.push(x, y, -h); data.normals.push(0, -slope / n, -1 / n); data.uvs.push(x / width + 0.5, v); }
  }
  for (let row = 0; row < rows; row++) { const a = row * 2; data.indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  return data;
}
/** A thin strip lying on a surface `heightAt(y)` from y0 to y1, `width` wide (pointer lines on crowned tops and domes). */
function strip(width: number, y0: number, y1: number, heightAt: (y: number) => number, rise: number, segments = 10): PartData {
  const data: PartData = { positions: [], normals: [], uvs: [], indices: [] };
  for (let step = 0; step <= segments; step++) {
    const y = y0 + ((y1 - y0) * step) / segments, h = heightAt(y) + rise;
    data.positions.push(-width / 2, y, -h, width / 2, y, -h);
    data.normals.push(0, 0, -1, 0, 0, -1);
    data.uvs.push(0, step / segments, 1, step / segments);
  }
  for (let step = 0; step < segments; step++) { const a = step * 2; data.indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  return data;
}
/** A quad on a straight facet of a (y, h) profile, from (y0, h0) to (y1, h1), `width` wide, lifted along its normal. */
function facet(width: number, y0: number, h0: number, y1: number, h1: number, lift: number): PartData {
  const dy = y1 - y0, dh = h1 - h0, length = Math.hypot(dy, dh), ny = -dh / length, nh = dy / length;
  const sign = nh < 0 ? -1 : 1, oy = ny * sign * lift, oh = nh * sign * lift;
  const data: PartData = { positions: [], normals: [], uvs: [], indices: [0, 2, 1, 1, 2, 3] };
  for (const [y, h] of [[y0, h0], [y1, h1]] as const) { data.positions.push(-width / 2, y + oy, -(h + oh), width / 2, y + oy, -(h + oh)); data.normals.push(0, ny * sign, -nh * sign, 0, ny * sign, -nh * sign); data.uvs.push(0, 0, 1, 0); }
  return data;
}

export interface InstrumentMeshOptions {
  /** Core's upload count of a layer (the probe refreshes when it changes). */
  uploads(layer: string): number;
  /** The stage (the harness frame) size, CSS px. */
  stage(): { width: number; height: number };
  interiorMax: number;
}

/** The Instrument presentation of the chassis panel; `draw` is core's frame, set once the harness is up. */
export function createInstrumentMeshes(current: () => ResolvedTokens, options: InstrumentMeshOptions) {
  let draw = () => {};
  const controls = new Map<HTMLElement, Control>();
  let parts: Part[] = [];
  let shadows = true, frame = 0, last = 0;
  const pressed = new Set<HTMLElement>();
  const reduced = matchMedia("(prefers-reduced-motion: reduce)"), fine = matchMedia("(pointer: fine)"), moreContrast = matchMedia("(prefers-contrast: more)");
  /** Every animated emissive colour, with the materials to update. */
  const glows: Glow[] = [];
  let surfaces: LayerSurfaces | undefined;
  let pointerLight: PointerLight | undefined;
  const pointer = { enabled: true, inside: false, x: -1e4, y: -1e4, alpha: 0, moved: false, suspended: false };
  let built: { pane?: ShaderMaterial; chain: string[]; casters: number; kinds: number } | undefined;

  /** Native state of a control as the spring target(s). */
  function targets(control: Control): number[] {
    const element = control.element, t = current();
    if (element instanceof HTMLInputElement && element.type === "range") {
      const min = Number(element.min), max = Number(element.max);
      return [max > min ? (Number(element.value) - min) / (max - min) : 0];
    }
    if (element instanceof HTMLInputElement) return [element.checked ? 1 : 0];
    if (element instanceof HTMLOutputElement) return [0];
    const latched = element.getAttribute("aria-pressed") === "true";
    return [pressed.has(element) ? t.button.travel : latched ? t.button.latch : 0];
  }
  function schedule() { if (!frame) { last = performance.now(); frame = requestAnimationFrame(tick); } }
  /** The pointer light's target: on with a fine pointer inside the stage, unless off, suspended or under more contrast. */
  const pointerTarget = () => (pointer.enabled && !pointer.suspended && fine.matches && !moreContrast.matches && pointer.inside ? 1 : 0);
  /** Advances every spring by fixed 4 ms steps, fades the pointer light, poses what moved and draws; stops at rest. */
  function tick(now: number) {
    frame = 0;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    let moving = false;
    for (const control of controls.values()) {
      let changed = false;
      for (const spring of control.springs) {
        if (spring.x === spring.target && spring.v === 0) continue;
        changed = true;
        if (reduced.matches) { spring.x = spring.target; spring.v = 0; continue; }
        for (let elapsed = 0; elapsed < dt; elapsed += 0.004) {
          const step = Math.min(0.004, dt - elapsed);
          spring.v += (-spring.stiffness * (spring.x - spring.target) - spring.damping * spring.v) * step;
          spring.x += spring.v * step;
        }
        if (Math.abs(spring.x - spring.target) < 1e-4 && Math.abs(spring.v) < 1e-3) { spring.x = spring.target; spring.v = 0; } else moving = true;
      }
      if (changed) control.pose();
    }
    for (const glow of glows) {
      const strength = glow.strength(), next = linear(glow.base).slice(0, 3).map(value => value * strength);
      if (next.some((value, index) => Math.abs(value - glow.colour[index]!) > 1e-4)) {
        glow.colour.splice(0, 3, ...next);
        if (glow.materials.pbr) markMaterialUboDirty(glow.materials.pbr as unknown as Material);
        if (glow.materials.flat) setShaderUniform(glow.materials.flat, "colour", [...next, 1]);
      }
    }
    // The pointer light fades over motion.fast (instantly under reduced motion) and follows the pointer.
    const target = pointerTarget();
    if (pointer.alpha !== target) {
      const step = reduced.matches ? 1 : (dt * 1000) / lightTokens.pointer.fade;
      pointer.alpha = target > pointer.alpha ? Math.min(target, pointer.alpha + step) : Math.max(target, pointer.alpha - step);
      pointer.moved = true;
      if (pointer.alpha !== target) moving = true;
    }
    if (pointer.moved) { pointerLight?.write(pointer.x, pointer.y, pointer.alpha); pointer.moved = false; }
    for (const part of parts) part.flush();
    draw();
    if (moving) frame = requestAnimationFrame(tick);
  }
  /** Re-reads a control's native state and animates its parts there. */
  function update(element: HTMLElement) {
    const control = controls.get(element);
    if (!control) return;
    targets(control).forEach((target, index) => { control.springs[index]!.target = target; });
    schedule();
  }

  /** The panel's part kinds for the current tokens; runs on every harness rebuild. */
  async function build(layer: InstrumentLayer) {
    // Layers without controls (the stage) have no parts.
    if (!layer.element.querySelector("[data-ip]")) return;
    const t = current(), stage = options.stage();
    const engine = (layer.scene.surface as unknown as { engine: EngineContext }).engine;
    controls.clear(); glows.length = 0;
    const nextParts: Part[] = [];
    const distance = -layer.camera.position.z, dpr = window.devicePixelRatio;
    layer.light.intensity = t.light.intensity;
    const s = await createSurfaces(layer, { light: t.light, reflections: t.light.environment, glassEnvironment: materials.glass.environment, stage, distance });
    onSceneDispose(layer.scene, () => s.probe.dispose());
    surfaces = s;
    const chain = createChain(layer, engine, { bloom: 1 });
    const map = createShadowMap(layer, engine, stage);
    const casters: { mesh: Mesh; box: Rect; height: number }[] = [];
    // The probe and the glass follow the layer's capture (bound by the harness to this material).
    const source = layer.capture("probe-source") as unknown as ShaderMaterial;
    onBeforeRender(layer.scene, () => {
      const texture = getShaderTexture(source, "capture") as (ReturnType<typeof getShaderTexture> & { texture?: GPUTexture }) | null;
      s.follow(texture ?? undefined, getShaderUniform(source, "origin") as Float32Array, options.uploads(layer.id));
    });

    /** A thin-instanced part kind (one instance) on `route`; `cast` adds it to the shadow map with its control's box. */
    const part = (name: string, data: PartData, material: Material, route: Route, cast?: { box: Rect; height: number }): Part => {
      if (route === "top") {
        const kind = layer.kind(name, data, material, 1);
        chain.add("tops", kind.mesh);
        const wrapped: Part = { name, mesh: kind.mesh, pose: (index, pose) => kind.pose(index, pose), hide: index => kind.hide(index), flush: () => kind.flush() };
        nextParts.push(wrapped);
        return wrapped;
      }
      const mesh = partMesh(engine, `${layer.id}-${name}`, data);
      mesh.material = material;
      const matrices = new Float32Array(16);
      setThinInstances(mesh, matrices, 1);
      chain.add(route, mesh);
      // Mesh-pass parts are in the scene too: Lite's shadow task builds its casters from the scene's meshes.
      if (route === "mesh") addToScene(layer.scene, mesh);
      let dirty = false;
      const result: Part = {
        name, mesh,
        pose(index, pose) {
          const [wx, wy] = layer.world(pose.x, pose.y), lift = pose.lift ?? 0;
          if (pose.tilt !== undefined) {
            // Rotation about the x axis through the pivot (local z = −pivot): T(w, −pivot) · Rx · T(0, 0, pivot).
            const c = Math.cos(pose.tilt), sn = Math.sin(pose.tilt), pivot = pose.pivot ?? 0;
            matrices.set([1, 0, 0, 0, 0, c, sn, 0, 0, -sn, c, 0, wx, wy - sn * pivot, -pivot + c * pivot - lift, 1], index * 16);
          } else {
            const c = Math.cos(pose.angle ?? 0), sn = Math.sin(pose.angle ?? 0);
            matrices.set([c, sn, 0, 0, -sn, c, 0, 0, 0, 0, 1, 0, wx, wy, -lift, 1], index * 16);
          }
          dirty = true;
        },
        hide(index) { matrices.fill(0, index * 16, index * 16 + 16); dirty = true; },
        flush() { if (dirty) { flushThinInstances(mesh); dirty = false; } },
      };
      if (cast) casters.push({ mesh, ...cast });
      nextParts.push(result);
      return result;
    };
    const ink = (colour: Rgb) => s.ink(colour);
    /** An emissive accent (PBR, in the mesh target) and its glow (flat, in the emitter target), animated by `strength`. */
    const lit = (strength: () => number) => {
      const pbr = createPbrMaterial({ baseColorFactor: linear(t.accent), metallicFactor: 0, roughnessFactor: 0.4, doubleSided: true, environmentIntensity: 0.3 });
      const colour = linear(t.accent).slice(0, 3).map(value => value * strength()) as [number, number, number];
      setPbrEmissive(pbr, colour);
      const flat = flatMaterial("glow", [...colour, 1]);
      glows.push({ colour, materials: { pbr, flat }, base: t.accent, strength });
      return { pbr: pbr as unknown as Material, flat: flat as unknown as Material };
    };
    const cap = materials[t.materials.cap], skirt = materials[t.materials.skirt], plateRecipe = materials[t.materials.plate];
    // Print on glass parts (grips, index lines) is in the faceplate's ink, so it reads against the plate seen through them.
    const capInk = cap.glass ? plateRecipe.plate.ink : cap.ink;
    const [lx, ly, lz] = lightVector(t.light.azimuth, t.light.elevation);
    // Shadow offset per px of height, in part-local axes (y up).
    const offset = [-lx / lz, ly / lz];
    /** A surface for a recipe on a control: the glass shader (standing on `bottom`) or a PBR material. */
    const surface = (recipe: MaterialRecipe, name: string, bottom: number, extra: Parameters<LayerSurfaces["pbr"]>[1] = {}, glassSkirt?: Parameters<LayerSurfaces["glass"]>[1]["skirt"]) =>
      recipe.glass ? s.glass(`glass-${name}`, { bottom, skirt: glassSkirt }) as unknown as Material : s.pbr(recipe, extra);
    const strength = (recipe: MaterialRecipe) => t.shadow.strength * (recipe.glass ? 0.45 : 1);

    /** An analytic shadow quad posed with its caster; `second` is a stacked footprint (a cap on its skirt). */
    const shadowOf = (name: string, first: number[], extra: { second?: number[]; capsule?: number[]; receiver?: number[]; extent?: [number, number]; strength?: number } = {}): Shadow => {
      const height = Math.max(first[3]!, extra.second?.[3] ?? 0);
      const reach = height * Math.hypot(offset[0]!, offset[1]!) + 1.5 * height + 8;
      const [ex, ey] = extra.extent ?? [first[0]!, first[1]!];
      const material = createShaderMaterial({ name: `shadow-${name}`, vertexSource: shadowVertex, fragmentSource: shadowFragment, attributes: ["position"],
        uniforms: ["world", "view", "projection",
          { name: "first", type: "vec4<f32>", defaultValue: first },
          { name: "second", type: "vec4<f32>", defaultValue: extra.second ?? first },
          { name: "segment", type: "vec4<f32>", defaultValue: extra.capsule ?? [0, 0, 0, 0] },
          { name: "receiver", type: "vec4<f32>", defaultValue: [0, 0, 0, 0] },
          { name: "look", type: "vec4<f32>", defaultValue: [extra.strength ?? t.shadow.strength, extra.capsule ? 0 : t.shadow.contact, offset[0]!, offset[1]!] },
          { name: "mode", type: "vec4<f32>", defaultValue: [extra.capsule ? 1 : 0, ...(extra.receiver ?? [0, 0, 0])] }],
        needAlphaBlending: true, blendMode: "alpha", backFaceCulling: false, depthWrite: false });
      enableShaderMaterialInstanceWorld(material);
      return { material, part: part(`shadow-${name}`, plate(2 * (ex + reach), 2 * (ey + reach), 0, 0.02), material as unknown as Material, "shade") };
    };
    const spring = (name: keyof ResolvedTokens["springs"]): Spring => ({ x: 0, v: 0, target: 0, ...t.springs[name] });
    const add = (element: HTMLElement, type: string, springs: Spring[], shadowsOf: Shadow[], pose: (rect: Rect, x: number[]) => void) => {
      const rect = layer.rectOf(element);
      const control: Control = { element, type, rect, springs, shadows: shadowsOf, pose: () => pose(rect, springs.map(item => item.x)) };
      controls.set(element, control);
      // Start at the native state, at rest.
      targets(control).forEach((target, index) => { springs[index]!.x = springs[index]!.target = target; });
      control.pose();
    };
    const centre = (rect: Rect) => ({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 });
    const radiusOf = (element: HTMLElement, rect: Rect) => { const value = getComputedStyle(element).borderTopLeftRadius; return Math.min(rect.width / 2, rect.height / 2, value.endsWith("%") ? (Number.parseFloat(value) / 100) * rect.width : Number.parseFloat(value) || 0); };

    for (const element of layer.element.querySelectorAll<HTMLElement>("[data-ip]")) {
      const type = element.dataset.ip!, box = layer.rectOf(element);
      // The control's box in the composite's clip mask.
      const mask = part(`mask-${element.id}`, plate(box.width, box.height, radiusOf(element, box), 0), chain.maskMaterial, "mask");
      mask.pose(0, centre(box));
      if (type === "knob" || type === "small") {
        const k = type === "knob" ? t.knob : t.small, rs = k.size / 2, rc = cap.glass ? k.dome.radius : k.cap / 2, hs = k.skirtHeight, top = hs + (cap.glass ? k.dome.height : k.capHeight), c = k.chamfer, b = k.skirtBreak;
        const cast = { box, height: top + k.crown };
        // The skirt's top is a shallow cone (`skirtSlope`), so its upper arc catches the studio's strip like a turned flange.
        const fall = Math.min(Math.tan(k.skirtSlope) * (rs - b - rc), hs * 0.4);
        const skirtPart = hs > 0 ? part(`${type}-skirt`, revolve([[rs, 0], [rs, hs - b - fall], [rs - b, hs - fall], [rc + 0.3, hs]], 96), surface(skirt, `${type}-skirt`, 0, { polished: skirt.brush === 0 }), "mesh", cast) : undefined;
        const turning: Part[] = [];
        let heightAt: (r: number) => number, pointerInk: Rgb = cap.ink;
        if (cap.glass) {
          // A glass cap: a short wall, then a superellipse dome; a plano-convex lens standing on the skirt.
          const wall = k.dome.wall, dome = top - hs - wall;
          const profile: SmoothProfilePoint[] = [[rc, hs, 1, 0], ...superellipseProfile(rc, dome, k.dome.exponent, 32, hs + wall)];
          const glass = s.glass(`glass-${type}-cap`, { bottom: hs, skirt: { ...centre(box), height: hs, radius: rs, tint: skirt.colour } });
          part(`${type}-dome`, revolveSmooth(profile, 96), glass as unknown as Material, "mesh").pose(0, centre(box));
          heightAt = r => hs + wall + dome * Math.pow(Math.max(0, 1 - Math.pow(Math.min(1, Math.abs(r) / rc), k.dome.exponent)), 1 / k.dome.exponent);
          // Under glass the pointer is printed in the faceplate's ink, so it reads against the magnified plate.
          pointerInk = plateRecipe.plate.ink;
        } else {
          // The cap: a brushed side, a 2 px polished chamfer and a spun top with a shallow crown (anisotropy around the axis).
          const a = rc - c, crown = Math.max(0.01, k.crown), sphere = (a * a + crown * crown) / (2 * crown);
          const crownProfile: SmoothProfilePoint[] = [];
          for (let step = 0; step <= 10; step++) { const r = a * (1 - step / 10), h = top + Math.sqrt(sphere * sphere - r * r) - (sphere - crown); crownProfile.push([r, h, r / sphere, Math.sqrt(1 - (r / sphere) ** 2)]); }
          turning.push(part(`${type}-cap`, revolve([[rc, hs], [rc, top - c]], 96), surface(cap, `${type}-cap`, hs, { direction: [1, 0] }), "mesh", cast));
          if (c > 0) turning.push(part(`${type}-chamfer`, revolve([[rc, top - c], [rc - c, top]], 96), surface(cap, `${type}-chamfer`, hs, { polished: true }), "mesh", cast));
          turning.push(part(`${type}-top`, revolveSmooth(crownProfile, 96), surface(cap, `${type}-top`, hs, { direction: [1, 0] }), "mesh", cast));
          heightAt = r => (Math.abs(r) >= a ? top : top + Math.sqrt(sphere * sphere - r * r) - (sphere - crown));
        }
        const inner = cap.glass ? rc * 0.92 : rc - c, p = k.pointer;
        turning.push(part(`${type}-pointer`, strip(p.width, p.from * inner, p.to * inner, heightAt, p.rise), ink(pointerInk), "mesh"));
        const shadow = shadowOf(type, [rs, rs, rs, hs], { second: [rc, rc, rc, top], strength: strength(cap) });
        add(element, type, [spring(type === "knob" ? "knob" : "detent")], [shadow], (rect, [x]) => {
          const at = centre(rect), angle = -(x! - 0.5) * k.sweep;
          skirtPart?.pose(0, { ...at, angle });
          for (const item of turning) item.pose(0, { ...at, angle });
          shadow.part.pose(0, at);
        });
      } else if (type === "fader") {
        const f = t.fader, parts = block(f.width, f.length, f.radius, f.height, f.taper, f.chamfer), cast = { box, height: f.height };
        const pieces = cap.glass ? [part("fader-glass", frustum(f.width, f.length, f.radius, f.height, 2.5), surface(cap, "fader", 0), "mesh")]
          : [part("fader-body", parts.body, surface(cap, "fader-body", 0, { direction: [1, 0] }), "mesh", cast), part("fader-chamfer", parts.chamfer, surface(cap, "fader-chamfer", 0, { polished: true }), "mesh", cast),
            part("fader-top", parts.top, surface(cap, "fader-top", 0, { direction: [1, 0] }), "mesh", cast)];
        pieces.push(part("fader-grip", bar(f.width - 2 * f.taper - 2 * f.chamfer - 6, f.grip.width, f.height - 0.02, f.height + f.grip.rise), ink(capInk), "mesh"));
        const shadow = shadowOf("fader", [f.width / 2, f.length / 2, f.radius, f.height], { strength: strength(cap) });
        add(element, type, [spring("fader")], [shadow], (rect, [x]) => {
          const at = { x: rect.x + rect.width / 2, y: rect.y + f.length / 2 + (1 - x!) * f.travel };
          for (const piece of pieces) piece.pose(0, at);
          shadow.part.pose(0, at);
        });
      } else if (type === "slide") {
        const sl = t.slide, [bw, bh] = sl.block, [sw, sh] = sl.slot, parts = block(bw, bh, sl.radius, sl.height, sl.taper, sl.chamfer), cast = { box, height: sl.height };
        const pieces = cap.glass ? [part("slide-glass", frustum(bw, bh, sl.radius, sl.height, 1.5), surface(cap, "slide", 0), "mesh")]
          : [part("slide-body", parts.body, surface(cap, "slide-body", 0, { direction: [0, 1] }), "mesh", cast), part("slide-chamfer", parts.chamfer, surface(cap, "slide-chamfer", 0, { polished: true }), "mesh", cast),
            part("slide-top", parts.top, surface(cap, "slide-top", 0, { direction: [0, 1] }), "mesh", cast)];
        pieces.push(part("slide-grip", bar(1.4, bh - 2 * sl.chamfer - 6, sl.height - 0.02, sl.height + 0.08), ink(capInk), "mesh"));
        const glow = lit(() => ((element as HTMLInputElement).checked ? 1 : 0));
        const flag = part("slide-flag", plate(sw / 2 - 3, sh - 3, 1.5, 0.06), glow.pbr, "mesh");
        const flagGlow = part("slide-flag-glow", plate(sw / 2 - 3, sh - 3, 1.5, 0.06), glow.flat, "emit");
        const shadow = shadowOf("slide", [bw / 2, bh / 2, sl.radius, sl.height], { strength: strength(cap) });
        add(element, type, [spring("slide")], [shadow], (rect, [x]) => {
          const at = { x: rect.x + sl.inset + bw / 2 + x! * (rect.width - 2 * sl.inset - bw), y: rect.y + rect.height / 2 };
          for (const piece of pieces) piece.pose(0, at);
          shadow.part.pose(0, at);
          const flagAt = { x: rect.x + rect.width / 2 - sw / 4, y: at.y };
          if (x! >= 0.5) { flag.pose(0, flagAt); flagGlow.pose(0, flagAt); } else { flag.hide(0); flagGlow.hide(0); }
        });
      } else if (type === "rocker") {
        const r = t.rocker, [pw, pl] = r.paddle, alpha = Math.atan((r.end - r.centre) / (pl / 2)), base = r.bezelHeight;
        const bezel = part("rocker-bezel", frustum(r.bezel[0], r.bezel[1], 4, r.bezelHeight, r.bezelTaper), surface(skirt, "rocker-bezel", 0, { direction: [1, 0] }), "mesh", { box, height: r.bezelHeight });
        const paddle = part("rocker-paddle", prism([[-pl / 2, base - 1], [pl / 2, base - 1], [pl / 2, base + r.end], [0, base + r.centre], [-pl / 2, base + r.end]], pw), surface(cap, "rocker-paddle", base - 1, { direction: [1, 0] }), "mesh", { box, height: base + r.end });
        // The accent flag on the On end's facet (y > 0), lit when on.
        const [fw, fl] = r.flag, y1 = pl / 2 - 3, y0 = y1 - fl, hAt = (y: number) => base + r.centre + ((r.end - r.centre) * y) / (pl / 2);
        const glow = lit(() => ((element as HTMLInputElement).checked ? 1 : 0.12));
        const flag = part("rocker-flag", facet(fw, y0, hAt(y0), y1, hAt(y1), 0.06), glow.pbr, "mesh");
        const flagGlow = part("rocker-flag-glow", facet(fw, y0, hAt(y0), y1, hAt(y1), 0.06), glow.flat, "emit");
        const shadow = shadowOf("rocker", [r.bezel[0] / 2, r.bezel[1] / 2, 4, r.bezelHeight], { second: [pw / 2, pl / 2, 2, base + (r.end + r.centre) / 2], strength: strength(cap) });
        add(element, type, [spring("rocker")], [shadow], (rect, [x]) => {
          const at = centre(rect), tilt = (2 * x! - 1) * alpha;
          bezel.pose(0, at); shadow.part.pose(0, at);
          paddle.pose(0, { ...at, tilt, pivot: base }); flag.pose(0, { ...at, tilt, pivot: base }); flagGlow.pose(0, { ...at, tilt, pivot: base });
          // The raised end casts further: the paddle's footprint moves towards it.
          setShaderUniform(shadow.material, "segment", [0, -Math.sin(tilt) * pl * 0.12, 0, 0]);
        });
      } else if (type === "bat") {
        const b = t.bat, cast = { box, height: b.length + b.ball };
        const nut = part("bat-nut", revolve([[b.nut, 0], [b.nut, b.nutHeight - 0.6], [b.nut - 0.6, b.nutHeight], [b.bushing, b.nutHeight]], 64), surface(skirt, "bat-nut", 0, { polished: skirt.brush === 0 }), "mesh", cast);
        const bushing = part("bat-bushing", revolve([[b.bushing, b.nutHeight], [b.bushing, b.bushingHeight - 0.6], [b.bushing - 0.6, b.bushingHeight], [0, b.bushingHeight]], 64), surface(skirt, "bat-bushing", 0, { polished: true }), "mesh", cast);
        const leverPart = part("bat-lever", lever(b.base, b.neck, b.ball, b.length), surface(cap, "bat-lever", b.pivot, { polished: true }), "mesh", cast);
        const shadow = shadowOf("bat", [b.nut, b.nut, b.nut, b.bushingHeight]);
        const leverShadow = shadowOf("bat-lever", [0, 0, b.neck, b.length], { capsule: [0, 0, 0, 0], extent: [b.ball + b.length, b.length], strength: strength(cap) });
        add(element, type, [spring("bat")], [shadow, leverShadow], (rect, [x]) => {
          const at = centre(rect), theta = (2 * x! - 1) * b.throw;
          nut.pose(0, at); bushing.pose(0, at); shadow.part.pose(0, at); leverShadow.part.pose(0, at);
          leverPart.pose(0, { ...at, tilt: theta, pivot: b.pivot });
          // The lever's shadow: a capsule from the pivot's shadow to the ball's.
          const tipY = (b.length - b.pivot) * Math.sin(theta), tipH = b.pivot + (b.length - b.pivot) * Math.cos(theta);
          setShaderUniform(leverShadow.material, "segment", [offset[0]! * b.bushingHeight, offset[1]! * b.bushingHeight, offset[0]! * tipH, tipY + offset[1]! * tipH]);
          setShaderUniform(leverShadow.material, "first", [0, 0, b.neck + 0.8, (b.bushingHeight + tipH) / 2]);
        });
      } else if (type === "wall") {
        const w = t.wall, [plateWidth, plateHeight] = t.wall.box, [pw, pl] = w.paddle, pivot = w.plateHeight - 1.5 + w.paddleHeight / 2;
        const wallPlate = part("wall-plate", frustum(plateWidth, plateHeight, w.radius, w.plateHeight, w.plateTaper), surface(plateRecipe, "wall-plate", 0, { direction: [1, 0], grain: false }), "mesh", { box, height: w.plateHeight });
        const parts = block(pw, pl, 3, w.paddleHeight, w.paddleTaper, w.chamfer, w.plateHeight - 1.5), cast = { box, height: w.plateHeight + w.paddleHeight + 3 };
        const pieces = cap.glass ? [part("wall-glass", frustum(pw, pl, 3, w.paddleHeight, 2, w.plateHeight - 1.5), surface(cap, "wall", w.plateHeight - 1.5), "mesh")]
          : [part("wall-body", parts.body, surface(cap, "wall-body", 0, { direction: [1, 0] }), "mesh", cast), part("wall-chamfer", parts.chamfer, surface(cap, "wall-chamfer", 0, { polished: true }), "mesh", cast),
            part("wall-top", crowned(pw - 2 * w.paddleTaper - 2 * w.chamfer, pl - 2 * w.paddleTaper - 2 * w.chamfer, w.plateHeight - 1.5 + w.paddleHeight, w.crown), surface(cap, "wall-top", 0, { direction: [1, 0] }), "mesh", cast)];
        // A lit dot near the paddle's On end, on its top.
        const glow = lit(() => ((element as HTMLInputElement).checked ? 1 : 0.12)), topH = w.plateHeight - 1.5 + w.paddleHeight + 0.06;
        const dotData = (() => { const data = plate(w.flag[0], w.flag[1], w.flag[1] / 2, topH); data.positions = data.positions.map((value, index) => (index % 3 === 1 ? value + pl / 2 - 9 : value)); return data; })();
        pieces.push(part("wall-flag", dotData, glow.pbr, "mesh"));
        const flagGlow = part("wall-flag-glow", dotData, glow.flat, "emit");
        const shadow = shadowOf("wall", [plateWidth / 2, plateHeight / 2, w.radius, w.plateHeight]);
        const paddleShadow = shadowOf("wall-paddle", [pw / 2, pl / 2, 3, w.paddleHeight], { receiver: [plateWidth / 2 - w.plateTaper, plateHeight / 2 - w.plateTaper, w.radius], strength: strength(cap) });
        add(element, type, [spring("wall")], [shadow, paddleShadow], (rect, [x]) => {
          const at = centre(rect), tilt = (2 * x! - 1) * w.throw;
          wallPlate.pose(0, at); shadow.part.pose(0, at); paddleShadow.part.pose(0, { ...at, lift: w.plateHeight });
          for (const piece of pieces) piece.pose(0, { ...at, tilt, pivot });
          flagGlow.pose(0, { ...at, tilt, pivot });
          setShaderUniform(paddleShadow.material, "first", [pw / 2, pl / 2, 3, w.paddleHeight + Math.abs(Math.sin(tilt)) * pl * 0.25]);
          setShaderUniform(paddleShadow.material, "segment", [0, -Math.sin(tilt) * pl * 0.2, 0, 0]);
        });
      } else if (type === "button") {
        const b = t.button, r = b.cap / 2;
        const bezel = part("button-bezel", revolve([[b.bezel[0], 0], [b.bezel[0], b.bezelHeight - 0.6], [b.bezel[0] - 0.6, b.bezelHeight], [b.bezel[1], b.bezelHeight], [b.bezel[1], 0.4]], 96), surface(skirt, "button-bezel", 0, { polished: skirt.brush === 0 }), "mesh", { box, height: b.bezelHeight });
        const glow = lit(() => (element.getAttribute("aria-pressed") === "true" ? 1 : 0.22));
        const ringData = revolve([[b.ring[0], 0.5], [b.ring[1], 0.5]], 96);
        const ring = part("button-ring", ringData, glow.pbr, "mesh"), ringGlow = part("button-ring-glow", ringData, glow.flat, "emit");
        const bodyParts = block(b.cap, b.cap, r, b.height, b.taper, b.chamfer);
        const body = part("button-cap", bodyParts.body, surface(cap, "button-cap", 0, { direction: [1, 0] }), "mesh", { box, height: b.height });
        const chamfer = part("button-chamfer", bodyParts.chamfer, surface(cap, "button-chamfer", 0, { polished: true }), "mesh", { box, height: b.height });
        const inset = b.taper + Math.min(b.chamfer, b.height / 2);
        const topPart = part("button-top", plate(b.cap - 2 * inset, b.cap - 2 * inset, r - inset, b.height), layer.capture("button-top"), "top");
        const shadow = shadowOf("button", [b.bezel[0], b.bezel[0], b.bezel[0], b.bezelHeight], { second: [r, r, r, b.height] });
        add(element, type, [spring("button")], [shadow], (rect, [x]) => {
          const at = centre(rect);
          bezel.pose(0, at); ring.pose(0, at); ringGlow.pose(0, at); shadow.part.pose(0, at);
          body.pose(0, { ...at, lift: -x! }); chamfer.pose(0, { ...at, lift: -x! });
          topPart.pose(0, { ...at, lift: -x!, locked: b.height });
          // Travel reads as the cap's shadow shrinking and its contact line tightening.
          setShaderUniform(shadow.material, "second", [r, r, r, Math.max(0.2, b.height - x!)]);
          setShaderUniform(shadow.material, "segment", [0, 0, 0.75 * Math.min(1, x! / b.travel), 0]);
        });
      } else if (type === "display") {
        const d = t.display, [width, height] = [box.width, box.height];
        const bezel = part("display-bezel", bezelFrame(width - 2 * d.edge, height - 2 * d.edge, d.radius - d.edge, d.rise, d.taper, d.border - d.edge, d.chamfer), surface(skirt, "display-bezel", 0, { polished: skirt.brush === 0, direction: [1, 0], grain: false }), "mesh", { box, height: d.rise });
        const gw = width - 2 * d.border, gh = height - 2 * d.border;
        const pane = s.glass("display-pane", { bottom: 0, pane: { band: d.band, horizon: d.horizon } });
        const glass = part("display-glass", frustum(gw, gh, Math.max(0.5, d.radius - d.border + 2), d.glass, d.glassTaper), pane as unknown as Material, "top");
        // The window (the glass's footprint) and the protected text rect, in canvas device px.
        const text = element.querySelector(".ip-display-text")!, range = document.createRange();
        range.selectNodeContents(text);
        const runs = range.getBoundingClientRect(), base = layer.element.getBoundingClientRect();
        const toDevice = (x: number, y: number) => [(layer.origin.x + x) * dpr, (layer.origin.y + y) * dpr];
        const protect = [...toDevice(runs.left - base.left - 2, runs.top - base.top - 2), ...toDevice(runs.right - base.left + 2, runs.bottom - base.top + 2)] as [number, number, number, number];
        const windowRect = [...toDevice(box.x + d.border, box.y + d.border), ...toDevice(box.x + width - d.border, box.y + height - d.border)] as [number, number, number, number];
        s.setPane(pane, windowRect, protect);
        const shadow = shadowOf("display", [width / 2, height / 2, d.radius, d.rise]);
        add(element, type, [spring("button")], [shadow], rect => {
          const at = centre(rect);
          bezel.pose(0, at); glass.pose(0, at); shadow.part.pose(0, at);
        });
        built = { ...(built ?? { chain: [], casters: 0, kinds: 0 }), pane };
      }
    }
    for (const control of controls.values()) for (const shadow of control.shadows) if (!shadows) shadow.part.hide(0);
    map.casters(casters);
    // The pointer light's face pass leads the chain; its clustered light lights the parts.
    pointerLight = createPointerLight(layer, engine, { stage, radius: 10, interiorMax: options.interiorMax });
    const names = chain.finish(pointerLight.task);
    pointer.moved = true;
    parts = nextParts;
    for (const item of parts) item.flush();
    built = { ...(built ?? {}), chain: names, casters: casters.length, kinds: parts.length };
    schedule();
  }

  /** The tallest point of each part and its inset from its control's box, for the harness's camera distance. */
  function envelopes(t: ResolvedTokens): Envelope[] {
    const r = t.rocker, b = t.bat, w = t.wall;
    return [
      ...[t.knob, t.small].map(k => ({ height: k.skirtHeight + Math.max(k.capHeight + k.crown, k.dome.height) + k.pointer.rise, inset: k.box / 2 - k.cap / 2 })),
      { height: t.fader.height + 0.1, inset: (t.fader.box - t.fader.width) / 2 + t.fader.taper },
      { height: t.slide.height + 0.1, inset: Math.min(t.slide.inset, (t.slide.box[1] - t.slide.block[1]) / 2) + t.slide.taper },
      { height: r.bezelHeight + 2 * r.end, inset: (r.box[0] - r.paddle[0]) / 2 },
      { height: b.length + b.ball, inset: b.box[1] / 2 - ((b.length - b.pivot) * Math.sin(b.throw) + b.ball) },
      { height: w.plateHeight + w.paddleHeight + 3, inset: (w.box[0] - w.paddle[0]) / 2 },
      { height: t.button.height, inset: (t.button.box - t.button.cap) / 2 + t.button.taper },
      { height: t.display.rise, inset: t.display.taper + t.display.edge },
    ];
  }

  return {
    build, update, envelopes,
    setDraw(callback: () => void) { draw = callback; },
    press(element: HTMLElement, down: boolean) { if (down) pressed.add(element); else pressed.delete(element); update(element); },
    /** Shows or hides every analytic shadow (they are face shading, not objects). */
    setShadows(on: boolean) {
      shadows = on;
      for (const control of controls.values()) { control.pose(); if (!on) for (const shadow of control.shadows) shadow.part.hide(0); }
      for (const item of parts) item.flush();
      draw();
    },
    /** The pointer light: `enabled` is the tuning bar's toggle, `at` the pointer in canvas CSS px (undefined: outside). */
    setPointer(state: { enabled?: boolean; at?: { x: number; y: number } | null; suspended?: boolean }) {
      if (state.enabled !== undefined) pointer.enabled = state.enabled;
      if (state.suspended !== undefined) { pointer.suspended = state.suspended; if (state.suspended) { pointer.alpha = 0; pointer.moved = true; } }
      if (state.at !== undefined) { pointer.inside = !!state.at; if (state.at) { pointer.x = state.at.x; pointer.y = state.at.y; } pointer.moved = true; }
      schedule();
    },
    pointerState: () => ({ ...pointer, fine: fine.matches, clustered: pointerLight?.clustered ?? false, protectedRects: pointerLight?.protectedRects ?? 0 }),
    /** True when every spring is at its target and the pointer light has finished fading. */
    atRest: () => !frame && pointer.alpha === pointerTarget() && [...controls.values()].every(control => control.springs.every(item => item.x === item.target && item.v === 0)),
    controls: () => [...controls.values()].map(control => ({ id: control.element.id, type: control.type, rect: control.rect })),
    info: () => ({ chain: built?.chain, casters: built?.casters, kinds: built?.kinds, probeRefreshes: surfaces?.refreshes() ?? 0 }),
  };
}
export type InstrumentMeshes = ReturnType<typeof createInstrumentMeshes>;
