/**
 * Combobox (anatomy page `combobox.md`): a TextField with the browser's own suggestion list, a native `<input list>`
 * and its `<datalist>`. Inside a Field it takes the Field's id, description and state; its own props win. The ref
 * reaches the `<input>`.
 */
import { forwardRef, useId, type InputHTMLAttributes } from "react";
import { comboboxListId, comboboxOptions, type ComboboxOption } from "../shared/combobox.ts";
import { useFieldControl } from "./Field.tsx";
import { classes, strataAttributes, type StrataProps } from "./shared.ts";

export type { ComboboxOption } from "../shared/combobox.ts";

export interface ComboboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size" | "list" | "type">, StrataProps {
  /** The suggestions, in order: a value, or `{ value, label }`. Any other text may still be typed. */
  options: readonly ComboboxOption[];
  /** Marks the value invalid (`aria-invalid`); a Field with an error sets it too. */
  invalid?: boolean;
}

export const Combobox = forwardRef<HTMLInputElement, ComboboxProps>(function Combobox(
  { options, invalid, size, material, level, className, ...rest }, ref,
) {
  const field = useFieldControl();
  const generated = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  // The datalist needs an id: the input's own, the Field's, or a generated one.
  const id = rest.id ?? field?.id ?? `combobox-${generated}`;
  const listId = comboboxListId(id);
  return (
    <>
      <input
        ref={ref}
        className={classes("ug-text-field ug-combobox", className)}
        data-strata-face="well"
        type="text"
        autoComplete="off"
        {...strataAttributes({ size, material, level })}
        {...field}
        {...(invalid ? { "aria-invalid": true as const } : {})}
        {...rest}
        id={id}
        list={listId}
      />
      <datalist id={listId}>
        {comboboxOptions(options).map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
      </datalist>
    </>
  );
});
