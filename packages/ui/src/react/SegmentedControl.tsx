/**
 * SegmentedControl (anatomy page `segmented-control.md`): native radios in a `<fieldset>` named by its `<legend>`, each
 * visually hidden over its key on one plinth. Arrow keys, Tab and Space stay native; the selected key is held down.
 */
import { forwardRef, useId, type FieldsetHTMLAttributes, type ReactNode } from "react";
import { classes, strataAttributes, type StrataProps } from "./shared.ts";

export interface SegmentedOption {
  value: string;
  label: ReactNode;
  disabled?: boolean;
}

export interface SegmentedControlProps extends Omit<FieldsetHTMLAttributes<HTMLFieldSetElement>, "onChange" | "defaultValue">, StrataProps {
  /** Names the group, as the `<legend>`. */
  label: ReactNode;
  /** Hides the legend visually; it still names the group. */
  hideLabel?: boolean;
  /** Two to five short options. */
  options: readonly SegmentedOption[];
  /** The radios' shared `name`; generated when absent. */
  name?: string;
  /** Controlled selection. */
  value?: string;
  /** Initial selection when uncontrolled. */
  defaultValue?: string;
  onChange?: (value: string) => void;
}

export const SegmentedControl = forwardRef<HTMLFieldSetElement, SegmentedControlProps>(function SegmentedControl(
  { label, hideLabel, options, name, value, defaultValue, onChange, size, material, level, className, ...rest }, ref,
) {
  const generated = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const groupName = name ?? `segmented-${generated}`;
  return (
    <fieldset ref={ref} className={classes("ug-segmented", className)} {...strataAttributes({ size, material, level })} {...rest}>
      <legend className={classes("ug-segmented__legend", hideLabel && "ug-segmented__legend--hidden")}>{label}</legend>
      <div className="ug-segmented__plinth">
        {options.map(option => (
          <label key={option.value} className="ug-segmented__item">
            <input
              className="ug-segmented__input"
              type="radio"
              name={groupName}
              value={option.value}
              disabled={option.disabled}
              {...(value !== undefined ? { checked: value === option.value } : defaultValue !== undefined ? { defaultChecked: defaultValue === option.value } : {})}
              onChange={event => { if (event.target.checked) onChange?.(option.value); }}
            />
            <span className="ug-segmented__key" data-strata-face="raised">{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
});
