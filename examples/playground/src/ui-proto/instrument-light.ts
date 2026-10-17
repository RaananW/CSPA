/**
 * Light, shadow and the post chain for the Phase I1 prototype's Instrument level (`instrument-mesh.ts`), carried over
 * from probes I0.3, I0.5 and I0.8 (docs/ui-library/instrument-phase0.md):
 * - **The PCF map** (I0.5, `ui-probes/instrument-shadows.ts`): a directional PCF generator of 4096 at bias 1.5e-3
 *   (≈ 1.95 px world) from the one key light, the light standing 4,000 px behind the stage with its depth range fitted
 *   to the stage; each part kind publishes the union of its placements (its control's box) as its bounds, and the map
 *   re-renders on pose change (Lite's default). Parts cast and receive; the captured face is not a mesh, so the map
 *   never reaches it. The map is never disabled here, so Lite 1.33's black-receiver bug (a generator disabled before its
 *   first pass) cannot occur.
 * - **The post chain** (I0.8, `ui-probes/instrument-post.ts`), in task order after the layer's own pass:
 *   1. the pointer light's face pass (below), on the swapchain;
 *   2. the analytic face shadows, on the swapchain (they fall outside the controls, so they are not clipped);
 *   3. the control mask: one flat rounded plate per control box into an `r8unorm` target;
 *   4. the mesh pass into a per-layer `rgba16float` + depth target cleared transparent (`sharedRt`: the targets
 *      outlive rebuilds), then SMAA;
 *   5. the emitters (the lit REC ring and lit flags) alone into an emitter target, bloomed;
 *   6. the composite over the swapchain, premultiplied, adding `max(bloom − emitters, 0)`, multiplied by the mask;
 *   7. a tops task drawing only what carries captured content (the push button's captured top and the display glass),
 *      after the composite, so no stage ever filters text.
 *   The PBR parts are in the scene (Lite's shadow task builds its casters from the scene) and drawn by the mesh task;
 *   the harness's own auto-mirrored task is disabled (the one internal read: `getFrameGraph(scene)._tasks`, as I0.5).
 * - **The pointer light** (I0.3, `ui-probes/instrument-emitters.ts`): a point emitter the visitor carries, 120 px above
 *   the face, radius 360, intensity 16,000 with Lite's clustered falloff. Its face pass multiplies the layer's box by
 *   `1 + E` (blend `dst · src + dst`), capped at `interior.max` inside the protected rects (the layer's text runs, with
 *   a feather); a Lite clustered point light at the same place lights the parts. It fades over `motion.fast`, exists
 *   only under `pointer: fine`, is off under `prefers-contrast: more`, and never carries meaning.
 * Throwaway prototype code.
 */
import {
  addClusteredLightContainer, addMeshToTask, addTaskAfter, addTaskAtStart, createBloomPostProcessTask, createClusteredLightContainer, createClusteredPointLight,
  createEffectRenderTask, createEffectWrapper, createPcfDirectionalShadowGenerator, createRenderTask, createShaderMaterial, createSmaaPostProcessTask,
  createRenderTarget, createSurfaceRenderTargetTexture, enableShaderMaterialInstanceWorld, getFrameGraph, markClusteredLightContainerDirty, setEffectTexture, setEffectUniforms, setShadowTaskCasterMeshes,
  type ClusteredLightContainer, type ClusteredPointLight, type EffectWrapper, type EngineContext, type Material, type Mesh, type RenderTargetTextureResult,
  type RenderTask, type ShaderMaterial, type ShadowGenerator, type Task,
} from "@babylonjs/lite";
import type { InstrumentLayer, Rect } from "../ui-probes/instrument-harness.ts";

