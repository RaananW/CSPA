/**
 * The WebGPU surface renderer behind one `CanvasRuntime` (`runtime.ts`, its only library caller).
 * `createSurfaceRenderer` owns the mount boundary, the owning `content="drawable"` output canvas and the one
 * shared Babylon Lite engine, and moves the original React root between the ordinary DOM host and that canvas.
 *
 * In GPU mode the browser's native `paint` uploads each enrolled layer straight into its own public
 * `DynamicTexture2D` (`GPUQueue.drawElementImageToTexture`), and each layer is drawn as its own blended effect
 * pass after a white background clear. One canonical matrix per layer drives both the native hit geometry
 * (`updateElementGeometry`) and the shader's inverse sampling. Membership, layout and DPR changes prepare a
 * complete successor composition while the last complete one stays presented; superseded GPU resources are
 * released only after a queue fence or device loss. Lifecycle transitions are serialized on one promise chain.
 *
 * Coordinate spaces: layer matrices map layer-local CSS pixels to the canvas content box (CSS pixels). Native
 * geometry is registered relative to the canvas border box, so it adds `nativeOrigin`. The output bitmap and
 * layer textures are in device pixels (CSS size times DPR).
 */
import {
  createEngine, disposeEngine, createDynamicTexture, releaseTexture,
  createEffectWrapper, disposeEffectWrapper, setEffectTexture, setEffectUniforms,
  createEffectRenderer, disposeEffectRenderer, registerEffectRenderer, unregisterEffectRenderer,
  setEngineSize, renderFrame, captureScreenshot, getRenderingContexts,
  type EngineContext, type DynamicTexture2D, type EffectWrapper, type RenderingContext,
} from "@babylonjs/lite";
import { capabilities, enableDrawable, isDrawableCanvas, isDrawableQueue, validateGeometry, validateAppliedGeometry, type DrawableCanvas, type DrawableQueue } from "./native.js";
import { completeCoverage, type CaptureCoverage } from "./publication.js";
import { createMountBoundary, type MountBoundaryOptions } from "./mount-boundary.js";
import { configuredDevice, observeConfiguredDevice, waitForTeardown, type IdleOutcome } from "./device-lifecycle.js";
import { layerBlend, layerShader, layerUniforms, passShaders, type PassShaders } from "./composition.js";
import { RELIEF_VEC4S, reliefUniforms } from "./relief.js";
import { createAdmissionProbe, verifyFrameBounds, verifyProbeGeometry, verifyProbePixels, verifyProjectiveHits, type FrameBounds } from "./admission.js";
import type { Ripple } from "./ripple.js";
import { isSceneMaterial, type ApplicationEffect, type EffectDescriptor, type MaterialDescriptor } from "./effects.js";
import type { CompiledMotion, CompiledProgramSet } from "./compiled.js";
import { instrumentFaceScene } from "./instrument.js";
import { createInstrumentController, INSTRUMENT_SUCCESSOR_DEFERRAL_MS, type InstrumentController, type InstrumentLayerInput } from "./instrument-pass.js";

/**
 * One enrolled layer as the runtime describes it to the renderer. The callbacks are read again on every
 * reconcile and frame, so they always report current values.
 */
export interface EnrolledLayer {
  /** Stable layer identity; keys dirty tracking, texture slots and per-layer metrics. */
  id: string;
  /** The original enrolled element; in GPU mode it must be a connected `drawable` inside the output canvas. */
  element: HTMLElement;
  /** Layer-local CSS pixels to canvas content-box CSS pixels. Must be finite, 2D and invertible. */
  matrix(): DOMMatrix;
  /**
   * Layer-local clip rectangle in CSS pixels for the given canvas-space matrix, applied to both native hits and
   * GPU drawing. `undefined` (or no callback) means the element's whole border box.
   */
  clip?(matrix?: DOMMatrixReadOnly): { x: number; y: number; width: number; height: number } | undefined;
  /** Layer opacity, multiplied into the drawn alpha. */
  opacity(): number;
  /** Decorative ripple displacement for this layer, if any. */
  ripple?(): Ripple | undefined;
  /** Shader effect chain for this layer, packed into its uniforms. */
  effects?(): readonly EffectDescriptor[];
  /** `false` draws the layer with no effects (the runtime uses this for reduced motion). */
  effectsEnabled?(): boolean;
  /** The layer's persistent material, packed into its uniforms and applied before its effects. */
  material?(): MaterialDescriptor | undefined;
  /** Build-time compiled motion currently driving this layer, sampled in the shader. */
  compiledMotion?(): CompiledMotion | undefined;
}

/** Structured renderer status delivered to `onStatusChange`; exported publicly as `CanvasStatus`. */
export interface RendererStatus {
  /**
   * `dom`: ordinary DOM presentation; `admitting`: functional admission in progress; `gpu`: GPU-presented;
   * `disposed`: the root and canvases have been released.
   */
  mode: "dom" | "admitting" | "gpu" | "disposed";
  /** Why the renderer is in this mode, or the diagnosis of the last failure or fallback. */
  reason: string;
  /** Live counts of owned resources (engines, textures, effects, renderers, listeners, pending cleanups and so on). */
  resources: Record<string, number>;
  /** Cumulative native capture, pixel copy, texture upload and GPU frame counts. */
  counts: { captures: number; pixelCopies: number; uploads: number; gpuFrames: number };
  /** Fixed description of the recovery strategy. */
  recovery: string;
  /** Fixed description of how device loss is handled. */
  deviceLoss: string;
  /** The most recent (up to 256) GPU device losses and what was running when each happened. */
  deviceLosses: { reason: GPUDeviceLostReason; message: string; duringMotion: boolean; duringAdmission: boolean }[];
  /** The most recent (up to 256) GPU-idle fence outcomes from teardown. */
  fenceOutcomes: IdleOutcome[];
}
/** Options for `createSurfaceRenderer`: the mount boundary plus callbacks into the owning runtime. */
export interface SurfaceRendererOptions extends MountBoundaryOptions {
  /** Serialized `RendererStatus` JSON, kept for compatibility. */
  onStatus?(message: string): void;
  /** Receives a fresh status snapshot after every lifecycle or status change. */
  onStatusChange?(status: RendererStatus): void;
  /** Current enrolled layers in paint order (DOM order). */
  layers(): EnrolledLayer[];
  /** Frame size in CSS pixels and the device pixel ratio; the output bitmap is `width * dpr` by `height * dpr`. */
  size(): { width: number; height: number; dpr: number };
  /**
   * Offset in CSS pixels from the output canvas border box to its content box (border plus padding). Added to
   * native geometry only; GPU composition stays content-box local.
   */
  nativeOrigin?(): { x: number; y: number };
  /**
   * A non-empty string is a diagnosed reason GPU cannot present the current state; the renderer then recovers
   * to ordinary DOM with that reason.
   */
  policy?(): string | undefined;
  /** Called when the root switches presentation, so the runtime can switch layer styling to match. */
  presentation?(mode: "dom" | "gpu"): void;
  /** Called when scheduled frames and in-flight GPU motion are cancelled. */
  onInterrupt?(): void;
  /** Called with the reason once ordinary DOM presentation has been restored. */
  onRecovery?(reason: string): void;
  /** Whether runtime motion is running; recorded with device losses. */
  isMoving?(): boolean;
  /** Whether the document is hidden; drawing and paint requests are skipped while it is. */
  isPaused?(): boolean;
  /**
   * Layer-count and captured-pixel limits (default 32 layers and 2,000,000 CSS pixels). The output bitmap is
   * additionally limited to four times the pixel budget.
   */
  budgets?: { layers: number; pixels: number };
  /** Build-time compiled programs; when set, they replace runtime shader generation and runtime custom effects. */
  compiled?: CompiledProgramSet;
  /** Synchronous per-operation timing samples; see `RendererSample`. */
  onMeasure?(sample: RendererSample): void;
  /**
   * @internal Phase I0 prototype path (`docs/ui-library/instrument.md`, probe I0.1); see `InstrumentProbeHook`. Not
   * part of the public API and not on `RuntimeOptions`: a playground probe passes it through the runtime's options
   * object. Phase I2 replaces it with the `instrument` material.
   */
  instrumentProbe?: InstrumentProbeHook;
  /** @internal Tests only, like `instrumentProbe`: hooks into the instrument material's builds (see `instrument-pass.ts`). */
  instrumentTestHook?: { beforeBuild?(layerId: string): Promise<void> | void };
}
/**
 * @internal Phase I0 prototype path for the Instrument level's mesh pass (probe I0.1), to be replaced by the
 * `instrument` material in Phase I2. It lets a probe draw Lite rendering contexts (one mesh scene per layer, each
 * with its own depth buffer, cleared every frame) on the shared engine, each right after its layer's own pass, so
 * the layers keep their painter's order. Core registers nothing for the probe: the probe creates and registers its
 * scenes on `access.engine`, and core only orders the registered ones on the surface before every frame it draws.
 */
export interface InstrumentProbeHook {
  /** Called once GPU presentation is active, with the admitted engine and core's own frame entry point. */
  attach(access: InstrumentProbeAccess): void;
  /**
   * The registered contexts to draw right after `layer`'s pass, in order; read before every frame. A context returned
   * earlier and not now is taken off the surface until it is returned again.
   */
  contexts(layer: InstrumentProbeLayer): readonly RenderingContext[];
  /** Called before the engine is released; the probe disposes its scenes here. */
  detach(): void;
}
/** @internal What `InstrumentProbeHook.attach` receives. */
export interface InstrumentProbeAccess {
  engine: EngineContext;
  /** Core's frame: geometry check, uniforms, context order and one `renderFrame`. Does nothing outside GPU mode. */
  draw(): void;
}
/** @internal One presented layer as `InstrumentProbeHook.contexts` sees it. */
export interface InstrumentProbeLayer {
  id: string;
  element: HTMLElement;
  /** Layer-local CSS px to canvas content-box CSS px, as drawn and hit-tested. */
  matrix(): DOMMatrix;
  /** The layer's capture (device px, top-left at layer-local 0, 0); it changes when the composition is rebuilt. */
  texture: DynamicTexture2D;
}
/** One timing sample passed to `onMeasure`. */
export interface RendererSample {
  /** `instrumentGpuMs`: the GPU time of one instrument layer's mesh pass in one frame (Lite's per-task timings). */
  kind: "captureMs" | "uploadMs" | "frameWorkMs" | "frameIntervalsMs" | "readbackCompareMs" | "effectCompileMs" | "instrumentGpuMs";
  /** `performance.now()` time when the sample was taken, in milliseconds. */
  at: number;
  durationMs: number;
  /** Whether the work belonged to functional admission or to ordinary content updates. */
  phase: "admission" | "content";
  layerId?: string;
  /** RGBA bytes uploaded, for capture and upload samples. */
  bytes?: number;
}

