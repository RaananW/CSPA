/**
 * ButtonGroup, Divider, Badge, Spinner and ProgressBar (anatomy pages `button-group.md`, `divider.md`, `badge.md`,
 * `spinner.md`, `progress-bar.md`).
 */
import { forwardRef, type HTMLAttributes, type ProgressHTMLAttributes, type ReactNode } from "react";
import { useFieldControl } from "./Field.tsx";
import { classes, strataAttributes, type StrataProps } from "./shared.ts";

export interface ButtonGroupProps extends HTMLAttributes<HTMLDivElement>, StrataProps {
  /** The group's accessible name. */
  label: string;
  /** `horizontal` by default; changes the flow, not the markup. */
  orientation?: "horizontal" | "vertical";
  children: ReactNode;
}

export const ButtonGroup = forwardRef<HTMLDivElement, ButtonGroupProps>(function ButtonGroup(
  { label, orientation = "horizontal", size, material, level, className, children, ...rest }, ref,
) {
  return (
    <div ref={ref} className={classes("ug-button-group", orientation === "vertical" && "ug-button-group--vertical", className)} role="group" aria-label={label} data-strata-face="raised" {...strataAttributes({ size, material, level })} {...rest}>
      {children}
    </div>
  );
});

export interface DividerProps extends HTMLAttributes<HTMLHRElement> {
  orientation?: "horizontal" | "vertical";
}

export const Divider = forwardRef<HTMLHRElement, DividerProps>(function Divider({ orientation = "horizontal", className, ...rest }, ref) {
  const vertical = orientation === "vertical";
  return <hr ref={ref} className={classes("ug-divider", vertical && "ug-divider--vertical", className)} data-strata-face="groove" aria-orientation={vertical ? "vertical" : undefined} {...rest} />;
});

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  /** `neutral` by default. */
  variant?: "neutral" | "accent" | "success" | "warning" | "danger" | "info";
  /** A number to show instead of children; above `max` it reads "99+", with the full number visually hidden. */
  count?: number;
  /** 99 by default. */
  max?: number;
}

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(function Badge(
  { variant = "neutral", count, max = 99, className, children, ...rest }, ref,
) {
  const content = count === undefined ? children : count > max
    ? <>{max}+<span className="ug-badge__full"> ({count})</span></>
    : count;
  return <span ref={ref} className={classes("ug-badge", variant !== "neutral" && `ug-badge--${variant}`, className)} data-strata-face="flat" {...rest}>{content}</span>;
});

export interface SpinnerProps extends HTMLAttributes<HTMLSpanElement> {
  /** The accessible name and the announcement; required. */
  label: string;
  /** `medium` by default: 16, 24 or 40 px. */
  size?: "small" | "medium" | "large";
  /** Show the label next to the ring (it is always shown under reduced motion). */
  showLabel?: boolean;
  /**
   * Inside a Button with `busy`: no `role` and hidden from assistive technology, so the Button announces the busy
   * state once.
   */
  decorative?: boolean;
}

const spinnerSizes = { small: "sm", medium: "md", large: "lg" } as const;

export const Spinner = forwardRef<HTMLSpanElement, SpinnerProps>(function Spinner(
  { label, size = "medium", showLabel, decorative, className, ...rest }, ref,
) {
  return (
    <span
      ref={ref}
      className={classes("ug-spinner", `ug-spinner--${spinnerSizes[size]}`, showLabel && "ug-spinner--labelled", className)}
      role={decorative ? undefined : "status"}
      aria-hidden={decorative || undefined}
      data-strata-face="ring"
      {...rest}
    >
      <span className="ug-spinner__arc" aria-hidden="true" />
      <span className="ug-spinner__label">{label}</span>
    </span>
  );
});

export interface ProgressBarProps extends ProgressHTMLAttributes<HTMLProgressElement> {
  /** Absent for an indeterminate bar. */
  value?: number;
  /** 100 by default. */
  max?: number;
}

export const ProgressBar = forwardRef<HTMLProgressElement, ProgressBarProps>(function ProgressBar(
  { value, max = 100, className, ...rest }, ref,
) {
  const field = useFieldControl();
  const { id, "aria-describedby": describedBy } = field ?? {};
  return <progress ref={ref} className={classes("ug-progress", className)} data-strata-face="groove" {...(field ? { id, "aria-describedby": describedBy } : {})} value={value} max={max} {...rest} />;
});
