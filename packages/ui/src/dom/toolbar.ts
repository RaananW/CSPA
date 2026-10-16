/**
 * Toolbar (anatomy page `toolbar.md`), the WAI-ARIA Toolbar pattern: one tab stop for a set of controls (a roving
 * tabindex, applied the first time focus enters), and the control the arrow keys, Home and End move to. `attachStrata`
 * uses both for plain HTML and Astro; the React and Vue bindings call them from their focus and key handlers.
 */

/** The controls of a toolbar that focus can move to: its own (not a nested toolbar's), not disabled, not hidden. */
function controlsOf(toolbar: Element): HTMLElement[] {
  return [...toolbar.querySelectorAll<HTMLElement>("button, a[href], input, select, textarea, [tabindex]")].filter(control =>
    control.closest("[role='toolbar']") === toolbar && !(control as HTMLButtonElement).disabled && !control.closest("[hidden]") && control !== toolbar);
}

/** Makes `current` the toolbar's one tab stop: `tabindex="0"` on it, and `-1` on every other control. */
export function rovingStrataToolbar(toolbar: Element, current: Element): void {
  for (const control of controlsOf(toolbar)) control.setAttribute("tabindex", control === current ? "0" : "-1");
}

/**
 * The control that `key` moves focus to from `from`, or undefined when the key is not a toolbar key (or belongs to a
 * text field, where the arrows move the caret). The arrows along the toolbar's orientation move to the next or
 * previous control, wrapping, reversed in right-to-left text when horizontal; Home and End move to the first and last.
 */
export function strataToolbarTarget(from: Element, key: string): HTMLElement | undefined {
  const toolbar = from.closest("[role='toolbar']");
  if (!toolbar || from.matches("input:not([type='checkbox'], [type='radio'], [type='button']), textarea, select")) return undefined;
  const vertical = toolbar.getAttribute("aria-orientation") === "vertical";
  const rtl = !vertical && getComputedStyle(toolbar).direction === "rtl";
  const next = vertical ? "ArrowDown" : rtl ? "ArrowLeft" : "ArrowRight";
  const previous = vertical ? "ArrowUp" : rtl ? "ArrowRight" : "ArrowLeft";
  const controls = controlsOf(toolbar);
  if (!controls.length || ![next, previous, "Home", "End"].includes(key)) return undefined;
  if (key === "Home") return controls[0];
  if (key === "End") return controls[controls.length - 1];
  const at = controls.indexOf(from.closest<HTMLElement>("button, a[href], input, select, textarea, [tabindex]") ?? (from as HTMLElement));
  return controls[(at + (key === next ? 1 : -1) + controls.length) % controls.length];
}