export const lightTokens = {
  map: { size: 4096, bias: 1.5e-3, darkness: 0.1, lightDistance: 4000 },
  smaa: { threshold: 0.05, maxSearchSteps: 16 },
  bloom: { threshold: 0.05, weight: 0.8, kernel: 48, bloomScale: 0.5, exposure: 1 },
  /**
   * I0.3's pointer light (intensity, radius, height, colour, fade over motion.fast). `face` scales its pool on the face:
   * at I0.3's full strength the pool saturates a light faceplate and every guarded text box reads as a grey patch, so
   * the face takes 0.3 of it with a 10 px feather, and the parts take all of it (the travelling highlight).
   */
  pointer: { intensity: 16000, radius: 360, height: 120, colour: [1, 0.95, 0.88] as [number, number, number], fade: 120, feather: 10, face: 0.3 },
};

// ---- The shadow map ----

/** A PCF map from the layer's key light, its depth range fitted to the stage (I0.5). */
export function createShadowMap(layer: InstrumentLayer, engine: EngineContext, stage: { width: number; height: number }) {
  const light = layer.light, direction = light.direction, length = Math.hypot(direction.x, direction.y, direction.z) || 1;
  const L = lightTokens.map.lightDistance, R = Math.hypot(stage.width, stage.height) / 2 + 200;
  light.position.set(-(direction.x / length) * L, -(direction.y / length) * L, -(direction.z / length) * L);
  const generator: ShadowGenerator = createPcfDirectionalShadowGenerator(engine, light, { mapSize: lightTokens.map.size, bias: lightTokens.map.bias, darkness: lightTokens.map.darkness, orthoMinZ: L - R, orthoMaxZ: L + R });
  light.shadowGenerator = generator;
  return {
    generator,
    /** Every PBR part casts and receives; `bounds` is the union of its placements (layer-local box, tallest point). */
    casters(meshes: { mesh: Mesh; box: Rect; height: number }[]) {
      for (const { mesh, box, height } of meshes) {
        const [x0, y0] = layer.world(box.x, box.y + box.height), [x1, y1] = layer.world(box.x + box.width, box.y);
        mesh.boundMin = [x0 - 1, y0 - 1, -height - 1];
        mesh.boundMax = [x1 + 1, y1 + 1, 1];
        mesh.receiveShadows = true;
      }
      setShadowTaskCasterMeshes(generator, meshes.map(item => item.mesh));
    },
  };
}

// ---- The post chain ----

const transparent = { r: 0, g: 0, b: 0, a: 0 };
interface Targets { mesh: RenderTargetTextureResult; ping: RenderTargetTextureResult; mask: RenderTargetTextureResult; emitters: RenderTargetTextureResult; glow: RenderTargetTextureResult }
const targets = new Map<string, Targets>();
/** The layer's surface-sized targets, made once and reused by every rebuild (they follow surface resizes). */
function targetsOf(id: string, engine: EngineContext): Targets {
  let entry = targets.get(id);
  if (!entry) {
    const colour = (name: string) => createSurfaceRenderTargetTexture(engine, { lbl: `${id}-proto-${name}`, format: "rgba16float", samples: 1, size: engine });
    entry = {
      mesh: createSurfaceRenderTargetTexture(engine, { lbl: `${id}-proto-mesh`, format: "rgba16float", dFormat: "depth24plus", samples: 1, size: engine }),
      ping: colour("ping"), emitters: colour("emitters"), glow: colour("glow"),
      mask: createSurfaceRenderTargetTexture(engine, { lbl: `${id}-proto-mask`, format: "r8unorm", samples: 1, size: engine }),
    };
    targets.set(id, entry);
  }
  return entry;
}
const compositeWGSL = /* wgsl */ `@group(0) @binding(0) var meshColour: texture_2d<f32>;
@group(0) @binding(1) var meshMask: texture_2d<f32>;
@group(0) @binding(2) var<uniform> composite: vec4f;
@group(0) @binding(3) var glow: texture_2d<f32>;
@group(0) @binding(4) var emitters: texture_2d<f32>;
@fragment fn effectFragment(input: EffectVertexOutput) -> @location(0) vec4f {
  let texel = vec2i(floor(input.position.xy));
  var colour = textureLoad(meshColour, texel, 0);
  // Emitter bloom: the halo is the bloom result minus its source, added (light without coverage).
  if (composite.y > 0.5) { colour = vec4f(colour.rgb + max(textureLoad(glow, texel, 0).rgb - textureLoad(emitters, texel, 0).rgb, vec3f(0.0)) * composite.z, colour.a); }
  let keep = textureLoad(meshMask, texel, 0).r;
  return vec4f(min(colour.rgb, vec3f(1.0)), min(colour.a, 1.0)) * keep;
}`;
const premultiplied: GPUBlendState = { color: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" }, alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" } };
const flatVertex = /* wgsl */ `struct VertexOutput { @builtin(position) position: vec4<f32> };
@vertex fn mainVertex(input: VertexInput) -> VertexOutput {
  var out: VertexOutput;
  out.position = shaderSystem.projection * (shaderSystem.view * (getFinalWorld(input) * vec4<f32>(input.position, 1.0)));
  return out;
}`;
/** A flat colour (the mask's 1, an emitter's glow), as a uniform. */
export function flatMaterial(name: string, colour: [number, number, number, number]) {
  const material = createShaderMaterial({ name, vertexSource: flatVertex, attributes: ["position"], backFaceCulling: false,
    fragmentSource: /* wgsl */ `struct VertexOutput { @builtin(position) position: vec4<f32> };
@fragment fn mainFragment(input: VertexOutput) -> @location(0) vec4<f32> { return shaderUniforms.colour; }`,
    uniforms: ["world", "view", "projection", { name: "colour", type: "vec4<f32>", defaultValue: colour }] });
  enableShaderMaterialInstanceWorld(material);
  return material;
}

