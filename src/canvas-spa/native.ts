export interface ElementSnapshot {
  readonly width: number;
  readonly height: number;
  close(): void;
}

export interface DrawableCanvas extends HTMLCanvasElement {
  content?: string;
  layoutSubtree?: boolean;
  requestPaint(): void;
  captureElementImage(element: Element): ElementSnapshot;
  updateElementGeometry(
    element: Element,
    options: { canvasTransform?: DOMMatrixInit; preserveHitTestOrder?: boolean },
  ): void;
  clearElementGeometry(element: Element): void;
  getElementTransform(element: Element): DOMMatrix;
}

export interface DrawableContext extends CanvasRenderingContext2D {
  drawElementImage(
    image: ElementSnapshot | Element,
    x: number,
    y: number,
    options?: { preserveElementGeometry: boolean },
  ): void;
}

export interface CapabilityResult {
  available: boolean;
  missing: string[];
  dialect: "content-drawable" | "layoutSubtree" | "unavailable";
}

export function capabilities(canvas: HTMLCanvasElement): CapabilityResult {
  const context = canvas.getContext("2d");
  const required = ["requestPaint", "captureElementImage", "updateElementGeometry", "clearElementGeometry", "getElementTransform"];
  const missing = required.filter((key) => typeof Reflect.get(canvas, key) !== "function");
  const dialect = "content" in canvas ? "content-drawable" : "layoutSubtree" in canvas ? "layoutSubtree" : "unavailable";
  if (dialect === "unavailable") missing.push("canvas.content or canvas.layoutSubtree");
  if (!context || !isDrawableContext(context)) missing.push("2d.drawElementImage");
  return { available: missing.length === 0, missing, dialect };
}

export function enableDrawable(canvas: DrawableCanvas): void {
  if ("content" in canvas) canvas.content = "drawable";
  else if ("layoutSubtree" in canvas) canvas.layoutSubtree = true;
  else throw new Error("No supported native layout dialect");
}

export function isDrawableCanvas(canvas: HTMLCanvasElement): canvas is DrawableCanvas {
  return capabilities(canvas).available;
}

export function isDrawableContext(context: CanvasRenderingContext2D): context is DrawableContext {
  return typeof Reflect.get(context, "drawElementImage") === "function";
}

export function validateGeometry(matrix: DOMMatrixReadOnly): void {
  if (!matrix.is2D || ![matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f].every(Number.isFinite)
    || !Number.isFinite(matrix.a * matrix.d - matrix.b * matrix.c)
    || Math.abs(matrix.a * matrix.d - matrix.b * matrix.c) < 1e-8) {
    throw new Error("Native geometry requires a finite invertible 2D transform");
  }

}

export function validateAppliedGeometry(canvas: DrawableCanvas, element: Element, expected: DOMMatrixReadOnly): void {
  const actual = canvas.getElementTransform(element);
  validateGeometry(actual);
  if (["a", "b", "c", "d", "e", "f"].some(key =>
    Math.abs(Reflect.get(actual, key) - Reflect.get(expected, key)) > 1e-5)) {
    throw new Error("Native geometry did not apply the requested transform");
  }
}

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
