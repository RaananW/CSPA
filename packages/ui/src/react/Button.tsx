/**
 * Button, IconButton and ToggleButton: native `<button>` keys (anatomy pages `button.md`, `icon-button.md`,
 * `toggle-button.md`). `type` defaults to `button`. `aria-disabled` keeps a control focusable while blocking
 * activation; `disabled` uses the native attribute.
 */
import { forwardRef, useState, type ButtonHTMLAttributes, type MouseEvent, type ReactNode } from "react";
import { classes, strataAttributes, type StrataProps } from "./shared.ts";

type NativeButton = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-pressed">;

export interface ButtonProps extends NativeButton, StrataProps {
  /** `secondary` (default), `accent` for the primary action, or `danger` for a destructive one. */
  variant?: "secondary" | "accent" | "danger";
  /** An icon before the label; decorative, so it is hidden from assistive technology. */
  icon?: ReactNode;
  /** Work in progress: sets `aria-busy`, and the label stays. */
  busy?: boolean;
}

/** Blocks activation of an `aria-disabled` control, which stays focusable. */
const guard = (onClick: ((event: MouseEvent<HTMLButtonElement>) => void) | undefined, blocked: boolean) => (event: MouseEvent<HTMLButtonElement>) => {
  if (blocked) { event.preventDefault(); event.stopPropagation(); return; }
  onClick?.(event);
};
const isBlocked = (value: ButtonHTMLAttributes<HTMLButtonElement>["aria-disabled"]) => value === true || value === "true";

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", icon, busy, size, material, level, className, type = "button", onClick, children, ...rest }, ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={classes("ug-button", variant !== "secondary" && `ug-button--${variant}`, className)}
      data-strata-face="raised"
      aria-busy={busy || undefined}
      {...strataAttributes({ size, material, level })}
      {...rest}
      onClick={guard(onClick, isBlocked(rest["aria-disabled"]))}
    >
      {icon !== undefined && <span className="ug-button__icon" aria-hidden="true">{icon}</span>}
      <span className="ug-button__label">{children}</span>
    </button>
  );
});

export interface IconButtonProps extends Omit<NativeButton, "children">, StrataProps {
  /** The accessible name; an icon-only button has no visible text. */
  label: string;
  /** The icon (SVG or an icon component). */
  icon: ReactNode;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, icon, size, material, level, className, type = "button", onClick, ...rest }, ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={classes("ug-icon-button", className)}
      data-strata-face="raised"
      aria-label={label}
      {...strataAttributes({ size, material, level })}
      {...rest}
      onClick={guard(onClick, isBlocked(rest["aria-disabled"]))}
    >
      <span className="ug-icon-button__icon" aria-hidden="true">{icon}</span>
    </button>
  );
});

export interface ToggleButtonProps extends NativeButton, StrataProps {
  /** Controlled state. */
  pressed?: boolean;
  /** Initial state when uncontrolled. */
  defaultPressed?: boolean;
  /** Called with the new state when the user toggles it. */
  onPressedChange?: (pressed: boolean) => void;
}

export const ToggleButton = forwardRef<HTMLButtonElement, ToggleButtonProps>(function ToggleButton(
  { pressed, defaultPressed = false, onPressedChange, size, material, level, className, type = "button", onClick, children, ...rest }, ref,
) {
  const [own, setOwn] = useState(defaultPressed);
  const current = pressed ?? own;
  return (
    <button
      ref={ref}
      type={type}
      className={classes("ug-toggle-button", className)}
      data-strata-face="raised"
      aria-pressed={current}
      {...strataAttributes({ size, material, level })}
      {...rest}
      onClick={guard(event => {
        onClick?.(event);
        if (event.defaultPrevented) return;
        if (pressed === undefined) setOwn(!current);
        onPressedChange?.(!current);
      }, isBlocked(rest["aria-disabled"]))}
    >
      <span className="ug-toggle-button__label">{children}</span>
    </button>
  );
});
