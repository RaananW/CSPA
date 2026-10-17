/**
 * Stepper (anatomy page `stepper.md`): where the user is in a task of ordered steps, as an `<ol>` whose current step
 * carries `aria-current="step"`. Steps before it are complete (a visually hidden status says so); it shows progress
 * only, and is not focusable.
 */
import { forwardRef, type OlHTMLAttributes, type ReactNode } from "react";
import { stepperFace } from "../shared/stepper.ts";
import { classes, strataAttributes, type StrataProps } from "./shared.ts";

export interface StepperProps extends OlHTMLAttributes<HTMLOListElement>, StrataProps {
  /** The list's name, such as "Checkout progress". */
  label: string;
  /** Each step's label, in order. */
  steps: readonly ReactNode[];
  /** The current step, from 0. */
  current: number;
  /** Read after a complete step's label; " (completed)" by default. */
  completedLabel?: string;
  orientation?: "horizontal" | "vertical";
}

export const Stepper = forwardRef<HTMLOListElement, StepperProps>(function Stepper(
  { label, steps, current, completedLabel = " (completed)", orientation = "horizontal", size, material, level, className, ...rest }, ref,
) {
  return (
    <ol ref={ref} className={classes("ug-stepper", orientation === "vertical" && "ug-stepper--vertical", className)} aria-label={label}
      {...strataAttributes({ size, material, level })} {...rest}>
      {steps.map((step, index) => (
        <li key={index} className="ug-stepper__step" aria-current={index === current ? "step" : undefined}>
          {index > 0 && <span className="ug-stepper__line" data-strata-face="groove" aria-hidden="true" />}
          <span className="ug-stepper__marker" data-strata-face={stepperFace(index, current)} aria-hidden="true">{index + 1}</span>
          <span className="ug-stepper__label">{step}{index < current && <span className="ug-stepper__status">{completedLabel}</span>}</span>
        </li>
      ))}
    </ol>
  );
});
