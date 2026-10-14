import { validateAppliedGeometry, type DrawableCanvas } from "./native.js";

const colors = [[207, 37, 83, 255], [31, 179, 113, 255]];

export function createAdmissionProbe(host: DrawableCanvas) {
  const extent = Math.min(32, Math.floor(Math.min(host.width, host.height) / 4));
  if (extent < 4) throw new Error("Functional admission requires a capture surface of at least 16 CSS pixels per axis");
  const element = host.ownerDocument.createElement("div");
  const half = host.ownerDocument.createElement("div");
  element.setAttribute("drawable", "");
  element.setAttribute("aria-hidden", "true");
  element.style.cssText = `all:initial;display:block;position:absolute;left:0;top:0;width:${extent}px;height:${extent}px;background:rgb(207,37,83);pointer-events:auto;`;
  half.style.cssText = `all:initial;display:block;position:absolute;left:35%;top:0;width:35%;height:100%;background:rgb(31,179,113);`;
  element.append(half);
  host.append(element);
  // Hit verification needs the probe inside the viewport: place it in the visible
  // part of the canvas (a scrolled page still admits); fully offscreen stays refused.
  const rect = host.getBoundingClientRect(), view = host.ownerDocument.defaultView!;
  const place = (start: number, size: number, viewport: number) => {
    const visible = Math.max(0, -start), limit = Math.min(size, viewport - start);
    return visible > 0 && visible + extent * 3 <= limit ? visible + extent * 1.5 : extent * 1.5;
  };
  const matrix = new DOMMatrix().translate(place(rect.x, rect.width, view.innerWidth), place(rect.y, rect.height, view.innerHeight))
    .rotate(11).scale(0.75);
  // Marker points sit well inside their colour band and the clip. Chromium clips hits on a
  // rotated layer to the clip's canvas-space bounding box, not the rotated rectangle, so the
  // clipped point lies beyond that box: top right, where the rotated clip edge leans inward.
  // Every margin is several CSS pixels, so fractional canvas offsets cannot flip a result.
  const points = [{ x: extent * 0.15, y: extent / 2 }, { x: extent * 0.52, y: extent / 2 }];
  const clipped = { x: extent * 0.9, y: extent * 0.15 };
  return { element, extent, matrix, points, clipped,
    clip: { x: 0, y: 0, width: extent * 0.75, height: extent } };
}

export function verifyProbePixels(pixels: number[][], stage: "native" | "GPU"): void {
  if (pixels.length !== colors.length || pixels.some((pixel, index) =>
    pixel.length !== 4 || pixel.some((value, channel) =>
      !Number.isFinite(value) || Math.abs(value - colors[index]![channel]!) > 2))) {
    throw new Error(`Functional ${stage} capture probe returned missing or incorrect marker pixels`);
  }
}

export function verifyProbeGeometry(host: DrawableCanvas, probe: ReturnType<typeof createAdmissionProbe>,
  origin = { x: 0, y: 0 }) {
  const matrix = new DOMMatrix().translate(origin.x, origin.y).multiply(probe.matrix);
  host.updateElementGeometry(probe.element, { canvasTransform: matrix, canvasClip: probe.clip });
  validateAppliedGeometry(host, probe.element, matrix);
  const rect = host.getBoundingClientRect();
  const locations = [...probe.points, probe.clipped]
    .map(point => matrix.transformPoint(point))
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
  return { expected: [matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f],
    actual: Array.from(host.getElementTransform(probe.element).toFloat64Array()), hits,
    hitCheck: "elementFromPoint: two interiors and one clipped exterior" };
}

export type FrameBounds = "bounded" | "unbounded" | "unverifiable";

/**
 * Functional proof that native hit testing stops at the output canvas content
 * box. The probe is rotated across one visible content edge with no clip beyond
 * its own extent: the inner half must hit the probe and the outer half must not.
 * When that holds, a transformed layer crossing the frame edge needs no extra
 * frame clip, because the canvas bounds its GPU pixels and its native hits alike.
 * `unverifiable` means no content edge is visible with room on both sides, or the
 * inner half is occluded; callers then keep the frame clip requirement.
 */
export function verifyFrameBounds(host: DrawableCanvas, probe: ReturnType<typeof createAdmissionProbe>,
  origin = { x: 0, y: 0 }): { result: FrameBounds; edge?: string; hits?: boolean[] } {
  const view = host.ownerDocument.defaultView!;
  const style = view.getComputedStyle(host);
  const rect = host.getBoundingClientRect();
  const width = host.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
  const height = host.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
  const content = { left: rect.x + origin.x, top: rect.y + origin.y, right: rect.x + origin.x + width, bottom: rect.y + origin.y + height };
  const margin = probe.extent;
  const visible = (low: number, high: number, limit: number) => {
    const start = Math.max(low, 0), end = Math.min(high, limit);
    return end - start > margin * 2 ? (start + end) / 2 : undefined;
  };
  const middleY = visible(content.top, content.bottom, view.innerHeight);
  const middleX = visible(content.left, content.right, view.innerWidth);
  const fits = (value: number, low: number, high: number) => value - margin >= low && value + margin <= high;
  const edges = [
    { edge: "right", at: { x: content.right, y: middleY }, angle: 0, ok: middleY !== undefined && fits(content.right, Math.max(content.left, 0), view.innerWidth) },
    { edge: "bottom", at: { x: middleX, y: content.bottom }, angle: 90, ok: middleX !== undefined && fits(content.bottom, Math.max(content.top, 0), view.innerHeight) },
    { edge: "left", at: { x: content.left, y: middleY }, angle: 180, ok: middleY !== undefined && fits(content.left, 0, Math.min(content.right, view.innerWidth)) },
    { edge: "top", at: { x: middleX, y: content.top }, angle: 270, ok: middleX !== undefined && fits(content.top, 0, Math.min(content.bottom, view.innerHeight)) },
  ];
  const candidate = edges.find(entry => entry.ok);
  if (!candidate) return { result: "unverifiable" };
  const half = probe.extent / 2;
  // Local +x points out of the canvas; 11 degrees keeps the probe non-axis-aligned.
  const matrix = new DOMMatrix().translate(candidate.at.x! - rect.x, candidate.at.y! - rect.y)
    .rotate(candidate.angle + 11).translate(-half, -half);
  host.updateElementGeometry(probe.element, { canvasTransform: matrix, canvasClip: { x: 0, y: 0, width: probe.extent, height: probe.extent } });
  validateAppliedGeometry(host, probe.element, matrix);
  const hits = [{ x: probe.extent * .15, y: half }, { x: probe.extent * .85, y: half }]
    .map(point => matrix.transformPoint(point))
    .map(point => {
      const hit = host.ownerDocument.elementFromPoint(rect.x + point.x, rect.y + point.y);
      return hit === probe.element || !!hit && probe.element.contains(hit);
    });
  return { result: !hits[0] ? "unverifiable" : hits[1] ? "unbounded" : "bounded", edge: candidate.edge, hits };
}