/** The layer's chain: its tasks, created empty; parts are added to them by route, then `finish` orders them. */
export function createChain(layer: InstrumentLayer, engine: EngineContext, options: { bloom: number }) {
  const rts = targetsOf(layer.id, engine);
  const shade = createRenderTask({ name: "proto-shade", rt: engine.scRT, clr: false, autoMirror: false }, engine, layer.scene);
  const mask = createRenderTask({ name: "proto-mask", rt: rts.mask.rt, sharedRt: true, clr: true, clrColor: transparent, autoMirror: false }, engine, layer.scene);
  const mesh = createRenderTask({ name: "proto-mesh", rt: rts.mesh.rt, sharedRt: true, clr: true, clrColor: transparent, autoMirror: false }, engine, layer.scene);
  const emit = createRenderTask({ name: "proto-emitters", rt: rts.emitters.rt, sharedRt: true, clr: true, clrColor: transparent, autoMirror: false }, engine, layer.scene);
  const topsDepth = createRenderTarget({ lbl: `${layer.id}-proto-tops-depth`, dFormat: "depth24plus-stencil8", samples: 1, size: engine });
  const tops = createRenderTask({ name: "proto-tops", rt: engine.scRT, depth: topsDepth, clr: false, autoMirror: false }, engine, layer.scene);
  const maskMaterial = flatMaterial(`${layer.id}-mask`, [1, 1, 1, 1]);
  let effect: EffectWrapper | undefined;
  return {
    tasks: { shade, mask, mesh, emit, tops } as Record<"shade" | "mask" | "mesh" | "emit" | "tops", RenderTask>,
    maskMaterial: maskMaterial as unknown as Material,
    /** Adds SMAA, the bloom and the composite, and puts every task before the harness's own (after `first`, if given). */
    finish(first?: Task) {
      const smaa = createSmaaPostProcessTask({ name: "proto-smaa", sourceTexture: rts.mesh.rt, targetTexture: rts.ping.rt, ...lightTokens.smaa }, engine, layer.scene);
      const bloom = createBloomPostProcessTask({ name: "proto-bloom", sourceTexture: rts.emitters.rt, targetTexture: rts.glow.rt, ...lightTokens.bloom }, engine, layer.scene);
      effect = createEffectWrapper(engine, { name: `${layer.id}-proto-composite`, fragmentWGSL: compositeWGSL, blend: premultiplied, bindings: [
        { binding: 0, kind: "texture", name: "meshColour" }, { binding: 1, kind: "texture", name: "meshMask" }, { binding: 2, kind: "uniform", name: "composite", uniformByteLength: 16 },
        { binding: 3, kind: "texture", name: "glow" }, { binding: 4, kind: "texture", name: "emitters" }] });
      setEffectTexture(effect, "meshColour", rts.ping.texture);
      setEffectTexture(effect, "meshMask", rts.mask.texture);
      setEffectTexture(effect, "glow", rts.glow.texture);
      setEffectTexture(effect, "emitters", rts.emitters.texture);
      setEffectUniforms(effect, new Float32Array([1, options.bloom > 0 ? 1 : 0, options.bloom, 0]));
      const composite = createEffectRenderTask({ name: "proto-composite", effect, target: engine.scRT, clear: false }, engine, layer.scene);
      const chain: Task[] = [...(first ? [first] : []), shade, mask, mesh, smaa, emit, bloom, composite, tops];
      const direct = (getFrameGraph(layer.scene) as unknown as { _tasks: RenderTask[] })._tasks.find(task => task.name === "scene");
      if (!direct) throw new Error("The harness's direct mesh pass was not found");
      direct.enabled = false;
      addTaskAtStart(layer.scene, chain[0]!);
      for (let index = 1; index < chain.length; index++) addTaskAfter(layer.scene, chain[index]!, chain[index - 1]!);
      return chain.map(task => task.name);
    },
    add(route: "shade" | "mask" | "mesh" | "emit" | "tops", meshPart: Mesh) {
      addMeshToTask({ shade, mask, mesh, emit, tops }[route], meshPart);
    },
    /** The bloom's strength (0 turns the halo off). */
    setBloom(value: number) { if (effect) setEffectUniforms(effect, new Float32Array([1, value > 0 ? 1 : 0, value, 0])); },
  };
}
export type Chain = ReturnType<typeof createChain>;

