/**
 * Pagination (anatomy page `pagination.md`): a `<nav>` landmark around a row of page keys, links (`href`) or buttons
 * (`onPageChange`). The current page is `aria-current="page"` and its key is held down.
 */
import { forwardRef, type HTMLAttributes } from "react";
import { pageItems } from "../shared/pagination.ts";
import { classes, strataAttributes, type StrataProps } from "./shared.ts";

export interface PaginationProps extends HTMLAttributes<HTMLElement>, StrataProps {
  /** The current page, from 1. */
  page: number;
  /** The number of pages. */
  count: number;
  /** Buttons: called with the page to go to. */
  onPageChange?: (page: number) => void;
  /** Links: the address of each page. */
  href?: (page: number) => string;
  /** Pages shown either side of the current one; 1 by default. */
  siblings?: number;
  /** The landmark's name; "Pagination" by default. */
  label?: string;
}

export const Pagination = forwardRef<HTMLElement, PaginationProps>(function Pagination(
  { page, count, onPageChange, href, siblings = 1, label = "Pagination", size, material, level, className, ...rest }, ref,
) {
  const key = (target: number, name: string, content: string | null, extra: string | false, current = false, disabled = false) => {
    const props = { className: classes("ug-pagination__link", extra), "data-strata-face": "raised", "aria-label": name, "aria-current": current ? "page" as const : undefined };
    return href
      ? <a {...props} href={disabled ? undefined : href(target)} aria-disabled={disabled ? true : undefined}>{content}</a>
      : <button {...props} type="button" disabled={disabled} onClick={() => onPageChange?.(target)}>{content}</button>;
  };
  return (
    <nav ref={ref} className={classes("ug-pagination", className)} aria-label={label} {...strataAttributes({ size, material, level })} {...rest}>
      <ul className="ug-pagination__list">
        <li className="ug-pagination__item">{key(page - 1, "Previous page", null, "ug-pagination__link--previous", false, page <= 1)}</li>
        {pageItems(page, count, siblings).map((item, index) => item === "ellipsis"
          ? <li key={`ellipsis-${index}`} className="ug-pagination__item" aria-hidden="true"><span className="ug-pagination__ellipsis">…</span></li>
          : <li key={item} className="ug-pagination__item">{key(item, `Page ${item}`, String(item), false, item === page)}</li>)}
        <li className="ug-pagination__item">{key(page + 1, "Next page", null, "ug-pagination__link--next", false, page >= count)}</li>
      </ul>
    </nav>
  );
});
