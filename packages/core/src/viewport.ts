/**
 * Small rectangle and offset helpers used for viewport clipping of GPU layers: content-box origin,
 * intersection, containment under an affine transform, and scroll-aware element origin. Pure
 * functions with no GPU state; used by `runtime.ts`.
 */
import type { Point } from "./affine.js";

/** An axis-aligned rectangle in a single coordinate space (x/y origin, non-negative size). */
export interface ViewportRect { x: number; y: number; width: number; height: number }
/**
 * Offset of a canvas's content box from its border-box origin: border (`clientLeft`/`clientTop`)
 * plus padding. Canvas-space coordinates are measured from this point.
 */
export function canvasContentOrigin(canvas: Pick<HTMLElement, "clientLeft" | "clientTop">,
  style: Pick<CSSStyleDeclaration, "paddingLeft" | "paddingTop">): Point {
  return { x: canvas.clientLeft + parseFloat(style.paddingLeft), y: canvas.clientTop + parseFloat(style.paddingTop) };
}
/** Intersection of two rectangles; width and height clamp to 0 when they do not overlap. */
export function intersectViewport(a: ViewportRect, b: ViewportRect): ViewportRect {
  const x = Math.max(a.x, b.x), y = Math.max(a.y, b.y);
  return { x, y, width: Math.max(0, Math.min(a.x + a.width, b.x + b.width) - x),
    height: Math.max(0, Math.min(a.y + a.height, b.y + b.height) - y) };
}
/**
 * True when all four corners of an `extent`-sized box, mapped through the 2D affine `matrix`
 * (a, b, c, d, e, f as in `DOMMatrix`), lie inside `clip` (edges inclusive).
 */
export function viewportContains(matrix: Pick<DOMMatrixReadOnly, "a" | "b" | "c" | "d" | "e" | "f">,
  extent: { width: number; height: number }, clip: ViewportRect): boolean {
  return [[0, 0], [extent.width, 0], [0, extent.height], [extent.width, extent.height]].every(([x, y]) => {
    const at = { x: matrix.a * x + matrix.c * y + matrix.e, y: matrix.b * x + matrix.d * y + matrix.f };
    return at.x >= clip.x && at.y >= clip.y && at.x <= clip.x + clip.width && at.y <= clip.y + clip.height;
  });
}
/** Positive axis-aligned scale/translation: the only form a local clip rectangle can represent. */
export function axisAligned(matrix: Pick<DOMMatrixReadOnly, "a" | "b" | "c" | "d">): boolean {
  return matrix.b === 0 && matrix.c === 0 && matrix.a > 0 && matrix.d > 0;
}
/**
 * Converts `clip` from the parent space into the local space of a layer with `matrix`. Only valid
 * for positive axis-aligned transforms; throws otherwise.
 */
export function localViewport(matrix: DOMMatrixReadOnly, clip: ViewportRect): ViewportRect {
  if (!axisAligned(matrix)) {
    throw new Error("Viewport clipping requires positive axis-aligned layer transforms");
  }
  return { x: (clip.x - matrix.e) / matrix.a, y: (clip.y - matrix.f) / matrix.d,
    width: clip.width / matrix.a, height: clip.height / matrix.d };
}
/**
 * Position of `element`'s top-left corner relative to `root`, measured through the `offsetParent`
 * chain (layout position, ignoring transforms) and then shifted back by every ancestor scroll
 * offset up to and including `root`.
 */
export function scrollOrigin(element: HTMLElement, root: HTMLElement): Point {
  let x = 0, y = 0;
  for (let node: HTMLElement | null = element; node && node !== root;
    node = node.offsetParent instanceof HTMLElement ? node.offsetParent : null) {
    x += node.offsetLeft; y += node.offsetTop;
    if (node.offsetParent instanceof HTMLElement) {
      x += node.offsetParent.clientLeft; y += node.offsetParent.clientTop;
    }
  }
  for (let node = element.parentElement; node; node = node.parentElement) {
    x -= node.scrollLeft; y -= node.scrollTop;
    if (node === root) break;
  }
  return { x, y };
}