// ---- The pointer light ----

const RECTS = 64;
const HEADER = 5;
const VEC4S = HEADER + RECTS;
/** dst · src + dst: the canvas beneath is multiplied by 1 + E. Alpha is kept. */
const lightBlend: GPUBlendState = { color: { srcFactor: "dst", dstFactor: "one", operation: "add" }, alpha: { srcFactor: "zero", dstFactor: "one", operation: "add" } };
// I0.3's face pass for one emitter: header (dpr, frame size), the layer's box (and its radius, the guard), the emitter,
// then the protected rects.
const pointerWGSL = {
  vertex: /* wgsl */ `struct EffectVertexOutput { @builtin(position) position: vec4f, @location(0) uv: vec2f };
@vertex fn effectFullscreenVertex(@builtin(vertex_index) vertex: u32) -> EffectVertexOutput {
  let bounds = light[1];
  let size = max(light[0].yz, vec2f(1.0));
  let corner = vec2f(f32(vertex == 1u), f32(vertex == 2u)) * 2.0;
  let at = bounds.xy + corner * (bounds.zw - bounds.xy);
  var output: EffectVertexOutput;
  output.position = vec4f(at.x / size.x * 2.0 - 1.0, 1.0 - at.y / size.y * 2.0, 0.0, 1.0);
  output.uv = corner;
  return output;
}`,
  fragment: /* wgsl */ `@group(0) @binding(0) var<uniform> light: array<vec4f, ${VEC4S}>;
fn lightBox(p: vec2f, rect: vec4f, radius: f32) -> f32 {
  let half = (rect.zw - rect.xy) * 0.5;
  let q = abs(p - (rect.xy + half)) - half + vec2f(radius);
  return length(max(q, vec2f(0.0))) + min(max(q.x, q.y), 0.0) - radius;
}
@fragment fn effectFragment(input: EffectVertexOutput) -> @location(0) vec4f {
  let p = input.position.xy / light[0].x;
  let bounds = light[1];
  if (p.x < bounds.x || p.y < bounds.y || p.x > bounds.z || p.y > bounds.w || lightBox(p, bounds, light[2].x) > 0.0) { discard; }
  // Lite's clustered falloff: inverse square, a smooth window to zero at the radius, times cos θ at the face, over π.
  let a = light[3];
  let b = light[4];
  let r = p - a.xy;
  let d2 = dot(r, r) + a.z * a.z;
  let range2 = a.w * a.w;
  if (d2 >= range2 || b.w <= 0.0) { discard; }
  let f = d2 / range2;
  let window = (1.0 - f * f) * (1.0 - f * f);
  var e = b.rgb * (b.w * window * a.z / (sqrt(d2) * d2 * 3.141592653589793));
  // The contrast guard: inside a protected rect (and over the feather around it) E is capped at interior.max.
  let guard = light[2];
  var protect = 0.0;
  for (var k = 0u; k < u32(guard.w); k++) { protect = max(protect, 1.0 - smoothstep(0.0, guard.y, lightBox(p, light[${HEADER}u + k], 0.0))); }
  e = mix(e, min(e, vec3f(guard.z)), protect);
  return vec4f(e, 1.0);
}`,
};

