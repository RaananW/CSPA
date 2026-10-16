/**
 * Modal behaviour for Dialog and Drawer (anatomy pages `dialog.md`, `drawer.md`), following the WAI-ARIA modal dialog
 * pattern. The panel is a Strata panel, not a `<dialog>`: this module makes it modal. While a panel is shown the rest
 * of the page is inert, so Tab stays inside and the background takes no pointer or assistive-technology input; focus
 * moves in and returns to the opener; Escape asks to close. Nested dialogs form a stack, and only the top one answers.
 * The React, Vue and Astro layers call this, so the behaviour is one implementation.
 */
import { strataEnter, strataLeave } from "./motion.ts";

/** Why a dialog asked to close. */
export type DialogCloseReason = "escape" | "scrim" | "close";

export interface DialogOptions {
  /**
   * Called when the user asks to close: Escape, a click on the scrim (only with `closeOnScrim`), or a close control.
   * The caller then decides, usually by calling `close()` on the returned handle. Without it, the dialog closes itself.
   */
  onClose?(reason: DialogCloseReason): void;
  /** The element that takes focus when the dialog opens; the first `[autofocus]`, then the first tabbable, by default. */
  initialFocus?: HTMLElement;
  /** The element that takes focus when the dialog closes; the previously focused element by default. */
  returnFocus?: HTMLElement;
  /** Whether a click on the scrim asks to close; false by default, as for a native `<dialog>`. */
  closeOnScrim?: boolean;
}

export interface DialogHandle {
  /** Takes the panel out through depth, hides it and its scrim, restores the page and returns focus. Resolves when done. */
  close(): Promise<void>;
}

/** One shown panel: what to undo when it closes. */
interface Layer {
  panel: HTMLElement;
  scrim: HTMLElement | null;
  options: DialogOptions;
  opener: HTMLElement | null;
  /** The panel's own `inert` before it was shown, restored once it has left. */
  panelInert: boolean;
  /** Each element made inert and its own `inert` value before, restored exactly when the layer closes. */
  inerted: Map<HTMLElement, boolean>;
  closing: boolean;
  /** Resolves when the enter motion and the initial focus are done. */
  entered: Promise<void>;
  /** Resolves when the layer has closed and the page is restored. */
  closed: Promise<void>;
  handle: DialogHandle;
  onScrim?: () => void;
}

/** Shown layers, bottom first. Escape belongs to the last one that is not closing. */
const stack: Layer[] = [];
const byPanel = new WeakMap<HTMLElement, Layer>();

const tabbable = [
  "a[href]", "area[href]", "button", "input:not([type=hidden])", "select", "textarea", "summary", "iframe",
  "[contenteditable]:not([contenteditable=false])", "[tabindex]",
].map(selector => `${selector}:not([disabled]):not([tabindex^="-"])`).join(",");

/** The first element inside `panel` that can take focus with Tab and is rendered. */
function firstTabbable(panel: HTMLElement): HTMLElement | null {
  for (const element of panel.querySelectorAll<HTMLElement>(tabbable)) {
    if (!element.closest("[inert]") && element.checkVisibility()) return element;
  }
  return null;
}

/** The scrim rendered immediately before `panel`, if any. */
function scrimOf(panel: HTMLElement): HTMLElement | null {
  const previous = panel.previousElementSibling;
  return previous instanceof HTMLElement && previous.classList.contains("ug-scrim") ? previous : null;
}

/**
 * Makes every sibling of `panel` and of its ancestors, up to `<body>`, inert except the panel and its scrim. Hidden
 * siblings, such as other closed dialogs, are left alone: they take no input, and a panel must not start out inert.
 */
function inertBackground(layer: Layer) {
  for (let node: HTMLElement = layer.panel; node !== document.body && node.parentElement; node = node.parentElement) {
    for (const sibling of node.parentElement.children) {
      if (!(sibling instanceof HTMLElement) || sibling === node || sibling === layer.scrim || sibling.hidden) continue;
      layer.inerted.set(sibling, sibling.inert);
      sibling.inert = true;
    }
  }
}

/** The layer that answers keys now: the last one that is not leaving. */
const top = () => [...stack].reverse().find(layer => !layer.closing);

