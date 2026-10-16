/**
 * Toast (anatomy page `toast.md`): brief messages in one region at the end of `<body>`, a `popover` in the top layer
 * outside every Underglass layer. The region holds a persistent `role="status"` list, so each new toast is announced
 * politely. A toast is a MessageBar at `elevation.overlay`; it goes after its duration, and the time stops while the
 * pointer or focus is in the region (WCAG 2.2.1).
 */
import type { MessageIntent } from "../shared/message.ts";

export interface ToastOptions {
  message: string;
  title?: string;
  /** `info` by default. */
  intent?: MessageIntent;
  /** One action; pressing it also dismisses the toast. */
  action?: { label: string; onAction: () => void };
  /** How long it stays, in ms; 5000 by default, `Infinity` until dismissed. */
  duration?: number;
  dismissLabel?: string;
}

export interface ToastHandle {
  dismiss(): void;
}

const visible = 3;
interface Live { element: HTMLElement; remaining: number; started: number; timer?: ReturnType<typeof setTimeout> }
const live: Live[] = [];
let paused = false;

/** The region, created on first use. */
function region(): HTMLElement {
  let section = document.querySelector<HTMLElement>("body > .ug-toast-region");
  if (section) return section;
  section = document.createElement("section");
  section.className = "ug-toast-region";
  section.setAttribute("aria-label", "Notifications");
  section.setAttribute("popover", "manual");
  const list = document.createElement("div");
  list.className = "ug-toast-region__list";
  list.setAttribute("role", "status");
  section.append(list);
  document.body.append(section);
  // The time stops while the pointer or focus is in the region.
  const pause = () => { if (paused) return; paused = true; for (const toast of live) { clearTimeout(toast.timer); toast.remaining -= performance.now() - toast.started; } };
  const resume = () => {
    if (!paused || section!.matches(":hover") || section!.contains(document.activeElement)) return;
    paused = false;
    for (const toast of live) schedule(toast);
  };
  section.addEventListener("pointerenter", pause);
  section.addEventListener("focusin", pause);
  section.addEventListener("pointerleave", () => setTimeout(resume));
  section.addEventListener("focusout", () => setTimeout(resume));
  return section;
}

function schedule(toast: Live) {
  clearTimeout(toast.timer);
  toast.started = performance.now();
  if (Number.isFinite(toast.remaining) && !paused) toast.timer = setTimeout(() => remove(toast), Math.max(0, toast.remaining));
}

function remove(toast: Live) {
  const index = live.indexOf(toast);
  if (index < 0) return;
  live.splice(index, 1);
  clearTimeout(toast.timer);
  toast.element.remove();
  const section = document.querySelector<HTMLElement>("body > .ug-toast-region");
  if (section && !live.length) {
    paused = false;
    if (section.matches(":popover-open")) section.hidePopover();
  }
}

/** Shows a toast and returns a handle that dismisses it. */
export function showStrataToast(options: ToastOptions): ToastHandle {
  const section = region(), list = section.querySelector(".ug-toast-region__list")!;
  const intent = options.intent ?? "info";
  const element = document.createElement("div");
  element.className = `ug-message-bar ug-message-bar--${intent} ug-toast`;
  element.setAttribute("data-strata-face", "raised");
  const icon = document.createElement("span");
  icon.className = "ug-message-bar__icon";
  icon.setAttribute("aria-hidden", "true");
  const content = document.createElement("div");
  content.className = "ug-message-bar__content";
  if (options.title) {
    const title = document.createElement("p");
    title.className = "ug-message-bar__title";
    title.textContent = options.title;
    content.append(title);
  }
  const body = document.createElement("p");
  body.className = "ug-message-bar__body";
  body.textContent = options.message;
  content.append(body);
  element.append(icon, content);
  const toast: Live = { element, remaining: options.duration ?? 5000, started: performance.now() };
  if (options.action) {
    const actions = document.createElement("div");
    actions.className = "ug-message-bar__actions";
    const button = document.createElement("button");
    button.className = "ug-button";
    button.setAttribute("data-strata-face", "raised");
    button.type = "button";
    const label = document.createElement("span");
    label.className = "ug-button__label";
    label.textContent = options.action.label;
    button.append(label);
    const { onAction } = options.action;
    button.addEventListener("click", () => { onAction(); remove(toast); });
    actions.append(button);
    element.append(actions);
  }
  const dismiss = document.createElement("button");
  dismiss.className = "ug-message-bar__dismiss";
  dismiss.type = "button";
  dismiss.setAttribute("aria-label", options.dismissLabel ?? "Dismiss");
  dismiss.addEventListener("click", () => remove(toast));
  element.append(dismiss);
  list.append(element);
  live.push(toast);
  while (live.length > visible) remove(live[0]!);
  if (!section.matches(":popover-open")) section.showPopover();
  schedule(toast);
  return { dismiss: () => remove(toast) };
}
