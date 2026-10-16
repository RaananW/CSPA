/**
 * Plain-DOM behaviour for Strata markup rendered without a framework binding (plain HTML, Astro, server templates),
 * where native elements need help (design language section 18). One delegated listener per root:
 * - a `.ug-toggle-button` or a filter chip (`.ug-chip[aria-pressed]`) toggles `aria-pressed` on click (and Enter or Space, which click a button natively), and
 *   dispatches a bubbling `strata-pressed-change` event with `{ pressed }`;
 * - a click on a Strata button with `aria-disabled="true"` is stopped before any other listener sees it, so the
 *   control stays focusable without activating;
 * - a checkbox with `data-strata-indeterminate` gets the `indeterminate` property, which has no attribute;
 * - a click on `[data-strata-open="id"]` shows the Dialog or Drawer with that id (`showStrataDialog`), and a click on a
 *   `[data-strata-close]` inside an open one closes it;
 * - a click on a chip's remove button dispatches a bubbling `strata-remove` event from the chip;
 * - Tabs: a click on a tab selects it, and the arrow keys, Home and End move between tabs and select them (only move,
 *   with `data-strata-activation="manual"` on the tablist, until Enter or Space clicks the tab).
 * The React and Vue bindings do the same themselves, so they need none of this.
 */
import { showStrataDialog, type DialogHandle } from "./dialog.ts";
import { selectStrataTab, strataTabsActivation, strataTabTarget } from "./tabs.ts";

const attached = new WeakMap<Document | HTMLElement, () => void>();

/** The detail of a `strata-pressed-change` event. */
export interface PressedChange {
  pressed: boolean;
}

/** The plain-markup dialogs this module has opened, by panel. */
const opened = new WeakMap<HTMLElement, DialogHandle>();

const buttons = ".ug-button, .ug-icon-button, .ug-toggle-button, .ug-chip";
const toggles = ".ug-toggle-button, .ug-chip[aria-pressed]";

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
    const button = (event.target as Element | null)?.closest?.(toggles);
    if (!button || event.defaultPrevented || button.getAttribute("aria-disabled") === "true" || (button as HTMLButtonElement).disabled) return;
    const pressed = button.getAttribute("aria-pressed") !== "true";
    button.setAttribute("aria-pressed", String(pressed));
    button.dispatchEvent(new CustomEvent<PressedChange>("strata-pressed-change", { bubbles: true, detail: { pressed } }));
  };
  const open = (event: Event) => {
    const opener = (event.target as Element | null)?.closest?.("[data-strata-open]");
    const panel = opener && document.getElementById(opener.getAttribute("data-strata-open") ?? "");
    if (!panel || event.defaultPrevented || opener.getAttribute("aria-disabled") === "true" || (opener as HTMLButtonElement).disabled) return;
    opened.set(panel, showStrataDialog(panel, { onClose: () => void opened.get(panel)?.close(), closeOnScrim: panel.hasAttribute("data-strata-close-on-scrim") }));
  };
  const close = (event: Event) => {
    const closer = (event.target as Element | null)?.closest?.("[data-strata-close]");
    const panel = closer?.closest<HTMLElement>(".ug-dialog, .ug-drawer");
    if (panel && !panel.hidden) void opened.get(panel)?.close();
  };
  const remove = (event: Event) => {
    const button = (event.target as Element | null)?.closest?.(".ug-chip__remove");
    const chip = button?.closest(".ug-chip");
    if (chip && !event.defaultPrevented && !(button as HTMLButtonElement).disabled) chip.dispatchEvent(new CustomEvent("strata-remove", { bubbles: true }));
  };
  const tab = (event: Event) => {
    const target = (event.target as Element | null)?.closest?.<HTMLElement>(".ug-tabs__list [role='tab']");
    if (target && !event.defaultPrevented && !(target as HTMLButtonElement).disabled) selectStrataTab(target);
  };
  const tabKey = (event: KeyboardEvent) => {
    const from = (event.target as Element | null)?.closest?.(".ug-tabs__list [role='tab']");
    const target = from && !event.defaultPrevented && !event.altKey && !event.ctrlKey && !event.metaKey ? strataTabTarget(from, event.key) : undefined;
    if (!target) return;
    event.preventDefault();
    target.focus();
    if (strataTabsActivation(target.closest("[role='tablist']")!) === "automatic") selectStrataTab(target);
  };
  root.addEventListener("click", block, true);
  root.addEventListener("click", tab);
  root.addEventListener("click", remove);
  root.addEventListener("keydown", tabKey as EventListener);
  root.addEventListener("click", open);
  root.addEventListener("click", close);
  root.addEventListener("click", toggle);
  const detach = () => {
    root.removeEventListener("click", block, true);
    root.removeEventListener("click", toggle);
    root.removeEventListener("click", open);
    root.removeEventListener("click", close);
    root.removeEventListener("click", tab);
    root.removeEventListener("click", remove);
    root.removeEventListener("keydown", tabKey as EventListener);
    attached.delete(root);
  };
  attached.set(root, detach);
  return detach;
}
