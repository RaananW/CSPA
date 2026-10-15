/**
 * Complete-frame publication rule used by the renderer: a composition may only be presented when
 * every layer's cached capture still covers what its current geometry requires. Otherwise the
 * renderer keeps the last complete output until fresh native-paint uploads arrive.
 */

/**
 * What a layer's texture currently holds. `slot` is the layer's logical capture slot and
 * `capturedSlot` the slot its pixels were captured for (`-1` before the first capture);
 * `width`/`height` are the captured CSS extent and `pixelWidth`/`pixelHeight` its pixel grid.
 */
export interface CaptureCoverage {
  slot: number;
  capturedSlot: number;
  width: number;
  height: number;
  pixelWidth: number;
  pixelHeight: number;
}

/** Geometry and capture provenance are deliberately independent. */
export function completeCoverage(
  capture: CaptureCoverage,
  required: { width: number; height: number; pixelWidth: number; pixelHeight: number },
): boolean {
  // Complete means: pixels captured for the current slot, at least the required CSS extent, and
  // at least the required pixels per CSS pixel on each axis, so a DPR increase is never presented
  // from a coarser grid. `Math.max(1, ...)` guards zero-sized extents.
  return capture.slot === capture.capturedSlot
    && capture.width >= required.width && capture.height >= required.height
    && capture.pixelWidth / Math.max(1, capture.width) >= required.pixelWidth / Math.max(1, required.width)
    && capture.pixelHeight / Math.max(1, capture.height) >= required.pixelHeight / Math.max(1, required.height);
}
