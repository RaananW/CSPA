/** TextArea: a native `<textarea>` well (anatomy page `text-area.md`), Field-aware like TextField. */
import { forwardRef, type TextareaHTMLAttributes } from "react";
import { useFieldControl } from "./Field.tsx";
import { classes, strataAttributes, type StrataProps } from "./shared.ts";

export interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement>, StrataProps {
  invalid?: boolean;
  /** How the user may resize it: `vertical` by default. */
  resize?: "vertical" | "none" | "both" | "horizontal";
}

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(function TextArea(
  { invalid, resize, size, material, level, className, style, rows = 3, ...rest }, ref,
) {
  const field = useFieldControl();
  return (
    <textarea
      ref={ref}
      className={classes("ug-text-area", className)}
      data-strata-face="well"
      rows={rows}
      {...strataAttributes({ size, material, level })}
      {...field}
      {...(invalid ? { "aria-invalid": true as const } : {})}
      {...rest}
      style={resize && resize !== "vertical" ? { resize, ...style } : style}
    />
  );
});
