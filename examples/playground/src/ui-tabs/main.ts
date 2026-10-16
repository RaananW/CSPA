/**
 * Strata tabs check page (`ui-tabs.html`): plain markup from the Tabs anatomy page, plus a vertical tablist with
 * manual activation and a right-to-left one, wired by `attachStrata` with no framework. `window.tabsCheck` records
 * each `strata-tab-change` event (the tab's and the panel's ids) for `tests/browser/ui-tabs.test.mjs`.
 */
import "@underglass/ui/css";
import { attachStrata, type TabChange } from "@underglass/ui/dom";

declare global { interface Window { tabsCheck: { changes: string[] } } }

attachStrata();
const check = { changes: [] as string[] };
window.tabsCheck = check;
document.addEventListener("strata-tab-change", event => {
  const { tab, panel } = (event as CustomEvent<TabChange>).detail;
  check.changes.push(`${tab.id}>${panel?.id ?? ""}`);
});
