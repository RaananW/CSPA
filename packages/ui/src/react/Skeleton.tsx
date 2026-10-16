/**
 * Skeleton (anatomy page `skeleton.md`): flat placeholders, hidden from assistive technology, that hold the place of
 * loading content. Put `aria-busy` and a status on the region that is loading.
 */
import { forwardRef, type CSSProperties, type HTMLAttributes } from "react";
import { classes } from "./shared.ts";

export interface SkeletonProps extends HTMLAttributes<HTMLSpanElement> {
  /** `text` (default): lines of text; `circle`: an avatar; `rect`: an image or a block. */
  shape?: "text" | "circle" | "rect";
  /** Text lines; one by default. */
  lines?: number;
  width?: CSSProperties["width"];
  height?: CSSProperties["height"];
}

export const Skeleton = forwardRef<HTMLSpanElement, SkeletonProps>(function Skeleton({ shape = "text", lines = 1, width, height, className, style, ...rest }, ref) {
  const size = width !== undefined || height !== undefined || style ? { ...style, width, height } : undefined;
  if (shape === "text" && lines > 1) {
    return (
      <span ref={ref} className={classes("ug-skeleton-text", className)} aria-hidden="true" style={size} {...rest}>
        {Array.from({ length: lines }, (_, index) => <span key={index} className="ug-skeleton ug-skeleton--text" />)}
      </span>
    );
  }
  return <span ref={ref} className={classes("ug-skeleton", `ug-skeleton--${shape}`, className)} aria-hidden="true" style={size} {...rest} />;
});
