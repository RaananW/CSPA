/**
 * Field: a label, a control, help and an error (anatomy page `field.md`). The binding creates the ids and passes
 * `id`, `aria-describedby`, `aria-invalid`, `required` and `disabled` to its control through context, so the control
 * stays the original child with its own ref and state. The error is not a live region.
 */
import { createContext, forwardRef, useContext, useId, type HTMLAttributes, type ReactNode } from "react";
import { classes } from "./shared.ts";

/** What a Field gives its control. */
export interface FieldControl {
  id: string;
  "aria-describedby"?: string;
  "aria-invalid"?: true;
  required?: boolean;
  disabled?: boolean;
}

const FieldContext = createContext<FieldControl | undefined>(undefined);

/** The Field around a control, if any: controls spread this before their own props. */
export function useFieldControl(): FieldControl | undefined {
  return useContext(FieldContext);
}

export interface FieldProps extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
  label: ReactNode;
  /** Help text, read as part of the control's description. */
  help?: ReactNode;
  /** An error message; also marks the control invalid. Prefixed with `errorPrefix`, so colour is never the only signal. */
  error?: ReactNode;
  /** The control's id; generated when absent. */
  controlId?: string;
  required?: boolean;
  disabled?: boolean;
  /** Visible suffix on the label of a required field. "(required)" by default. */
  requiredLabel?: string;
  /** Visible prefix of the error message. "Error:" by default. */
  errorPrefix?: string;
  children: ReactNode;
}

export const Field = forwardRef<HTMLDivElement, FieldProps>(function Field(
  { label, help, error, controlId, required, disabled, requiredLabel = "(required)", errorPrefix = "Error:", className, children, ...rest }, ref,
) {
  const generated = useId();
  const id = controlId ?? `field-${generated.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const helpId = `${id}-help`, errorId = `${id}-error`;
  const hasError = error !== undefined && error !== null && error !== false;
  const describedBy = [help ? helpId : undefined, hasError ? errorId : undefined].filter(Boolean).join(" ") || undefined;
  const control: FieldControl = { id, "aria-describedby": describedBy, "aria-invalid": hasError ? true : undefined, required, disabled };
  return (
    <div ref={ref} className={classes("ug-field", className)} {...rest}>
      <label className="ug-field__label" htmlFor={id}>
        {label}
        {required && <> {requiredLabel}</>}
      </label>
      <FieldContext.Provider value={control}>{children}</FieldContext.Provider>
      {help && <p className="ug-field__help" id={helpId}>{help}</p>}
      {hasError && <p className="ug-field__error" id={errorId}>{errorPrefix} {error}</p>}
    </div>
  );
});
