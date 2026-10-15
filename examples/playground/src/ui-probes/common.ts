/**
 * Shared setup for the Strata Phase 0 probes (docs/ui-library/plan.md): HTML-in-Canvas types, a WebGPU
 * canvas sized to its CSS box at the current DPR, native-paint uploads of one drawable element, and a
 * whole-frame pixel readback. Raw WebGPU and public HTML-in-Canvas API only, no Underglass runtime.
 */

export interface DrawableCanvas extends HTMLCanvasElement {
  requestPaint(): void;
  updateElementGeometry(element: Element, options: { canvasTransform?: DOMMatrixInit }): void;
  getElementTransform(element: Element): DOMMatrix;
  getElementImageDefaultSize(element: Element): { width: number; height: number };
}
interface DrawableQueue extends GPUQueue {
  drawElementImageToTexture(source: { source: Element }, destination: { texture: GPUTexture }): void;
}
/** The WebGPU canvas context members used here (TypeScript's DOM library has no canvas context type). */
interface WebGPUCanvasContext {
  configure(configuration: { device: GPUDevice; format: GPUTextureFormat; alphaMode: "opaque"; usage: number }): void;
  getCurrentTexture(): GPUTexture;
}
export interface Point { x: number; y: number }

// WebGPU flags by value: the DOM library declares the interfaces but not these namespaces.
export const textureUsage = { COPY_SRC: 0x01, COPY_DST: 0x02, TEXTURE_BINDING: 0x04, RENDER_ATTACHMENT: 0x10 } as const;
export const bufferUsage = { MAP_READ: 0x0001, COPY_DST: 0x0008, UNIFORM: 0x0040, STORAGE: 0x0080 } as const;
const mapRead = 0x0001;

/**
 * Checks the HTML-in-Canvas and WebGPU APIs, then configures `canvas` for WebGPU at its CSS size times
 * DPR. `upload(element)` copies the element's current native paint into a texture of its native grid
 * size (call it from the canvas `paint` event); `present(encode, readback)` encodes one frame into the
 * canvas texture and, with `readback`, copies it for `pixel`.
 */
export async function startProbe(canvas: DrawableCanvas, cssWidth: number, cssHeight: number) {
  for (const name of ["requestPaint", "updateElementGeometry", "getElementTransform", "getElementImageDefaultSize"]) {
    if (typeof Reflect.get(canvas, name) !== "function") throw new Error(`HTML-in-Canvas: canvas.${name} is missing`);
  }
  const adapter = await navigator.gpu?.requestAdapter();
  if (!adapter) throw new Error("WebGPU adapter unavailable");
  const device = await adapter.requestDevice();
  const queue = device.queue as DrawableQueue;
  if (typeof queue.drawElementImageToTexture !== "function") throw new Error("HTML-in-Canvas: drawElementImageToTexture is missing");

  const dpr = window.devicePixelRatio;
  canvas.width = Math.round(cssWidth * dpr);
  canvas.height = Math.round(cssHeight * dpr);
  const context = canvas.getContext("webgpu") as unknown as WebGPUCanvasContext;
  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({ device, format, alphaMode: "opaque", usage: textureUsage.RENDER_ATTACHMENT | textureUsage.COPY_SRC });
  const bytesPerRow = Math.ceil(canvas.width * 4 / 256) * 256;
  const readback = device.createBuffer({ size: bytesPerRow * canvas.height, usage: bufferUsage.COPY_DST | bufferUsage.MAP_READ });
  let pixels = new Uint8Array(0);
  let texture: GPUTexture | undefined;
  const counts = { uploads: 0, frames: 0 };

  return {
    device, format, dpr, counts,
    get texture() { return texture; },
    /** Uploads `element`'s native paint; returns true when the texture was (re)allocated. */
    upload(element: Element): boolean {
      const size = canvas.getElementImageDefaultSize(element);
      const allocated = !texture || texture.width !== size.width || texture.height !== size.height;
      if (allocated) {
        texture?.destroy();
        texture = device.createTexture({ size: [size.width, size.height], format: "rgba8unorm",
          usage: textureUsage.TEXTURE_BINDING | textureUsage.COPY_DST | textureUsage.RENDER_ATTACHMENT });
      }
      queue.drawElementImageToTexture({ source: element }, { texture: texture! });
      counts.uploads++;
      return allocated;
    },
    /** Encodes one frame into the canvas, clears to white first, and optionally reads it back. Resolves when the GPU is done. */
    async present(encode: (pass: GPURenderPassEncoder) => void, withReadback: boolean) {
      const target = context.getCurrentTexture();
      const encoder = device.createCommandEncoder();
      const pass = encoder.beginRenderPass({ colorAttachments: [{ view: target.createView(), loadOp: "clear", storeOp: "store", clearValue: [1, 1, 1, 1] }] });
      encode(pass);
      pass.end();
      if (withReadback) encoder.copyTextureToBuffer({ texture: target }, { buffer: readback, bytesPerRow }, [canvas.width, canvas.height]);
      queue.submit([encoder.finish()]);
      counts.frames++;
      if (!withReadback) return queue.onSubmittedWorkDone();
      await readback.mapAsync(mapRead);
      pixels = new Uint8Array(readback.getMappedRange().slice(0));
      readback.unmap();
    },
    /** Drawn RGBA at a client point, from the last frame that was read back. */
    pixel(client: Point): number[] {
      const box = canvas.getBoundingClientRect();
      const x = Math.floor((client.x - box.left - canvas.clientLeft) * dpr), y = Math.floor((client.y - box.top - canvas.clientTop) * dpr);
      const offset = y * bytesPerRow + x * 4;
      const [c0, c1, c2, c3] = pixels.subarray(offset, offset + 4);
      return format === "bgra8unorm" ? [c2!, c1!, c0!, c3!] : [c0!, c1!, c2!, c3!];
    },
  };
}

/** Resolves on the canvas's first native paint after requesting one. */
export function firstPaint(canvas: DrawableCanvas): Promise<void> {
  return new Promise(resolve => {
    canvas.addEventListener("paint", () => resolve(), { once: true });
    canvas.requestPaint();
  });
}

/** Element id, or lower-case tag name, of the topmost element at a client point. */
export function hitAt(client: Point): string {
  const element = document.elementFromPoint(client.x, client.y);
  return element?.id || element?.tagName.toLowerCase() || "null";
}

/** `element`'s layout offset relative to `ancestor`, through the offsetParent chain (CSS pixels, untransformed). */
export function offsetWithin(element: HTMLElement, ancestor: HTMLElement): Point {
  let x = 0, y = 0;
  for (let node: HTMLElement | null = element; node && node !== ancestor; node = node.offsetParent as HTMLElement | null) {
    x += node.offsetLeft; y += node.offsetTop;
  }
  return { x, y };
}
