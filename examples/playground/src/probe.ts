/**
 * Entry for `probe.html` (native topology probe): a disposable fixture that talks to the raw native
 * HTML-in-Canvas API (`captureElementImage`, `drawElementImage`, `updateElementGeometry`, `clearElementGeometry`)
 * without React or the library runtime. `window.nativeProbe` lets tests capture layers, apply transforms,
 * check hit-test geometry, try fallback-triggering fixture changes, and (via `backend-probe.ts`) compare Lite
 * WebGPU and WebGL2 uploads. It uses the `./native` shim for capability checks and type guards.
 */
import { capabilities, enableDrawable, isDrawableCanvas, isDrawableContext, validateGeometry, waitForPaint } from "./native";
import { createBackendProbe } from "./backend-probe";

const host = document.querySelector<HTMLCanvasElement>("#host");
const layer = document.getElementById("layer");
const nested = document.getElementById("nested");
const button = document.getElementById("button");
const editing = document.querySelector<HTMLInputElement>("#editing");
const text = document.getElementById("text");
if (!host || !layer || !nested || !button || !editing || !text) throw new Error("Probe fixture is incomplete");
if (isDrawableCanvas(host)) enableDrawable(host);

let clicks = 0;
let disposed = false;
const onClick = () => {
  clicks++;
  text.textContent = `Native count ${clicks}`;
};
button.addEventListener("click", onClick);
// Live counters; `liveSnapshots` must be back to 0 after each capture and `listeners` to 0 after dispose.
const metrics = { paints: 0, captures: 0, liveSnapshots: 0, stagingCanvases: 0, listeners: 2 };
const onPaint = () => metrics.paints++;
host.addEventListener("paint", onPaint);

const api = {
  capability: capabilities(host),
  metrics,
  backend: isDrawableCanvas(host) ? createBackendProbe(host, [layer, nested]) : null,
  state: () => ({ clicks, value: editing.value, selectionStart: editing.selectionStart, focused: document.activeElement === editing }),
  // Captures each layer, draws it at its own offset and registers canvas geometry for it, then samples one pixel
  // per layer. Snapshots are closed in `finally` so none stay live.
  async capture() {
    if (disposed) throw new Error("Probe has been disposed");
    if (!isDrawableCanvas(host)) throw new Error(`Missing native APIs: ${capabilities(host).missing.join(", ")}`);
    const context = host.getContext("2d");
    if (!context || !isDrawableContext(context)) throw new Error("Native 2D context unavailable");
    await waitForPaint(host);
    context.clearRect(0, 0, host.width, host.height);
    const pixels: Record<string, { width: number; height: number; sample: number[] }> = {};
    for (const [element, x, y] of [[layer, 40, 40], [nested, 270, 40]] as const) {
      const snapshot = host.captureElementImage(element);
      metrics.captures++;
      metrics.liveSnapshots++;
      try {
        context.drawElementImage(snapshot, x, y, { preserveElementGeometry: true });
        pixels[element.id] = {
          width: snapshot.width,
          height: snapshot.height,
          sample: [...context.getImageData(x + 15, y + 120 * Number(element === layer) + 5, 1, 1).data],
        };
        host.updateElementGeometry(element, { canvasTransform: new DOMMatrix().translate(x, y) });
      } finally {
        snapshot.close();
        metrics.liveSnapshots--;
      }
    }
    return pixels;
  },
  // Draws the `layer` element with a translate (plus optional scale or rotate) and registers the same matrix as its
  // native geometry. Returns the page position of the layer's button, derived from the matrix, so a test can click it
  // natively; `bad-geometry` (zero scale) is expected to be rejected by `validateGeometry`.
  async transform(kind: string) {
    if (!isDrawableCanvas(host)) throw new Error("Geometry unavailable");
    const context = host.getContext("2d");
    if (!context || !isDrawableContext(context)) throw new Error("Native 2D unavailable");
    await waitForPaint(host);
    const matrix = new DOMMatrix().translate(170, 80);
    if (kind === "scale") matrix.scaleSelf(1.3, 1.3);
    if (kind === "rotate") matrix.rotateSelf(20);
    if (kind === "bad-geometry") matrix.scaleSelf(0, 0);
    if (!["translate", "scale", "rotate", "bad-geometry"].includes(kind)) throw new Error(`Unknown transform: ${kind}`);
    validateGeometry(matrix);
    const snapshot = host.captureElementImage(layer);
    metrics.captures++;
    metrics.liveSnapshots++;
    try {
      context.clearRect(0, 0, 480, 300);
      context.setTransform(matrix);
      context.drawElementImage(snapshot, 0, 0, { preserveElementGeometry: true });
      context.resetTransform();
      host.updateElementGeometry(layer, { canvasTransform: matrix });
      const localButton = { x: 80, y: 35 };
      const point = matrix.transformPoint(localButton);
      const rect = host.getBoundingClientRect();
      return { x: rect.x + point.x, y: rect.y + point.y, matrix: matrix.toJSON(), nativeTransform: host.getElementTransform(layer).toJSON() };
    } finally {
      snapshot.close();
      metrics.liveSnapshots--;
    }
  },
  // Clears native geometry, applies one fixture change to the host (`content` attribute, display, bitmap size or
  // visibility) and reports where the layer is after two frames.
  async fallback(kind: string) {
    let afterClear;
    if (isDrawableCanvas(host)) {
      host.clearElementGeometry(layer);
      host.clearElementGeometry(nested);
      afterClear = { layer: host.getElementTransform(layer).toJSON(), nested: host.getElementTransform(nested).toJSON() };
    }
    host.getContext("2d")?.clearRect(0, 0, 480, 300);
    host.removeAttribute("style");
    host.setAttribute("content", "drawable");
    switch (kind) {
      case "content-fallback": host.setAttribute("content", "fallback"); break;
      case "remove-content": host.removeAttribute("content"); break;
      case "display-contents": host.style.display = "contents"; break;
      case "display-block": host.style.display = "block"; break;
      case "zero-bitmap": host.width = 0; host.height = 0; break;
      case "layout-subtree-off":
        if (isDrawableCanvas(host)) host.content = "fallback";
        break;
      case "display-none": host.style.display = "none"; break;
      case "visibility-hidden-child-visible":
        host.style.visibility = "hidden";
        layer.style.visibility = "visible";
        break;
      default: throw new Error(`Unknown fallback candidate: ${kind}`);
    }
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    const rect = layer.getBoundingClientRect();
    return { sameParent: layer.parentElement === host, afterClear, rect: rect.toJSON(), state: api.state() };
  },
  // Idempotent teardown: releases backend resources, clears native geometry, removes the canvas and listeners.
  dispose() {
    if (disposed) return { ...metrics, connected: host.isConnected };
    api.backend?.dispose();
    if (isDrawableCanvas(host)) {
      host.clearElementGeometry(layer);
      host.clearElementGeometry(nested);
    }
    host.remove();
    host.removeEventListener("paint", onPaint);
    button.removeEventListener("click", onClick);
    metrics.listeners = 0;
    disposed = true;
    return { ...metrics, connected: host.isConnected };
  },
};

declare global { interface Window { nativeProbe: typeof api } }
window.nativeProbe = api;
