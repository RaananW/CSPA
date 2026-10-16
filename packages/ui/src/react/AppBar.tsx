/**
 * AppBar (anatomy page `app-bar.md`): the application's top bar, a `<header>` on a raised slab with optional start and
 * end controls and a title between them.
 */
import { forwardRef, type HTMLAttributes, type ReactNode } from "react";
import { classes, strataAttributes, type StrataProps } from "./shared.ts";

export interface AppBarProps extends Omit<HTMLAttributes<HTMLElement>, "title">, StrataProps {
  /** The bar's title: text, or a heading when it names the page. */
  title: ReactNode;
  /** Controls before the title (navigation, a logo). */
  start?: ReactNode;
  /** Controls after the title (search, the account). */
  end?: ReactNode;
}

export const AppBar = forwardRef<HTMLElement, AppBarProps>(function AppBar({ title, start, end, size, material, level, className, ...rest }, ref) {
  return (
    <header ref={ref} className={classes("ug-app-bar", className)} data-strata-face="raised" {...strataAttributes({ size, material, level })} {...rest}>
      {start !== undefined && start !== null && <div className="ug-app-bar__start">{start}</div>}
      <span className="ug-app-bar__title">{title}</span>
      {end !== undefined && end !== null && <div className="ug-app-bar__end">{end}</div>}
    </header>
  );
});
