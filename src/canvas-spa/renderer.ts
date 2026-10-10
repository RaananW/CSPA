import {
  createEngine, disposeEngine, createDynamicTexture, updateDynamicTexture, releaseTexture,
  createEffectWrapper, disposeEffectWrapper, setEffectTexture, setEffectUniforms,
  createEffectRenderer, disposeEffectRenderer, registerEffectRenderer, unregisterEffectRenderer,
  setEngineSize, renderFrame, captureScreenshot,
  type EngineContext, type DynamicTexture2D, type EffectWrapper,
} from "@babylonjs/lite";
import { capabilities, enableDrawable, isDrawableCanvas, isDrawableContext, validateGeometry, validateAppliedGeometry, waitForPaint, type DrawableCanvas } from "./native.js";
import { createMountBoundary, type MountBoundaryOptions } from "./mount-boundary.js";
import { configuredDevice, observeConfiguredDevice, waitForTeardown, type IdleOutcome } from "./device-lifecycle.js";
import { compositionShader, compositionUniforms } from "./composition.js";
import { createAdmissionProbe, verifyProbeGeometry, verifyProbePixels } from "./admission.js";
import type { Ripple } from "./ripple.js";
import type { ApplicationEffect, EffectDescriptor } from "./effects.js";

export interface EnrolledLayer {
  id: string;
  element: HTMLElement;
  matrix(): DOMMatrix;
  opacity(): number;
  ripple?(): Ripple | undefined;
  effects?(): readonly EffectDescriptor[];
  effectsEnabled?(): boolean;
}

