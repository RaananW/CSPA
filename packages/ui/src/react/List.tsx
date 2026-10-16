/**
 * List and ListItem (anatomy page `list.md`): a native `<ul role="list">` on one raised slab. A row is static, a link
 * (`href`) or a button (`onClick`), and an actionable row's link or button fills it.
 */
import { forwardRef, type AnchorHTMLAttributes, type HTMLAttributes, type MouseEventHandler, type ReactNode } from "react";
import { classes, strataAttributes, type StrataProps } from "./shared.ts";

export interface ListProps extends HTMLAttributes<HTMLUListElement>, StrataProps {
  /** The list's accessible name (`aria-label`). */
  label?: string;
  children: ReactNode;
}

export const List = forwardRef<HTMLUListElement, ListProps>(function List({ label, size, material, level, className, children, ...rest }, ref) {
  return (
    <ul ref={ref} className={classes("ug-list", className)} role="list" data-strata-face="raised" aria-label={label} {...strataAttributes({ size, material, level })} {...rest}>
      {children}
    </ul>
  );
});

export interface ListItemProps extends Omit<HTMLAttributes<HTMLLIElement>, "onClick"> {
  primary: ReactNode;
  secondary?: ReactNode;
  /** A decorative icon or avatar before the text. */
  start?: ReactNode;
  /** Trailing details after the text, which are read. */
  end?: ReactNode;
  /** A link row. */
  href?: string;
  /** A button row (without `href`). */
  onClick?: MouseEventHandler<HTMLElement>;
  /** Marks the current row (`aria-current`) on a link row. */
  current?: AnchorHTMLAttributes<HTMLAnchorElement>["aria-current"];
  /** Disables a button row. */
  disabled?: boolean;
}

export const ListItem = forwardRef<HTMLLIElement, ListItemProps>(function ListItem(
  { primary, secondary, start, end, href, onClick, current, disabled, className, ...rest }, ref,
) {
  const content = (
    <>
      {start !== undefined && start !== null && <span className="ug-list__start" aria-hidden="true">{start}</span>}
      <span className="ug-list__text">
        <span className="ug-list__primary">{primary}</span>
        {secondary !== undefined && secondary !== null && <span className="ug-list__secondary">{secondary}</span>}
      </span>
      {end !== undefined && end !== null && <span className="ug-list__end">{end}</span>}
    </>
  );
  return (
    <li ref={ref} className={classes("ug-list__item", className)} {...rest}>
      {href !== undefined ? <a className="ug-list__action" href={href} aria-current={current} onClick={onClick}>{content}</a>
        : onClick ? <button className="ug-list__action" type="button" disabled={disabled} onClick={onClick}>{content}</button>
        : content}
    </li>
  );
});
