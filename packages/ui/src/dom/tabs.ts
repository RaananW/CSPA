/**
 * Tabs (anatomy page `tabs.md`), the WAI-ARIA Tabs pattern: which tab a key moves to, and selecting a tab in plain
 * markup. `attachStrata` uses both for plain HTML and Astro; the React and Vue bindings use `strataTabTarget` and hold
 * the selection themselves.
 */

/** Tab activation: `automatic` selects the tab focus moves to; `manual` waits for Enter or Space. */
export type TabsActivation = "automatic" | "manual";

/** The detail of a `strata-tab-change` event, dispatched from the newly selected tab. */
export interface TabChange {
  tab: HTMLElement;
  panel: HTMLElement | null;
}

/** The tabs of a tablist that are its own (not a nested tablist's). */
function tabsOf(list: Element): HTMLElement[] {
  return [...list.querySelectorAll<HTMLElement>("[role='tab']")].filter(tab => tab.closest("[role='tablist']") === list);
}

/** The tablist's activation, from `data-strata-activation`. */
export function strataTabsActivation(list: Element): TabsActivation {
  return list.getAttribute("data-strata-activation") === "manual" ? "manual" : "automatic";
}

/**
 * The enabled tab that `key` moves focus to from `tab`, or undefined when the key is not a tab key. The arrows along
 * the tablist's orientation move to the next or previous tab, wrapping (reversed in right-to-left text when
 * horizontal); Home and End move to the first and last. Disabled tabs are skipped.
 */
export function strataTabTarget(tab: Element, key: string): HTMLElement | undefined {
  const list = tab.closest("[role='tablist']");
  if (!list) return undefined;
  const vertical = list.getAttribute("aria-orientation") === "vertical";
  const rtl = !vertical && getComputedStyle(list).direction === "rtl";
  const next = vertical ? "ArrowDown" : rtl ? "ArrowLeft" : "ArrowRight";
  const previous = vertical ? "ArrowUp" : rtl ? "ArrowRight" : "ArrowLeft";
  if (![next, previous, "Home", "End"].includes(key)) return undefined;
  const enabled = tabsOf(list).filter(candidate => !(candidate as HTMLButtonElement).disabled && candidate.getAttribute("aria-disabled") !== "true");
  if (!enabled.length) return undefined;
  if (key === "Home") return enabled[0];
  if (key === "End") return enabled[enabled.length - 1];
  const all = tabsOf(list), from = all.indexOf(tab as HTMLElement);
  const step = key === next ? 1 : -1;
  for (let offset = 1; offset <= all.length; offset++) {
    const candidate = all[(from + step * offset + all.length * offset) % all.length]!;
    if (enabled.includes(candidate)) return candidate;
  }
  return undefined;
}

/**
 * Selects `tab` in plain markup: it becomes the selected tab and the only one in the tab order, its panel (from
 * `aria-controls`) is shown and the others hidden, and a bubbling `strata-tab-change` event is dispatched from it.
 * Selecting the selected tab again changes nothing and dispatches nothing.
 */
export function selectStrataTab(tab: HTMLElement): void {
  const list = tab.closest("[role='tablist']");
  if (!list || tab.getAttribute("aria-selected") === "true") return;
  const panelOf = (candidate: Element) => document.getElementById(candidate.getAttribute("aria-controls") ?? "");
  for (const candidate of tabsOf(list)) {
    const selected = candidate === tab;
    candidate.setAttribute("aria-selected", String(selected));
    if (selected) candidate.removeAttribute("tabindex");
    else candidate.setAttribute("tabindex", "-1");
    const panel = panelOf(candidate);
    if (panel) panel.hidden = !selected;
  }
  tab.dispatchEvent(new CustomEvent<TabChange>("strata-tab-change", { bubbles: true, detail: { tab, panel: panelOf(tab) } }));
}
