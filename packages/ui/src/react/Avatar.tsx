/**
 * Avatar (anatomy page `avatar.md`): a raised coin with initials (`role="img"`, named by `name`) or a picture whose
 * `alt` is the name. `decorative` hides it, for an avatar beside the name in text.
 */
import { forwardRef, type HTMLAttributes } from "react";
import { avatarInitials } from "../shared/avatar.ts";
import { classes, strataAttributes, type StrataProps } from "./shared.ts";

export interface AvatarProps extends HTMLAttributes<HTMLSpanElement>, StrataProps {
  /** The person's or entity's name: the picture's `alt`, or the initials and the name. */
  name: string;
  /** A picture; initials when absent. */
  src?: string;
  /** Hidden from assistive technology, for an avatar beside the name in text. */
  decorative?: boolean;
}

export const Avatar = forwardRef<HTMLSpanElement, AvatarProps>(function Avatar({ name, src, decorative, size, material, level, className, ...rest }, ref) {
  const own = src !== undefined ? {} : decorative ? {} : { role: "img", "aria-label": name };
  return (
    <span ref={ref} className={classes("ug-avatar", className)} data-strata-face="raised" {...own} aria-hidden={decorative ? true : undefined}
      {...strataAttributes({ size, material, level })} {...rest}>
      {src !== undefined ? <img className="ug-avatar__image" src={src} alt={decorative ? "" : name} />
        : <span className="ug-avatar__initials" aria-hidden={decorative ? undefined : true}>{avatarInitials(name)}</span>}
    </span>
  );
});
