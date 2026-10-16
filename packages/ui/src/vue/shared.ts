/** Vue helpers for the Strata bindings: the shared Strata props, and the Field context. */
import { inject, type ComputedRef, type InjectionKey, type PropType } from "vue";
import type { StrataLevel, StrataSize } from "../shared/markup.ts";

export { classes, strataAttributes } from "../shared/markup.ts";

/** The Strata props every component accepts (`size`, `material`, `level`). */
export const strataProps = {
  size: { type: String as PropType<StrataSize>, default: undefined },
  material: { type: String, default: undefined },
  level: { type: String as PropType<StrataLevel>, default: undefined },
};

/** What a Field gives its control. */
export interface FieldControl {
  id: string;
  "aria-describedby"?: string;
  "aria-invalid"?: "true";
  required?: boolean;
  disabled?: boolean;
}

export const fieldKey: InjectionKey<ComputedRef<FieldControl>> = Symbol("strata-field");

/** The Field around a control, if any: controls apply it before their own attributes. */
export function useFieldControl(): ComputedRef<FieldControl> | undefined {
  return inject(fieldKey, undefined);
}

/** Splits fallthrough attributes: `class` and `style` for a component's row, everything else for its control. */
export function splitAttrs(attrs: Record<string, unknown>): { row: Record<string, unknown>; control: Record<string, unknown> } {
  const { class: className, style, ...control } = attrs;
  return { row: { class: className, style }, control };
}