export interface SurfaceRendererOptions extends MountBoundaryOptions {
  onStatus(message: string): void;
  layers(): EnrolledLayer[];
  size(): { width: number; height: number; dpr: number };
  policy?(): string | undefined;
  presentation?(mode: "dom" | "gpu"): void;
  onInterrupt?(): void;
  onRecovery?(reason: string): void;
  isMoving?(): boolean;
  isPaused?(): boolean;
  comparePixels?: boolean;
  budgets?: { layers: number; pixels: number };
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
  const host = options.captureHost;
  let drawable: DrawableCanvas | undefined;
  function nativeHost(): DrawableCanvas {
    if (!drawable) throw new Error("Native canvas has not passed admission");
    return drawable;
  }
  const resources = { roots: 1, captureCanvases: 1, outputCanvases: 1, engines: 0, pendingEngines: 0, textures: 0, effects: 0, renderers: 0, stagingCanvases: 0, snapshots: 0, comparisonBuffers: 0, listeners: 0, scheduledFrames: 0, paintWaits: 0, lossObservers: 0, pendingCleanups: 0, probeElements: 0, probeReadbacks: 0 };
  const timing = () => ({ count: 0, totalMs: 0, minMs: null as number | null, maxMs: null as number | null });
  const layerMetrics: Record<string, { captures: number; pixelCopies: number; pixelReadbacks: number; uploads: number }> = Object.create(null);
  const metrics = { captures: 0, pixelCopies: 0, pixelReadbacks: 0, reusedUploads: 0, uploads: 0, paintNotifications: 0, deviceLossCount: 0, fenceCount: 0, effectShaderCompilations: 0,
    admission: { attempts: 0, passes: 0, captures: 0, pixelCopies: 0, pixelReadbacks: 0, uploads: 0, gpuFrames: 0, gpuReadbacks: 0, geometryChecks: 0,
      last: undefined as { nativePixels: number[][]; gpuPixels: number[][]; geometry: ReturnType<typeof verifyProbeGeometry> } | undefined },
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
  let clearedGeometry: { id: string; identity: boolean }[] = [];
  const layers: (EnrolledLayer & { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D; texture: DynamicTexture2D; pixels?: Uint8ClampedArray })[] = [];
  const dirty = new Set<string>();
  const removers: (() => void)[] = [];
  let observer: ReturnType<typeof observeConfiguredDevice> | undefined;
  let lostInfo: GPUDeviceLostInfo | undefined;
  let probe: ReturnType<typeof createAdmissionProbe> | undefined;
  let probeReadback: { active: boolean; completion: Promise<void> } | undefined;
  let lifecycle = Promise.resolve();
  let admissionIntent = 0;
  let admissionCancellation: string | undefined;
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
    options.onStatus(JSON.stringify({ mode, reason, resources, counts: { captures: metrics.captures, pixelCopies: metrics.pixelCopies, uploads: metrics.uploads, gpuFrames: metrics.gpuFrames }, recovery: "Host-owned moveBefore; one persistent React root", deviceLoss: "Public configured-device lost promise -> ordinary DOM; explicit fresh-engine reentry", deviceLosses: metrics.deviceLosses, fenceOutcomes: metrics.fenceOutcomes }, null, 2));
  }
  function state() {
    return {
      mode, reason, initializing, transitioning, moving, clearedGeometry: [...clearedGeometry], resources: { ...resources }, metrics: structuredClone(metrics),
      rootContainer: container.parentElement?.id,
      transforms: mode === "gpu" ? layers.map(layer => ({ id: layer.element.id, matrix: Array.from(nativeHost().getElementTransform(layer.element).toFloat64Array()) })) : [],
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
    if (renderer) { disposeEffectRenderer(renderer); renderer = undefined; resources.renderers--; }
    if (effect) { disposeEffectWrapper(effect); effect = undefined; resources.effects--; }
    for (const layer of layers) {
      releaseTexture(layer.texture);
      resources.textures--;
      layer.canvas.width = layer.canvas.height = 0;
      resources.stagingCanvases--;
      if (layer.pixels) resources.comparisonBuffers--;
    }
    layers.length = 0;
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
    clearedGeometry = layers.map(layer => {
      if (!host.contains(layer.element)) return { id: layer.element.id, identity: false };
      nativeHost().clearElementGeometry(layer.element);
      return { id: layer.element.id, identity: nativeHost().getElementTransform(layer.element).isIdentity };
    });
    host.getContext("2d")?.clearRect(0, 0, host.width, host.height);
    if (removeProbe) releaseProbe();
  }
  function presentDOM(message: string) {
    mode = "dom";
    reason = message;
    generation++;
    cancelScheduled();
    output.hidden = true;
    clearGeometry(false);
    ordinary.hidden = false;
    if (boundary.moveToDOM()) metrics.moves++;
    options.presentation?.("dom");
    host.hidden = true;
    options.onRecovery?.(message);
  }
  function retainGPUUntil(completion: Promise<IdleOutcome>) {
    resources.pendingCleanups++;
    const retainedEngine = engine;
    void completion.then(result => serialize(async () => {
      if (engine !== retainedEngine) return;
      if (result.kind !== "completed" && result.kind !== "device-lost") throw new Error("Pending cleanup requires a confirmed fence or device loss");
      sample(metrics.fenceOutcomes, result);
      metrics.fenceCount++;
      destroyGPU();
      resources.pendingCleanups--;
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
      if (engine) {
        const { outcome, completion } = await waitForTeardown(engine, observer?.lost, 1500, probeReadback?.completion);
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
    for (const layer of layers) {
      const matrix = new DOMMatrix().translate(dx, 0).multiply(layer.matrix());
      validateGeometry(matrix);
      nativeHost().updateElementGeometry(layer.element, { canvasTransform: matrix });
      validateAppliedGeometry(nativeHost(), layer.element, matrix);
      metrics.geometryUpdates++;
    }
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
      setEffectUniforms(effect, compositionUniforms(layers, options.size().dpr, dx, tint));
      geometry();
      renderFrame(engine, 16.67);
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
    const policy = options.policy?.();
    if (policy) throw new Error(policy);
    if (options.isPaused?.()) throw new Error("GPU admission requires a visible surface");
    const selected = layers.filter(layer => dirty.has(layer.id));
    if (!selected.length) return;
    for (const layer of selected) dirty.delete(layer.id);
    const version = generation;
    const abort = new AbortController();
    captureAbort = abort;
    resources.paintWaits++;
    try { await waitForPaint(nativeHost(), 1500, abort.signal); }
    catch (error) {
      if (options.isPaused?.() && abort.signal.aborted) {
        for (const layer of selected) dirty.add(layer.id);
        return;
      }
      throw error;
    }
    finally {
      resources.paintWaits--;
      if (captureAbort === abort) captureAbort = undefined;
    }
    if (version !== generation || mode !== "gpu" && mode !== "admitting" || lostInfo) return;
    if (options.isPaused?.()) {
      for (const layer of selected) dirty.add(layer.id);
      return;
    }
    const owner = host.getContext("2d");
    if (!owner || !isDrawableContext(owner) || !engine) throw new Error("Owning native 2D canvas or engine unavailable");
    for (const layer of selected) {
      if (layer.element.offsetWidth !== layer.canvas.width || layer.element.offsetHeight !== layer.canvas.height) {
        throw new Error(`Layer resized during capture: ${layer.id}; stale-size transfer refused`);
      }
      const started = performance.now();
      const snapshot = nativeHost().captureElementImage(layer.element);
      resources.snapshots++;
      metrics.captures++;
      metrics.perLayer[layer.id]!.captures++;
      try {
        owner.clearRect(0, 0, host.width, host.height);
        owner.drawElementImage(snapshot, 0, 0, { preserveElementGeometry: true });
        layer.context.clearRect(0, 0, layer.canvas.width, layer.canvas.height);
        layer.context.drawImage(host, 0, 0, layer.canvas.width, layer.canvas.height, 0, 0, layer.canvas.width, layer.canvas.height);
        metrics.pixelCopies++;
        metrics.perLayer[layer.id]!.pixelCopies++;
        recordTiming("captureMs", performance.now() - started, layer.id, layer.canvas.width * layer.canvas.height * 4);
        if (options.comparePixels) {
          const readbackStarted = performance.now();
          const pixels = layer.context.getImageData(0, 0, layer.canvas.width, layer.canvas.height).data;
          metrics.pixelReadbacks++;
          metrics.perLayer[layer.id]!.pixelReadbacks++;
          const identical = !!layer.pixels && pixels.every((value, index) => value === layer.pixels![index]);
          options.onMeasure?.({ kind: "readbackCompareMs", at: performance.now(), durationMs: performance.now() - readbackStarted,
            phase: mode === "admitting" ? "admission" : "content", layerId: layer.id, bytes: pixels.byteLength });
          if (identical) {
            metrics.reusedUploads++;
            continue;
          }
          if (!layer.pixels) resources.comparisonBuffers++;
          layer.pixels = pixels;
        }
        const uploadStarted = performance.now();
        updateDynamicTexture(engine, layer.texture, layer.canvas, { invertY: false, premultiplyAlpha: false });
        recordTiming("uploadMs", performance.now() - uploadStarted, layer.id, layer.canvas.width * layer.canvas.height * 4);
        metrics.uploads++;
        metrics.perLayer[layer.id]!.uploads++;
        metrics.uploadBytes += layer.canvas.width * layer.canvas.height * 4;
      } finally {
        snapshot.close();
        resources.snapshots--;
        // The native host keeps hit geometry, but never presents a second painted image.
        owner.clearRect(0, 0, host.width, host.height);
      }
    }
  }
  function scheduleCapture() {
    if (mode !== "gpu" || lostInfo || initializing || work || scheduled || !dirty.size || options.isPaused?.()) return;
    resources.scheduledFrames++;
    scheduled = requestAnimationFrame(() => {
      scheduled = 0;
      resources.scheduledFrames--;
      const policy = options.policy?.();
      if (policy) {
        void recover(policy).catch(reportFailure);
        return;
      }
      const refreshEngine = engine;
      const refreshGeneration = generation;
      work = captureLayers().then(draw).catch(error => {
        if (lostInfo || mode !== "gpu" || generation !== refreshGeneration) return;
        console.error("CanvasSPA runtime capture failed", error);
        void serialize(async () => {
          if (engine === refreshEngine && generation === refreshGeneration && mode === "gpu") {
            await recoverToDOM(`Runtime capture failure: ${String(error)}`);
          }
        }).catch(reportFailure);
      }).finally(() => { work = undefined; scheduleCapture(); status(); });
    });
  }
  function queueCapture(target?: Event | Element | string) {
    const node = target instanceof Event ? target.target : target;
    for (const layer of layers) {
      if (!node || typeof node === "string" && layer.id === node
        || node instanceof Element && (layer.element.contains(node) || node.contains(layer.element))) dirty.add(layer.id);
    }
    scheduleCapture();
  }
  async function settle() {
    const deadline = performance.now() + 3000;
    while (scheduled || work) {
      if (performance.now() > deadline) throw new Error("Native refresh did not settle within 3000 ms");
      if (work) await work;
      else await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    }
  }
    async function createComposition(name: string) {
      if (!engine) throw new Error("Composition requires an admitted engine");
      admittedCustom = layers.map(layer => layer.effects?.().find(value => value.kind === "custom")?.definition);
      const shader = compositionShader(layers.length, admittedCustom);
      if (admittedCustom.some(Boolean)) {
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
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = probe.extent;
      const context = canvas.getContext("2d");
      const owner = host.getContext("2d");
      if (!context || !owner || !isDrawableContext(owner)) throw new Error("Functional capture contexts unavailable");
      const texture = createDynamicTexture(engine, probe.extent, probe.extent, { minFilter: "nearest", magFilter: "nearest" });
      layers.push({ id: "admission-probe", element: probe.element, matrix: () => probe!.matrix, opacity: () => 1, canvas, context, texture });
      resources.stagingCanvases++;
      resources.textures++;
      await createComposition("native-functional-admission");
      const abort = new AbortController();
      captureAbort = abort;
      const deadline = setTimeout(() => abort.abort(new Error("Functional admission timed out after 1500 ms")), 1500);
      try {
        resources.paintWaits++;
        try { await waitForPaint(nativeHost(), 1500, abort.signal); }
        finally { resources.paintWaits--; }
        abort.signal.throwIfAborted();
        const snapshot = nativeHost().captureElementImage(probe.element);
        metrics.admission.captures++;
        resources.snapshots++;
        try {
          owner.clearRect(0, 0, host.width, host.height);
          owner.drawElementImage(snapshot, 0, 0, { preserveElementGeometry: true });
          context.drawImage(host, 0, 0, probe.extent, probe.extent, 0, 0, probe.extent, probe.extent);
          metrics.admission.pixelCopies++;
        } finally { snapshot.close(); resources.snapshots--; owner.clearRect(0, 0, host.width, host.height); }
        await Promise.resolve();
        abort.signal.throwIfAborted();
        const nativePixels = probe.points.map(point => Array.from(context.getImageData(point.x, point.y, 1, 1).data));
        metrics.admission.pixelReadbacks++;
        verifyProbePixels(nativePixels, "native");
        const geometryResult = verifyProbeGeometry(nativeHost(), probe);
        metrics.admission.geometryChecks++;
        updateDynamicTexture(engine, texture, canvas, { invertY: false, premultiplyAlpha: false });
        metrics.admission.uploads++;
        setEffectUniforms(effect!, compositionUniforms(layers, options.size().dpr, 0, 0));
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
        metrics.admission.last = { nativePixels, gpuPixels, geometry: geometryResult };
        const { outcome } = await waitForTeardown(engine, observer?.lost, 1500, pending.completion);
        sample(metrics.fenceOutcomes, outcome);
        metrics.fenceCount++;
        if (outcome.kind !== "completed" || lostInfo) throw new Error(`Functional probe cleanup fence did not complete: ${outcome.kind}`);
        nativeHost().clearElementGeometry(probe.element);
        validateAppliedGeometry(nativeHost(), probe.element, new DOMMatrix());
        releaseProbe();
        releaseComposition();
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
      const capability = capabilities(host);
      if (!isDrawableCanvas(host)) throw new Error(capability.missing.join("; "));
      drawable = host;
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
          if (engine === admittedEngine && !resources.pendingCleanups) await recoverToDOM(`GPU device lost (${info.reason}): ${info.message}; original root recovered to ordinary DOM.`);
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
      host.width = Math.ceil(size.width);
      host.height = Math.ceil(size.height);
      enableDrawable(nativeHost());
      host.hidden = false;
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
        const current = options.layers();
        if (current.length !== enrolled.length || current.some((layer, index) =>
          layer.id !== enrolled[index]!.id || layer.element !== enrolled[index]!.element)) throw new Error("Enrollment changed during admission; fresh admission required");
        const currentSize = options.size();
        if (currentSize.width !== size.width || currentSize.height !== size.height || currentSize.dpr !== size.dpr) throw new Error("Surface dimensions/DPR changed during admission");
        if (layers.some(layer => layer.canvas.width !== layer.element.offsetWidth || layer.canvas.height !== layer.element.offsetHeight)) {
          throw new Error("Enrolled capture dimensions changed during admission");
        }
        if (generation !== admissionGeneration || mode !== "admitting") throw new Error(`Admission generation retired; fresh admission required: ${reason}`);
        const currentPolicy = options.policy?.();
        if (currentPolicy) throw new Error(currentPolicy);
      };
      assertCurrentAdmission();
      let pixels = 0;
      for (const spec of enrolled) {
        const { element, id } = spec;
        const canvas = document.createElement("canvas");
        canvas.width = element.offsetWidth;
        canvas.height = element.offsetHeight;
        if (!canvas.width || !canvas.height) throw new Error(`Zero-sized layer: ${id}`);
        if (canvas.width > host.width || canvas.height > host.height) throw new Error(`Layer exceeds owning capture bitmap: ${id}`);
        pixels += canvas.width * canvas.height;
        if (pixels > budget.pixels) throw new Error("Captured-pixel admission budget exceeded");
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Pixel staging context unavailable");
        const texture = createDynamicTexture(engine, canvas.width, canvas.height, { minFilter: "nearest", magFilter: "nearest" });
        layers.push({ ...spec, canvas, context, texture });
        metrics.perLayer[id] ??= { captures: 0, pixelCopies: 0, pixelReadbacks: 0, uploads: 0 };
        dirty.add(id);
        resources.stagingCanvases++;
        resources.textures++;
      }
      await createComposition("native-react-layers");
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
      reason = "Native snapshots -> owning 2D canvas -> pixel-only staging canvases -> public Lite textures -> shared shader composition.";
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
    if (resources.pendingCleanups) return state();
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
    host.width = host.height = output.width = output.height = 0;
    host.remove();
    output.remove();
    resources.captureCanvases = resources.outputCanvases = 0;
    mode = "disposed";
    reason = "Disposed root, captures, pixel canvases, textures, effect, renderer, engine and owned listeners.";
    status();
    return state();
  }
  function recover(message: string) {
    if (mode !== "gpu" && mode !== "admitting" && !initializing) return Promise.resolve();
    if (initializing) admissionCancellation = message;
    presentDOM(message);
    return serialize(async () => {
      if (mode !== "disposed" && engine && !resources.pendingCleanups) await recoverToDOM(message);
    });
  }
  listen(host, "paint", event => {
    const policy = options.policy?.();
    if (policy) { void recover(policy).catch(reportFailure); return; }
    const changed: unknown = Reflect.get(event, "changedElements");
    metrics.paintNotifications++;
    if (Array.isArray(changed)) sample(metrics.paintElements, changed.map(element => element instanceof Element ? element.id || element.tagName : String(element)));
    if (!Array.isArray(changed) || changed.some(element => !(element instanceof Element))) queueCapture();
    else for (const element of changed) if (container.contains(element)) queueCapture(element);
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
    acceptsCustom: (id: string, definition: ApplicationEffect) => admittedCustom[layers.findIndex(layer => layer.id === id)] === definition,
    phase: () => mode, version: () => generation, resume: scheduleCapture,
    pause: () => {
      if (scheduled) { cancelAnimationFrame(scheduled); scheduled = 0; resources.scheduledFrames--; }
      captureAbort?.abort(new DOMException("Native paint paused while hidden", "AbortError"));
    },
    recover,
  };
}
