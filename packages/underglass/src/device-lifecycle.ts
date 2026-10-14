import { waitForGpuIdle, type EngineContext } from "@babylonjs/lite";

export type IdleOutcome =
  | { kind: "completed" }
  | { kind: "device-lost"; reason: GPUDeviceLostReason }
  | { kind: "rejected"; message: string }
  | { kind: "timeout"; milliseconds: number };

export function configuredDevice(canvas: HTMLCanvasElement) {
  const context = canvas.getContext("webgpu");
  if (typeof GPUCanvasContext === "undefined" || !(context instanceof GPUCanvasContext) || typeof context.getConfiguration !== "function") throw new Error("Public WebGPU configuration/loss observation unavailable");
  const configuration = context.getConfiguration();
  if (!configuration) throw new Error("WebGPU output is not configured");
  return configuration.device;
}
export function observeConfiguredDevice(canvas: HTMLCanvasElement, onLost: (info: GPUDeviceLostInfo) => void) {
  const device = configuredDevice(canvas);
  let active = true;
  const lost = device.lost;
  void lost.then(info => { if (active) onLost(info); });
  return { lost, maxTextureDimension2D: device.limits.maxTextureDimension2D, release() { active = false; } };
}

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
