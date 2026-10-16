/**
 * Breadcrumb (anatomy page `breadcrumb.md`): a `<nav>` landmark around an ordered list of links. The last item is
 * the current page (`aria-current="page"`).
 */
import { forwardRef, type HTMLAttributes } from "react";
import { classes } from "./shared.ts";

/** A breadcrumb item: a level of the site, and its address. */
export interface BreadcrumbItem {
  label: string;
  href: string;
}

export interface BreadcrumbProps extends HTMLAttributes<HTMLElement> {
  /** From the top level to the current page. */
  items: BreadcrumbItem[];
  /** The landmark's name; "Breadcrumb" by default. */
  label?: string;
}

export const Breadcrumb = forwardRef<HTMLElement, BreadcrumbProps>(function Breadcrumb({ items, label = "Breadcrumb", className, ...rest }, ref) {
  return (
    <nav ref={ref} className={classes("ug-breadcrumb", className)} aria-label={label} {...rest}>
      <ol className="ug-breadcrumb__list">
        {items.map((item, index) => (
          <li key={item.href} className="ug-breadcrumb__item">
            <a className="ug-link ug-breadcrumb__link" href={item.href} aria-current={index === items.length - 1 ? "page" : undefined}>{item.label}</a>
          </li>
        ))}
      </ol>
    </nav>
  );
});
