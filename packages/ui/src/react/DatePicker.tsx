/**
 * DatePicker (anatomy page `date-picker.md`): a TextField that takes a date, a native `<input type="date">`. The
 * browser draws the calendar. Inside a Field it takes the Field's id, description and state; its own props win. The
 * ref reaches the `<input>`.
 */
import { forwardRef, type InputHTMLAttributes } from "react";
import { useFieldControl } from "./Field.tsx";
import { classes, strataAttributes, type StrataProps } from "./shared.ts";

export interface DatePickerProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size" | "type">, StrataProps {
  /** Marks the value invalid (`aria-invalid`); a Field with an error sets it too. */
  invalid?: boolean;
}

export const DatePicker = forwardRef<HTMLInputElement, DatePickerProps>(function DatePicker(
  { invalid, size, material, level, className, ...rest }, ref,
) {
  const field = useFieldControl();
  return (
    <input
      ref={ref}
      className={classes("ug-text-field ug-date-picker", className)}
      data-strata-face="well"
      {...strataAttributes({ size, material, level })}
      {...field}
      {...(invalid ? { "aria-invalid": true as const } : {})}
      {...rest}
      type="date"
    />
  );
});
