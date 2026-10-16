/**
 * MessageBar (anatomy page `message-bar.md`): an inline message on a raised slab, a live region whose role follows
 * its intent, with optional actions and a dismiss button (`onDismiss`).
 */
import { forwardRef, type HTMLAttributes, type ReactNode } from "react";
import { messageRole, type MessageIntent } from "../shared/message.ts";
import { classes, strataAttributes, type StrataProps } from "./shared.ts";

export type { MessageIntent } from "../shared/message.ts";

export interface MessageBarProps extends Omit<HTMLAttributes<HTMLDivElement>, "title">, StrataProps {
  /** `info` by default. */
  intent?: MessageIntent;
  title?: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
  /** Shows a dismiss button, and is called when it is pressed. */
  onDismiss?: () => void;
  dismissLabel?: string;
}

export const MessageBar = forwardRef<HTMLDivElement, MessageBarProps>(function MessageBar(
  { intent = "info", title, children, actions, onDismiss, dismissLabel = "Dismiss", size, material, level, className, ...rest }, ref,
) {
  return (
    <div ref={ref} className={classes("ug-message-bar", `ug-message-bar--${intent}`, className)} data-strata-face="raised" role={messageRole(intent)}
      {...strataAttributes({ size, material, level })} {...rest}>
      <span className="ug-message-bar__icon" aria-hidden="true" />
      <div className="ug-message-bar__content">
        {title !== undefined && title !== null && <p className="ug-message-bar__title">{title}</p>}
        <p className="ug-message-bar__body">{children}</p>
      </div>
      {actions !== undefined && actions !== null && <div className="ug-message-bar__actions">{actions}</div>}
      {onDismiss && <button className="ug-message-bar__dismiss" type="button" aria-label={dismissLabel} onClick={onDismiss} />}
    </div>
  );
});
