/**
 * Public types for original-element ref enrollment (`useSurfaceRef` and `CanvasController.enroll`):
 * the enrollment options and the typed error `CanvasRuntime.enroll` throws before mutating anything.
 */
import type { TransformOrigin } from "./affine.js";

/**
 * Why an enrollment was refused: `invalid-id` (blank or duplicate ID), `foreign-element` (not an
 * original connected element inside the persistent root), `nested-element` (not a direct root
 * child, or nested with another enrolled element), `duplicate-element` (already enrolled) or
 * `decorative-element` (decorative content is not inert, aria-hidden and noninteractive).
 */
export type EnrollmentErrorCode = "invalid-id" | "foreign-element" | "nested-element" | "duplicate-element" | "decorative-element";
/** Thrown by ref enrollment before any DOM mutation; `code` identifies the refused precondition. */
export class EnrollmentError extends Error {
  constructor(readonly code: EnrollmentErrorCode, message: string) {
    super(message);
    this.name = "EnrollmentError";
  }
}
/** Options for enrolling an original element; keep `id` and `decorative` stable while enrolled. */
export interface EnrollmentOptions {
  /** Unique, nonblank layer ID used by the controller methods. */
  id: string;
  /** Marks authored inert, aria-hidden noninteractive decoration that effects may distort. */
  decorative?: boolean;
  /** Static pivot for rotation and scale; see `TransformOrigin`. */
  origin?: TransformOrigin;
}
