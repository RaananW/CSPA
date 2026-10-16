/**
 * Chip (anatomy page `chip.md`): a tag (a `<span>`), a filter chip (a `<button aria-pressed>`, with `pressed` or
 * `defaultPressed`) or a removable chip (with `onRemove`, and a remove button named "Remove {label}").
 */
import { forwardRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { classes, strataAttributes, type StrataProps } from "./shared.ts";

export interface ChipProps extends Omit<ButtonHTMLAttributes<HTMLElement>, "type">, StrataProps {
  children: ReactNode;
  /** A filter chip: controlled state; pair it with `onPressedChange`. */
  pressed?: boolean;
  /** A filter chip: initial state when uncontrolled. */
  defaultPressed?: boolean;
  onPressedChange?: (pressed: boolean) => void;
  /** A removable chip: called when its remove button is pressed. */
  onRemove?: () => void;
  /** The remove button's name; "Remove" and the label by default (give it when the label is not plain text). */
  removeLabel?: string;
}

export const Chip = forwardRef<HTMLElement, ChipProps>(function Chip(
  { children, pressed, defaultPressed, onPressedChange, onRemove, removeLabel, size, material, level, className, onClick, disabled, ...rest }, ref,
) {
  const [own, setOwn] = useState(defaultPressed ?? false);
  const label = <span className="ug-chip__label">{children}</span>;
  const common = { className: classes("ug-chip", className), "data-strata-face": "raised", ...strataAttributes({ size, material, level }) };
  if (pressed !== undefined || defaultPressed !== undefined || onPressedChange) {
    const current = pressed ?? own;
    return (
      <button ref={ref as React.Ref<HTMLButtonElement>} {...common} type="button" aria-pressed={current} disabled={disabled} {...rest}
        onClick={event => { onClick?.(event); if (event.defaultPrevented) return; if (pressed === undefined) setOwn(!current); onPressedChange?.(!current); }}>
        {label}
      </button>
    );
  }
  return (
    <span ref={ref as React.Ref<HTMLSpanElement>} {...common} {...rest}>
      {label}
      {onRemove && <button className="ug-chip__remove" type="button" aria-label={removeLabel ?? `Remove ${typeof children === "string" ? children : ""}`.trim()} onClick={onRemove} />}
    </span>
  );
});
