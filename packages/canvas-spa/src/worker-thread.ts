import {
  createEngine, disposeEngine, createDynamicTexture, releaseTexture, createEffectWrapper, disposeEffectWrapper,
  createEffectRenderer, disposeEffectRenderer, registerEffectRenderer, unregisterEffectRenderer,
  setEffectTexture, setEffectUniforms, setEngineSize, renderFrame, waitForGpuIdle, captureScreenshot, decodeError, startEngine, stopEngine,
  type EngineContext, type DynamicTexture2D, type EffectWrapper,
} from "@babylonjs/lite";
import { validateWorkerProgram, validateWorkerFrame, type WorkerRequest, type WorkerResponse, type WorkerStats, type WorkerSnapshot } from "./worker-protocol.js";

interface WorkerScope {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
  postMessage(message: WorkerResponse): void;
}
interface SnapshotQueue extends GPUQueue {
  drawElementImageToTexture(source: { source: WorkerSnapshot }, destination: { texture: GPUTexture }): void;
}

/** Call once in the application's module worker; no DOM or engine-private API. */
export function startWorkerCompositor(scope: WorkerScope) {
  let engine: EngineContext | undefined, effect: EffectWrapper | undefined;
  let renderer: ReturnType<typeof createEffectRenderer> | undefined;
  let device: GPUDevice | undefined, queue: SnapshotQueue | undefined;
  let textures: DynamicTexture2D[] = [], uniforms: Float32Array | undefined, baseUniforms: Float32Array | undefined;
  const snapshots = new Set<WorkerSnapshot>();
  let scheduled = 0, playing = false, reduced = false, stopping = false, lost = false;
  let capacity = 0, lastFrame: number | undefined, lastRAF: number | undefined, origin = 0;
  const stats: WorkerStats = { frames: 0, uploads: 0, textureBytes: 0, frameIntervals: [], frameWork: [],
    resources: { engines: 0, textures: 0, effects: 0, renderers: 0, scheduledFrames: 0, snapshots: 0 } };
  function closeSnapshots(images: Iterable<WorkerSnapshot>) {
    for (const image of images) { image.close(); snapshots.delete(image); }
    stats.resources.snapshots = snapshots.size;
  }
  function sample(values: number[], value: number) {
    if (values.length >= 20_000) values.shift();
    values.push(value);
  }
  function reply(id: number, type: WorkerResponse["type"], extra: Partial<WorkerResponse> = {}) {
    scope.postMessage({ id, type, ...extra });
  }
  function cancel(resetClock = true) {
    if (scheduled) cancelAnimationFrame(scheduled);
    scheduled = 0;
    stats.resources.scheduledFrames = 0;
    if (resetClock) { lastFrame = undefined; lastRAF = undefined; }
  }
  function draw(time = performance.now()) {
    if (!engine || !effect || !uniforms || stopping || lost) return;
    const start = performance.now();
    const seconds = (time - origin) / 1000;
    uniforms[2] = reduced ? 0 : seconds;
    for (let slot = 0; slot < capacity; slot++) {
      uniforms[17 + slot * 44] = reduced ? 0 : seconds;
      uniforms[16 + slot * 44] = reduced ? 0 : baseUniforms![16 + slot * 44]!;
    }
    setEffectUniforms(effect, uniforms);
    renderFrame(engine, lastFrame === undefined ? 0 : Math.max(0, time - lastFrame) / 1000);
    lastFrame = time;
    stats.frames++;
    sample(stats.frameWork, performance.now() - start);
  }
  function schedule() {
    if (scheduled || !playing || reduced || !uniforms || stopping || lost) return;
    stats.resources.scheduledFrames = 1;
    scheduled = requestAnimationFrame(time => {
      scheduled = 0;
      stats.resources.scheduledFrames = 0;
      if (lastRAF !== undefined) sample(stats.frameIntervals, time - lastRAF);
      lastRAF = time;
      try { draw(time); schedule(); }
      catch (error) { cancel(); reply(0, "error", { error: String(error) }); }
    });
  }
  let serial = Promise.resolve();
  scope.onmessage = ({ data }) => {
    serial = serial.then(async () => {
      let frameReply: WorkerResponse | undefined;
      if (data.type === "frame") {
        for (const { image } of data.images) snapshots.add(image);
        stats.resources.snapshots = snapshots.size;
      }
      try {
        switch (data.type) {
          case "init": {
            if (engine || stopping) throw new Error("Worker already initialized or stopped");
            validateWorkerProgram(data.program);
            capacity = data.program.capacity;
            engine = await createEngine(data.canvas);
            stats.resources.engines = 1;
            const context = data.canvas.getContext("webgpu");
            device = context instanceof GPUCanvasContext ? context.getConfiguration()?.device : undefined;
            if (!device || typeof Reflect.get(device.queue, "drawElementImageToTexture") !== "function") {
              throw new Error("Worker native texture upload unavailable");
            }
            queue = device.queue as SnapshotQueue;
            device.addEventListener("uncapturederror", event => {
              cancel();
              reply(0, "error", { error: `Worker GPU validation: ${event.error.message}` });
            });
            void device.lost.then(info => {
              lost = true;
              cancel();
              if (stopping) return;
              reply(0, "lost", { error: `${info.reason}: ${info.message}` });
            });
            effect = createEffectWrapper(engine, { name: "prebuilt-worker-compositor", ...data.program.shader });
            stats.resources.effects = 1;
            for (let slot = 0; slot < capacity; slot++) {
              const texture = createDynamicTexture(engine, 1, 1, { minFilter: "nearest", magFilter: "nearest" });
              textures.push(texture);
              setEffectTexture(effect, `layer${slot}`, texture);
            }
            stats.resources.textures = textures.length;
            stats.textureBytes = textures.length * 4;
            renderer = createEffectRenderer(engine, effect);
            registerEffectRenderer(renderer);
            stats.resources.renderers = 1;
            origin = performance.now();
            reply(data.id, "ready", { stats: structuredClone(stats) });
            break;
          }
          case "frame": {
            if (!engine || !effect || !queue || !device || stopping || lost) throw new Error("Worker not ready for snapshots");
            validateWorkerFrame(data, capacity, device.limits.maxTextureDimension2D);
            cancel(false);
            unregisterEffectRenderer(renderer!);
            setEngineSize(engine, data.width, data.height);
            for (const image of data.images) {
              let texture = textures[image.slot]!;
              if (texture.texture.width !== image.width || texture.texture.height !== image.height) {
                await waitForGpuIdle(engine);
                releaseTexture(texture);
                texture = createDynamicTexture(engine, image.width, image.height, { minFilter: "nearest", magFilter: "nearest" });
                textures[image.slot] = texture;
                setEffectTexture(effect, `layer${image.slot}`, texture);
              }
              queue.drawElementImageToTexture({ source: image.image }, { texture: texture.texture });
              stats.uploads++;
            }
            stats.textureBytes = textures.reduce((sum, texture) => sum + texture.texture.width * texture.texture.height * 4, 0);
            baseUniforms = data.uniforms; uniforms = baseUniforms.slice();
            registerEffectRenderer(renderer!);
            draw();
            // A first real readback is part of admission, never the steady-state benchmark.
            let pixels: number | undefined;
            if (data.probe) {
              let timer: ReturnType<typeof setTimeout> | undefined;
              const capture = captureScreenshot(engine);
              startEngine(engine);
              stats.resources.scheduledFrames = 1;
              const shot = await Promise.race([capture, new Promise<never>((_, reject) => {
                timer = setTimeout(() => reject(new Error("Worker functional readback timed out")), 5000);
              })]).finally(() => {
                clearTimeout(timer);
                stopEngine(engine!);
                stats.resources.scheduledFrames = 0;
              });
              const pixel = [...shot.data.slice((2 * shot.width + 2) * 4, (2 * shot.width + 2) * 4 + 4)];
              if (pixel.some((value, index) => Math.abs(value - [240, 30, 60, 255][index]!) > 2)) {
                throw new Error(`Worker functional capture probe failed: ${pixel}`);
              }
              pixels = 1;
            }
            frameReply = { id: data.id, type: "frame", stats: structuredClone(stats), pixels };
            schedule();
            break;
          }
          case "clock":
            playing = data.playing; reduced = data.reduced;
            cancel(); draw(); schedule();
            reply(data.id, "clock");
            break;
          case "stats":
            reply(data.id, "stats", { stats: structuredClone(stats) });
            break;
          case "lose":
            if (!device) throw new Error("Worker device unavailable");
            device.destroy();
            reply(data.id, "stats", { stats: structuredClone(stats) });
            break;
          case "stop":
            stopping = true;
            cancel();
            if (engine && !lost) await waitForGpuIdle(engine);
            closeSnapshots(snapshots);
            if (renderer) { unregisterEffectRenderer(renderer); disposeEffectRenderer(renderer); }
            if (effect) disposeEffectWrapper(effect);
            for (const texture of textures) releaseTexture(texture);
            if (engine) disposeEngine(engine);
            textures = []; uniforms = undefined; baseUniforms = undefined;
            engine = undefined; effect = undefined; renderer = undefined; device = undefined; queue = undefined;
            stats.textureBytes = 0;
            for (const key of Object.keys(stats.resources) as (keyof WorkerStats["resources"])[]) stats.resources[key] = 0;
            reply(data.id, "stopped", { stats: structuredClone(stats) });
            break;
        }
      } catch (error) {
        cancel();
        if (data.type === "frame") frameReply = { id: data.id, type: "error", error: decodeError(error) };
        else reply(data.id, "error", { error: decodeError(error) });
      } finally {
        if (data.type === "frame") {
          // Release transferred native captures only after their submitted GPU work.
          if (engine && !lost) await waitForGpuIdle(engine);
          closeSnapshots(data.images.map(({ image }) => image));
        }
      }
      if (frameReply?.stats) frameReply.stats = structuredClone(stats);
      if (frameReply) scope.postMessage(frameReply);
    }).catch(error => {
      cancel();
      reply(0, "error", { error: `Worker message cleanup failed: ${decodeError(error)}` });
    });
  };
}
