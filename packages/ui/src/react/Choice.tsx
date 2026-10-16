/**
 * Checkbox and Switch: a native checkbox inside its label row (anatomy pages `checkbox.md`, `switch.md`). The ref
 * reaches the `<input>`; `className` and `style` go on the row, which carries the Strata attributes. Inside a Field
 * without a label, they take its description, invalid, required and disabled state.
 */
import { forwardRef, useLayoutEffect, useRef, type CSSProperties, type InputHTMLAttributes, type ReactNode } from "react";
import { useFieldControl } from "./Field.tsx";
import { classes, mergeRefs, strataAttributes, type StrataProps } from "./shared.ts";

type NativeCheckbox = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "size" | "children" | "className" | "style">;

interface ChoiceProps extends NativeCheckbox, StrataProps {
  /** The visible label. A switch's label must not contain "on" or "off": screen readers announce the state. */
  children: ReactNode;
  invalid?: boolean;
  /** Class names for the label row. */
  className?: string;
  /** Styles for the label row. */
  style?: CSSProperties;
}

export interface CheckboxProps extends ChoiceProps {
  /** The mixed state, set as a property on every render (it has no attribute). A click clears it, as native. */
  indeterminate?: boolean;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { indeterminate = false, invalid, size, material, level, className, style, children, ...rest }, ref,
) {
  const own = useRef<HTMLInputElement>(null);
  const field = useFieldControl();
  useLayoutEffect(() => { if (own.current) own.current.indeterminate = indeterminate; });
  return (
    <label className={classes("ug-checkbox", className)} style={style} {...strataAttributes({ size, material, level })}>
      <input ref={mergeRefs(own, ref)} className="ug-checkbox__input" data-strata-face="well" type="checkbox" {...field} {...(invalid ? { "aria-invalid": true as const } : {})} {...rest} />
      <span className="ug-checkbox__mark" data-strata-face="mark" aria-hidden="true" />
      <span className="ug-checkbox__label">{children}</span>
    </label>
  );
});

export interface SwitchProps extends ChoiceProps {
  /** The label before the track; the DOM order stays, so focus and reading order do not change. */
  reverse?: boolean;
}

export const Switch = forwardRef<HTMLInputElement, SwitchProps>(function Switch(
  { reverse, invalid, size, material, level, className, style, children, ...rest }, ref,
) {
  const field = useFieldControl();
  return (
    <label className={classes("ug-switch", reverse && "ug-switch--reverse", className)} style={style} {...strataAttributes({ size, material, level })}>
      <input ref={ref} className="ug-switch__input" data-strata-face="well" type="checkbox" role="switch" {...field} {...(invalid ? { "aria-invalid": true as const } : {})} {...rest} />
      <span className="ug-switch__knob" data-strata-face="knob" aria-hidden="true" />
      <span className="ug-switch__label">{children}</span>
    </label>
  );
});
