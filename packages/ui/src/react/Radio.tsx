/**
 * RadioGroup and Radio (anatomy page `radio.md`): native radios in a `<fieldset>` named by its `<legend>`. The group
 * owns `name`, `value` and `onChange`; arrow keys, Tab and Space stay native. An error marks every radio invalid and
 * joins the help in the fieldset's description; `disabled` on the fieldset disables every radio natively.
 */
import { createContext, forwardRef, useContext, useId, type CSSProperties, type FieldsetHTMLAttributes, type InputHTMLAttributes, type ReactNode } from "react";
import { classes, strataAttributes, type StrataProps } from "./shared.ts";

interface GroupContext {
  name: string;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  invalid: boolean;
  required?: boolean;
}

const RadioGroupContext = createContext<GroupContext | undefined>(undefined);

export interface RadioGroupProps extends Omit<FieldsetHTMLAttributes<HTMLFieldSetElement>, "onChange" | "defaultValue">, StrataProps {
  /** The question, rendered as the `<legend>`. */
  legend: ReactNode;
  /** The radios' shared `name`; generated when absent. */
  name?: string;
  /** Controlled selection. */
  value?: string;
  /** Initial selection when uncontrolled. */
  defaultValue?: string;
  onChange?: (value: string) => void;
  help?: ReactNode;
  /** An error message, prefixed with `errorPrefix`; marks every radio invalid. */
  error?: ReactNode;
  required?: boolean;
  errorPrefix?: string;
  children: ReactNode;
}

export const RadioGroup = forwardRef<HTMLFieldSetElement, RadioGroupProps>(function RadioGroup(
  { legend, name, value, defaultValue, onChange, help, error, required, errorPrefix = "Error:", size, material, level, className, children, ...rest }, ref,
) {
  const generated = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const groupName = name ?? `radio-${generated}`;
  const helpId = `${groupName}-help`, errorId = `${groupName}-error`;
  const hasError = error !== undefined && error !== null && error !== false;
  const describedBy = [help ? helpId : undefined, hasError ? errorId : undefined].filter(Boolean).join(" ") || undefined;
  return (
    <fieldset ref={ref} className={classes("ug-radio-group", className)} aria-describedby={describedBy} {...strataAttributes({ size, material, level })} {...rest}>
      <legend className="ug-radio-group__legend">{legend}</legend>
      <RadioGroupContext.Provider value={{ name: groupName, value, defaultValue, onChange, invalid: hasError, required }}>{children}</RadioGroupContext.Provider>
      {help && <p className="ug-field__help" id={helpId}>{help}</p>}
      {hasError && <p className="ug-field__error" id={errorId}>{errorPrefix} {error}</p>}
    </fieldset>
  );
});

export interface RadioProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "size" | "children" | "className" | "style" | "value">, StrataProps {
  value: string;
  children: ReactNode;
  /** Class names for the label row. */
  className?: string;
  style?: CSSProperties;
}

export const Radio = forwardRef<HTMLInputElement, RadioProps>(function Radio(
  { value, size, material, level, className, style, children, onChange, ...rest }, ref,
) {
  const group = useContext(RadioGroupContext);
  const selection = group?.value !== undefined ? { checked: group.value === value } : group?.defaultValue !== undefined ? { defaultChecked: group.defaultValue === value } : {};
  return (
    <label className={classes("ug-radio", className)} style={style} {...strataAttributes({ size, material, level })}>
      <input
        ref={ref}
        className="ug-radio__input"
        data-strata-face="well"
        type="radio"
        name={group?.name}
        value={value}
        required={group?.required}
        aria-invalid={group?.invalid || undefined}
        {...selection}
        {...rest}
        onChange={event => { onChange?.(event); if (event.target.checked) group?.onChange?.(value); }}
      />
      <span className="ug-radio__dot" data-strata-face="knob" aria-hidden="true" />
      <span className="ug-radio__label">{children}</span>
    </label>
  );
});
