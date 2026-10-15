/**
 * Helpers for observing the WebGPU device behind an output canvas: reading the configured device,
 * watching for device loss and waiting for the GPU to drain before teardown. Used by `renderer.ts`.
 */
import { waitForGpuIdle, type EngineContext } from "@babylonjs/lite";

/** How a GPU idle wait ended: it completed, the device was lost, the wait threw, or it timed out. */
export type IdleOutcome =
  | { kind: "completed" }
  | { kind: "device-lost"; reason: GPUDeviceLostReason }
  | { kind: "rejected"; message: string }
  | { kind: "timeout"; milliseconds: number };

/**
 * The `GPUDevice` the canvas's WebGPU context is configured with, read through the public
 * `getConfiguration()`. Throws when that API is missing or the canvas is not configured.
 */
export function configuredDevice(canvas: HTMLCanvasElement) {
  const context = canvas.getContext("webgpu");
  if (typeof GPUCanvasContext === "undefined" || !(context instanceof GPUCanvasContext) || typeof context.getConfiguration !== "function") throw new Error("Public WebGPU configuration/loss observation unavailable");
  const configuration = context.getConfiguration();
  if (!configuration) throw new Error("WebGPU output is not configured");
  return configuration.device;
}
/**
 * Watches the canvas's configured device for loss. `onLost` runs on device loss until `release()`
 * is called. Also returns the `lost` promise and the device's `maxTextureDimension2D` limit.
 */
export function observeConfiguredDevice(canvas: HTMLCanvasElement, onLost: (info: GPUDeviceLostInfo) => void) {
  const device = configuredDevice(canvas);
  let active = true;
  const lost = device.lost;
  void lost.then(info => { if (active) onLost(info); });
  return { lost, maxTextureDimension2D: device.limits.maxTextureDimension2D, release() { active = false; } };
}

/**
 * Waits for the GPU to go idle (and for optional `pendingWork`) before resources are destroyed.
 * `outcome` resolves at the first of: idle, device loss, or `milliseconds` elapsing, so teardown
 * never hangs. `completion` settles later, on idle or device loss, for callers that keep waiting
 * after a timeout; a rejected idle wait settles it only when the device is also lost.
 */
export async function waitForTeardown(engine: EngineContext, lost: Promise<GPUDeviceLostInfo> | undefined, milliseconds = 1500, pendingWork?: Promise<void>) {
  const loss = lost
    ? lost.then((info): IdleOutcome => ({ kind: "device-lost", reason: info.reason }))
    : new Promise<IdleOutcome>(() => {});
  const idle = Promise.resolve().then(async () => { await waitForGpuIdle(engine); await pendingWork; }).then(
    (): IdleOutcome => ({ kind: "completed" }),
    (error: unknown): IdleOutcome => ({ kind: "rejected", message: String(error) }),
  );
  const completion = Promise.race([idle.then(outcome => outcome.kind === "rejected" ? loss : outcome), loss]);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const outcome = await Promise.race([
      idle, loss,
      new Promise<IdleOutcome>(resolve => { timer = setTimeout(() => resolve({ kind: "timeout", milliseconds }), milliseconds); }),
    ]);
    return { outcome, completion };
  } finally { clearTimeout(timer); }
}
