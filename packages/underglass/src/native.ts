/**
 * Typed views of the experimental HTML-in-Canvas canvas API (`DrawableCanvas`, `DrawableContext`,
 * `DrawableQueue`), feature checks, geometry validation and paint waiting. The runtime and renderer
 * use these helpers so the rest of the code does not call the untyped native methods directly.
 */

/** A captured image of an element, as returned by `captureElementImage`. Call `close` to release it. */
export interface ElementSnapshot {
  readonly width: number;
  readonly height: number;
  close(): void;
}

/**
 * An `HTMLCanvasElement` that has the HTML-in-Canvas element methods. `content` is the attribute
 * reflection that switches the canvas into drawable mode; the methods capture child elements as
 * images and set the canvas-space transform and clip that native hit testing uses.
 */
export interface DrawableCanvas extends HTMLCanvasElement {
  content: string;
  getElementImageDefaultSize(element: Element): { width: number; height: number };
  requestPaint(): void;
  captureElementImage(element: Element): ElementSnapshot;
  updateElementGeometry(
    element: Element,
    options: { canvasTransform?: DOMMatrixInit; canvasClip?: DOMRectInit; preserveHitTestOrder?: boolean },
  ): void;
  clearElementGeometry(element: Element): void;
  getElementTransform(element: Element): DOMMatrix;
}

/** A 2D context that has `drawElementImage`. */
export interface DrawableContext extends CanvasRenderingContext2D {
  drawElementImage(
    image: ElementSnapshot | Element,
    x: number,
    y: number,
    options?: { preserveElementGeometry: boolean },
  ): void;
}

/** Result of `capabilities`: whether the required canvas methods exist, which are missing, and the API dialect. */
export interface CapabilityResult {
  available: boolean;
  missing: string[];
  dialect: "content-drawable" | "unavailable";
}

/**
 * Reports whether `canvas` has `content` and the paint, size and geometry methods (not `captureElementImage`). This is only a
 * presence check; admission still proves behaviour with functional probes (see `admission.ts`).
 */
export function capabilities(canvas: HTMLCanvasElement): CapabilityResult {
  // Do not acquire a 2D context: this canvas owns the WebGPU output.
  const required = ["requestPaint", "getElementImageDefaultSize", "updateElementGeometry", "clearElementGeometry", "getElementTransform"];
  const missing = required.filter((key) => typeof Reflect.get(canvas, key) !== "function");
  const dialect = "content" in canvas ? "content-drawable" : "unavailable";
  if (dialect === "unavailable") missing.push("canvas.content");
  return { available: missing.length === 0, missing, dialect };
}

/** Switches `canvas` into drawable mode by setting `content="drawable"`. Throws if the reflection is missing or ignored. */
export function enableDrawable(canvas: DrawableCanvas): void {
  if (!("content" in canvas)) throw new Error("Current canvas.content reflection unavailable");
  canvas.content = "drawable";
  if (canvas.content !== "drawable" || canvas.getAttribute("content") !== "drawable") {
    throw new Error("Current canvas.content drawable reflection failed");
  }
}

/** A WebGPU queue with `drawElementImageToTexture`, which uploads an element's pixels directly into a texture. */
export interface DrawableQueue extends GPUQueue {
  drawElementImageToTexture(source: { source: Element }, destination: { texture: GPUTexture }): void;
}

/** True for an enabled, connected textarea or text-like input: a control that natively consumes typing. */
export function nativeEditingControl(element: Element): boolean {
  const view = element.ownerDocument.defaultView;
  if (!view || !element.isConnected) return false;
  if (element instanceof view.HTMLTextAreaElement) return !element.disabled;
  return element instanceof view.HTMLInputElement && !element.disabled
    && ["text", "search", "tel", "url", "email", "password", "number"].includes(element.type);
}

/**
 * Classifies a native scroll target: a text editing control, the enrolled element itself, or a
 * scrollable descendant of it.
 */
export function nativeScrollKind(
  target: Element,
  enrolled: Element,
): "editing" | "descendant-viewport" | "enrolled-viewport" {
  if (nativeEditingControl(target)) return "editing";
  return target === enrolled ? "enrolled-viewport" : "descendant-viewport";
}
/** Type guard: the queue has `drawElementImageToTexture`. */
export function isDrawableQueue(queue: GPUQueue): queue is DrawableQueue {
  return typeof Reflect.get(queue, "drawElementImageToTexture") === "function";
}

/** Type guard: `capabilities(canvas)` reports the canvas as available. */
export function isDrawableCanvas(canvas: HTMLCanvasElement): canvas is DrawableCanvas {
  return capabilities(canvas).available;
}

/** Type guard: the 2D context has `drawElementImage`. */
export function isDrawableContext(context: CanvasRenderingContext2D): context is DrawableContext {
  return typeof Reflect.get(context, "drawElementImage") === "function";
}

/** Throws unless `matrix` is a finite, invertible 2D transform (non-degenerate determinant). */
export function validateGeometry(matrix: DOMMatrixReadOnly): void {
  if (!matrix.is2D || ![matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f].every(Number.isFinite)
    || !Number.isFinite(matrix.a * matrix.d - matrix.b * matrix.c)
    || Math.abs(matrix.a * matrix.d - matrix.b * matrix.c) < 1e-8) {
    throw new Error("Native geometry requires a finite invertible 2D transform");
  }

}

/**
 * Reads back the transform the browser holds for `element` and throws if it is not a valid 2D
 * transform or differs from `expected` by more than 1e-5 in any component.
 */
export function validateAppliedGeometry(canvas: DrawableCanvas, element: Element, expected: DOMMatrixReadOnly): void {
  const actual = canvas.getElementTransform(element);
  validateGeometry(actual);
  if (["a", "b", "c", "d", "e", "f"].some(key =>
    Math.abs(Reflect.get(actual, key) - Reflect.get(expected, key)) > 1e-5)) {
    throw new Error("Native geometry did not apply the requested transform");
  }
}

/**
 * Requests a native paint and resolves on the canvas's next `paint` event. Rejects on `timeout`
 * (milliseconds), when `signal` aborts, or if `requestPaint` throws; listeners are always removed.
 */
export function waitForPaint(canvas: DrawableCanvas, timeout = 1500, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    signal?.throwIfAborted();
    let timer: ReturnType<typeof setTimeout>;
    const cleanup = () => {
      clearTimeout(timer);
      canvas.removeEventListener("paint", onPaint);
      signal?.removeEventListener("abort", onAbort);
    };
    const onPaint = () => {
      cleanup();
      resolve();
    };
    const onAbort = () => {
      cleanup();
      reject(signal?.reason ?? new DOMException("Native paint cancelled", "AbortError"));
    };
    timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Native canvas paint timed out after ${timeout} ms`));
    }, timeout);
    signal?.addEventListener("abort", onAbort, { once: true });
    canvas.addEventListener("paint", onPaint, { once: true });
    try {
      canvas.requestPaint();
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
}
