/**
 * The Instrument probe harness (docs/ui-library/instrument.md, Phase I0): real enrolled panels of native controls on
 * the Underglass runtime, plus one Babylon Lite mesh scene per layer, drawn inside core's shared engine right after
 * that layer's own pass (core's Phase I0 prototype hook, `InstrumentProbeHook` in `packages/core/src/renderer.ts`).
 * Each layer scene has its own depth buffer, cleared every frame, so a layer's parts occlude each other and the next
 * layer's face hides them: panels keep their painter's order. I0.1 (`instrument.ts`) is the first probe on it; the
 * later probes (moving parts, emitters, materials, shadows, the post chain) build on the same API.
 *
 * API (`startInstrument(options)` returns an `InstrumentHarness`):
 * - `options.mount(root)` creates the panels as direct children of the Underglass root and returns them in paint
 *   order; each is enrolled as a layer under its `id`. `options.build(layer)` adds part kinds to a layer's scene
 *   before it registers; it runs again on `rebuild()` (after layout, density or token changes).
 * - World units are canvas CSS px, y up, +z away from the viewer, the stage centre at the origin. One perspective
 *   stage camera at distance `D` maps the face plane z = 0 1:1 onto the canvas. `D` is derived from the stage's half
 *   diagonal `r` and `options.envelopes` (each a part height `h` and the inset of that height from its control's box):
 *   `D = max(minDistance, max(r · h / inset + h))`, so perspective drift never takes a drawn pixel outside its control.
 * - `InstrumentLayer`: `scene` (a Lite `SceneContext` on core's engine), `camera`, `light` (the one key light, from
 *   `options.light` azimuth and elevation), `fill`, `origin` (the layer's stage position), `rectOf(element)`
 *   (layer-local CSS px), `world(x, y, h)`, `kind(name, data, material, capacity)` and `capture(name)`.
 * - `PartKind`: one mesh, thin-instanced up to `capacity`. `pose(index, pose)` writes an instance from a `Pose`
 *   (layer-local anchor, `lift` towards the viewer, `angle` about the part's axis, `locked` for a screen-locked part)
 *   and `hide(index)` collapses one; `flush()` uploads what changed. Poses are uniform changes: they never capture.
 * - `capture(name)` is the screen-locked captured top: a ShaderMaterial that loads the layer's own capture texel at
 *   each pixel, so labels on caps stay texel-exact. Its part must be drawn `locked` at its own height.
 * - `draw()` is core's frame (geometry check, uniforms, context order, one `renderFrame`); `setMeshes(false)` takes
 *   every layer scene off the surface (the reference frame for pixel diffs); `readback()` resolves a decoded frame;
 *   `counts()` reads core's capture, upload, frame and geometry counters; `measure(frames, step)` runs `step` and a
 *   core frame per animation frame and returns timing statistics; `gpuTimings()` reads Lite's per-task GPU timings.
 */
import {
  addTask, addToScene, captureScreenshot, createRenderTarget, createRenderTask, createDirectionalLight, createFreeCamera, createHemisphericLight, createSceneContext,
  createShaderMaterial, disposeScene, enableShaderMaterialInstanceWorld, getRenderTaskGpuTimings, isGpuTimingSupported,
  registerScene, setGpuTimingEnabled, setRenderTaskGpuTimingEnabled, setShaderTexture, setShaderUniform, setThinInstances,
  flushThinInstances, vec3, waitForGpuIdle,
  type DirectionalLight, type EngineContext, type FreeCamera, type Material, type Mesh, type RenderingContext, type SceneContext,
  type Screenshot, type ShaderMaterial,
} from "@babylonjs/lite";
import { createCanvasHosts, mountApplicationModule, type CanvasController } from "@underglass/core";
import { partMesh, type PartData } from "./instrument-parts.ts";
import { offsetWithin, type Point } from "./common.ts";

