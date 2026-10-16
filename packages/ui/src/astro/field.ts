/**
 * Field wiring for the Astro components. Astro has no component context, so each control takes the Field props
 * (`label`, `help`, `error`, `required`, `disabled`) and renders the Field markup around itself (`Field.astro` with
 * `wrap`). Ids come from a counter, unique within a render.
 */
let next = 0;

export interface FieldInput {
  id?: string;
  label?: string;
  help?: string;
  error?: string;
  required?: boolean;
  disabled?: boolean;
  invalid?: boolean;
}

/** Whether to wrap the control in a Field, its id, and the attributes the Field gives it. */
export function fieldControl(input: FieldInput, prefix = "field") {
  const wrap = input.label !== undefined || !!input.help || !!input.error;
  const id = input.id ?? (wrap ? `${prefix}-${++next}` : undefined);
  const describedBy = id ? [input.help ? `${id}-help` : "", input.error ? `${id}-error` : ""].filter(Boolean).join(" ") || undefined : undefined;
  return {
    wrap,
    id: id ?? "",
    attrs: {
      id,
      "aria-describedby": describedBy,
      "aria-invalid": input.error || input.invalid ? "true" : undefined,
      required: input.required || undefined,
      disabled: input.disabled || undefined,
    },
  };
}

/** A fresh id for groups and headings. */
export function nextId(prefix: string): string {
  return `${prefix}-${++next}`;
}
