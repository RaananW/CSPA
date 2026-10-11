import { validateAppliedGeometry, type DrawableCanvas } from "./native.js";

const colors = [[207, 37, 83, 255], [31, 179, 113, 255]];

export function createAdmissionProbe(host: DrawableCanvas) {
  const extent = Math.min(16, Math.floor(Math.min(host.width, host.height) / 4));
  if (extent < 4) throw new Error("Functional admission requires a capture surface of at least 16 CSS pixels per axis");
  const element = host.ownerDocument.createElement("div");
  const half = host.ownerDocument.createElement("div");
  element.setAttribute("drawable", "");
  element.setAttribute("aria-hidden", "true");
  element.style.cssText = `all:initial;display:block;position:absolute;left:0;top:0;width:${extent}px;height:${extent}px;background:rgb(207,37,83);pointer-events:auto;`;
  half.style.cssText = `all:initial;display:block;position:absolute;left:50%;top:0;width:50%;height:100%;background:rgb(31,179,113);`;
  element.append(half);
  host.append(element);
  const matrix = new DOMMatrix().translate(extent * 1.5, extent * 1.5).rotate(11).scale(0.75);
  const points = [{ x: extent / 4, y: extent / 2 }, { x: extent * 3 / 4, y: extent / 2 }];
  return { element, extent, matrix, points,
    clip: { x: 0, y: 0, width: extent * 0.8, height: extent } };
}

export function verifyProbePixels(pixels: number[][], stage: "native" | "GPU"): void {
  if (pixels.length !== colors.length || pixels.some((pixel, index) =>
    pixel.length !== 4 || pixel.some((value, channel) =>
      !Number.isFinite(value) || Math.abs(value - colors[index]![channel]!) > 2))) {
    throw new Error(`Functional ${stage} capture probe returned missing or incorrect marker pixels`);
  }
}

export function verifyProbeGeometry(host: DrawableCanvas, probe: ReturnType<typeof createAdmissionProbe>) {
  host.updateElementGeometry(probe.element, { canvasTransform: probe.matrix, canvasClip: probe.clip });
  validateAppliedGeometry(host, probe.element, probe.matrix);
  const rect = host.getBoundingClientRect();
  const locations = [...probe.points, { x: probe.extent * 0.9, y: probe.extent / 2 }]
    .map(point => probe.matrix.transformPoint(point))
    .map(point => ({ x: rect.x + point.x, y: rect.y + point.y }));
  const doc = host.ownerDocument;
  const view = doc.defaultView!;
  const inViewport = locations.every(point => point.x >= 0 && point.y >= 0
    && point.x < view.innerWidth && point.y < view.innerHeight);
  if (!inViewport) throw new Error("Functional native clipping is unproven: admission deferred until the owning output probe is inside the viewport; explicitly enable again when visible");
  const hits = locations.map(point => {
    const hit = doc.elementFromPoint(point.x, point.y);
    return hit === probe.element || !!hit && probe.element.contains(hit);
  });
  if (!hits[0] || !hits[1] || hits[2]) throw new Error("Functional native geometry/clip probe failed interior/clipped hit testing (possibly occluded)");
  return { expected: [probe.matrix.a, probe.matrix.b, probe.matrix.c, probe.matrix.d, probe.matrix.e, probe.matrix.f],
    actual: Array.from(host.getElementTransform(probe.element).toFloat64Array()), hits,
    hitCheck: "elementFromPoint: two interiors and one clipped exterior" };
}
