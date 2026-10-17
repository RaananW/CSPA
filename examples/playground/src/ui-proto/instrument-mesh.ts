/**
 * The Instrument level of the Phase I1 prototype page: the premium character's parts as Babylon Lite meshes in the
 * chassis panel's layer scene (the I0 harness, `ui-probes/instrument-harness.ts`), posed from native state.
 * - Knob: a skirt (flange) and a chamfered cap revolved from profiles, an engraved pointer line; the cap turns through
 *   `sweep`. Brushed metal is circular (spun) on the cap: Lite anisotropy along the lathe's circumference.
 * - Fader: a machined carriage (tapered block) with an index line, sliding in the printed slot.
 * - Switches: `slide` (a block in a slot with an accent flag that shows when on), `rocker` (two plates on a pivot: a
 *   shallow valley that tips so the pressed plate lies level), `bat` (a lever on a nut and bushing that throws over
 *   centre) and `wall` (a paddle that tips on a machined wall plate).
 * - Push button: a bezel, a lit ring (a plain emissive material) and a cap whose top is the screen-locked capture, so
 *   its label stays texel-exact; it travels on press and holds at `latch` while `aria-pressed` is true.
 * - Shadows: Strata's analytic formula (design language section 7) on each part's footprint, as a quad per caster on
 *   the face, plus a contact line; a lever casts a capsule. They are face shading, not objects: `setShadows(false)`
 *   hides them for the containment check.
 * Moving parts follow springs (stiffness, damping per unit mass); under reduced motion poses are instant. Poses are
 * thin-instance matrix writes: they never capture. Throwaway prototype code.
 */
import {
  createPbrMaterial, createShaderMaterial, enableShaderMaterialInstanceWorld, flushThinInstances, loadHdrEnvironment, markMaterialUboDirty,
  setPbrAnisotropy, setPbrClearCoat, setPbrEmissive, setShaderUniform, setThinInstances,
  type Material, type PbrMaterialProps, type ShaderMaterial,
} from "@babylonjs/lite";
import { bar, frustum, plate, revolve, type PartData } from "../ui-probes/instrument-parts.ts";
import { lever, prism } from "./instrument-shapes.ts";
import type { Envelope, InstrumentLayer, PartKind, Rect } from "../ui-probes/instrument-harness.ts";
import { lightVector } from "./instrument-css.ts";
import { instrumentStudioHdr } from "./instrument-studio.ts";
import { materials, type MaterialRecipe, type ResolvedTokens } from "./instrument-tokens.ts";

