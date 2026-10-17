/**
 * NavigationRail (anatomy page `navigation-rail.md`): an application's top-level destinations, as a `<nav>` landmark
 * holding a list of native links on a raised rail; the current one carries `aria-current="page"`. A click reaches
 * `onNavigate`, so a router can prevent the default and route instead.
 */
import { forwardRef, type HTMLAttributes, type MouseEvent, type ReactNode } from "react";
import { classes, strataAttributes, type StrataProps } from "./shared.ts";

export interface NavigationRailItem {
  label: ReactNode;
  href: string;
  /** Decorative: the label names the destination. */
  icon?: ReactNode;
}

export interface NavigationRailProps extends HTMLAttributes<HTMLElement>, StrataProps {
  /** The landmark's name, such as "Main". */
  label: string;
  items: readonly NavigationRailItem[];
  /** The current destination's `href`. */
  current?: string;
  onNavigate?: (href: string, event: MouseEvent<HTMLAnchorElement>) => void;
}

export const NavigationRail = forwardRef<HTMLElement, NavigationRailProps>(function NavigationRail(
  { label, items, current, onNavigate, size, material, level, className, ...rest }, ref,
) {
  return (
    <nav ref={ref} className={classes("ug-nav-rail", className)} data-strata-face="raised" aria-label={label} {...strataAttributes({ size, material, level })} {...rest}>
      <ul className="ug-nav-rail__list" role="list">
        {items.map(item => (
          <li key={item.href} className="ug-nav-rail__entry">
            <a className="ug-nav-rail__item" data-strata-face="raised" href={item.href} aria-current={item.href === current ? "page" : undefined}
              onClick={onNavigate && (event => onNavigate(item.href, event))}>
              <span className="ug-nav-rail__icon" aria-hidden="true">{item.icon}</span>
              <span className="ug-nav-rail__label">{item.label}</span>
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
});
