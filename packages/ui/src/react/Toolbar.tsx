/**
 * Toolbar (anatomy page `toolbar.md`): controls on one plinth that are one tab stop (a roving tabindex applied when
 * focus first enters), with the arrow keys, Home and End between them (`@underglass/ui/dom`).
 */
import { forwardRef, type HTMLAttributes, type ReactNode } from "react";
import { rovingStrataToolbar, strataToolbarTarget } from "../dom/toolbar.ts";
import { classes, strataAttributes, type StrataProps } from "./shared.ts";

export interface ToolbarProps extends HTMLAttributes<HTMLDivElement>, StrataProps {
  /** The toolbar's accessible name (`aria-label`). */
  label: string;
  /** `vertical` stacks the controls, with Up and Down between them. */
  orientation?: "horizontal" | "vertical";
  children: ReactNode;
}

export const Toolbar = forwardRef<HTMLDivElement, ToolbarProps>(function Toolbar(
  { label, orientation = "horizontal", size, material, level, className, children, onFocus, onKeyDown, ...rest }, ref,
) {
  return (
    <div ref={ref} className={classes("ug-toolbar", orientation === "vertical" && "ug-toolbar--vertical", className)} role="toolbar" aria-label={label}
      aria-orientation={orientation === "vertical" ? "vertical" : undefined} data-strata-face="raised" {...strataAttributes({ size, material, level })} {...rest}
      onFocus={event => { onFocus?.(event); if (event.target !== event.currentTarget) rovingStrataToolbar(event.currentTarget, event.target); }}
      onKeyDown={event => {
        onKeyDown?.(event);
        if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
        const target = strataToolbarTarget(event.target as Element, event.key);
        if (!target) return;
        event.preventDefault();
        target.focus();
      }}>
      {children}
    </div>
  );
});
