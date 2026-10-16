/**
 * Select and Slider: native `<select>` and `<input type="range">` (anatomy pages `select.md`, `slider.md`), Field-aware.
 * The select's list is the browser's own; the slider's keys, pointer and touch input are native.
 */
import { forwardRef, type InputHTMLAttributes, type SelectHTMLAttributes } from "react";
import { useFieldControl } from "./Field.tsx";
import { classes, strataAttributes, type StrataProps } from "./shared.ts";

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "size">, StrataProps {
  invalid?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { invalid, size, material, level, className, children, ...rest }, ref,
) {
  const field = useFieldControl();
  return (
    <select ref={ref} className={classes("ug-select", className)} data-strata-face="raised" {...strataAttributes({ size, material, level })} {...field} {...(invalid ? { "aria-invalid": true as const } : {})} {...rest}>
      {children}
    </select>
  );
});

export interface SliderProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "size">, StrataProps {}

export const Slider = forwardRef<HTMLInputElement, SliderProps>(function Slider(
  { size, material, level, className, ...rest }, ref,
) {
  const field = useFieldControl();
  // A slider has no invalid or required state of its own; it takes the Field's id, description and disabled.
  const { id, "aria-describedby": describedBy, disabled } = field ?? {};
  return (
    <input
      ref={ref}
      type="range"
      className={classes("ug-slider", className)}
      data-strata-face="groove"
      {...strataAttributes({ size, material, level })}
      {...(field ? { id, "aria-describedby": describedBy, disabled } : {})}
      {...rest}
    />
  );
});
