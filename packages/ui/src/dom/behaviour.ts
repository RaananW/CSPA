/**
 * Plain-DOM behaviour for Strata markup rendered without a framework binding (plain HTML, Astro, server templates),
 * where native elements need help (design language section 18). One delegated listener per root:
 * - a `.ug-toggle-button` toggles `aria-pressed` on click (and Enter or Space, which click a button natively), and
 *   dispatches a bubbling `strata-pressed-change` event with `{ pressed }`;
 * - a click on a Strata button with `aria-disabled="true"` is stopped before any other listener sees it, so the
 *   control stays focusable without activating;
 * - a checkbox with `data-strata-indeterminate` gets the `indeterminate` property, which has no attribute.
 * The React and Vue bindings do the same themselves, so they need none of this.
 */

const attached = new WeakMap<Document | HTMLElement, () => void>();

/** The detail of a `strata-pressed-change` event. */
export interface PressedChange {
  pressed: boolean;
}

const buttons = ".ug-button, .ug-icon-button, .ug-toggle-button";

/** Sets `indeterminate` on every marked checkbox inside `root` (including ones added later, on the next call). */
function applyIndeterminate(root: Document | HTMLElement) {
  for (const input of root.querySelectorAll<HTMLInputElement>("input[type=checkbox][data-strata-indeterminate]")) {
    input.indeterminate = true;
    // The mark is a one-time initial state: a click clears it natively, and it must not come back.
    input.removeAttribute("data-strata-indeterminate");
  }
}

/**
 * Attaches the behaviour to `root` (the document by default) and returns a function that detaches it. Calling it
 * again for the same root re-applies the initial states and keeps one listener.
 */
export function attachStrata(root: Document | HTMLElement = document): () => void {
  applyIndeterminate(root);
  const existing = attached.get(root);
  if (existing) return existing;
  const block = (event: Event) => {
    const button = (event.target as Element | null)?.closest?.(buttons);
    if (button && button.getAttribute("aria-disabled") === "true") { event.preventDefault(); event.stopImmediatePropagation(); }
  };
  const toggle = (event: Event) => {
    const button = (event.target as Element | null)?.closest?.(".ug-toggle-button");
    if (!button || event.defaultPrevented || button.getAttribute("aria-disabled") === "true" || (button as HTMLButtonElement).disabled) return;
    const pressed = button.getAttribute("aria-pressed") !== "true";
    button.setAttribute("aria-pressed", String(pressed));
    button.dispatchEvent(new CustomEvent<PressedChange>("strata-pressed-change", { bubbles: true, detail: { pressed } }));
  };
  root.addEventListener("click", block, true);
  root.addEventListener("click", toggle);
  const detach = () => {
    root.removeEventListener("click", block, true);
    root.removeEventListener("click", toggle);
    attached.delete(root);
  };
  attached.set(root, detach);
  return detach;
}