export interface Rect { x: number; y: number; width: number; height: number }
/** The tallest point of a part kind and how far that point stays inside its control's box (CSS px). */
export interface Envelope { height: number; inset: number }
/** One instance's placement, in its layer's CSS px. */
export interface Pose {
  /** The part's anchor, layer-local. */
  x: number; y: number;
  /** Movement towards the viewer (negative: into the face, as a pressed key travels). */
  lift?: number;
  /** Turn about the part's own z axis, radians, counter-clockwise on screen. */
  angle?: number;
  /** Uniform scale in the face plane. */
  scale?: number;
  /** A screen-locked part: the height its geometry stands at, so it projects onto exactly its layer-local pixels. */
  locked?: number;
}
export interface PartKind { name: string; mesh: Mesh; capacity: number; pose(index: number, pose: Pose): void; hide(index: number): void; flush(): void }
export interface InstrumentLayer {
  id: string; element: HTMLElement;
  /** The layer's top-left on the stage, in canvas CSS px, when its scene was built. */
  origin: Point;
  scene: SceneContext; camera: FreeCamera; light: DirectionalLight;
  rectOf(element: HTMLElement): Rect;
  world(x: number, y: number, h?: number): [number, number, number];
  kind(name: string, data: PartData, material: Material, capacity: number): PartKind;
  capture(name: string): Material;
  kinds: PartKind[];
}
export interface InstrumentHarnessOptions {
  frame: HTMLElement;
  mount(root: HTMLDivElement): HTMLElement[];
  build(layer: InstrumentLayer): void | Promise<void>;
  envelopes: readonly Envelope[];
  /** The key light: azimuth clockwise from the top of the screen, elevation above the face, in degrees. */
  light: { azimuth: number; elevation: number };
  minDistance?: number;
  budgets?: { layers: number; pixels: number };
  onStatus?(message: string): void;
}
export interface FrameStats { frames: number; mean: number; p50: number; p95: number; max: number }

const statistics = (values: number[]): FrameStats => {
  const sorted = [...values].sort((a, b) => a - b), at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] ?? 0;
  return { frames: values.length, mean: values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length), p50: at(0.5), p95: at(0.95), max: sorted.at(-1) ?? 0 };
};
const nextFrame = () => new Promise<number>(resolve => requestAnimationFrame(resolve));

// The screen-locked captured top: each pixel loads its layer's capture texel, so the label is exact by construction.
const captureVertex = /* wgsl */ `struct VertexOutput { @builtin(position) position: vec4<f32> };
@vertex fn mainVertex(input: VertexInput) -> VertexOutput {
  var out: VertexOutput;
  out.position = shaderSystem.projection * (shaderSystem.view * (getFinalWorld(input) * vec4<f32>(input.position, 1.0)));
  return out;
}`;
const captureFragment = /* wgsl */ `struct VertexOutput { @builtin(position) position: vec4<f32> };
@fragment fn mainFragment(input: VertexOutput) -> @location(0) vec4<f32> {
  let texel = vec2<i32>(floor(input.position.xy - shaderUniforms.origin.xy));
  return vec4<f32>(textureLoad(capture, texel, 0).rgb, 1.0);
}`;

