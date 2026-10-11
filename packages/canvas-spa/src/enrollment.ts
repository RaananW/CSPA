export type EnrollmentErrorCode = "invalid-id" | "foreign-element" | "nested-element" | "duplicate-element" | "decorative-element";
export class EnrollmentError extends Error {
  constructor(readonly code: EnrollmentErrorCode, message: string) {
    super(message);
    this.name = "EnrollmentError";
  }
}
export interface EnrollmentOptions {
  id: string;
  decorative?: boolean;
}
