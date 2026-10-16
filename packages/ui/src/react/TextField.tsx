/**
 * TextField: a native `<input>` well (anatomy page `text-field.md`). Inside a Field it takes the Field's id,
 * description, invalid, required and disabled state; its own props win. With an `icon`, the input sits in a wrapper
 * that carries the well and the focus edge, and the ref still reaches the `<input>`.
 */
import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";
import { useFieldControl } from "./Field.tsx";
import { classes, strataAttributes, type StrataProps } from "./shared.ts";

export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size">, StrataProps {
  /** Marks the value invalid (`aria-invalid`); a Field with an error sets it too. */
  invalid?: boolean;
  /** A decorative icon at the start of the field. */
  icon?: ReactNode;
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { invalid, icon, size, material, level, className, ...rest }, ref,
) {
  const field = useFieldControl();
  const strata = strataAttributes({ size, material, level });
  const native = { ...field, ...(invalid ? { "aria-invalid": true as const } : {}), ...rest };
  if (icon === undefined) {
    return <input ref={ref} className={classes("ug-text-field", className)} data-strata-face="well" {...strata} {...native} />;
  }
  return (
    <span className="ug-text-field__wrap" data-strata-face="well" {...strata}>
      <span className="ug-text-field__icon" aria-hidden="true">{icon}</span>
      <input ref={ref} className={classes("ug-text-field__input", className)} {...native} />
    </span>
  );
});
