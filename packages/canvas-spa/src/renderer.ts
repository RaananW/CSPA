import {
  createEngine, disposeEngine, createDynamicTexture, releaseTexture,
  createEffectWrapper, disposeEffectWrapper, setEffectTexture, setEffectUniforms,
  createEffectRenderer, disposeEffectRenderer, registerEffectRenderer, unregisterEffectRenderer,
  setEngineSize, renderFrame, captureScreenshot,
  type EngineContext, type DynamicTexture2D, type EffectWrapper,
} from "@babylonjs/lite";
import { capabilities, enableDrawable, isDrawableCanvas, isDrawableQueue, validateGeometry, validateAppliedGeometry, type DrawableCanvas, type DrawableQueue } from "./native.js";
import { completeCoverage, type CaptureCoverage } from "./publication.js";
import { createMountBoundary, type MountBoundaryOptions } from "./mount-boundary.js";
import { configuredDevice, observeConfiguredDevice, waitForTeardown, type IdleOutcome } from "./device-lifecycle.js";
import { compositionShader, compositionUniforms } from "./composition.js";
import { createAdmissionProbe, verifyFrameBounds, verifyProbeGeometry, verifyProbePixels, type FrameBounds } from "./admission.js";
import type { Ripple } from "./ripple.js";
import type { ApplicationEffect, EffectDescriptor } from "./effects.js";
import type { CompiledMotion, CompiledProgramSet } from "./compiled.js";

export interface EnrolledLayer {
  id: string;
  element: HTMLElement;
  matrix(): DOMMatrix;
  clip?(matrix?: DOMMatrixReadOnly): { x: number; y: number; width: number; height: number } | undefined;
  opacity(): number;
  ripple?(): Ripple | undefined;
  effects?(): readonly EffectDescriptor[];
  effectsEnabled?(): boolean;
  compiledMotion?(): CompiledMotion | undefined;
}

export interface RendererStatus {
  mode: "dom" | "admitting" | "gpu" | "disposed";
  reason: string;
  resources: Record<string, number>;
  counts: { captures: number; pixelCopies: number; uploads: number; gpuFrames: number };
  recovery: string;
  deviceLoss: string;
  deviceLosses: { reason: GPUDeviceLostReason; message: string; duringMotion: boolean; duringAdmission: boolean }[];
  fenceOutcomes: IdleOutcome[];
}
export interface SurfaceRendererOptions extends MountBoundaryOptions {
  /** Serialized `RendererStatus` JSON, kept for compatibility. */
  onStatus?(message: string): void;
  onStatusChange?(status: RendererStatus): void;
  layers(): EnrolledLayer[];
  size(): { width: number; height: number; dpr: number };
  nativeOrigin?(): { x: number; y: number };
  policy?(): string | undefined;
  presentation?(mode: "dom" | "gpu"): void;
  onInterrupt?(): void;
  onRecovery?(reason: string): void;
  isMoving?(): boolean;
  isPaused?(): boolean;
  budgets?: { layers: number; pixels: number };
  compiled?: CompiledProgramSet;
  onMeasure?(sample: RendererSample): void;
}
export interface RendererSample {
  kind: "captureMs" | "uploadMs" | "frameWorkMs" | "frameIntervalsMs" | "readbackCompareMs" | "effectCompileMs";
  at: number;
  durationMs: number;
  phase: "admission" | "content";
  layerId?: string;
  bytes?: number;
}