/**
 * Creates the renderer for one surface and mounts the React root in ordinary DOM through
 * `createMountBoundary`. GPU mode starts only on `enable()`. The returned object is driven by `CanvasRuntime`:
 * `enable`/`disable`/`dispose` are serialized lifecycle operations; `reconcile`, `reconcileGeometry` and `draw`
 * apply layer, layout and transform updates; `invalidate` marks content for recapture; `pause`/`resume` follow
 * document visibility; `recover` performs a diagnosed fallback; `state` returns diagnostics. Throws if the mount
 * boundary is invalid.
 */
export function createSurfaceRenderer(options: SurfaceRendererOptions) {
  const { outputCanvas: output, ordinaryHost: ordinary } = options;
  const boundary = createMountBoundary(options);
  const container = boundary.container;
  // The output canvas is also the native capture host: it owns the WebGPU context and the drawable originals.
  const host = output;
  // GPU mode forces `pointer-events: auto` on the output; DOM presentation restores the caller's inline value.
  const outputPointer = { value: output.style.getPropertyValue("pointer-events"), priority: output.style.getPropertyPriority("pointer-events") };
  let drawable: DrawableCanvas | undefined;
  /** The output canvas typed as a drawable canvas; throws until `enable` has verified its capabilities. */
  function nativeHost(): DrawableCanvas {
    if (!drawable) throw new Error("Native canvas has not passed admission");
    return drawable;
  }
  // Live counts of owned resources, reported in status and used by tests to prove nothing leaks. The root and
  // the `captureCanvases`/`outputCanvases` entries count from construction until `dispose`.
  const resources = { roots: 1, captureCanvases: 1, outputCanvases: 1, engines: 0, pendingEngines: 0, textures: 0, effects: 0, renderers: 0, stagingCanvases: 0, snapshots: 0, comparisonBuffers: 0, listeners: 0, scheduledFrames: 0, paintWaits: 0, lossObservers: 0, pendingCleanups: 0, probeElements: 0, probeReadbacks: 0 };
  // Metrics are cumulative counters and aggregates plus bounded 256-entry sample histories (see `sample`).
  const timing = () => ({ count: 0, totalMs: 0, minMs: null as number | null, maxMs: null as number | null });
  const layerMetrics: Record<string, { captures: number; pixelCopies: number; pixelReadbacks: number; uploads: number }> = Object.create(null);
  const metrics = { captures: 0, pixelCopies: 0, pixelReadbacks: 0, reusedUploads: 0, uploads: 0, paintNotifications: 0, deviceLossCount: 0, fenceCount: 0, effectShaderCompilations: 0, incompleteFramesSkipped: 0, shaderSourceGenerations: 0, precompiledShaderSelections: 0,
    admission: { attempts: 0, passes: 0, captures: 0, pixelCopies: 0, pixelReadbacks: 0, uploads: 0, gpuFrames: 0, gpuReadbacks: 0, geometryChecks: 0,
      last: undefined as { nativePixels: number[][]; gpuPixels: number[][]; geometry: ReturnType<typeof verifyProbeGeometry>; frameBounds: ReturnType<typeof verifyFrameBounds>; projective?: ReturnType<typeof verifyProjectiveHits> } | undefined },
    timings: { captureMs: timing(), uploadMs: timing(), frameWorkMs: timing(), frameIntervalsMs: timing() },
    paintElements: [] as string[][], perLayer: layerMetrics, uploadBytes: 0, gpuFrames: 0, geometryUpdates: 0, moves: 0, deviceLosses: [] as { reason: GPUDeviceLostReason; message: string; duringMotion: boolean; duringAdmission: boolean }[], fenceOutcomes: [] as IdleOutcome[], captureMs: [] as number[], uploadMs: [] as number[], frameWorkMs: [] as number[], frameIntervalsMs: [] as number[] };
  /** Appends `value` to a history that keeps only the latest 256 entries. */
  function sample<T>(values: T[], value: T) {
    if (values.length === 256) values.shift();
    values.push(value);
  }
  /** Updates a timing aggregate and its history, and forwards the sample to `onMeasure`. */
  function recordTiming(key: keyof typeof metrics.timings, value: number, layerId?: string, bytes?: number) {
    const aggregate = metrics.timings[key];
    aggregate.count++;
    aggregate.totalMs += value;
    aggregate.minMs = Math.min(aggregate.minMs ?? value, value);
    aggregate.maxMs = Math.max(aggregate.maxMs ?? value, value);
    sample(metrics[key], value);
    options.onMeasure?.({ kind: key, at: performance.now(), durationMs: value,
      phase: mode === "admitting" ? "admission" : "content", layerId, bytes });
  }
  let mode: "dom" | "admitting" | "gpu" | "disposed" = "dom";
  let reason = "Ordinary DOM startup; admission pending.";
  let engine: EngineContext | undefined;
  // One blended effect pass per layer, drawn in order after a background clear.
  // `passes` is what is presented now; it is aligned with `layers`.
  let passes: Pass[] = [];
  let background: { effect: EffectWrapper; renderer: ReturnType<typeof createEffectRenderer> } | undefined;
  // Whether the background and `passes` are currently registered with Lite for drawing.
  let registered = false;
  // Phase I0 prototype path (`InstrumentProbeHook`): whether the hook is attached to the current engine, and every
  // probe context it has returned (those it no longer returns are kept off the surface).
  let instrumentAttached = false;
  const instrumentKnown = new Set<RenderingContext>();
  // The `instrument` material's mesh passes on the current engine (`instrument-pass.ts`), created with the first
  // instrument layer and released with the engine.
  let instrument: InstrumentController | undefined;
  // `enable` is running; `transitioning`: `recoverToDOM` is running.
  let initializing = false;
  let transitioning = false;
  let work: Promise<void> | undefined;
  let scheduled = 0;
  // The pending animation frame of `frames()`; cancellation rejects it to interrupt that motion.
  let motionFrame: { id: number; reject(error: Error): void } | undefined;
  // Aborts the functional admission paint wait on a lifecycle transition.
  let captureAbort: AbortController | undefined;
  // Bumped on every presentation transition and device loss; async work compares it to detect supersession.
  let generation = 0;
  let moving = false;
  // Diagnostic `frames()` state: a channel-swap tint (0..1) and a horizontal shift in CSS pixels for all layers.
  let tint = 0;
  let dx = 0;
  let previousFrame: number | undefined;
  // The custom effect and material definitions per presented layer, aligned with `layers`.
  let admittedCustom: (PassShaders | undefined)[] = [];
  /**
   * The layer pass shader: the first precompiled program when `options.compiled` is set (runtime custom
   * effects and materials are refused then), otherwise WGSL generated for `custom`.
   */
  function shaderFor(custom: PassShaders | undefined) {
    if (options.compiled) {
      if (custom) throw new Error("Compiled programs do not include runtime custom effect or material definitions");
      const program = options.compiled.programs[0];
      if (!program) throw new Error("Compiled layer program missing");
      metrics.precompiledShaderSelections++;
      return program;
    }
    metrics.shaderSourceGenerations++;
    return layerShader(custom?.effect, undefined, custom?.relief ? "relief" : custom?.material);
  }
  /** The layer's trusted custom effect and its material (a custom definition or the built-in relief), if any. */
  function customOf(layer: EnrolledLayer) {
    const material = layer.material?.();
    return passShaders(layer.effects?.().find(value => value.kind === "custom")?.definition,
      isSceneMaterial(material) ? "relief" : material?.definition);
  }
  // Written to a relief pass whose layer no longer has a relief material, until the pass is rebuilt.
  const noRelief = new Float32Array(RELIEF_VEC4S * 4);
  /**
   * Creates one layer's effect wrapper, bound to `layer.texture`, and a non-clearing renderer for it on the
   * engine's primary surface. The pass is not registered; `present` does that. If renderer creation throws,
   * the wrapper is disposed before rethrowing.
   */
  function createPass(layer: Layer, custom: PassShaders | undefined, name: string): Pass {
    const effect = createEffectWrapper(engine!, { name, ...shaderFor(custom), blend: layerBlend });
    resources.effects++;
    try {
      setEffectTexture(effect, "layer0", layer.texture);
      const renderer = createEffectRenderer(engine!.surfaces[0], effect, { name, clear: false });
      resources.renderers++;
      return { effect, renderer, texture: layer.texture, custom };
    } catch (error) {
      disposeEffectWrapper(effect); resources.effects--;
      throw error;
    }
  }
  /** Frees a pass's renderer and effect wrapper. Callers ensure the GPU no longer uses it (fence or loss). */
  function disposePass(pass: Pass) {
    disposeEffectRenderer(pass.renderer); resources.renderers--;
    disposeEffectWrapper(pass.effect); resources.effects--;
  }
  /** Validates trusted custom/compiled WGSL once per distinct source before it is drawn. */
  function compileShaders(customs: readonly (PassShaders | undefined)[]): Promise<void> {
    if (!options.compiled && !customs.some(Boolean)) return Promise.resolve();
    const device = configuredDevice(output);
    const sources = new Set(customs.filter(custom => custom || options.compiled).map(custom => {
      const shader = shaderFor(custom);
      return `${shader.vertexWGSL ?? ""} ${shader.fragmentWGSL}`;
    }));
    return Promise.all([...sources].map(code => {
      metrics.effectShaderCompilations++;
      return device.createShaderModule({ code }).getCompilationInfo().then(info => {
        const errors = info.messages.filter(message => message.type === "error");
        if (errors.length) throw new Error(`Application effect compilation failed: ${errors.map(message => `${message.lineNum}:${message.linePos} ${message.message}`).join("; ")}`);
      });
    })).then(() => undefined);
  }
  /** Presents `next` in order after the background pass; one frame submission draws them all. */
  function present(next: Pass[]) {
    unpresent();
    if (!background) {
      const effect = createEffectWrapper(engine!, { name: "underglass-background",
        fragmentWGSL: "@fragment fn effectFragment(input: EffectVertexOutput) -> @location(0) vec4f { return vec4f(1.0); }" });
      resources.effects++;
      const renderer = createEffectRenderer(engine!.surfaces[0], effect, { name: "underglass-background", clear: true, clearColor: { r: 1, g: 1, b: 1, a: 1 } });
      resources.renderers++;
      background = { effect, renderer };
    }
    registerEffectRenderer(background.renderer);
    for (const pass of next) registerEffectRenderer(pass.renderer);
    passes = next;
    registered = true;
  }
  /**
   * Puts mesh scenes on the surface right after their layers' passes, so a layer's meshes draw before the next layer's
   * face: the `instrument` material's scenes, and the Phase I0 prototype hook's (`InstrumentProbeHook`). Lite documents
   * `getRenderingContexts` as the surface's live registry view in render order and has no public call that inserts a
   * context at a position (`registerScene` appends, asynchronously), so core reorders that list in place: a documented
   * reliance (`docs/ui-library/instrument-phase2.md`, decision 1). Only contexts core registered are permuted; others
   * keep their order after them. The order is read back, and if Lite did not take it every instrument layer is drawn at
   * the Relief level from the next frame. Does nothing on a surface with no mesh scenes.
   */
  function orderContexts() {
    const hook = options.instrumentProbe;
    const probe = !!hook && instrumentAttached;
    const owned = instrument?.scenes();
    if (!engine || !registered || !probe && !owned?.size) return;
    const list = getRenderingContexts(engine.surfaces[0]) as RenderingContext[];
    const desired: RenderingContext[] = background ? [background.renderer] : [];
    layers.forEach((layer, index) => {
      desired.push(passes[index]!.renderer);
      if (owned?.size) for (const context of instrument!.contexts(layer.id)) if (!desired.includes(context)) desired.push(context);
      if (probe) for (const context of hook.contexts({ id: layer.id, element: layer.element, matrix: () => layer.matrix(), texture: layer.texture })) {
        // Only contexts the probe registered (or that core took off the surface earlier) are drawn.
        if (desired.includes(context) || !list.includes(context) && !instrumentKnown.has(context)) continue;
        instrumentKnown.add(context);
        desired.push(context);
      }
    });
    const next = [...desired, ...list.filter(context => !desired.includes(context) && !instrumentKnown.has(context) && !owned?.has(context))];
    if (next.length === list.length && next.every((context, index) => context === list[index])) return;
    try { list.splice(0, list.length, ...next); }
    catch (error) {
      if (!owned?.size) throw error;
      instrument!.orderFailed(`the surface's context list cannot be reordered: ${String(error)}`);
      return;
    }
    if (!owned?.size) return;
    const after = getRenderingContexts(engine.surfaces[0]);
    if (after.length !== next.length || next.some((context, index) => context !== after[index])) {
      instrument!.orderFailed("the surface's context list did not take the order core wrote");
    }
  }
  /**
   * The `instrument` material's frame, inside `draw()` after native geometry: hands the controller every presented
   * layer (an instrument one with its scene), so it can step objects down, start builds and write instances in this
   * frame. Creates the controller with the first instrument layer.
   */
  function instrumentFrame(shift: number) {
    if (!engine || !queue || !observer) return;
    const any = layers.some(layer => layer.material?.()?.kind === "instrument");
    if (!any && !instrument?.active()) return;
    if (!instrument) {
      const lost = observer.lost;
      instrument = createInstrumentController({ engine, queue: queue as unknown as GPUQueue, lost, stage: () => options.size(),
        texture: id => layers.find(layer => layer.id === id)?.texture,
        preparation: () => preparation, onMeasure: options.onMeasure, testHook: options.instrumentTestHook,
        requestDraw: () => {
          if (scheduled || mode !== "gpu") return;
          resources.scheduledFrames++;
          scheduled = requestAnimationFrame(() => {
            scheduled = 0; resources.scheduledFrames--;
            try { draw(); } catch (error) { console.error("Underglass instrument frame failed", error); }
          });
        } });
    }
    instrument.frame(layers.map((layer): InstrumentLayerInput => {
      const material = layer.material?.();
      const matrix = new DOMMatrix().translate(shift, 0).multiply(layer.matrix());
      return { id: layer.id, scene: material?.kind === "instrument" ? material.scene : undefined, matrix,
        clip: layer.clip?.(matrix) ?? { x: 0, y: 0, width: layer.extent.width, height: layer.extent.height },
        extent: layer.extent, opacity: layer.opacity(), texture: layer.texture, content: layer.contentExtent };
    }));
  }
  /** Phase I0 prototype path: lets the probe release its scenes before the engine goes. */
  function detachInstrument() {
    if (!instrumentAttached) return;
    instrumentAttached = false;
    instrumentKnown.clear();
    try { options.instrumentProbe?.detach(); }
    catch (error) { console.error("Underglass instrument probe detach failed", error); }
  }
  /** Unregisters the background and layer passes from Lite drawing without disposing them. */
  function unpresent() {
    if (!registered) return;
    if (background) unregisterEffectRenderer(background.renderer);
    for (const pass of passes) unregisterEffectRenderer(pass.renderer);
    registered = false;
  }
  /**
   * Packs every presented layer's uniforms (matrix, clip, opacity, effects) for the next frame. `shift` is the
   * diagnostic horizontal offset in CSS pixels and `shade` the diagnostic tint; both are 0 outside `frames()`.
   */
  function writeUniforms(shift: number, shade: number) {
    const size = options.size();
    layers.forEach((layer, index) => {
      const pass = passes[index]!;
      const block = layerUniforms(layer, size.dpr, size, shift, shade, pass.custom, !!options.compiled);
      if (pass.custom?.relief) {
        const material = layer.material?.();
        // An instrument layer's face is its relief primitives plus the objects drawn at the Relief level this frame.
        const scene = material?.kind === "instrument"
          ? instrumentFaceScene(material.scene, instrument?.stepped(layer.id) ?? material.scene.objects.map((_, object) => object))
          : isSceneMaterial(material) ? material.scene : undefined;
        setEffectUniforms(pass.effect, { 2: block, 3: scene ? reliefUniforms(scene) : noRelief });
      } else setEffectUniforms(pass.effect, block);
    });
  }
  // Last native geometry clearing per element, and whether its transform read back as identity (null: unknown).
  let clearedGeometry: { id: string; identity: boolean | null }[] = [];
  // Whether the last functional admission proved native hits stop at the canvas content box.
  // Set from `verifyFrameBounds`; `frameBounded()` is true only for `"bounded"`, while `"unbounded"` and
  // `"unverifiable"` (the initial value) both count as not bounded.
  let frameBounds: FrameBounds = "unverifiable";
  // Whether the last functional admission proved native hits follow a projective (tilted) transform.
  let projective: ReturnType<typeof verifyProjectiveHits>["result"] = "unverifiable";
  // A layer as presented: the runtime's description plus its layout extent (CSS px), its GPU texture (device px),
  // what that texture currently holds (`coverage`, `contentExtent`) and the native capture grid last uploaded.
  type Layer = EnrolledLayer & { extent: { width: number; height: number }; texture: DynamicTexture2D;
    coverage: CaptureCoverage; contentExtent: { width: number; height: number; pixelWidth: number; pixelHeight: number } };
  // One draw pass: the effect wrapper bound to a layer texture, its renderer, and the custom effect and material it was built for.
  type Pass = { effect: EffectWrapper; renderer: ReturnType<typeof createEffectRenderer>; texture: DynamicTexture2D; custom: PassShaders | undefined };
  // `passes` align with `layers`; `owned` also keeps passes of removed layers alive until the composition retires.
  // A complete set of layers, passes and textures presented together. At most one is `active` (drawn now) and one
  // `pending` (prepared, waiting for fresh pixels); superseded ones sit in `retiring` until a queue fence.
  type Composition = { layers: Layer[]; passes: Pass[]; owned: Set<Pass>;
    textures: DynamicTexture2D[]; custom: (PassShaders | undefined)[];
    ready: boolean; size: ReturnType<SurfaceRendererOptions["size"]> };
  // `layers` is the presented composition; `current` is the runtime's latest enrollment, which may be ahead of it.
  let layers: Layer[] = [];
  let current: EnrolledLayer[] = [];
  let pending: Composition | undefined;
  let active: Composition | undefined;
  let preparation: Promise<void> | undefined;
  let slotSerial = 0;
  // `publicationGeneration` counts reconciles; `submittedGeneration` is the one last drawn, so lag is observable.
  let publicationGeneration = 0;
  let submittedGeneration = -1;
  // A native paint has been requested and not yet delivered; guarded by a 1500 ms watchdog in `requestPaint`.
  let paintRequested = false;
  // Native paints that completed a capture and draw. `settle` uses it to tell a paint it was waiting for from a
  // newer one requested by content that keeps changing.
  let completedPaints = 0;
  // Layer membership or order changed and `reconcile` has not run yet; drawing is skipped until it does.
  let membershipPending = false;
  let paintTimer: ReturnType<typeof setTimeout> | undefined;
  let queue: DrawableQueue | undefined;
  const compositions = new Set<Composition>();
  const retiring = new Set<Composition>();
  const textures = new Set<DynamicTexture2D>();
  // Stable per-layer slot numbers; a texture is reused only while its layer keeps the same slot.
  const logicalSlots = new Map<string, number>();
  // Last native geometry applied per element, so `geometry` only re-applies it when something changed.
  const nativeMatrices = new WeakMap<Element, DOMMatrix>();
  const nativeClips = new WeakMap<Element, string>();
  // Native default capture size last reported per element, with the layout size and DPR it was measured at.
  const nativeGrids = new WeakMap<Element, { width: number; height: number; dpr: number; pixelWidth: number; pixelHeight: number }>();
  // Layers that currently have native geometry applied, in hit-test order.
  let nativeOrder: EnrolledLayer[] = [];
  // Outstanding queue-fence promises of retiring compositions; teardown waits for them.
  const retirements = new Set<Promise<void>>();
  // Layer ids whose content changed since their texture was last uploaded.
  const dirty = new Set<string>();
  // Undo functions for every listener added through `listen`; run on dispose.
  const removers: (() => void)[] = [];
  let observer: ReturnType<typeof observeConfiguredDevice> | undefined;
  let lostInfo: GPUDeviceLostInfo | undefined;
  let probe: ReturnType<typeof createAdmissionProbe> | undefined;
  // The in-flight admission screenshot readback, tracked so teardown never destroys a copy the GPU still owns.
  let probeReadback: { active: boolean; completion: Promise<void> } | undefined;
  // Tail of the promise chain that serializes enable, disable, recovery and dispose.
  let lifecycle = Promise.resolve();
  // Bumped by explicit disable/dispose so an `enable` already queued or running can tell it was cancelled.
  let admissionIntent = 0;
  let admissionCancellation: string | undefined;
  // GPU resources are retained because no fence or device loss confirmed the GPU is idle; reentry is refused.
  let terminalCleanupPending = false;
  /** Runs `operation` after all earlier lifecycle operations settle; a failure does not block later ones. */
  function serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = lifecycle.then(operation);
    lifecycle = result.then(() => undefined, () => undefined);
    return result;
  }
  /** Records an unexpected lifecycle failure in `reason`, logs it and publishes status. */
  function reportFailure(error: unknown) {
    reason = `Lifecycle failure: ${String(error)}`;
    console.error(reason);
    status();
  }

  /** Publishes a status snapshot to `onStatus` (as JSON) and `onStatusChange`, if either is set. */
  function status() {
    if (!options.onStatus && !options.onStatusChange) return;
    const value: RendererStatus = { mode, reason, resources: { ...resources }, counts: { captures: metrics.captures, pixelCopies: metrics.pixelCopies, uploads: metrics.uploads, gpuFrames: metrics.gpuFrames }, recovery: "Host-owned moveBefore; one persistent React root", deviceLoss: "Public configured-device lost promise -> ordinary DOM; explicit fresh-engine reentry", deviceLosses: [...metrics.deviceLosses], fenceOutcomes: [...metrics.fenceOutcomes] };
    options.onStatus?.(JSON.stringify(value, null, 2));
    options.onStatusChange?.(value);
  }
  /**
   * Full diagnostics for tests and tooling: mode, resource counts, metrics, publication progress and, in GPU
   * mode, each layer's native element transform.
   */
  function state() {
    return {
      mode, reason, initializing, transitioning, moving, clearedGeometry: [...clearedGeometry], resources: { ...resources }, metrics: structuredClone(metrics),
      publication: { generation: publicationGeneration, submittedGeneration, pending: membershipPending || !!pending || paintRequested,
        captures: layers.map(layer => ({ id: layer.id, ...layer.coverage, textureWidth: layer.texture.texture.width, textureHeight: layer.texture.texture.height })) },
      rootContainer: container.parentElement?.id,
      transforms: mode === "gpu" ? current.map(layer => ({ id: layer.element.id, matrix: Array.from(nativeHost().getElementTransform(layer.element).toFloat64Array()) })) : [],
      /** The `instrument` material's diagnostics, or null before the first instrument layer on this engine. */
      instrument: instrument?.state() ?? null,
    };
  }
  /** Adds an event listener that is counted in `resources.listeners` and removed on dispose. */
  function listen(target: EventTarget, name: string, listener: EventListener) {
    target.addEventListener(name, listener);
    resources.listeners++;
    removers.push(() => { target.removeEventListener(name, listener); resources.listeners--; });
  }
  /** Cancels pending paint waits, scheduled frames and in-flight `frames()` motion, and notifies `onInterrupt`. */
  function cancelScheduled() {
    options.onInterrupt?.();
    captureAbort?.abort(new DOMException("Native paint cancelled by lifecycle transition", "AbortError"));
    clearTimeout(paintTimer);
    paintRequested = false;
    resources.paintWaits = 0;
    if (scheduled) { cancelAnimationFrame(scheduled); scheduled = 0; resources.scheduledFrames--; }
    if (motionFrame) {
      cancelAnimationFrame(motionFrame.id);
      motionFrame.reject(new Error("GPU-only motion interrupted by topology change or device loss"));
      motionFrame = undefined;
      resources.scheduledFrames--;
    }
  }
  /**
   * Disposes every pass, the background and every texture, and resets composition state. The caller must
   * already know the GPU no longer uses them (fence or device loss).
   */
  function releaseComposition() {
    unpresent();
    const owned = new Set(passes);
    for (const composition of compositions) for (const pass of composition.owned) owned.add(pass);
    for (const pass of owned) disposePass(pass);
    if (background) {
      disposeEffectRenderer(background.renderer); resources.renderers--;
      disposeEffectWrapper(background.effect); resources.effects--;
      background = undefined;
    }
    compositions.clear();
    for (const texture of textures) { releaseTexture(texture); resources.textures--; }
    textures.clear();
    layers = [];
    current = [];
    pending = active = undefined;
    passes = [];
    logicalSlots.clear();
    admittedCustom = [];
  }
  /** Removes the functional admission probe element; it counts as two entries in `resources.probeElements`. */
  function releaseProbe() {
    if (!probe) return;
    probe.element.remove();
    probe = undefined;
    resources.probeElements -= 2;
  }
  /** Releases everything GPU-side: probe, loss observer, composition and the engine. Callers fence first. */
  function destroyGPU() {
    cancelScheduled();
    releaseProbe();
    if (!probeReadback?.active) probeReadback = undefined;
    if (observer) { observer.release(); observer = undefined; resources.lossObservers--; }
    detachInstrument();
    // Instrument scenes go before the engine; the caller has fenced the GPU or the device is lost.
    instrument?.dispose();
    instrument = undefined;
    releaseComposition();
    if (engine) { disposeEngine(engine); engine = undefined; resources.engines--; }
  }
  /**
   * Clears native geometry from every element that has it applied, recording whether each transform returned to
   * identity. Also removes the admission probe unless `removeProbe` is false.
   */
  function clearGeometry(removeProbe = true) {
    // A repeated DOM transition with nothing applied keeps the last cleared record.
    if (nativeOrder.length) clearedGeometry = nativeOrder.map(layer => {
      nativeHost().clearElementGeometry(layer.element);
      return { id: layer.element.id, identity: layer.element.isConnected && layer.element.hasAttribute("drawable") && layer.element.closest("canvas") === host
        ? nativeHost().getElementTransform(layer.element).isIdentity : null };
    });
    nativeOrder = [];
    if (removeProbe) releaseProbe();
  }
  /**
   * Switches presentation back to ordinary DOM synchronously: hides the canvas, restores pointer events, clears
   * native geometry and moves the React root home. GPU resources are released later by `recoverToDOM`.
   */
  function presentDOM(message: string) {
    mode = "dom";
    reason = message;
    generation++;
    cancelScheduled();
    output.hidden = true;
    if (output.style.getPropertyValue("pointer-events") === "auto") {
      if (outputPointer.value) output.style.setProperty("pointer-events", outputPointer.value, outputPointer.priority);
      else output.style.removeProperty("pointer-events");
    }
    clearGeometry(false);
    ordinary.hidden = false;
    if (boundary.moveToDOM()) metrics.moves++;
    try { options.presentation?.("dom"); }
    catch (error) {
      reason += ` DOM presentation restoration failed: ${String(error)}`;
      console.error("Underglass DOM presentation restoration failed", error);
      status();
    }
    options.onRecovery?.(message);
  }
  /**
   * Keeps GPU resources alive until `completion` reports a confirmed idle fence or device loss, then destroys
   * them. Used when the idle wait was rejected or timed out, so a healthy device is never torn down while busy.
   */
  function retainGPUUntil(completion: Promise<IdleOutcome>) {
    terminalCleanupPending = true;
    resources.pendingCleanups++;
    const retainedEngine = engine;
    void completion.then(result => serialize(async () => {
      if (engine !== retainedEngine) return;
      if (result.kind !== "completed" && result.kind !== "device-lost") throw new Error("Pending cleanup requires a confirmed fence or device loss");
      sample(metrics.fenceOutcomes, result);
      metrics.fenceCount++;
      destroyGPU();
      resources.pendingCleanups--;
      terminalCleanupPending = false;
      reason += ` Pending cleanup settled: ${result.kind}.`;
      status();
    })).catch(reportFailure);
  }
  /**
   * Full fallback to ordinary DOM: presents DOM, waits for work and preparation, fences the GPU queue (1500 ms)
   * and destroys GPU resources. If the fence is not confirmed on a healthy device, resources are retained
   * instead. Throws if a recovery is already running.
   */
  async function recoverToDOM(message: string) {
    if (transitioning) throw new Error("A renderer recovery is already in progress");
    transitioning = true;
    presentDOM(message);
    releaseProbe();
    let retained = false;
    try {
      if (work) await work;
      if (preparation) await preparation;
      if (engine) {
       const outstanding = Promise.all([...retirements, ...(instrument?.retirements() ?? []), ...(probeReadback?.active ? [probeReadback.completion] : [])]).then(() => undefined);
       const { outcome, completion } = await waitForTeardown(engine, observer?.lost, 1500, outstanding);
        sample(metrics.fenceOutcomes, outcome);
        metrics.fenceCount++;
        if (outcome.kind === "rejected" || outcome.kind === "timeout") {
          reason += ` GPU-idle synchronization ${JSON.stringify(outcome)}`;
          if (lostInfo) console.warn(reason);
          else {
            console.error(`${reason}; healthy GPU resources retained until a confirmed fence or loss.`);
            reason += "; healthy GPU cleanup pending; DOM remains usable.";
            retained = true;
            retainGPUUntil(completion);
          }
        }
      }
    } catch (error) {
      reason += ` GPU-idle synchronization failed: ${String(error)}`;
      if (engine && !retained) {
        retained = true;
        retainGPUUntil(observer
          ? observer.lost.then(info => ({ kind: "device-lost", reason: info.reason }))
          : new Promise<IdleOutcome>(() => {}));
        reason += "; GPU cleanup pending after unexpected synchronization failure; no unfenced destruction.";
      }
      console.error(reason);
      throw error;
    } finally { if (!retained) destroyGPU(); transitioning = false; status(); }
    previousFrame = undefined;
    dirty.clear();
    status();
  }
  /**
   * Applies each current layer's matrix and clip to its native element, so browser hit-testing matches the
   * drawn pixels, and clears geometry of removed layers. Calls `updateElementGeometry` only when a matrix, clip or
   * the order changed (the applied transform is read back and validated every time). Throws if a required drawable is unavailable or a matrix is invalid.
   */
  function geometry() {
    const ordered = current;
    const orderChanged = ordered.length !== nativeOrder.length || ordered.some((layer, index) => layer.element !== nativeOrder[index]?.element);
    clearedGeometry = [];
    for (const layer of nativeOrder) if (!ordered.some(next => next.element === layer.element)) {
      nativeHost().clearElementGeometry(layer.element);
      nativeMatrices.delete(layer.element);
      nativeClips.delete(layer.element);
      clearedGeometry.push({ id: layer.element.id, identity: layer.element.isConnected && layer.element.hasAttribute("drawable") && layer.element.closest("canvas") === host
        ? nativeHost().getElementTransform(layer.element).isIdentity : null });
    }
    for (const layer of ordered) {
      if (!layer.element.isConnected || !layer.element.hasAttribute("drawable") || layer.element.closest("canvas") !== host) {
        throw new Error(`Required current original drawable/owner unavailable: ${layer.id}`);
      }
      // Canvas content-box matrix (also what the shader inverts), including the diagnostic horizontal shift.
      const matrix = new DOMMatrix().translate(dx, 0).multiply(layer.matrix());
      validateGeometry(matrix);
      const origin = options.nativeOrigin?.() ?? { x: 0, y: 0 };
      // Native geometry is relative to the canvas border box, so add the border and padding offset.
      const nativeMatrix = new DOMMatrix().translate(origin.x, origin.y).multiply(matrix);
      validateGeometry(nativeMatrix);
      const previous = nativeMatrices.get(layer.element);
      // Default clip is the element's whole border box in layer-local CSS pixels.
      const clip = layer.clip?.(matrix) ?? { x: 0, y: 0, width: layer.element.offsetWidth, height: layer.element.offsetHeight };
      const clipKey = JSON.stringify(clip);
      // Compare matrix components exactly; any change in order, clip or matrix re-applies the geometry.
      // All 16 coefficients: a tilt or perspective change can keep a..f.
      const before = previous?.toFloat64Array(), after = nativeMatrix.toFloat64Array();
      if (orderChanged || !before || nativeClips.get(layer.element) !== clipKey || after.some((value, index) => before[index] !== value)) {
        nativeHost().updateElementGeometry(layer.element, { canvasTransform: nativeMatrix, canvasClip: clip, preserveHitTestOrder: !orderChanged });
        nativeMatrices.set(layer.element, nativeMatrix);
        nativeClips.set(layer.element, clipKey);
        metrics.geometryUpdates++;
      }
      // Read the geometry back from the browser to confirm it was accepted as sent.
      validateAppliedGeometry(nativeHost(), layer.element, nativeMatrix);
    }
    nativeOrder = [...ordered];
  }
  /**
   * Draws one frame if GPU is presented: re-applies geometry, skips (and requests a paint) while the composition
   * is incomplete, writes uniforms and submits all passes. Does nothing while hidden or after device loss. A
   * failing `policy` triggers recovery; a draw error triggers recovery and is rethrown.
   */
  function draw() {
    if (!engine || !registered || mode !== "gpu" && mode !== "admitting" || lostInfo || options.isPaused?.()) return;
    const policy = options.policy?.();
    if (policy) {
      void recover(policy).catch(reportFailure);
      return;
    }
    const now = performance.now();
    if (previousFrame !== undefined) recordTiming("frameIntervalsMs", now - previousFrame);
    previousFrame = now;
    try {
      geometry();
      // Never present a partial composition; the last complete frame stays on screen until fresh pixels arrive.
      if (membershipPending || pending || !complete()) { metrics.incompleteFramesSkipped++; requestPaint(); return; }
      // Instrument parts move in the same frame as the geometry above, before the face's uniforms (its step-downs).
      instrumentFrame(dx);
      writeUniforms(dx, tint);
      orderContexts();
      renderFrame(engine, 16.67);
      submittedGeneration = publicationGeneration;
      instrument?.afterFrame();
    } catch (error) {
      if (mode === "gpu") {
        const failedGeneration = generation;
        void serialize(async () => {
          if (mode === "gpu" && generation === failedGeneration) await recoverToDOM(`Geometry/GPU draw failure: ${String(error)}`);
        }).catch(reportFailure);
      }
      throw error;
    }
    metrics.gpuFrames++;
    recordTiming("frameWorkMs", performance.now() - now);
  }
  /** Requests a native paint and waits until publication settles. */
  async function captureLayers() {
    requestPaint();
    await settle();
  }
  /** Requests a paint when GPU is presented and some layer is dirty. */
  function scheduleCapture() {
    if (mode === "gpu" && dirty.size) requestPaint();
  }
  /**
   * Marks layers dirty and schedules a paint. `target` is an event, element or layer id; layers containing or
   * contained by the element are marked, and no target marks every layer.
   */
  function queueCapture(target?: Event | Element | string) {
    const node = target instanceof Event ? target.target : target;
    for (const layer of current) {
      if (!node || typeof node === "string" && layer.id === node
        || node instanceof Element && (layer.element.contains(node) || node.contains(layer.element))) dirty.add(layer.id);
    }
    scheduleCapture();
  }
  /**
   * Waits until scheduled frames, lifecycle work, successor preparation and the paint already requested are done
   * (3000 ms cap). Once a paint has completed during the wait, a still-requested paint is newer work from content
   * that keeps changing (a requestAnimationFrame loop, a video): it does not hold settling, or a page that never
   * stops updating could never admit.
   */
  async function settle() {
    const deadline = performance.now() + 3000;
    const paints = completedPaints;
    while (scheduled || work || preparation || pending || paintRequested && completedPaints === paints) {
      if (performance.now() > deadline) throw new Error("Native refresh did not settle within 3000 ms");
      if (work) await work;
      else if (preparation) await preparation;
      else await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    }
  }
  /**
   * The capture grid a layer must cover: layout size in CSS pixels and texture size in device pixels. Uses the
   * browser-reported size once a paint has recorded it for this layout and DPR, otherwise `ceil(size * dpr)`.
   */
  function required(layer: EnrolledLayer, size = options.size()) {
    const width = layer.element.offsetWidth, height = layer.element.offsetHeight;
    // New originals have no cached native paint record yet. Reserve the target
    // grid before paint; only paint reads the browser's actual default extent.
    const recorded = nativeGrids.get(layer.element);
    const matching = recorded?.width === width && recorded.height === height && recorded.dpr === size.dpr;
    return { width, height, pixelWidth: matching ? recorded.pixelWidth : Math.ceil(width * size.dpr),
      pixelHeight: matching ? recorded.pixelHeight : Math.ceil(height * size.dpr) };
  }
  /** Whether `candidate` matches the current enrollment and every texture holds a capture of the required size. */
  function complete(candidate = layers) {
    return candidate.length === current.length && candidate.every((layer, index) =>
      layer.id === current[index]!.id && completeCoverage(layer.coverage, required(current[index]!)));
  }
  /** Asks the browser for a native paint; if none arrives within 1500 ms the renderer falls back to DOM. */
  function requestPaint() {
    if (paintRequested || lostInfo || options.isPaused?.() || mode !== "gpu" && mode !== "admitting") return;
    paintRequested = true;
    resources.paintWaits = 1;
    paintTimer = setTimeout(() => {
      paintRequested = false; resources.paintWaits = 0;
      void recover("Required owning native paint timed out after 1500 ms").catch(reportFailure);
    }, 1500);
    nativeHost().requestPaint();
  }
  /**
   * Queues a superseded composition for disposal after `onSubmittedWorkDone` (or device loss). Passes and
   * textures still used by another composition are kept.
   */
  function retire(composition: Composition) {
    if (!queue || !compositions.has(composition) || retiring.has(composition)) return;
    retiring.add(composition);
    resources.pendingCleanups++;
    const finish = () => {
      retiring.delete(composition);
      resources.pendingCleanups--;
      if (!compositions.delete(composition)) return;
      // Passes are shared with successors that kept the same texture and effect.
      for (const pass of composition.owned) if (!passes.includes(pass) && ![...compositions].some(other => other.owned.has(pass))) disposePass(pass);
      for (const texture of composition.textures) if (![...compositions].some(other => other.textures.includes(texture))) {
        if (textures.delete(texture)) { releaseTexture(texture); resources.textures--; }
      }
      metrics.fenceCount++;
    };
    const lost = observer!.lost;
    const fence = Promise.race([queue.onSubmittedWorkDone(), lost.then(() => undefined)]).then(finish).catch(error => {
      // A rejected queue promise is not permission to destroy healthy resources.
      console.error("Underglass successor retirement fence failed; retaining resources", error);
      return lost.then(finish);
    }).finally(() => { retirements.delete(fence); });
    retirements.add(fence);
  }
  /**
   * Brings the GPU composition in line with the runtime's current layers: validates budgets and capture grids,
   * allocates or reuses textures and passes, and either presents the active composition's passes in the new order
   * (when they already cover every layer) or prepares a pending successor that is published once shaders
   * compile and fresh pixels are uploaded. Throws on invalid
   * or over-budget state; the old composition stays presented meanwhile.
   */
  function reconcile() {
    if (!engine || mode !== "gpu" && mode !== "admitting" || lostInfo) return;
    membershipPending = false;
    current = options.layers();
    const ids = new Set(current.map(layer => layer.id));
    for (const id of logicalSlots.keys()) if (!ids.has(id)) logicalSlots.delete(id);
    for (const layer of current) if (!logicalSlots.has(layer.id)) logicalSlots.set(layer.id, ++slotSerial);
    publicationGeneration++;
    geometry();
    const size = options.size();
    const budget = options.budgets ?? { layers: 32, pixels: 2_000_000 };
    if (current.length > budget.layers || ids.size !== current.length) throw new Error("Layer-count/identity budget exceeded");
    // Texture sizes are in device pixels; every dimension must fit the device limit.
    const extents = current.map(spec => {
      const extent = required(spec, size);
      if (!extent.width || !extent.height || ![extent.pixelWidth, extent.pixelHeight].every(value => Number.isFinite(value) && value > 0 && value <= observer!.maxTextureDimension2D)) {
        throw new Error(`Invalid native capture grid: ${spec.id}`);
      }
      return extent;
    });
    // Output bitmap size in device pixels.
    const outputWidth = Math.round(size.width * size.dpr), outputHeight = Math.round(size.height * size.dpr);
    // The pixel budget is in CSS pixels, so the device-pixel total is compared against it scaled by DPR squared.
    if (extents.reduce((sum, extent) => sum + extent.pixelWidth * extent.pixelHeight, 0) > budget.pixels * size.dpr * size.dpr) throw new Error("Captured-pixel safety budget exceeded");
    if (![size.width, size.height, size.dpr].every(value => Number.isFinite(value) && value > 0)
      || Math.max(outputWidth, outputHeight) > observer!.maxTextureDimension2D
      || outputWidth * outputHeight > budget.pixels * 4) throw new Error("GPU output size/device budget exceeded");
    const next = current.map((spec, index) => {
      const extent = extents[index]!;
      // Reuse a texture only for the same layer slot and only if it is already large enough.
      const retained = (pending?.layers ?? layers).find(layer => layer.id === spec.id
        && layer.coverage.slot === logicalSlots.get(spec.id)
        && layer.texture.texture.width >= Math.ceil(extent.pixelWidth) && layer.texture.texture.height >= Math.ceil(extent.pixelHeight));
      const layout = { width: extent.width, height: extent.height };
      if (retained) return { ...retained, ...spec, extent: layout };
      // Nearest taps: the composition shader filters bilinearly in premultiplied space.
      // The native grid can be fractional (a layer laid out at 377.25 px); the texture holds whole texels.
      const texture = createDynamicTexture(engine!, Math.ceil(extent.pixelWidth), Math.ceil(extent.pixelHeight), { minFilter: "nearest", magFilter: "nearest" });
      textures.add(texture); resources.textures++;
      return { ...spec, extent: layout, texture,
        coverage: { slot: logicalSlots.get(spec.id)!, capturedSlot: -1, width: 0, height: 0, pixelWidth: 0, pixelHeight: 0 },
        contentExtent: { width: 0, height: 0, pixelWidth: 0, pixelHeight: 0 } };
    });
    for (const spec of current) metrics.perLayer[spec.id] ??= { captures: 0, pixelCopies: 0, pixelReadbacks: 0, uploads: 0 };
    const custom = next.map(customOf);
    // Each layer keeps its pass while its texture, custom effect and material are unchanged.
    // Finds an existing pass bound to the same texture and custom definitions, searching the given compositions.
    const reuse = (layer: Layer, definition: PassShaders | undefined, from: (Composition | undefined)[]) =>
      from.flatMap(composition => composition ? [...composition.owned] : [])
        .find(pass => pass.texture === layer.texture && pass.custom === definition);
    const retained = next.map((layer, index) => reuse(layer, custom[index], [active]));
    if (active && retained.every(Boolean) && !pending && output.width === outputWidth && output.height === outputHeight && complete(next)) {
      // Membership/order change only: present the existing passes in the new order.
      // Passes of removed layers stay owned by the active composition until it is fenced.
      present(retained as Pass[]);
      layers = next; active.layers = next; active.passes = retained as Pass[];
      admittedCustom = custom;
      draw(); queueCapture(); return;
    }
    const previous = pending;
    const device = configuredDevice(output);
    const compileStarted = performance.now();
    let compilation: Promise<void> = Promise.resolve();
    device.pushErrorScope("validation");
    const created: Pass[] = [];
    let successorPasses: Pass[];
    try {
      successorPasses = next.map((layer, index) => {
        const existing = reuse(layer, custom[index], [pending, active]);
        if (existing) return existing;
        const pass = createPass(layer, custom[index], `native-successor-${publicationGeneration}-${index}`);
        created.push(pass);
        return pass;
      });
      compilation = compileShaders(created.map(pass => pass.custom)).finally(() => {
        options.onMeasure?.({ kind: "effectCompileMs", at: performance.now(), durationMs: performance.now() - compileStarted, phase: "admission" });
      });
      // Public registration prepares pipelines/bindings, without a submitted frame.
      for (const pass of created) { registerEffectRenderer(pass.renderer); unregisterEffectRenderer(pass.renderer); }
    } catch (error) {
      // No commands were submitted by preparation, so these bindings are idle.
      for (const pass of created) disposePass(pass);
      void compilation.catch(reportFailure);
      void device.popErrorScope().catch(reportFailure);
      throw error;
    }
    const successor: Composition = { layers: next, passes: successorPasses, owned: new Set(successorPasses),
      textures: next.map(layer => layer.texture), custom, ready: false, size };
    pending = successor; compositions.add(successor);
    if (previous) retire(previous);
    // Presents the pending successor immediately if every texture already holds complete pixels at the right size.
    const publishCached = () => {
      if (!complete(next) || output.width !== outputWidth || output.height !== outputHeight) return false;
      const previousActive = active;
      present(successor.passes);
      layers = next;
      successor.ready = true; active = successor; pending = undefined;
      admittedCustom = custom;
      draw();
      if (previousActive) retire(previousActive);
      queueCapture();
      return true;
    };
    // Preparation (error scope and shader compilation) is limited to 1500 ms; a timeout recovers to DOM. While an
    // instrument scene builds (registration to its first frame on the GPU), the GPU process is compiling its pipelines
    // one at a time, so the deadline starts when that build is done and counts core's own work (the compile policy,
    // `docs/ui-library/instrument-phase2.md`).
    let preparationTimer: ReturnType<typeof setTimeout> | undefined;
    let preparationSettled = false;
    const preparationTimeout = new Promise<never>((_, reject) => {
      const start = () => {
        if (preparationSettled) return;
        preparationTimer = setTimeout(() => reject(new Error("Successor composition preparation timed out after 1500 ms")), 1500);
      };
      const gate = instrument?.gate();
      if (!gate) { start(); return; }
      // The deferral has a ceiling (`INSTRUMENT_SUCCESSOR_DEFERRAL_MS`, 3 s): a build that hangs cannot hold a successor longer.
      const waiting = performance.now(), controller = instrument!;
      let ceiling: ReturnType<typeof setTimeout> | undefined, begun = false;
      const begin = () => { if (begun) return; begun = true; clearTimeout(ceiling); controller.deferred(performance.now() - waiting); start(); };
      ceiling = setTimeout(begin, INSTRUMENT_SUCCESSOR_DEFERRAL_MS);
      void gate.then(begin);
    });
    const prepared = Promise.race([Promise.all([device.popErrorScope(), compilation]), preparationTimeout]).then(([error]) => {
      if (error) throw new Error(`Successor composition preparation failed: ${error.message}`);
      if (pending === successor && mode !== "dom" && mode !== "disposed") {
        successor.ready = true;
        if (!publishCached()) requestPaint();
      }
    }).catch(error => {
      console.error(error);
      if (pending === successor || active === successor) void recover(`GPU successor failure: ${String(error)}`).catch(reportFailure);
    })
      .finally(() => { preparationSettled = true; clearTimeout(preparationTimer); if (preparation === prepared) preparation = undefined; });
    preparation = prepared;
  }
  /**
   * Runs synchronously inside the native `paint` event: uploads the elements' fresh pixels with
   * `drawElementImageToTexture`, promotes a ready successor to active and draws. Only stale layers are
   * re-uploaded. If a native grid outgrew its texture or layout moved on, it reconciles again and keeps the
   * previous complete frame. Uploads are validated through a WebGPU error scope.
   */
  function publishPaint() {
    clearTimeout(paintTimer); paintRequested = false; resources.paintWaits = 0;
    if (!engine || !queue || lostInfo || options.isPaused?.() || mode !== "gpu" && mode !== "admitting") return;
    if (pending && !pending.ready) { requestPaint(); return; }
    const successor = pending ?? active;
    if (!successor) return;
    // The browser's default capture size per element (device pixels) decides whether the texture is big enough.
    const grids = successor.layers.map(layer => {
      const native = nativeHost().getElementImageDefaultSize(layer.element);
      nativeGrids.set(layer.element, { width: layer.element.offsetWidth, height: layer.element.offsetHeight,
        dpr: options.size().dpr, pixelWidth: native.width, pixelHeight: native.height });
      return native;
    });
    if (successor.layers.some((layer, index) => Math.ceil(grids[index]!.width) > layer.texture.texture.width
      || Math.ceil(grids[index]!.height) > layer.texture.texture.height)) {
      queueMicrotask(() => {
        try { reconcile(); requestPaint(); }
        catch (error) { void recover(`Native successor preparation failed: ${String(error)}`).catch(reportFailure); }
      });
      return;
    }
    const device = configuredDevice(output);
    device.pushErrorScope("validation");
    try {
      geometry();
      const width = Math.round(successor.size.width * successor.size.dpr), height = Math.round(successor.size.height * successor.size.dpr);
      for (const [index, layer] of successor.layers.entries()) {
        const native = grids[index]!;
        // Only layers whose native paint changed (or whose texture slot/extent is
        // stale) are re-uploaded; unchanged textures already hold current pixels.
        const stale = dirty.has(layer.id) || layer.coverage.capturedSlot !== layer.coverage.slot
          || layer.contentExtent.pixelWidth !== native.width || layer.contentExtent.pixelHeight !== native.height
          || layer.contentExtent.width !== layer.element.offsetWidth || layer.contentExtent.height !== layer.element.offsetHeight;
        if (!stale) { metrics.reusedUploads++; continue; }
        const started = performance.now();
        // Native upload straight into the layer's texture, done synchronously during the paint event.
        queue.drawElementImageToTexture({ source: layer.element }, { texture: layer.texture.texture });
        const contentExtent = { width: layer.element.offsetWidth, height: layer.element.offsetHeight,
          pixelWidth: native.width, pixelHeight: native.height };
        layer.contentExtent = contentExtent;
        layer.coverage = { ...contentExtent, slot: layer.coverage.slot, capturedSlot: layer.coverage.slot };
        metrics.captures++; metrics.uploads++;
        metrics.perLayer[layer.id]!.captures++; metrics.perLayer[layer.id]!.uploads++;
        metrics.uploadBytes += native.width * native.height * 4;
        recordTiming("captureMs", performance.now() - started, layer.id, native.width * native.height * 4);
        recordTiming("uploadMs", performance.now() - started, layer.id, native.width * native.height * 4);
      }
      if (!complete(successor.layers)) {
        // Layout/DPR can advance between preparation and the next paint. Keep
        // the prior complete output and prepare the newly observed generation.
        queueMicrotask(() => {
          try { reconcile(); requestPaint(); }
          catch (error) { void recover(`Native successor preparation failed: ${String(error)}`).catch(reportFailure); }
        });
        return;
      }
      // The output bitmap is in device pixels; after a resize another paint is requested to refresh it.
      const resized = output.width !== width || output.height !== height;
      if (resized) setEngineSize(engine, width, height);
      const previous = active;
      if (pending) {
        present(successor.passes);
        layers = successor.layers;
        active = successor; pending = undefined;
        admittedCustom = layers.map(customOf);
      }
      dirty.clear();
      const frames = metrics.gpuFrames;
      draw();
      if (metrics.gpuFrames > frames) completedPaints++;
      if (resized) requestPaint();
      if (previous && previous !== successor) retire(previous);
    } finally {
      void device.popErrorScope().then(error => {
        if (error) { console.error(error.message); void recover(`Native upload/composition validation failed: ${error.message}`).catch(reportFailure); }
      }).catch(reportFailure);
    }
  }
    /**
     * Compiles any custom or precompiled shaders (5000 ms cap) and builds and presents one pass per layer in
     * `layers`. Used by functional admission.
     */
    async function createComposition(name: string) {
      if (!engine) throw new Error("Composition requires an admitted engine");
      admittedCustom = layers.map(customOf);
      if (admittedCustom.some(Boolean) || options.compiled) {
        const started = performance.now();
        const device = configuredDevice(output);
        device.pushErrorScope("validation");
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          await Promise.race([compileShaders(admittedCustom), new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error("Application effect compilation timed out after 5000ms")), 5000);
          })]);
        } finally {
          clearTimeout(timer);
          const error = await device.popErrorScope();
          options.onMeasure?.({ kind: "effectCompileMs", at: performance.now(), durationMs: performance.now() - started, phase: "admission" });
          if (error) throw new Error(`Application effect compilation failed: ${error.message}`);
        }
      }
      const created: Pass[] = [];
      try { for (const [index, layer] of layers.entries()) created.push(createPass(layer, admittedCustom[index], `${name}-${index}`)); }
      catch (error) { for (const pass of created) disposePass(pass); throw error; }
      present(created);
    }
    /** Resolves on the next animation frame; rejects with the signal's reason if aborted first. */
    function admissionFrame(signal: AbortSignal): Promise<void> {
      return new Promise((resolve, reject) => {
        signal.throwIfAborted();
        const cleanup = () => {
          cancelAnimationFrame(id);
          signal.removeEventListener("abort", abort);
          resources.scheduledFrames--;
          resources.listeners--;
        };
        const abort = () => { cleanup(); reject(signal.reason); };
        const id = requestAnimationFrame(() => { cleanup(); resolve(); });
        resources.scheduledFrames++;
        resources.listeners++;
        signal.addEventListener("abort", abort, { once: true });
      });
    }
    /**
     * Proves the GPU path end to end on a probe element before any real layer is shown: native upload, GPU
     * readback pixels, hit geometry, frame bounds and viewport clip. Releases the probe and its GPU resources
     * after a confirmed fence. Throws on any mismatch or timeout (1500 ms per wait).
     */
    async function functionalAdmission() {
      if (!engine) throw new Error("Functional admission requires an engine");
      metrics.admission.attempts++;
      probe = createAdmissionProbe(nativeHost());
      resources.probeElements += 2;
      // Probe texture size in device pixels.
      const grid = { width: Math.ceil(probe.extent * options.size().dpr), height: Math.ceil(probe.extent * options.size().dpr) };
      const texture = createDynamicTexture(engine, Math.ceil(grid.width), Math.ceil(grid.height), { minFilter: "nearest", magFilter: "nearest" });
      const contentExtent = { width: probe.extent, height: probe.extent, pixelWidth: grid.width, pixelHeight: grid.height };
      const probeLayer = { id: "admission-probe", element: probe.element, matrix: () => probe!.matrix, clip: () => probe!.clip, opacity: () => 1, extent: { width: probe.extent, height: probe.extent }, texture,
        contentExtent, coverage: { ...contentExtent, slot: 0, capturedSlot: 0 } };
      layers.push(probeLayer);
      textures.add(texture);
      resources.textures++;
      await createComposition("native-functional-admission");
      const abort = new AbortController();
      captureAbort = abort;
      const deadline = setTimeout(() => abort.abort(new Error("Functional admission timed out after 1500 ms")), 1500);
      try {
        resources.paintWaits++;
        try {
          await new Promise<void>((resolve, reject) => {
            const capture = () => {
              cleanup();
              try {
                const actual = nativeHost().getElementImageDefaultSize(probe!.element);
                if (Math.ceil(actual.width) > texture.texture.width || Math.ceil(actual.height) > texture.texture.height) throw new Error("Functional probe native grid exceeds prepared texture");
                probeLayer.contentExtent = { width: probe!.extent, height: probe!.extent, pixelWidth: actual.width, pixelHeight: actual.height };
                queue!.drawElementImageToTexture({ source: probe!.element }, { texture: texture.texture });
                metrics.admission.captures++; metrics.admission.uploads++;
                writeUniforms(0, 0);
                renderFrame(engine!, 16.67);
                resolve();
              } catch (error) { reject(error); }
            };
            const cancel = () => { cleanup(); reject(abort.signal.reason); };
            const cleanup = () => {
              host.removeEventListener("paint", capture);
              abort.signal.removeEventListener("abort", cancel);
            };
            host.addEventListener("paint", capture, { once: true });
            abort.signal.addEventListener("abort", cancel, { once: true });
            nativeHost().requestPaint();
          });
        }
        finally { resources.paintWaits--; }
        abort.signal.throwIfAborted();
        await Promise.resolve();
        abort.signal.throwIfAborted();
        const geometryResult = verifyProbeGeometry(nativeHost(), probe, options.nativeOrigin?.());
        metrics.admission.geometryChecks++;
        const frameResult = verifyFrameBounds(nativeHost(), probe, options.nativeOrigin?.());
        frameBounds = frameResult.result;
        const projectiveResult = verifyProjectiveHits(nativeHost(), probe, options.nativeOrigin?.());
        projective = projectiveResult.result;
        writeUniforms(0, 0);
        // Public screenshot readback: it needs rendered frames to complete, so frames are drained below.
        const readback = captureScreenshot(engine.surfaces[0]);
        const pending = { active: true, completion: Promise.resolve() };
        resources.probeReadbacks++;
        metrics.admission.gpuReadbacks++;
        let result: Awaited<typeof readback> | undefined;
        let failed = false;
        let failure: unknown;
        pending.completion = readback.then(value => { result = value; }, error => { failed = true; failure = error; })
          .then(() => {
            if (pending.active) { pending.active = false; resources.probeReadbacks--; }
            if (probeReadback === pending) probeReadback = undefined;
            status();
          });
        probeReadback = pending;
        // A public screenshot request needs rendered frames even after presentation
        // cancellation. Drain it while hidden; never orphan a healthy queued copy.
        const readbackFrames = new AbortController();
        const readbackDeadline = setTimeout(() => readbackFrames.abort(new Error("Functional GPU readback timed out after 1500 ms")), 1500);
        try {
          while (!result && !failed) {
            await admissionFrame(readbackFrames.signal);
            if (!result && !failed) {
              if (lostInfo) throw new Error("GPU device lost during functional readback");
              renderFrame(engine, 16.67); metrics.admission.gpuFrames++;
            }
          }
        } finally { clearTimeout(readbackDeadline); }
        abort.signal.throwIfAborted();
        if (failed) throw new Error(`Functional GPU readback failed: ${String(failure)}`);
        if (!result || result.width !== output.width || result.height !== output.height) throw new Error("Functional GPU readback dimensions disagree with output");
        const screenshot = result;
        const dpr = options.size().dpr;
        const gpuPixels = probe.points.map(point => {
          // Map the probe point to the output bitmap: canvas CSS pixels times DPR, then to an RGBA byte offset.
          const position = probe!.matrix.transformPoint(point);
          const offset = (Math.floor(position.y * dpr) * screenshot.width + Math.floor(position.x * dpr)) * 4;
          return Array.from(screenshot.data.subarray(offset, offset + 4));
        });
        verifyProbePixels(gpuPixels, "GPU");
        const clipped = probe.matrix.transformPoint(probe.clipped);
        const clippedOffset = (Math.floor(clipped.y * dpr) * screenshot.width + Math.floor(clipped.x * dpr)) * 4;
        const clippedPixel = Array.from(screenshot.data.subarray(clippedOffset, clippedOffset + 4));
        // The point outside the clip must be white (the background clear), proving the clip applies to GPU drawing.
        if (clippedPixel.length !== 4 || clippedPixel.some(value => Math.abs(value - 255) > 2)) {
          throw new Error("Functional GPU viewport clip probe failed");
        }
        metrics.admission.last = { nativePixels: [], gpuPixels, geometry: geometryResult, frameBounds: frameResult, projective: projectiveResult };
        const { outcome } = await waitForTeardown(engine, observer?.lost, 1500, pending.completion);
        sample(metrics.fenceOutcomes, outcome);
        metrics.fenceCount++;
        if (outcome.kind !== "completed" || lostInfo) throw new Error(`Functional probe cleanup fence did not complete: ${outcome.kind}`);
        nativeHost().clearElementGeometry(probe.element);
        validateAppliedGeometry(nativeHost(), probe.element, new DOMMatrix());
        releaseProbe();
        unpresent();
        for (const pass of passes) disposePass(pass);
        passes = [];
        releaseTexture(texture); textures.delete(texture); resources.textures--;
        layers = [];
        probeReadback = undefined;
        metrics.admission.passes++;
      } finally {
        clearTimeout(deadline);
        if (captureAbort === abort) captureAbort = undefined;
      }
    }
  /**
   * Admission sequence: checks capability and budgets, creates the engine (5000 ms cap), observes device loss,
   * moves the root into the canvas, runs functional admission, reconciles, captures and draws once, then
   * sets mode to `gpu`. Any failure or cancellation recovers to ordinary DOM. `intent` is the
   * `admissionIntent` captured when queued, so a later disable cancels it.
   */
  async function enable(intent: number) {
    if (intent !== admissionIntent) return state();
    if (mode === "disposed") throw new Error("Surface is disposed");
    if (initializing || resources.pendingEngines) throw new Error("Previous engine admission has not settled");
    if (resources.pendingCleanups) throw new Error("GPU cleanup pending; reentry refused until a confirmed fence or loss");
    if (resources.probeReadbacks) throw new Error("Public admission readback pending; reentry refused until the SDK request settles");
    if (transitioning) throw new Error("Wait for renderer recovery before admission");
    initializing = true;
    admissionCancellation = undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let abandoned = false;
    try {
      await settle();
      if (intent !== admissionIntent) throw new Error("Admission cancelled by explicit disable/disposal");
      if (mode === "gpu") return state();
      const policy = options.policy?.();
      if (policy) throw new Error(policy);
      const budget = options.budgets ?? { layers: 32, pixels: 2_000_000 };
      const size = options.size();
      if (![size.width, size.height, size.dpr].every(value => Number.isFinite(value) && value > 0)) throw new Error("Invalid surface dimensions/DPR");
      const capability = capabilities(output);
      if (!isDrawableCanvas(host)) throw new Error(capability.missing.join("; "));
      drawable = host;
      enableDrawable(nativeHost());
      boundary.assertMovable();
      if (!navigator.gpu) throw new Error("WebGPU unavailable");
      resources.pendingEngines++;
      // A late engine is disposed instead of adopted if admission already gave up on it.
      const pending = createEngine(output, { msaaSamples: 1, maxDevicePixelRatio: 1 }).then(value => {
        resources.pendingEngines--;
        if (abandoned) { disposeEngine(value); status(); return undefined; }
        resources.engines++;
        return value;
      }, error => { resources.pendingEngines--; status(); throw error; });
      engine = await Promise.race([pending, new Promise<never>((_, reject) => { timer = setTimeout(() => { abandoned = true; reject(new Error("WebGPU initialization timed out after 5000 ms; late engine will be disposed")); }, 5000); })]);
      clearTimeout(timer);
      if (!engine) throw new Error("Engine admission was abandoned");
      const deviceQueue = configuredDevice(output).queue;
      if (!isDrawableQueue(deviceQueue)) throw new Error("Current public GPUQueue.drawElementImageToTexture unavailable; WebGL2 direct capture remains unqualified");
      queue = deviceQueue;
      if (intent !== admissionIntent) throw new Error("Admission cancelled during engine initialization");
      if (admissionCancellation) throw new Error(admissionCancellation);
      lostInfo = undefined;
      const admittedEngine = engine;
      observer = observeConfiguredDevice(output, info => {
        if (engine !== admittedEngine) return;
        lostInfo = info;
        sample(metrics.deviceLosses, { reason: info.reason, message: info.message, duringMotion: moving || !!options.isMoving?.(), duringAdmission: initializing });
        metrics.deviceLossCount++;
        generation++;
        cancelScheduled();
        reason = `GPU device lost (${info.reason}): ${info.message}`;
        status();
        void serialize(async () => {
          if (engine === admittedEngine && !terminalCleanupPending) await recoverToDOM(`GPU device lost (${info.reason}): ${info.message}; original root recovered to ordinary DOM.`);
        }).catch(reportFailure);
      });
      resources.lossObservers++;
      const enrolled = options.layers();
      if (!enrolled.length || enrolled.length > budget.layers) throw new Error("Layer-count admission budget exceeded or no enrolled layers");
      if (enrolled.some(layer => !container.contains(layer.element) || !layer.element.isConnected)) throw new Error("Detached or foreign enrolled layer");
      if (new Set(enrolled.map(layer => layer.id)).size !== enrolled.length) throw new Error("Duplicate enrolled layer identity");
      if (enrolled.some(layer => enrolled.some(other => other !== layer && other.element.contains(layer.element)))) throw new Error("Nested enrollment requires ordinary DOM; duplicate native paint is refused");
      const activeIds = new Set(enrolled.map(layer => layer.id));
      for (const id of Object.keys(metrics.perLayer)) if (!activeIds.has(id)) delete metrics.perLayer[id];
      const bitmapWidth = Math.round(size.width * size.dpr), bitmapHeight = Math.round(size.height * size.dpr);
      if (Math.max(bitmapWidth, bitmapHeight) > observer.maxTextureDimension2D || bitmapWidth * bitmapHeight > budget.pixels * 4) {
        throw new Error("GPU output exceeds the configured device limit or output-pixel safety budget");
      }
      setEngineSize(engine, Math.round(size.width * size.dpr), Math.round(size.height * size.dpr));
      host.hidden = false;
      output.style.setProperty("pointer-events", "auto");
      if (boundary.moveToCapture()) metrics.moves++;
      options.presentation?.("gpu");
      ordinary.hidden = true;
      mode = "admitting";
      dx = tint = 0;
      generation++;
      const admissionGeneration = generation;
      await functionalAdmission();
      const assertCurrentAdmission = () => {
        if (intent !== admissionIntent) throw new Error("Admission cancelled by explicit disable/disposal");
        if (generation !== admissionGeneration || mode !== "admitting") throw new Error(`Admission generation retired; fresh admission required: ${reason}`);
        const currentPolicy = options.policy?.();
        if (currentPolicy) throw new Error(currentPolicy);
      };
      assertCurrentAdmission();
      reconcile();
      await captureLayers();
      assertCurrentAdmission();
      if (options.isPaused?.()) throw new Error("GPU admission requires a visible surface");
      if (lostInfo) throw new Error("GPU device lost during admission");
      const device = configuredDevice(output);
      device.pushErrorScope("validation");
      try { draw(); }
      finally {
        const error = await device.popErrorScope();
        if (error) throw new Error(`Composition validation failed: ${error.message}`);
      }
      assertCurrentAdmission();
      if (options.isPaused?.()) throw new Error("GPU admission requires a visible surface");
      if (lostInfo) throw new Error("GPU device lost before admission completed");
      mode = "gpu";
      output.hidden = false;
      reason = "Current content=drawable owning WebGPU canvas; synchronous native-paint direct public textures; complete same-root GPU successors.";
      if (options.instrumentProbe && !instrumentAttached) {
        instrumentAttached = true;
        try { options.instrumentProbe.attach({ engine: engine!, draw }); }
        catch (error) { console.error("Underglass instrument probe attach failed", error); }
      }
    } catch (error) {
      abandoned = true;
      await recoverToDOM(admissionCancellation ?? (lostInfo
        ? `GPU admission failed: device lost (${lostInfo.reason}): ${lostInfo.message}`
        : `GPU admission failed: ${String(error)}`));
      if (!admissionCancellation) console.error(reason);
    } finally { clearTimeout(timer); initializing = false; scheduleCapture(); status(); }
    return state();
  }
  /** Explicit disable: waits for idle then recovers to ordinary DOM. Caller-owned, so nothing re-enables GPU. */
  async function disable() {
    if (mode === "disposed") return state();
    if (terminalCleanupPending) return state();
    await settle();
    await recoverToDOM("Explicit disable: original controls and React root retained in ordinary DOM.");
    return state();
  }
  /**
   * Diagnostic GPU-only motion: draws `count` frames shifting all layers up to `shift` CSS pixels with a tint of
   * `shade`, with no capture or upload. Returns counters before and after. Throws if topology changes.
   */
  async function frames(count = 60, shift = 40, shade = 0.5) {
    if (!Number.isInteger(count) || count < 1 || count > 300 || !Number.isFinite(shift) || Math.abs(shift) > 100 || !Number.isFinite(shade) || shade < 0 || shade > 1) throw new Error("Invalid bounded GPU-frame parameters");
    await settle();
    if (mode !== "gpu" || moving || initializing || transitioning) throw new Error("GPU-only frames require an idle active GPU surface");
    moving = true;
    const version = generation;
    const before = { captures: metrics.captures, pixelCopies: metrics.pixelCopies, uploads: metrics.uploads, gpuFrames: metrics.gpuFrames };
    try {
      for (let i = 1; i <= count; i++) {
        await new Promise<void>((resolve, reject) => {
          resources.scheduledFrames++;
          const id = requestAnimationFrame(() => {
            motionFrame = undefined;
            resources.scheduledFrames--;
            resolve();
          });
          motionFrame = { id, reject };
        });
        if (mode !== "gpu" || lostInfo || generation !== version) throw new Error("GPU-only motion interrupted by topology change or device loss");
        dx = shift * i / count;
        tint = shade;
        draw();
      }
    } finally { moving = false; status(); }
    return { before, after: { captures: metrics.captures, pixelCopies: metrics.pixelCopies, uploads: metrics.uploads, gpuFrames: metrics.gpuFrames }, state: state() };
  }
  /** Disables GPU, then releases the root, listeners and both canvases. Refused while cleanup is pending. */
  async function dispose() {
    if (mode === "disposed") return state();
    await disable();
    if (resources.pendingCleanups) throw new Error("GPU cleanup pending; persistent ordinary DOM remains mounted");
    if (resources.probeReadbacks) throw new Error("Public admission readback pending; persistent ordinary DOM remains mounted");
    boundary.dispose();
    resources.roots--;
    for (const remove of removers.splice(0)) remove();
    if (options.captureHost) options.captureHost.width = options.captureHost.height = 0;
    output.width = output.height = 0;
    options.captureHost?.remove();
    output.remove();
    resources.captureCanvases = resources.outputCanvases = 0;
    mode = "disposed";
    reason = "Disposed root, captures, pixel canvases, textures, effect, renderer, engine and owned listeners.";
    status();
    return state();
  }
  /**
   * Diagnosed fallback: presents DOM immediately, then queues GPU teardown. No-op if already in DOM mode.
   * Cancels a running admission with `message`.
   */
  function recover(message: string) {
    if (mode === "dom" && transitioning) return Promise.resolve();
    if (mode !== "gpu" && mode !== "admitting" && !initializing) return Promise.resolve();
    if (initializing) admissionCancellation = message;
    presentDOM(message);
    return serialize(async () => {
      if (mode !== "disposed" && engine && !terminalCleanupPending) await recoverToDOM(message);
    });
  }
  /**
   * Accumulates layers touched by a paint's changedElements. A missing or empty
   * list is unknown attribution (e.g. an external requestPaint), so every layer
   * is refreshed rather than risking stale pixels.
   */
  function markChanged(changed: unknown) {
    const listed = Array.isArray(changed) ? changed.filter((element): element is Element => element instanceof Element) : [];
    const elements = listed.length ? listed : undefined;
    for (const layer of current) {
      if (!elements || elements.some(element => element === layer.element || layer.element.contains(element) || element.contains(layer.element))) dirty.add(layer.id);
    }
  }
  // Native paint from the browser: records which layers changed, enforces `policy`, then uploads and draws.
  listen(host, "paint", event => {
    if (!active && !pending) return;
    const changed: unknown = Reflect.get(event, "changedElements");
    markChanged(changed);
    const policy = options.policy?.();
    if (policy) { void recover(policy).catch(reportFailure); return; }
    metrics.paintNotifications++;
    if (Array.isArray(changed)) sample(metrics.paintElements, changed.map(element => element instanceof Element ? element.id || element.tagName : String(element)));
    try { publishPaint(); }
    catch (error) {
      console.error("Underglass synchronous native publication failed", error);
      void recover(`Native publication failed: ${String(error)}`).catch(reportFailure);
    }
  });
  listen(container, "input", queueCapture);
  listen(container, "focusin", queueCapture);
  listen(container, "focusout", queueCapture);
  status();
  /** Invalidates queued and running admissions, then recovers to DOM. */
  function cancelAdmission(message: string) {
    admissionIntent++;
    if (initializing) admissionCancellation = message;
    void recover(message).catch(reportFailure);
  }
  // Public surface driven by `CanvasRuntime`; see the `createSurfaceRenderer` doc.
  return { container, enable: () => {
    const intent = admissionIntent;
    return serialize(() => enable(intent));
  }, disable: () => {
    cancelAdmission("Explicit disable: original controls and React root retained in ordinary DOM.");
    return serialize(disable);
  }, frames, toggleTint: () => frames(1, dx, tint ? 0 : 1), toggleMotion: () => frames(60, dx ? 0 : 40, tint), settle,
    idle: () => serialize(async () => {}), state, dispose: () => {
      cancelAdmission("Runtime disposed: pending admission cancelled.");
      return serialize(dispose);
    }, invalidate: queueCapture, draw,
    reconcile,
    // The layer set or layout moved: refresh native geometry now and skip drawing until `reconcile` runs.
    reconcileGeometry: () => {
      // Only a real membership change (a layer joined, left, was replaced or moved in order) needs the full
      // reconcile before drawing. A content or layout change keeps the same layers: `draw` already refuses
      // incomplete coverage, and a stuck flag would skip every frame after admission.
      const next = options.layers();
      if (next.length !== current.length || next.some((layer, index) => layer.id !== current[index]!.id || layer.element !== current[index]!.element)) membershipPending = true;
      current = next; geometry();
    },
    acceptsCustom: (id: string, definition: ApplicationEffect) => admittedCustom[layers.findIndex(layer => layer.id === id)]?.effect === definition,
    acceptsMaterial: (id: string, material: ApplicationEffect | "relief") => {
      const shaders = admittedCustom[layers.findIndex(layer => layer.id === id)];
      return material === "relief" ? shaders?.relief === true : shaders?.material === material;
    },
    phase: () => mode, version: () => generation, resume: scheduleCapture,
    frameBounded: () => frameBounds === "bounded",
    /** Whether admission proved native hits follow a tilted layer's projection. */
    projectiveHits: () => projective === "proven",
    pause: () => {
      // Paints skipped while hidden are not replayed; refresh every layer on resume.
      for (const layer of current) dirty.add(layer.id);
      if (scheduled) { cancelAnimationFrame(scheduled); scheduled = 0; resources.scheduledFrames--; }
      captureAbort?.abort(new DOMException("Native paint paused while hidden", "AbortError"));
      clearTimeout(paintTimer); paintRequested = false; resources.paintWaits = 0;
    },
    recover,
  };
}
