import type { Point } from "./affine.js";

export interface ViewportRect { x: number; y: number; width: number; height: number }
export function intersectViewport(a: ViewportRect, b: ViewportRect): ViewportRect {
  const x = Math.max(a.x, b.x), y = Math.max(a.y, b.y);
  return { x, y, width: Math.max(0, Math.min(a.x + a.width, b.x + b.width) - x),
    height: Math.max(0, Math.min(a.y + a.height, b.y + b.height) - y) };
}
export function localViewport(matrix: DOMMatrixReadOnly, clip: ViewportRect): ViewportRect {
  if (matrix.b !== 0 || matrix.c !== 0 || matrix.a <= 0 || matrix.d <= 0) {
    throw new Error("Viewport clipping requires positive axis-aligned layer transforms");
  }
  return { x: (clip.x - matrix.e) / matrix.a, y: (clip.y - matrix.f) / matrix.d,
    width: clip.width / matrix.a, height: clip.height / matrix.d };
}
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