/** Layer-local boxes of every text run in the layer (the protected rects). */
function textRects(layer: InstrumentLayer) {
  const base = layer.element.getBoundingClientRect(), rects: Rect[] = [];
  const walker = document.createTreeWalker(layer.element, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.textContent?.trim()) continue;
    const range = document.createRange();
    range.selectNodeContents(node);
    for (const box of range.getClientRects()) if (box.width > 0 && box.height > 0) rects.push({ x: box.left - base.left, y: box.top - base.top, width: box.width, height: box.height });
  }
  return rects;
}

/**
 * The pointer light in one layer: the face pass (returned as the chain's first task) and a clustered point light for
 * the parts. `write(x, y, alpha)` places it (canvas CSS px) and fades it; uniform writes only, no capture.
 */
export function createPointerLight(layer: InstrumentLayer, engine: EngineContext, options: { stage: { width: number; height: number }; radius: number; interiorMax: number }) {
  const t = lightTokens.pointer, panel = layer.element;
  const box = { x: layer.origin.x, y: layer.origin.y, width: panel.offsetWidth, height: panel.offsetHeight };
  const rects = textRects(layer).slice(0, RECTS);
  const effect = createEffectWrapper(engine, { name: `pointer-${panel.id}`, vertexWGSL: pointerWGSL.vertex, fragmentWGSL: pointerWGSL.fragment,
    bindings: [{ binding: 0, kind: "uniform", uniformByteLength: VEC4S * 16, visibility: 3 }], blend: lightBlend });
  const task = createEffectRenderTask({ name: `pointer-${panel.id}`, effect, target: engine.scRT, clear: false }, engine, layer.scene);
  const data = new Float32Array(VEC4S * 4);
  let container: ClusteredLightContainer | undefined, clustered: ClusteredPointLight | undefined;
  try {
    container = createClusteredLightContainer();
    clustered = createClusteredPointLight(container, { position: layer.world(-1e4, -1e4, t.height), diffuse: t.colour, range: t.radius, intensity: 0 });
    addClusteredLightContainer(layer.scene, container);
  } catch { container = undefined; clustered = undefined; }
  const write = (x: number, y: number, alpha: number) => {
    data.fill(0);
    data.set([window.devicePixelRatio, options.stage.width, options.stage.height, 0], 0);
    data.set([box.x, box.y, box.x + box.width, box.y + box.height], 4);
    data.set([options.radius, t.feather, options.interiorMax, rects.length], 8);
    data.set([x, y, t.height, t.radius], 12);
    data.set([...t.colour, t.intensity * t.face * alpha], 16);
    rects.forEach((rect, index) => data.set([rect.x + box.x, rect.y + box.y, rect.x + box.x + rect.width, rect.y + box.y + rect.height], (HEADER + index) * 4));
    setEffectUniforms(effect, data);
    if (clustered && container) {
      clustered.position = layer.world(x - box.x, y - box.y, t.height);
      clustered.intensity = t.intensity * alpha;
      markClusteredLightContainerDirty(container);
    }
  };
  write(-1e4, -1e4, 0);
  return { task, write, clustered: !!clustered, protectedRects: rects.length };
}
export type PointerLight = ReturnType<typeof createPointerLight>;
export type { ShaderMaterial };