/** Mounts the panels, enables GPU presentation and builds one mesh scene per layer. */
export async function startInstrument(options: InstrumentHarnessOptions) {
  const hosts = createCanvasHosts(options.frame);
  let root!: HTMLDivElement;
  let panels: HTMLElement[] = [];
  let engine: EngineContext | undefined;
  let coreDraw: (() => void) | undefined;
  let meshes = true;
  // Layer scenes by layer id; `building` is the rebuild in flight.
  let layers = new Map<string, InstrumentLayer & { captures: { material: ShaderMaterial; bound?: unknown; origin?: string }[] }>();
  let building: Promise<void> | undefined;
  let attached!: () => void;
  const attachedOnce = new Promise<void>(resolve => { attached = resolve; });
  const diagnostics: string[] = [];
  // Each layer's current capture texture, as core last presented it.
  const textures = new Map<string, unknown>();
  const dpr = window.devicePixelRatio;
  const stage = () => ({ width: options.frame.clientWidth, height: options.frame.clientHeight });
  const camera = { distance: 0 };
  /** Camera distance for the current stage: no envelope's perspective drift may exceed its inset. */
  const deriveDistance = () => {
    const { width, height } = stage(), r = Math.hypot(width, height) / 2;
    return Math.ceil(Math.max(options.minDistance ?? 2400, ...options.envelopes.map(({ height: h, inset }) => (r * h) / inset + h)));
  };
  /** Largest on-screen drift of a point `h` above the face, over the stage. */
  const drift = (h: number) => { const { width, height } = stage(); return (Math.hypot(width, height) / 2 * h) / (camera.distance - h); };

  // Core's Phase I0 prototype hook: core draws each returned scene right after its layer's pass.
  const instrumentProbe = {
    attach(access: { engine: EngineContext; draw(): void }) { engine = access.engine; coreDraw = access.draw; attached(); },
    contexts(layer: { id: string; matrix(): DOMMatrix; texture: unknown }): readonly RenderingContext[] {
      textures.set(layer.id, layer.texture);
      const entry = layers.get(layer.id);
      if (!entry || !meshes) return [];
      const matrix = layer.matrix();
      if (Math.abs(matrix.e - entry.origin.x) > 1e-3 || Math.abs(matrix.f - entry.origin.y) > 1e-3) {
        const message = `Layer ${layer.id} moved from its built origin (${entry.origin.x}, ${entry.origin.y}) to (${matrix.e}, ${matrix.f}); rebuild needed`;
        if (diagnostics.at(-1) !== message) diagnostics.push(message);
      }
      // The capture is replaced when the composition is rebuilt (layout, DPR): the captured tops follow it.
      for (const capture of entry.captures) {
        if (capture.bound !== layer.texture) { setShaderTexture(capture.material, "capture", layer.texture as never); capture.bound = layer.texture; }
        const origin = `${matrix.e * dpr},${matrix.f * dpr}`;
        if (capture.origin !== origin) { setShaderUniform(capture.material, "origin", [matrix.e * dpr, matrix.f * dpr, 0, 0]); capture.origin = origin; }
      }
      return [entry.scene];
    },
    detach() { for (const entry of layers.values()) disposeScene(entry.scene); layers = new Map(); engine = undefined; coreDraw = undefined; },
  };
  const runtimeOptions = {
    ...hosts, budgets: options.budgets, instrumentProbe,
    onStatusChange: (status: { mode: string; reason: string }) => options.onStatus?.(`${status.mode}: ${status.reason}`),
  };
  const controller: CanvasController = mountApplicationModule(runtimeOptions, { mount({ container }) {
    root = container;
    panels = options.mount(container);
    return () => { for (const panel of panels) panel.remove(); };
  } });
  // Each panel is a direct child of the root, enrolled as one layer under its id.
  for (const panel of panels) controller.enroll(panel, { id: panel.id });

  /** Builds a scene for one layer: stage camera, key light, fill, and the parts `options.build` adds. */
  async function buildLayer(panel: HTMLElement) {
    const { width, height } = stage();
    const origin = offsetWithin(panel, root);
    // The scene draws over what core has drawn so far (colour loaded, never cleared) with its own depth buffer, which
    // its task owns and clears every frame: Lite would clear the colour of the first scene after effect passes.
    const scene = createSceneContext(engine!, { defaultRenderTask: false });
    const depth = createRenderTarget({ lbl: `${panel.id}-instrument-depth`, dFormat: "depth24plus-stencil8", samples: 1, size: engine! });
    addTask(scene, createRenderTask({ name: "scene", rt: engine!.scRT, depth, clr: false }, engine!, scene));
    scene.imageProcessing = { exposure: 1, contrast: 1, toneMappingEnabled: false };
    const D = camera.distance;
    const view = createFreeCamera(vec3(0, 0, -D), vec3(0, 0, 0));
    view.nearPlane = D / 4; view.farPlane = D * 2;
    // Vertical field of view that maps the z = 0 plane 1:1 onto the canvas.
    view.fov = 2 * Math.atan(height / 2 / D);
    scene.camera = view;
    // Lite's light direction is the way light travels, in world axes (y up, +z away from the viewer).
    const a = (options.light.azimuth * Math.PI) / 180, e = (options.light.elevation * Math.PI) / 180;
    const towards = [Math.sin(a) * Math.cos(e), Math.cos(a) * Math.cos(e), -Math.sin(e)];
    const light = createDirectionalLight([-towards[0]!, -towards[1]!, -towards[2]!], 1.6);
    addToScene(scene, light);
    addToScene(scene, createHemisphericLight([0, 0, -1], 0.55));
    const world = (x: number, y: number, h = 0): [number, number, number] => [origin.x + x - width / 2, height / 2 - (origin.y + y), -h];
    const kinds: PartKind[] = [];
    const captures: { material: ShaderMaterial; bound?: unknown; origin?: string }[] = [];
    const layer: InstrumentLayer = {
      id: panel.id, element: panel, origin, scene, camera: view, light, kinds,
      // Layout boxes relative to the panel, unrounded (offsetLeft and offsetTop round to whole px; a centred control
      // often sits on a half pixel).
      rectOf: element => {
        const box = element.getBoundingClientRect(), base = panel.getBoundingClientRect();
        return { x: box.left - base.left, y: box.top - base.top, width: box.width, height: box.height };
      },
      world,
      kind(name, data, material, capacity) {
        const mesh = partMesh(engine!, `${panel.id}-${name}`, data);
        mesh.material = material;
        const matrices = new Float32Array(Math.max(1, capacity) * 16);
        // Every instance starts collapsed (zero scale), so an unposed slot draws nothing.
        setThinInstances(mesh, matrices, Math.max(1, capacity));
        addToScene(scene, mesh);
        let dirty = false;
        const kind: PartKind = {
          name, mesh, capacity,
          pose(index, pose) {
            const [wx, wy] = world(pose.x, pose.y);
            const lift = pose.lift ?? 0, c = Math.cos(pose.angle ?? 0), s = Math.sin(pose.angle ?? 0);
            // Screen lock: a point at height h is pulled towards the vanishing point by (D − h) / D, which perspective undoes.
            const lock = pose.locked === undefined ? 1 : (D - (pose.locked + lift)) / D, k = lock * (pose.scale ?? 1);
            matrices.set([k * c, k * s, 0, 0, -k * s, k * c, 0, 0, 0, 0, 1, 0, lock * wx, lock * wy, -lift, 1], index * 16);
            dirty = true;
          },
          hide(index) { matrices.fill(0, index * 16, index * 16 + 16); dirty = true; },
          flush() { if (dirty) { flushThinInstances(mesh); dirty = false; } },
        };
        kinds.push(kind);
        return kind;
      },
      capture(name) {
        const material = createShaderMaterial({ name, vertexSource: captureVertex, fragmentSource: captureFragment, attributes: ["position"],
          uniforms: ["world", "view", "projection", { name: "origin", type: "vec4<f32>", defaultValue: [origin.x * dpr, origin.y * dpr, 0, 0] }],
          samplers: ["capture"], backFaceCulling: false });
        enableShaderMaterialInstanceWorld(material);
        captures.push({ material });
        return material as unknown as Material;
      },
    };
    await options.build(layer);
    for (const kind of kinds) kind.flush();
    return { ...layer, captures };
  }
  /** Rebuilds every layer's scene; the old scenes stay drawn until the new ones are registered. */
  async function rebuild() {
    await attachedOnce;
    const run = (async () => {
      await controller.settle();
      camera.distance = deriveDistance();
      const next = new Map<string, Awaited<ReturnType<typeof buildLayer>>>();
      for (const panel of panels) next.set(panel.id, await buildLayer(panel));
      // A captured top binds its layer's capture before the scene registers (core reports it on every frame).
      draw();
      for (const entry of next.values()) {
        const texture = textures.get(entry.id);
        if (!texture) throw new Error(`No capture presented for layer ${entry.id}`);
        for (const capture of entry.captures) { setShaderTexture(capture.material, "capture", texture as never); capture.bound = texture; }
      }
      for (const entry of next.values()) await registerScene(entry.scene);
      const previous = layers;
      layers = next;
      draw();
      for (const entry of previous.values()) disposeScene(entry.scene);
    })();
    building = run;
    try { await run; } finally { if (building === run) building = undefined; }
  }
  function draw() { coreDraw?.(); }
  const counts = () => {
    const state = controller.state() as unknown as { mode: string; reason: string; metrics: { captures: number; uploads: number; gpuFrames: number; geometryUpdates: number } };
    return { mode: state.mode, reason: state.reason, captures: state.metrics.captures, uploads: state.metrics.uploads, gpuFrames: state.metrics.gpuFrames, geometryUpdates: state.metrics.geometryUpdates };
  };
  /** Resolves a decoded frame of the canvas; a screenshot completes over later frames, so frames are drawn until it does. */
  async function readback(): Promise<Screenshot> {
    if (!engine) throw new Error("GPU presentation is not active");
    let done = false;
    const shot = captureScreenshot(engine.surfaces[0]!).then(result => { done = true; return result; });
    for (let guard = 0; !done && guard < 120; guard++) { draw(); await nextFrame(); }
    if (!done) throw new Error("GPU readback did not complete");
    return shot;
  }
  /** RGBA of `shot` at a client point. */
  function pixel(shot: Screenshot, client: Point): number[] {
    const box = hosts.outputCanvas.getBoundingClientRect();
    const x = Math.floor((client.x - box.left) * dpr), y = Math.floor((client.y - box.top) * dpr);
    const offset = (y * shot.width + x) * 4;
    return [...shot.data.subarray(offset, offset + 4)];
  }
  /**
   * Runs `frames` animation frames: `step(index)` poses parts, then core draws, then the GPU is awaited. Returns the
   * work time per frame (step to GPU idle), the CPU part (step and draw), the interval between frames, and Lite's GPU
   * frame time when the device has timestamp queries.
   */
  async function measure(frames: number, step: (index: number) => void) {
    if (!engine) throw new Error("GPU presentation is not active");
    const timed = isGpuTimingSupported(engine);
    if (timed) setGpuTimingEnabled(engine, true);
    const taskTimings = await setRenderTaskGpuTimingEnabled(engine, true).catch(error => ({ status: "error", error: String(error) }));
    const work: number[] = [], cpu: number[] = [], intervals: number[] = [], gpu: number[] = [], meshPass: number[] = [];
    let previous: number | undefined;
    const device = (hosts.outputCanvas.getContext("webgpu") as unknown as { getConfiguration(): { device: GPUDevice } }).getConfiguration().device;
    for (let index = 0; index < frames; index++) {
      const now = await nextFrame();
      if (previous !== undefined) intervals.push(now - previous);
      previous = now;
      const started = performance.now();
      step(index);
      draw();
      cpu.push(performance.now() - started);
      await device.queue.onSubmittedWorkDone();
      work.push(performance.now() - started);
      if (timed && engine.gpuFrameTimeMs > 0) gpu.push(engine.gpuFrameTimeMs);
      const tasks = getRenderTaskGpuTimings(engine);
      if (tasks.status === "available") meshPass.push(tasks.tasks.filter(task => task.name === "scene").reduce((sum, task) => sum + task.durationMs, 0));
    }
    const lastTasks = getRenderTaskGpuTimings(engine);
    return { work: statistics(work), cpu: statistics(cpu), intervals: statistics(intervals),
      gpu: gpu.length ? statistics(gpu) : null, meshPass: meshPass.length ? statistics(meshPass) : null,
      gpuTiming: { frameTimestamps: timed, tasks: { status: lastTasks.status, initial: taskTimings.status, supported: lastTasks.supported, perTask: lastTasks.tasks.map(task => ({ ...task })) } } };
  }

  await controller.enable();
  if (counts().mode !== "gpu") throw new Error(`GPU presentation unavailable: ${counts().reason}`);
  await rebuild();
  return {
    controller, root: () => root, panels: () => panels, hosts, dpr,
    engine: () => engine, camera: () => ({ distance: camera.distance, ...stage() }), drift,
    layers: () => [...layers.values()] as InstrumentLayer[],
    rebuild, draw, readback, pixel, counts, measure, diagnostics,
    idle: async () => { if (building) await building; await controller.settle(); if (engine) await waitForGpuIdle(engine); },
    setMeshes(on: boolean) { meshes = on; draw(); },
    meshes: () => meshes,
    gpuTimings: () => (engine ? { frame: engine.gpuFrameTimeMs, supported: isGpuTimingSupported(engine), tasks: getRenderTaskGpuTimings(engine) } : null),
  };
}
export type InstrumentHarness = Awaited<ReturnType<typeof startInstrument>>;
