/** Link: a native `<a href>` (anatomy page `link.md`). Navigation is a link, never a button. */
import { forwardRef, type AnchorHTMLAttributes } from "react";
import { classes } from "./shared.ts";

export interface LinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
  /**
   * A link that stands alone (a list or navigation item) rather than inside a sentence: it gets a box of at least
   * 24 by 24. Links inside a sentence are exempt from the target size, as in WCAG 2.5.8.
   */
  standalone?: boolean;
}

export const Link = forwardRef<HTMLAnchorElement, LinkProps>(function Link({ standalone, className, ...rest }, ref) {
  return <a ref={ref} className={classes("ug-link", standalone && "ug-link--standalone", className)} {...rest} />;
});
