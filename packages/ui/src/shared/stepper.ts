/** Stepper (anatomy page `stepper.md`): what the bindings share. */

/** A step's marker face: raised when complete or current, flat when it is still to come. */
export function stepperFace(index: number, current: number): "raised" | "flat" {
  return index <= current ? "raised" : "flat";
}