export function createSurfaceRenderer(options: SurfaceRendererOptions) {
  const { outputCanvas: output, ordinaryHost: ordinary } = options;
  const boundary = createMountBoundary(options);
  const container = boundary.container;
  const host = output;
  const outputPointer = { value: output.style.getPropertyValue("pointer-events"), priority: output.style.getPropertyPriority("pointer-events") };
  let drawable: DrawableCanvas | undefined;
  function nativeHost(): DrawableCanvas {
    if (!drawable) throw new Error("Native canvas has not passed admission");
    return drawable;
  }
  const resources = { roots: 1, captureCanvases: 1, outputCanvases: 1, engines: 0, pendingEngines: 0, textures: 0, effects: 0, renderers: 0, stagingCanvases: 0, snapshots: 0, comparisonBuffers: 0, listeners: 0, scheduledFrames: 0, paintWaits: 0, lossObservers: 0, pendingCleanups: 0, probeElements: 0, probeReadbacks: 0 };
  const timing = () => ({ count: 0, totalMs: 0, minMs: null as number | null, maxMs: null as number | null });
  const layerMetrics: Record<string, { captures: number; pixelCopies: number; pixelReadbacks: number; uploads: number }> = Object.create(null);
  const metrics = { captures: 0, pixelCopies: 0, pixelReadbacks: 0, reusedUploads: 0, uploads: 0, paintNotifications: 0, deviceLossCount: 0, fenceCount: 0, effectShaderCompilations: 0, incompleteFramesSkipped: 0, shaderSourceGenerations: 0, precompiledShaderSelections: 0,
    admission: { attempts: 0, passes: 0, captures: 0, pixelCopies: 0, pixelReadbacks: 0, uploads: 0, gpuFrames: 0, gpuReadbacks: 0, geometryChecks: 0,
      last: undefined as { nativePixels: number[][]; gpuPixels: number[][]; geometry: ReturnType<typeof verifyProbeGeometry>; frameBounds: ReturnType<typeof verifyFrameBounds> } | undefined },
    timings: { captureMs: timing(), uploadMs: timing(), frameWorkMs: timing(), frameIntervalsMs: timing() },
    paintElements: [] as string[][], perLayer: layerMetrics, uploadBytes: 0, gpuFrames: 0, geometryUpdates: 0, moves: 0, deviceLosses: [] as { reason: GPUDeviceLostReason; message: string; duringMotion: boolean; duringAdmission: boolean }[], fenceOutcomes: [] as IdleOutcome[], captureMs: [] as number[], uploadMs: [] as number[], frameWorkMs: [] as number[], frameIntervalsMs: [] as number[] };
  function sample<T>(values: T[], value: T) {
    if (values.length === 256) values.shift();
    values.push(value);
  }
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
  let effect: EffectWrapper | undefined;
  let renderer: ReturnType<typeof createEffectRenderer> | undefined;
  let registered = false;
  let initializing = false;
  let transitioning = false;
  let work: Promise<void> | undefined;
  let scheduled = 0;
  let motionFrame: { id: number; reject(error: Error): void } | undefined;
  let captureAbort: AbortController | undefined;
  let generation = 0;
  let moving = false;
  let tint = 0;
  let dx = 0;
  let previousFrame: number | undefined;
  let admittedCustom: (ApplicationEffect | undefined)[] = [];
  function shaderFor(count: number, custom: readonly (ApplicationEffect | undefined)[]) {
    if (options.compiled) {
      if (custom.some(Boolean)) throw new Error("Compiled programs do not include runtime custom effect definitions");
      const program = options.compiled.programs[count - 1];
      if (!program) throw new Error(`Compiled layer capacity exceeded: ${count}`);
      metrics.precompiledShaderSelections++;
      return program;
    }
    metrics.shaderSourceGenerations++;
    return compositionShader(count, custom);
  }
  let clearedGeometry: { id: string; identity: boolean | null }[] = [];
  // Whether the last functional admission proved native hits stop at the canvas content box.
  let frameBounds: FrameBounds = "unverifiable";
  type Layer = EnrolledLayer & { extent: { width: number; height: number }; texture: DynamicTexture2D;
    coverage: CaptureCoverage; contentExtent: { width: number; height: number; pixelWidth: number; pixelHeight: number } };
  type Composition = { layers: Layer[]; effect: EffectWrapper; renderer: ReturnType<typeof createEffectRenderer>;
    textures: DynamicTexture2D[]; custom: (ApplicationEffect | undefined)[]; capacity: number;
    ready: boolean; size: ReturnType<SurfaceRendererOptions["size"]> };
  let layers: Layer[] = [];
  let current: EnrolledLayer[] = [];
  let pending: Composition | undefined;
  let active: Composition | undefined;
  let preparation: Promise<void> | undefined;
  let slotSerial = 0;
  let publicationGeneration = 0;
  let submittedGeneration = -1;
  let paintRequested = false;
  let membershipPending = false;
  let paintTimer: ReturnType<typeof setTimeout> | undefined;
  let queue: DrawableQueue | undefined;
  const compositions = new Set<Composition>();
  const retiring = new Set<Composition>();
  const textures = new Set<DynamicTexture2D>();
  const logicalSlots = new Map<string, number>();
  const nativeMatrices = new WeakMap<Element, DOMMatrix>();
  const nativeClips = new WeakMap<Element, string>();
  const nativeGrids = new WeakMap<Element, { width: number; height: number; dpr: number; pixelWidth: number; pixelHeight: number }>();
  let nativeOrder: EnrolledLayer[] = [];
  const retirements = new Set<Promise<void>>();
  const dirty = new Set<string>();
  const removers: (() => void)[] = [];
  let observer: ReturnType<typeof observeConfiguredDevice> | undefined;
  let lostInfo: GPUDeviceLostInfo | undefined;
  let probe: ReturnType<typeof createAdmissionProbe> | undefined;
  let probeReadback: { active: boolean; completion: Promise<void> } | undefined;
  let lifecycle = Promise.resolve();
  let admissionIntent = 0;
  let admissionCancellation: string | undefined;
  let terminalCleanupPending = false;
  function serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = lifecycle.then(operation);
    lifecycle = result.then(() => undefined, () => undefined);
    return result;
  }
  function reportFailure(error: unknown) {
    reason = `Lifecycle failure: ${String(error)}`;
    console.error(reason);
    status();
  }

  function status() {
    if (!options.onStatus && !options.onStatusChange) return;
    const value: RendererStatus = { mode, reason, resources: { ...resources }, counts: { captures: metrics.captures, pixelCopies: metrics.pixelCopies, uploads: metrics.uploads, gpuFrames: metrics.gpuFrames }, recovery: "Host-owned moveBefore; one persistent React root", deviceLoss: "Public configured-device lost promise -> ordinary DOM; explicit fresh-engine reentry", deviceLosses: [...metrics.deviceLosses], fenceOutcomes: [...metrics.fenceOutcomes] };
    options.onStatus?.(JSON.stringify(value, null, 2));
    options.onStatusChange?.(value);
  }
  function state() {
    return {
      mode, reason, initializing, transitioning, moving, clearedGeometry: [...clearedGeometry], resources: { ...resources }, metrics: structuredClone(metrics),
      publication: { generation: publicationGeneration, submittedGeneration, pending: membershipPending || !!pending || paintRequested,
        captures: layers.map(layer => ({ id: layer.id, ...layer.coverage, textureWidth: layer.texture.texture.width, textureHeight: layer.texture.texture.height })) },
      rootContainer: container.parentElement?.id,
      transforms: mode === "gpu" ? current.map(layer => ({ id: layer.element.id, matrix: Array.from(nativeHost().getElementTransform(layer.element).toFloat64Array()) })) : [],
    };
  }
  function listen(target: EventTarget, name: string, listener: EventListener) {
    target.addEventListener(name, listener);
    resources.listeners++;
    removers.push(() => { target.removeEventListener(name, listener); resources.listeners--; });
  }
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
  function releaseComposition() {
    if (renderer && registered) unregisterEffectRenderer(renderer);
    registered = false;
    if (renderer && ![...compositions].some(composition => composition.renderer === renderer)) {
      disposeEffectRenderer(renderer); resources.renderers--;
    }
    if (effect && ![...compositions].some(composition => composition.effect === effect)) {
      disposeEffectWrapper(effect); resources.effects--;
    }
    for (const composition of compositions) {
      disposeEffectRenderer(composition.renderer); resources.renderers--;
      disposeEffectWrapper(composition.effect); resources.effects--;
    }
    compositions.clear();
    for (const texture of textures) { releaseTexture(texture); resources.textures--; }
    textures.clear();
    layers = [];
    current = [];
    pending = active = undefined;
    effect = renderer = undefined;
    logicalSlots.clear();
    admittedCustom = [];
  }
  function releaseProbe() {
    if (!probe) return;
    probe.element.remove();
    probe = undefined;
    resources.probeElements -= 2;
  }
  function destroyGPU() {
    cancelScheduled();
    releaseProbe();
    if (!probeReadback?.active) probeReadback = undefined;
    if (observer) { observer.release(); observer = undefined; resources.lossObservers--; }
    releaseComposition();
    if (engine) { disposeEngine(engine); engine = undefined; resources.engines--; }
  }
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
      console.error("CanvasSPA DOM presentation restoration failed", error);
      status();
    }
    options.onRecovery?.(message);
  }
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
       const outstanding = Promise.all([...retirements, ...(probeReadback?.active ? [probeReadback.completion] : [])]).then(() => undefined);
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
      const matrix = new DOMMatrix().translate(dx, 0).multiply(layer.matrix());
      validateGeometry(matrix);
      const origin = options.nativeOrigin?.() ?? { x: 0, y: 0 };
      const nativeMatrix = new DOMMatrix().translate(origin.x, origin.y).multiply(matrix);
      validateGeometry(nativeMatrix);
      const previous = nativeMatrices.get(layer.element);
      const clip = layer.clip?.(matrix) ?? { x: 0, y: 0, width: layer.element.offsetWidth, height: layer.element.offsetHeight };
      const clipKey = JSON.stringify(clip);
      if (orderChanged || !previous || nativeClips.get(layer.element) !== clipKey || ["a", "b", "c", "d", "e", "f"].some(key => Reflect.get(previous, key) !== Reflect.get(nativeMatrix, key))) {
        nativeHost().updateElementGeometry(layer.element, { canvasTransform: nativeMatrix, canvasClip: clip, preserveHitTestOrder: !orderChanged });
        nativeMatrices.set(layer.element, nativeMatrix);
        nativeClips.set(layer.element, clipKey);
        metrics.geometryUpdates++;
      }
      validateAppliedGeometry(nativeHost(), layer.element, nativeMatrix);
    }
    nativeOrder = [...ordered];
  }
  function draw() {
    if (!engine || !effect || mode !== "gpu" && mode !== "admitting" || lostInfo || options.isPaused?.()) return;
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
      if (membershipPending || pending || !complete()) { metrics.incompleteFramesSkipped++; requestPaint(); return; }
      setEffectUniforms(effect, compositionUniforms(layers, options.size().dpr, dx, tint, active?.capacity, active?.custom, !!options.compiled));
      renderFrame(engine, 16.67);
      submittedGeneration = publicationGeneration;
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
  async function captureLayers() {
    requestPaint();
    await settle();
  }
  function scheduleCapture() {
    if (mode === "gpu" && dirty.size) requestPaint();
  }
  function queueCapture(target?: Event | Element | string) {
    const node = target instanceof Event ? target.target : target;
    for (const layer of current) {
      if (!node || typeof node === "string" && layer.id === node
        || node instanceof Element && (layer.element.contains(node) || node.contains(layer.element))) dirty.add(layer.id);
    }
    scheduleCapture();
  }
  async function settle() {
    const deadline = performance.now() + 3000;
    while (scheduled || work || preparation || paintRequested || pending) {
      if (performance.now() > deadline) throw new Error("Native refresh did not settle within 3000 ms");
      if (work) await work;
      else if (preparation) await preparation;
      else await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    }
  }
  function required(layer: EnrolledLayer, size = options.size()) {
    const width = layer.element.offsetWidth, height = layer.element.offsetHeight;
    // New originals have no cached native paint record yet. Reserve the target
    // grid before paint; only paint reads the browser's actual default extent.
    const recorded = nativeGrids.get(layer.element);
    const matching = recorded?.width === width && recorded.height === height && recorded.dpr === size.dpr;
    return { width, height, pixelWidth: matching ? recorded.pixelWidth : Math.ceil(width * size.dpr),
      pixelHeight: matching ? recorded.pixelHeight : Math.ceil(height * size.dpr) };
  }
  function complete(candidate = layers) {
    return candidate.length === current.length && candidate.every((layer, index) =>
      layer.id === current[index]!.id && completeCoverage(layer.coverage, required(current[index]!)));
  }
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
  function retire(composition: Composition) {
    if (!queue || !compositions.has(composition) || retiring.has(composition)) return;
    retiring.add(composition);
    unregisterEffectRenderer(composition.renderer);
    resources.pendingCleanups++;
    const finish = () => {
      retiring.delete(composition);
      resources.pendingCleanups--;
      if (!compositions.delete(composition)) return;
      disposeEffectRenderer(composition.renderer); resources.renderers--;
      disposeEffectWrapper(composition.effect); resources.effects--;
      for (const texture of composition.textures) if (![...compositions].some(other => other.textures.includes(texture))) {
        if (textures.delete(texture)) { releaseTexture(texture); resources.textures--; }
      }
      metrics.fenceCount++;
    };
    const lost = observer!.lost;
    const fence = Promise.race([queue.onSubmittedWorkDone(), lost.then(() => undefined)]).then(finish).catch(error => {
      // A rejected queue promise is not permission to destroy healthy resources.
      console.error("CanvasSPA successor retirement fence failed; retaining resources", error);
      return lost.then(finish);
    }).finally(() => { retirements.delete(fence); });
    retirements.add(fence);
  }
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
    const budget = options.budgets ?? { layers: 8, pixels: 2_000_000 };
    if (current.length > budget.layers || ids.size !== current.length) throw new Error("Layer-count/identity budget exceeded");
    const extents = current.map(spec => {
      const extent = required(spec, size);
      if (!extent.width || !extent.height || ![extent.pixelWidth, extent.pixelHeight].every(value => Number.isFinite(value) && value > 0 && value <= observer!.maxTextureDimension2D)) {
        throw new Error(`Invalid native capture grid: ${spec.id}`);
      }
      return extent;
    });
    const outputWidth = Math.round(size.width * size.dpr), outputHeight = Math.round(size.height * size.dpr);
    if (extents.reduce((sum, extent) => sum + extent.pixelWidth * extent.pixelHeight, 0) > budget.pixels * size.dpr * size.dpr) throw new Error("Captured-pixel safety budget exceeded");
    if (![size.width, size.height, size.dpr].every(value => Number.isFinite(value) && value > 0)
      || Math.max(outputWidth, outputHeight) > observer!.maxTextureDimension2D
      || outputWidth * outputHeight > budget.pixels * 4) throw new Error("GPU output size/device budget exceeded");
    const next = current.map((spec, index) => {
      const extent = extents[index]!;
      const retained = (pending?.layers ?? layers).find(layer => layer.id === spec.id
        && layer.coverage.slot === logicalSlots.get(spec.id)
        && layer.texture.texture.width >= extent.pixelWidth && layer.texture.texture.height >= extent.pixelHeight);
      const layout = { width: extent.width, height: extent.height };
      if (retained) return { ...retained, ...spec, extent: layout };
      // Nearest taps: the composition shader filters bilinearly in premultiplied space.
      const texture = createDynamicTexture(engine!, extent.pixelWidth, extent.pixelHeight, { minFilter: "nearest", magFilter: "nearest" });
      textures.add(texture); resources.textures++;
      return { ...spec, extent: layout, texture,
        coverage: { slot: logicalSlots.get(spec.id)!, capturedSlot: -1, width: 0, height: 0, pixelWidth: 0, pixelHeight: 0 },
        contentExtent: { width: 0, height: 0, pixelWidth: 0, pixelHeight: 0 } };
    });
    for (const spec of current) metrics.perLayer[spec.id] ??= { captures: 0, pixelCopies: 0, pixelReadbacks: 0, uploads: 0 };
    const compatibleBindings = active && next.length <= active.capacity && next.every(layer => {
      const definition = layer.effects?.().find(value => value.kind === "custom")?.definition;
      return active!.textures.includes(layer.texture) && (!definition || active!.custom.includes(definition));
    });
    if (compatibleBindings && !pending && output.width === outputWidth && output.height === outputHeight && complete(next)) {
      // Keep the validated pipeline's capacity; unused lanes have zero extent.
      // Retain all of its bound textures until its submitted work is fenced.
      next.forEach((layer, index) => setEffectTexture(active!.effect, `layer${index}`, layer.texture));
      registerEffectRenderer(active!.renderer);
      layers = next; active!.layers = next;
      admittedCustom = next.map(layer => layer.effects?.().find(value => value.kind === "custom")?.definition);
      draw(); queueCapture(); return;
    }
    const previous = pending;
    const custom = next.map(layer => layer.effects?.().find(value => value.kind === "custom")?.definition);
    const shader = shaderFor(next.length, custom);
    const device = configuredDevice(output);
    const compileStarted = performance.now();
    let compilation: Promise<void> = Promise.resolve();
    device.pushErrorScope("validation");
    let nextEffect: EffectWrapper | undefined, nextRenderer: ReturnType<typeof createEffectRenderer> | undefined;
    try {
      if (custom.some(Boolean) || options.compiled) {
        metrics.effectShaderCompilations++;
        const module = device.createShaderModule({ code: `struct EffectVertexOutput { @builtin(position) position: vec4f, @location(0) uv: vec2f }; ${shader.fragmentWGSL}` });
        compilation = module.getCompilationInfo().then(info => {
          const errors = info.messages.filter(message => message.type === "error");
          if (errors.length) throw new Error(`Application effect compilation failed: ${errors.map(message => `${message.lineNum}:${message.linePos} ${message.message}`).join("; ")}`);
        }).finally(() => {
          options.onMeasure?.({ kind: "effectCompileMs", at: performance.now(), durationMs: performance.now() - compileStarted, phase: "admission" });
        });
      }
      nextEffect = createEffectWrapper(engine, { name: `native-successor-${publicationGeneration}`, ...shader });
      resources.effects++;
      next.forEach((layer, index) => setEffectTexture(nextEffect!, `layer${index}`, layer.texture));
      nextRenderer = createEffectRenderer(engine.surfaces[0], nextEffect);
      resources.renderers++;
      // Public registration prepares pipelines/bindings, without a submitted frame.
      registerEffectRenderer(nextRenderer); unregisterEffectRenderer(nextRenderer);
    } catch (error) {
      // No commands were submitted by preparation, so these bindings are idle.
      if (nextRenderer) { disposeEffectRenderer(nextRenderer); resources.renderers--; }
      if (nextEffect) { disposeEffectWrapper(nextEffect); resources.effects--; }
      void compilation.catch(reportFailure);
      void device.popErrorScope().catch(reportFailure);
      throw error;
    }
    const successor = { layers: next, textures: next.map(layer => layer.texture), custom, capacity: next.length,
      effect: nextEffect, renderer: nextRenderer, ready: false, size };
    pending = successor; compositions.add(successor);
    if (previous) retire(previous);
    const publishCached = () => {
      if (!complete(next) || output.width !== outputWidth || output.height !== outputHeight) return false;
      const previousActive = active;
      if (renderer && registered) unregisterEffectRenderer(renderer);
      layers = next; effect = nextEffect; renderer = nextRenderer;
      registerEffectRenderer(renderer); registered = true;
      successor.ready = true; active = successor; pending = undefined;
      admittedCustom = custom;
      draw();
      if (previousActive) retire(previousActive);
      queueCapture();
      return true;
    };
    let preparationTimer: ReturnType<typeof setTimeout>;
    const preparationTimeout = new Promise<never>((_, reject) => {
      preparationTimer = setTimeout(() => reject(new Error("Successor composition preparation timed out after 1500 ms")), 1500);
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
      .finally(() => { clearTimeout(preparationTimer); if (preparation === prepared) preparation = undefined; });
    preparation = prepared;
  }
  function publishPaint() {
    clearTimeout(paintTimer); paintRequested = false; resources.paintWaits = 0;
    if (!engine || !queue || lostInfo || options.isPaused?.() || mode !== "gpu" && mode !== "admitting") return;
    if (pending && !pending.ready) { requestPaint(); return; }
    const successor = pending ?? active;
    if (!successor) return;
    const grids = successor.layers.map(layer => {
      const native = nativeHost().getElementImageDefaultSize(layer.element);
      nativeGrids.set(layer.element, { width: layer.element.offsetWidth, height: layer.element.offsetHeight,
        dpr: options.size().dpr, pixelWidth: native.width, pixelHeight: native.height });
      return native;
    });
    if (successor.layers.some((layer, index) => grids[index]!.width > layer.texture.texture.width
      || grids[index]!.height > layer.texture.texture.height)) {
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
      const resized = output.width !== width || output.height !== height;
      if (resized) setEngineSize(engine, width, height);
      const previous = active;
      if (pending) {
        if (renderer && registered) unregisterEffectRenderer(renderer);
        layers = successor.layers; effect = successor.effect; renderer = successor.renderer;
        registerEffectRenderer(renderer); registered = true;
        active = successor; pending = undefined;
        admittedCustom = layers.map(layer => layer.effects?.().find(value => value.kind === "custom")?.definition);
      }
      dirty.clear();
      draw();
      if (resized) requestPaint();
      if (previous && previous !== successor) retire(previous);
    } finally {
      void device.popErrorScope().then(error => {
        if (error) { console.error(error.message); void recover(`Native upload/composition validation failed: ${error.message}`).catch(reportFailure); }
      }).catch(reportFailure);
    }
  }
    async function createComposition(name: string) {
      if (!engine) throw new Error("Composition requires an admitted engine");
      admittedCustom = layers.map(layer => layer.effects?.().find(value => value.kind === "custom")?.definition);
      const shader = shaderFor(layers.length, admittedCustom);
      if (admittedCustom.some(Boolean) || options.compiled) {
        const started = performance.now();
        const device = configuredDevice(output);
        device.pushErrorScope("validation");
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          metrics.effectShaderCompilations++;
          const module = device.createShaderModule({ code: `struct EffectVertexOutput { @builtin(position) position: vec4f, @location(0) uv: vec2f }; ${shader.fragmentWGSL}` });
          const compilation = await Promise.race([module.getCompilationInfo(), new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error("Application effect compilation timed out after 5000ms")), 5000);
          })]);
          const errors = compilation.messages.filter(message => message.type === "error");
          if (errors.length) throw new Error(`Application effect compilation failed: ${errors.map(message => `${message.lineNum}:${message.linePos} ${message.message}`).join("; ")}`);
        } finally {
          clearTimeout(timer);
          const error = await device.popErrorScope();
          options.onMeasure?.({ kind: "effectCompileMs", at: performance.now(), durationMs: performance.now() - started, phase: "admission" });
          if (error) throw new Error(`Application effect compilation failed: ${error.message}`);
        }
      }
      effect = createEffectWrapper(engine, { name, ...shader });
      resources.effects++;
      layers.forEach((layer, index) => setEffectTexture(effect!, `layer${index}`, layer.texture));
      renderer = createEffectRenderer(engine.surfaces[0], effect);
      resources.renderers++;
      registerEffectRenderer(renderer);
      registered = true;
    }
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
    async function functionalAdmission() {
      if (!engine) throw new Error("Functional admission requires an engine");
      metrics.admission.attempts++;
      probe = createAdmissionProbe(nativeHost());
      resources.probeElements += 2;
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
                if (actual.width > texture.texture.width || actual.height > texture.texture.height) throw new Error("Functional probe native grid exceeds prepared texture");
                probeLayer.contentExtent = { width: probe!.extent, height: probe!.extent, pixelWidth: actual.width, pixelHeight: actual.height };
                queue!.drawElementImageToTexture({ source: probe!.element }, { texture: texture.texture });
                metrics.admission.captures++; metrics.admission.uploads++;
                setEffectUniforms(effect!, compositionUniforms(layers, options.size().dpr, 0, 0, layers.length, [], !!options.compiled));
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
        setEffectUniforms(effect!, compositionUniforms(layers, options.size().dpr, 0, 0, layers.length, [], !!options.compiled));
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
          const position = probe!.matrix.transformPoint(point);
          const offset = (Math.floor(position.y * dpr) * screenshot.width + Math.floor(position.x * dpr)) * 4;
          return Array.from(screenshot.data.subarray(offset, offset + 4));
        });
        verifyProbePixels(gpuPixels, "GPU");
        const clipped = probe.matrix.transformPoint({ x: probe.extent * 0.9, y: probe.extent / 2 });
        const clippedOffset = (Math.floor(clipped.y * dpr) * screenshot.width + Math.floor(clipped.x * dpr)) * 4;
        const clippedPixel = Array.from(screenshot.data.subarray(clippedOffset, clippedOffset + 4));
        if (clippedPixel.length !== 4 || clippedPixel.some(value => Math.abs(value - 255) > 2)) {
          throw new Error("Functional GPU viewport clip probe failed");
        }
        metrics.admission.last = { nativePixels: [], gpuPixels, geometry: geometryResult, frameBounds: frameResult };
        const { outcome } = await waitForTeardown(engine, observer?.lost, 1500, pending.completion);
        sample(metrics.fenceOutcomes, outcome);
        metrics.fenceCount++;
        if (outcome.kind !== "completed" || lostInfo) throw new Error(`Functional probe cleanup fence did not complete: ${outcome.kind}`);
        nativeHost().clearElementGeometry(probe.element);
        validateAppliedGeometry(nativeHost(), probe.element, new DOMMatrix());
        releaseProbe();
        if (renderer) { disposeEffectRenderer(renderer); resources.renderers--; renderer = undefined; }
        if (effect) { disposeEffectWrapper(effect); resources.effects--; effect = undefined; }
        registered = false;
        releaseTexture(texture); textures.delete(texture); resources.textures--;
        layers = [];
        probeReadback = undefined;
        metrics.admission.passes++;
      } finally {
        clearTimeout(deadline);
        if (captureAbort === abort) captureAbort = undefined;
      }
    }
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
      const budget = options.budgets ?? { layers: 8, pixels: 2_000_000 };
      const size = options.size();
      if (![size.width, size.height, size.dpr].every(value => Number.isFinite(value) && value > 0)) throw new Error("Invalid surface dimensions/DPR");
      const capability = capabilities(output);
      if (!isDrawableCanvas(host)) throw new Error(capability.missing.join("; "));
      drawable = host;
      enableDrawable(nativeHost());
      boundary.assertMovable();
      if (!navigator.gpu) throw new Error("WebGPU unavailable");
      resources.pendingEngines++;
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
    } catch (error) {
      abandoned = true;
      await recoverToDOM(admissionCancellation ?? (lostInfo
        ? `GPU admission failed: device lost (${lostInfo.reason}): ${lostInfo.message}`
        : `GPU admission failed: ${String(error)}`));
      if (!admissionCancellation) console.error(reason);
    } finally { clearTimeout(timer); initializing = false; scheduleCapture(); status(); }
    return state();
  }
  async function disable() {
    if (mode === "disposed") return state();
    if (terminalCleanupPending) return state();
    await settle();
    await recoverToDOM("Explicit disable: original controls and React root retained in ordinary DOM.");
    return state();
  }
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
      console.error("CanvasSPA synchronous native publication failed", error);
      void recover(`Native publication failed: ${String(error)}`).catch(reportFailure);
    }
  });
  listen(container, "input", queueCapture);
  listen(container, "focusin", queueCapture);
  listen(container, "focusout", queueCapture);
  status();
  function cancelAdmission(message: string) {
    admissionIntent++;
    if (initializing) admissionCancellation = message;
    void recover(message).catch(reportFailure);
  }
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
    reconcileGeometry: () => { membershipPending = true; current = options.layers(); geometry(); },
    acceptsCustom: (id: string, definition: ApplicationEffect) => admittedCustom[layers.findIndex(layer => layer.id === id)] === definition,
    phase: () => mode, version: () => generation, resume: scheduleCapture,
    frameBounded: () => frameBounds === "bounded",
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