type Rgb = readonly [number, number, number];
const srgbToLinear = (value: number) => { const c = value / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const linear = ([r, g, b]: Rgb): [number, number, number, number] => [srgbToLinear(r), srgbToLinear(g), srgbToLinear(b), 1];

// The analytic shadow of a caster on the face, in the quad's local px (y up, centred on the caster): Strata's formula
// (offset −light.xy / light.z · h, grown over 2h + 1 px) for up to two stacked rounded footprints, or for a capsule
// (a lever), plus a contact line just outside the footprint; optionally clipped to a receiving surface.
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
    let contact = (1.0 - smoothstep(0.0, 1.6, d)) * step(0.0, d) * look.y;
    alpha = max(max(castShadow(p, shaderUniforms.first, look.zw), castShadow(p, shaderUniforms.second, look.zw)) * look.x, contact);
  }
  if (mode.y > 0.0) { alpha = alpha * (1.0 - smoothstep(-0.5, 0.5, roundedBox(p - shaderUniforms.receiver.xy, mode.yz, mode.w))); }
  return vec4<f32>(0.0, 0.0, 0.0, alpha);
}`;

interface Spring { x: number; v: number; target: number; stiffness: number; damping: number }
interface Shadow { kind: PartKind; material: ShaderMaterial; first: number[] }
interface Control { element: HTMLElement; type: string; rect: Rect; springs: Spring[]; pose(): void; shadows: Shadow[] }

/** A part kind that poses with a tilt about the x axis (rockers, paddles, levers): `pose(index, x, y, tilt, pivot)`. */
interface TiltKind { kind: PartKind; pose(index: number, x: number, y: number, tilt: number, pivot: number, lift?: number): void; hide(index: number): void; flush(): void }

/** The Instrument presentation of the chassis panel; `draw` is core's frame, set once the harness is up. */
export function createInstrumentMeshes(current: () => ResolvedTokens) {
  let draw = () => {};
  const controls = new Map<HTMLElement, Control>();
  const tilts: TiltKind[] = [];
  let shadows = true, frame = 0, last = 0;
  let currentLayer: InstrumentLayer | undefined;
  const pressed = new Set<HTMLElement>();
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  let studio: Uint8Array | undefined;
  /** Every animated emissive colour, with the material to mark dirty. */
  const glows: { colour: [number, number, number]; material: PbrMaterialProps; base: Rgb; strength: () => number }[] = [];

  /** Native state of a control as the spring target(s). */
  function targets(control: Control): number[] {
    const element = control.element, t = current();
    if (element instanceof HTMLInputElement && element.type === "range") {
      const min = Number(element.min), max = Number(element.max);
      return [max > min ? (Number(element.value) - min) / (max - min) : 0];
    }
    if (element instanceof HTMLInputElement) return [element.checked ? 1 : 0];
    const latched = element.getAttribute("aria-pressed") === "true";
    return [pressed.has(element) ? t.button.travel : latched ? t.button.latch : 0];
  }
  function schedule() { if (!frame) { last = performance.now(); frame = requestAnimationFrame(tick); } }
  /** Advances every spring by fixed 4 ms steps, poses what moved and draws; stops when everything is at rest. */
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
      if (next.some((value, index) => Math.abs(value - glow.colour[index]!) > 1e-4)) { glow.colour.splice(0, 3, ...next); markMaterialUboDirty(glow.material as unknown as Material); }
    }
    flushAll();
    draw();
    if (moving) frame = requestAnimationFrame(tick);
  }
  /** Uploads every part kind that changed (harness kinds and tilt kinds). */
  function flushAll() {
    for (const kind of currentLayer?.kinds ?? []) kind.flush();
    for (const tilt of tilts) tilt.flush();
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
    const t = current();
    controls.clear(); tilts.length = 0; glows.length = 0;
    currentLayer = layer;
    // The studio the metals reflect; loading an environment resets image processing, which the face needs off.
    studio ??= instrumentStudioHdr(512, 256, t.light.azimuth, t.light.elevation);
    const url = URL.createObjectURL(new Blob([studio as BlobPart], { type: "application/octet-stream" }));
    try { await loadHdrEnvironment(layer.scene, url, { skipSkybox: true, skipGround: true, faceSize: 128 }); } finally { URL.revokeObjectURL(url); }
    layer.scene.imageProcessing = { exposure: 1, contrast: 1, toneMappingEnabled: false };
    layer.light.intensity = t.light.intensity;
    // The harness's fill faces the viewer: its specular term would put a mirror highlight on every flat top, so the fill
    // is diffuse only (the studio gives metals their reflections).
    for (const light of layer.scene.lights) if ((light as { lightType?: string }).lightType === "hemispheric") Object.assign(light, { intensity: t.light.ambient, specularColor: [0, 0, 0] });

    const cache = new Map<string, Material>();
    /** A PBR material for a recipe; brushed metal takes anisotropy along `direction` (tangent space: u, v). */
    const pbr = (recipe: MaterialRecipe, direction: [number, number] = [1, 0]) => {
      const key = `${recipe.label}:${direction}`;
      if (!cache.has(key)) {
        const material = createPbrMaterial({ baseColorFactor: linear(recipe.colour), metallicFactor: recipe.metallic, roughnessFactor: recipe.roughness,
          doubleSided: true, environmentIntensity: recipe.environment * t.light.environment, directIntensity: recipe.metallic > 0.5 ? 0.2 : 1 });
        if (recipe.brush > 0) setPbrAnisotropy(material, { isEnabled: true, intensity: recipe.brush, direction });
        if (recipe.coat > 0) setPbrClearCoat(material, { isEnabled: true, intensity: recipe.coat, roughness: recipe.coatRoughness, indexOfRefraction: 1.5 });
        cache.set(key, material as unknown as Material);
      }
      return cache.get(key)!;
    };
    const flat = (colour: Rgb, roughness = 0.55, emissive?: { strength: () => number }) => {
      const material = createPbrMaterial({ baseColorFactor: linear(colour), metallicFactor: 0, roughnessFactor: roughness, doubleSided: true });
      if (emissive) {
        const glow: [number, number, number] = linear(colour).slice(0, 3).map(value => value * emissive.strength()) as [number, number, number];
        setPbrEmissive(material, glow);
        glows.push({ colour: glow, material, base: colour, strength: emissive.strength });
      }
      return material as unknown as Material;
    };
    /** The same material polished: a diamond-cut edge. */
    const polished = (recipe: MaterialRecipe): MaterialRecipe => ({ ...recipe, label: `${recipe.label} polished`, roughness: Math.min(recipe.roughness, 0.1), brush: 0 });
    const cap = materials[t.materials.cap], skirt = materials[t.materials.skirt], plateRecipe = materials[t.materials.plate];
    const [lx, ly, lz] = lightVector(t.light.azimuth, t.light.elevation);
    // Shadow offset per px of height, in part-local axes (y up).
    const offset = [-lx / lz, ly / lz];

    /** An analytic shadow quad posed with its caster; `second` is a stacked footprint (a cap on its skirt). */
    const shadowOf = (name: string, first: number[], options: { second?: number[]; capsule?: number[]; receiver?: number[]; extent?: [number, number] } = {}): Shadow => {
      const height = Math.max(first[3]!, options.second?.[3] ?? 0);
      const reach = height * Math.hypot(offset[0]!, offset[1]!) + 1.5 * height + 4;
      const [ex, ey] = options.extent ?? [first[0]!, first[1]!];
      const material = createShaderMaterial({ name: `shadow-${name}`, vertexSource: shadowVertex, fragmentSource: shadowFragment, attributes: ["position"],
        uniforms: ["world", "view", "projection",
          { name: "first", type: "vec4<f32>", defaultValue: first },
          { name: "second", type: "vec4<f32>", defaultValue: options.second ?? first },
          { name: "segment", type: "vec4<f32>", defaultValue: options.capsule ?? [0, 0, 0, 0] },
          { name: "receiver", type: "vec4<f32>", defaultValue: [0, 0, 0, 0] },
          { name: "look", type: "vec4<f32>", defaultValue: [t.shadow.strength, options.capsule ? 0 : t.shadow.contact, offset[0]!, offset[1]!] },
          { name: "mode", type: "vec4<f32>", defaultValue: [options.capsule ? 1 : 0, ...(options.receiver ?? [0, 0, 0])] }],
        needAlphaBlending: true, blendMode: "alpha", backFaceCulling: false, depthWrite: false });
      enableShaderMaterialInstanceWorld(material);
      const kind = layer.kind(`shadow-${name}`, plate(2 * (ex + reach), 2 * (ey + reach), 0, 0.02), material as unknown as Material, 1);
      return { kind, material, first };
    };
    const tiltKind = (name: string, data: PartData, material: Material): TiltKind => {
      const kind = layer.kind(name, data, material, 1);
      const matrices = new Float32Array(16);
      setThinInstances(kind.mesh, matrices, 1);
      let dirty = false;
      const tilt: TiltKind = {
        kind,
        pose(index, x, y, angle, pivot, lift = 0) {
          const [wx, wy] = layer.world(x, y), c = Math.cos(angle), s = Math.sin(angle);
          // Rotation about the x axis through the pivot (local z = −pivot): T(w, −pivot) · Rx · T(0, 0, pivot).
          matrices.set([1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, wx, wy - s * pivot, -pivot + c * pivot - lift, 1], index * 16);
          dirty = true;
        },
        hide(index) { matrices.fill(0, index * 16, index * 16 + 16); dirty = true; },
        flush() { if (dirty) { flushThinInstances(kind.mesh); dirty = false; } },
      };
      tilts.push(tilt);
      return tilt;
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

    for (const element of layer.element.querySelectorAll<HTMLElement>("[data-ip]")) {
      const type = element.dataset.ip!;
      if (type === "knob" || type === "small") {
        const k = type === "knob" ? t.knob : t.small, rs = k.size / 2, rc = k.cap / 2, hs = k.skirtHeight, top = hs + k.capHeight, c = k.chamfer, b = k.skirtBreak;
        const skirtPart = hs > 0 ? layer.kind(`${type}-skirt`, revolve([[rs, 0], [rs, hs - b], [rs - b, hs], [rc + 0.3, hs]], 96), pbr(skirt), 1) : undefined;
        // The cap: a brushed side and top (spun: anisotropy along the circumference) and a diamond-cut chamfer, polished.
        const capSide = layer.kind(`${type}-cap`, revolve([[rc, hs], [rc, top - c]], 96), pbr(cap, [1, 0]), 1);
        const capTop = layer.kind(`${type}-top`, revolve([[rc - c, top], [0, top]], 96), pbr(cap), 1);
        const chamferPart = c > 0 ? layer.kind(`${type}-chamfer`, revolve([[rc, top - c], [rc - c, top]], 96), pbr(polished(cap)), 1) : undefined;
        const inner = rc - c, p = k.pointer;
        const pointerData = bar(p.width, (p.to - p.from) * inner, top - 0.02, top + p.rise);
        pointerData.positions = pointerData.positions.map((value, index) => (index % 3 === 1 ? value + ((p.from + p.to) / 2) * inner : value));
        const pointer = layer.kind(`${type}-pointer`, pointerData, flat(cap.ink, 0.6), 1);
        const shadow = shadowOf(type, [rs, rs, rs, hs], { second: [rc, rc, rc, top] });
        add(element, type, [spring(type === "knob" ? "knob" : "detent")], [shadow], (rect, [x]) => {
          const at = centre(rect), angle = -(x! - 0.5) * k.sweep;
          skirtPart?.pose(0, { ...at, angle });
          capSide.pose(0, { ...at, angle });
          chamferPart?.pose(0, { ...at, angle });
          capTop.pose(0, { ...at, angle });
          pointer.pose(0, { ...at, angle });
          shadow.kind.pose(0, at);
        });
      } else if (type === "fader") {
        const f = t.fader;
        const carriage = layer.kind("fader-carriage", frustum(f.width, f.length, f.radius, f.height, f.taper), pbr(cap, [1, 0]), 1);
        const grip = layer.kind("fader-grip", bar(f.width - 2 * f.taper - 8, f.grip.width, f.height - 0.02, f.height + f.grip.rise), flat(cap.ink, 0.6), 1);
        const shadow = shadowOf("fader", [f.width / 2, f.length / 2, f.radius, f.height]);
        add(element, type, [spring("fader")], [shadow], (rect, [x]) => {
          const at = { x: rect.x + rect.width / 2, y: rect.y + f.length / 2 + (1 - x!) * f.travel };
          carriage.pose(0, at); grip.pose(0, at); shadow.kind.pose(0, at);
        });
      } else if (type === "slide") {
        const s = t.slide, [bw, bh] = s.block, [sw, sh] = s.slot;
        const block = layer.kind("slide-block", frustum(bw, bh, s.radius, s.height, s.taper), pbr(cap, [0, 1]), 1);
        const grip = layer.kind("slide-grip", bar(1.2, bh - 2 * s.taper - 6, s.height - 0.02, s.height + 0.06), flat(cap.ink, 0.6), 1);
        const flag = layer.kind("slide-flag", plate(sw / 2 - 3, sh - 3, 1.5, s.flag), flat(t.accent, 0.5, { strength: () => 0.25 }), 1);
        const shadow = shadowOf("slide", [bw / 2, bh / 2, s.radius, s.height]);
        add(element, type, [spring("slide")], [shadow], (rect, [x]) => {
          const at = { x: rect.x + s.inset + bw / 2 + x! * (rect.width - 2 * s.inset - bw), y: rect.y + rect.height / 2 };
          block.pose(0, at); grip.pose(0, at); shadow.kind.pose(0, at);
          if (x! >= 0.5) flag.pose(0, { x: rect.x + rect.width / 2 - sw / 4, y: at.y }); else flag.hide(0);
        });
      } else if (type === "rocker") {
        const r = t.rocker, [pw, pl] = r.paddle, alpha = Math.atan((r.end - r.centre) / (pl / 2));
        const bezel = layer.kind("rocker-bezel", frustum(r.bezel[0], r.bezel[1], 4, r.bezelHeight, r.bezelTaper), pbr(skirt, [1, 0]), 1);
        const base = r.bezelHeight;
        const paddle = tiltKind("rocker-paddle", prism([[-pl / 2, base - 1], [pl / 2, base - 1], [pl / 2, base + r.end], [0, base + r.centre], [-pl / 2, base + r.end]], pw), pbr(cap, [1, 0]));
        const shadow = shadowOf("rocker", [r.bezel[0] / 2, r.bezel[1] / 2, 4, r.bezelHeight], { second: [pw / 2, pl / 2, 2, base + (r.end + r.centre) / 2] });
        add(element, type, [spring("rocker")], [shadow], (rect, [x]) => {
          const at = centre(rect);
          bezel.pose(0, at); shadow.kind.pose(0, at);
          paddle.pose(0, at.x, at.y, (2 * x! - 1) * alpha, base);
        });
      } else if (type === "bat") {
        const b = t.bat;
        const nut = layer.kind("bat-nut", revolve([[b.nut, 0], [b.nut, b.nutHeight - 0.6], [b.nut - 0.6, b.nutHeight], [b.bushing, b.nutHeight]], 64), pbr(skirt), 1);
        const bushing = layer.kind("bat-bushing", revolve([[b.bushing, b.nutHeight], [b.bushing, b.bushingHeight - 0.5], [b.bushing - 0.5, b.bushingHeight], [0, b.bushingHeight]], 64), pbr(skirt), 1);
        const leverPart = tiltKind("bat-lever", lever(b.base, b.neck, b.ball, b.length), pbr(cap, [0, 1]));
        const shadow = shadowOf("bat", [b.nut, b.nut, b.nut, b.bushingHeight]);
        const leverShadow = shadowOf("bat-lever", [0, 0, b.neck, b.length], { capsule: [0, 0, 0, 0], extent: [b.ball + b.length, b.length] });
        add(element, type, [spring("bat")], [shadow, leverShadow], (rect, [x]) => {
          const at = centre(rect), theta = (2 * x! - 1) * b.throw;
          nut.pose(0, at); bushing.pose(0, at); shadow.kind.pose(0, at); leverShadow.kind.pose(0, at);
          leverPart.pose(0, at.x, at.y, theta, b.pivot);
          // The lever's shadow: a capsule from the pivot's shadow to the ball's.
          const tipY = (b.length - b.pivot) * Math.sin(theta), tipH = b.pivot + (b.length - b.pivot) * Math.cos(theta);
          setShaderUniform(leverShadow.material, "segment", [offset[0]! * b.bushingHeight, offset[1]! * b.bushingHeight, offset[0]! * tipH, tipY + offset[1]! * tipH]);
          setShaderUniform(leverShadow.material, "first", [0, 0, b.neck + 0.6, (b.bushingHeight + tipH) / 2]);
        });
      } else if (type === "wall") {
        const w = t.wall, [plateWidth, plateHeight] = t.wall.box, [pw, pl] = w.paddle;
        const wallPlate = layer.kind("wall-plate", frustum(plateWidth, plateHeight, w.radius, w.plateHeight, w.plateTaper), pbr(plateRecipe, [1, 0]), 1);
        const paddle = tiltKind("wall-paddle", frustum(pw, pl, 3, w.paddleHeight, w.paddleTaper, w.plateHeight - 1.5), pbr(cap, [1, 0]));
        const shadow = shadowOf("wall", [plateWidth / 2, plateHeight / 2, w.radius, w.plateHeight]);
        const paddleShadow = shadowOf("wall-paddle", [pw / 2, pl / 2, 3, w.paddleHeight], { receiver: [plateWidth / 2 - w.plateTaper, plateHeight / 2 - w.plateTaper, w.radius] });
        add(element, type, [spring("wall")], [shadow, paddleShadow], (rect, [x]) => {
          const at = centre(rect);
          wallPlate.pose(0, at); shadow.kind.pose(0, at); paddleShadow.kind.pose(0, { ...at, lift: w.plateHeight });
          paddle.pose(0, at.x, at.y, (2 * x! - 1) * w.throw, w.plateHeight - 1.5 + w.paddleHeight / 2);
        });
      } else if (type === "button") {
        const b = t.button, r = b.cap / 2;
        const bezel = layer.kind("button-bezel", revolve([[b.bezel[0], 0], [b.bezel[0], b.bezelHeight - 0.6], [b.bezel[0] - 0.6, b.bezelHeight], [b.bezel[1], b.bezelHeight], [b.bezel[1], 0.4]], 96), pbr(skirt), 1);
        const ring = layer.kind("button-ring", revolve([[b.ring[0], 0.5], [b.ring[1], 0.5]], 96),
          flat(t.accent, 0.4, { strength: () => (element.getAttribute("aria-pressed") === "true" ? 1 : 0.3) }), 1);
        const body = layer.kind("button-cap", frustum(b.cap, b.cap, r, b.height, b.taper, 0, true), pbr(cap, [1, 0]), 1);
        const topPart = layer.kind("button-top", plate(b.cap - 2 * b.taper, b.cap - 2 * b.taper, r - b.taper, b.height), layer.capture("button-top"), 1);
        const shadow = shadowOf("button", [b.bezel[0], b.bezel[0], b.bezel[0], b.bezelHeight], { second: [r, r, r, b.height] });
        add(element, type, [spring("button")], [shadow], (rect, [x]) => {
          const at = centre(rect);
          bezel.pose(0, at); ring.pose(0, at); shadow.kind.pose(0, at);
          body.pose(0, { ...at, lift: -x! });
          topPart.pose(0, { ...at, lift: -x!, locked: b.height });
          setShaderUniform(shadow.material, "second", [r, r, r, b.height - x!]);
        });
      }
    }
    for (const control of controls.values()) for (const shadow of control.shadows) if (!shadows) shadow.kind.hide(0);
    flushAll();
  }

  /** The tallest point of each part and its inset from its control's box, for the harness's camera distance. */
  function envelopes(t: ResolvedTokens): Envelope[] {
    const r = t.rocker, b = t.bat, w = t.wall;
    return [
      { height: t.knob.skirtHeight + t.knob.capHeight + t.knob.pointer.rise, inset: t.knob.box / 2 - t.knob.cap / 2 },
      { height: t.small.skirtHeight + t.small.capHeight + t.small.pointer.rise, inset: t.small.box / 2 - t.small.cap / 2 },
      { height: t.fader.height + 0.1, inset: (t.fader.box - t.fader.width) / 2 + t.fader.taper },
      { height: t.slide.height + 0.1, inset: Math.min(t.slide.inset, (t.slide.box[1] - t.slide.block[1]) / 2) + t.slide.taper },
      { height: r.bezelHeight + 2 * r.end, inset: (r.box[0] - r.paddle[0]) / 2 },
      { height: b.length + b.ball, inset: b.box[1] / 2 - ((b.length - b.pivot) * Math.sin(b.throw) + b.ball) },
      { height: w.plateHeight + w.paddleHeight + 3, inset: (w.box[0] - w.paddle[0]) / 2 },
      { height: t.button.height, inset: (t.button.box - t.button.cap) / 2 + t.button.taper },
    ];
  }

  return {
    build, update, envelopes,
    setDraw(callback: () => void) { draw = callback; },
    press(element: HTMLElement, down: boolean) { if (down) pressed.add(element); else pressed.delete(element); update(element); },
    /** Shows or hides every analytic shadow (they are face shading, not objects). */
    setShadows(on: boolean) {
      shadows = on;
      for (const control of controls.values()) { control.pose(); if (!on) for (const shadow of control.shadows) shadow.kind.hide(0); }
      flushAll();
      draw();
    },
    /** True when every spring is at its target. */
    atRest: () => !frame && [...controls.values()].every(control => control.springs.every(spring => spring.x === spring.target && spring.v === 0)),
    controls: () => [...controls.values()].map(control => ({ id: control.element.id, type: control.type, rect: control.rect })),
  };
}
export type InstrumentMeshes = ReturnType<typeof createInstrumentMeshes>;
