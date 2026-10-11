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
  return capture.slot === capture.capturedSlot
    && capture.width >= required.width && capture.height >= required.height
    && capture.pixelWidth / Math.max(1, capture.width) >= required.pixelWidth / Math.max(1, required.width)
    && capture.pixelHeight / Math.max(1, capture.height) >= required.pixelHeight / Math.max(1, required.height);
}
