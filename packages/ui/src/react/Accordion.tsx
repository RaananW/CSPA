/**
 * Accordion and AccordionItem (anatomy page `accordion.md`): native `<details>` sections, each a raised slab with a
 * `<summary>` header. `exclusive` (or a `name`) makes opening one section close the others, natively. An item is
 * uncontrolled with `defaultOpen`, or controlled with `open` and `onOpenChange`, from the native `toggle` event.
 */
import { createContext, forwardRef, useContext, useId, useState, type DetailsHTMLAttributes, type HTMLAttributes, type ReactNode } from "react";
import { classes, strataAttributes, type StrataProps } from "./shared.ts";

const AccordionContext = createContext<{ name?: string }>({});

export interface AccordionProps extends HTMLAttributes<HTMLDivElement>, StrataProps {
  /** Only one section open at a time: a generated `name` on every section. */
  exclusive?: boolean;
  /** The sections' shared `name`, for an exclusive accordion with a name of your own. */
  name?: string;
  children: ReactNode;
}

export const Accordion = forwardRef<HTMLDivElement, AccordionProps>(function Accordion(
  { exclusive, name, size, material, level, className, children, ...rest }, ref,
) {
  const generated = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  return (
    <div ref={ref} className={classes("ug-accordion", className)} {...strataAttributes({ size, material, level })} {...rest}>
      <AccordionContext.Provider value={{ name: name ?? (exclusive ? `accordion-${generated}` : undefined) }}>{children}</AccordionContext.Provider>
    </div>
  );
});

export interface AccordionItemProps extends Omit<DetailsHTMLAttributes<HTMLElement>, "title" | "open">, StrataProps {
  /** The header's text. */
  title: ReactNode;
  /** Controlled open state; pair it with `onOpenChange`. */
  open?: boolean;
  /** Initial open state when uncontrolled. */
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  children?: ReactNode;
}

export const AccordionItem = forwardRef<HTMLDetailsElement, AccordionItemProps>(function AccordionItem(
  { title, open, defaultOpen, onOpenChange, onToggle, size, material, level, className, children, ...rest }, ref,
) {
  const { name } = useContext(AccordionContext);
  // Uncontrolled: the first value only, so React never sets `open` again after the user toggles.
  const [initial] = useState(defaultOpen);
  return (
    <details ref={ref} className={classes("ug-accordion__item", className)} data-strata-face="raised" name={name} open={open ?? initial}
      onToggle={event => { onToggle?.(event); onOpenChange?.((event.currentTarget as HTMLDetailsElement).open); }}
      {...strataAttributes({ size, material, level })} {...rest}>
      <summary className="ug-accordion__header">
        <span className="ug-accordion__title">{title}</span>
        <span className="ug-accordion__chevron" aria-hidden="true" />
      </summary>
      <div className="ug-accordion__body">{children}</div>
    </details>
  );
});