/** Reports a close request to the caller; without a handler the dialog closes itself. */
function request(layer: Layer, reason: DialogCloseReason) {
  if (layer.closing) return;
  if (layer.options.onClose) layer.options.onClose(reason);
  else void layer.handle.close();
}

function onKeydown(event: KeyboardEvent) {
  if (event.key !== "Escape" || event.isComposing) return;
  const layer = top();
  if (!layer) return;
  event.preventDefault();
  event.stopPropagation();
  request(layer, "escape");
}

/** Takes `layer` off the page: leave, hide, restore the page, return focus. */
async function finish(layer: Layer) {
  await layer.entered;
  layer.scrim?.setAttribute("data-strata-closing", "");
  await strataLeave(layer.panel);
  layer.panel.hidden = true;
  // The leave motion keeps its final state until the panel is hidden; a hidden panel carries none.
  delete layer.panel.dataset.strataMotion;
  layer.panel.inert = layer.panelInert;
  if (layer.scrim) {
    layer.scrim.hidden = true;
    layer.scrim.removeAttribute("data-strata-closing");
    if (layer.onScrim) layer.scrim.removeEventListener("click", layer.onScrim);
  }
  const index = stack.indexOf(layer);
  const above = stack.slice(index + 1)[0];
  stack.splice(index, 1);
  if (above) {
    // Closed under a newer layer: the newer one saw this layer's inert state as the page's, so what it restores
    // becomes what this layer saved, and what only this layer touched is restored now.
    for (const [element, value] of layer.inerted) {
      if (above.inerted.has(element)) above.inerted.set(element, value);
      else if (element !== above.panel) element.inert = value;
    }
  } else {
    for (const [element, value] of layer.inerted) element.inert = value;
  }
  if (byPanel.get(layer.panel) === layer) byPanel.delete(layer.panel);
  if (!stack.length) document.removeEventListener("keydown", onKeydown, true);
  const target = layer.options.returnFocus ?? layer.opener;
  if (!above && target?.isConnected) target.focus();
}

/**
 * Shows `panel` (and its scrim, the `.ug-scrim` just before it) as a modal dialog: removes `hidden`, makes the
 * background inert, plays the enter motion and moves focus in. Returns a handle to close it. Showing a panel that is
 * already shown returns the handle it has.
 */
export function showStrataDialog(panel: HTMLElement, options: DialogOptions = {}): DialogHandle {
  const existing = byPanel.get(panel);
  if (existing && !existing.closing) return existing.handle;
  // A panel shown again while it is still leaving starts once it has left.
  const previous = existing?.closed;
  const scrim = scrimOf(panel);
  let resolveClosed!: () => void;
  let started = false;
  let closing: Promise<void> | undefined;
  const layer: Layer = {
    panel, scrim, options, opener: null, panelInert: panel.inert, inerted: new Map(), closing: false,
    entered: Promise.resolve(),
    closed: new Promise<void>(resolve => { resolveClosed = resolve; }),
    handle: {
      close() {
        if (closing) return closing;
        layer.closing = true;
        closing = (async () => {
          await previous;
          if (started) await finish(layer);
          resolveClosed();
        })();
        return closing;
      },
    },
  };
  const start = async () => {
    if (layer.closing) return;
    started = true;
    const active = document.activeElement;
    layer.opener = active instanceof HTMLElement && active !== document.body && !panel.contains(active) ? active : null;
    stack.push(layer);
    if (stack.length === 1) document.addEventListener("keydown", onKeydown, true);
    panel.hidden = false;
    if (scrim) {
      scrim.hidden = false;
      layer.onScrim = () => { if (layer.options.closeOnScrim) request(layer, "scrim"); };
      scrim.addEventListener("click", layer.onScrim);
    }
    inertBackground(layer);
    // The panel is inert while it enters, so focus moves in afterwards.
    await strataEnter(panel);
    if (layer.closing) return;
    (options.initialFocus ?? panel.querySelector<HTMLElement>("[autofocus]") ?? firstTabbable(panel) ?? panel).focus();
  };
  byPanel.set(panel, layer);
  layer.entered = previous ? previous.then(start) : start();
  return layer.handle;
}
