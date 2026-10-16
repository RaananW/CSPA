/**
 * The Strata markup contract check shared by every binding test: each anatomy page's markup example
 * (`docs/ui-library/components/*.md`), and a page-side canonical form of DOM to compare a binding's output with it.
 * Install `canonicalScript` with `page.addInitScript`, render each example inside `[data-contract="<name>"]`, then call
 * `expectContracts(page, expect)`.
 */
import { readFileSync } from "node:fs";

const examples = name => [...readFileSync(new URL(`../../docs/ui-library/components/${name}`, import.meta.url), "utf8").matchAll(/```html\n([\s\S]*?)```/g)].map(match => match[1]);

/** Every markup example by contract name (`text-field.md#2` is a page's second example). */
export function contracts() {
  const names = ["button.md", "icon-button.md", "toggle-button.md", "link.md", "field.md", "text-field.md", "text-area.md", "checkbox.md", "radio.md", "switch.md",
    "select.md", "slider.md", "button-group.md", "divider.md", "badge.md", "spinner.md", "progress-bar.md", "card.md", "panel.md", "dialog.md", "drawer.md", "tabs.md", "accordion.md", "list.md", "table.md"];
  const map = Object.fromEntries(names.map(name => [name, examples(name)[0]]));
  map["text-field.md#2"] = examples("text-field.md")[1];
  // A Dialog and a Drawer are shown open (React, Vue) and closed with `hidden` (plain HTML, Astro): the second example.
  map["dialog.md#2"] = examples("dialog.md")[1];
  map["drawer.md#2"] = examples("drawer.md")[1];
  // A Table that does not sort: what Astro renders, with no sort buttons.
  map["table.md#2"] = examples("table.md")[1];
  return map;
}

/**
 * Page-side canonical DOM: tag, sorted attributes (class as a sorted set), and children with whitespace-collapsed text.
 * Scripts are not markup and are skipped. React and Vue set an option's selection as a property, not the `selected`
 * attribute, so selects compare their value instead.
 */
export const canonicalScript = () => {
  window.canonical = root => {
    const walk = node => {
      if (node.nodeType === Node.TEXT_NODE) { const text = node.textContent.replace(/\s+/g, " ").trim(); return text || null; }
      if (node.nodeType !== Node.ELEMENT_NODE || node.localName === "script") return null;
      const attrs = [...node.attributes].filter(({ name }) => name !== "selected").map(({ name, value }) => `${name}=${name === "class" ? value.split(/\s+/).filter(Boolean).sort().join(" ") : value}`).sort();
      const children = [];
      let text = "";
      for (const child of node.childNodes) {
        const value = walk(child);
        if (value === null) continue;
        if (typeof value === "string") { text = text ? `${text} ${value}` : value; continue; }
        if (text) { children.push(text); text = ""; }
        children.push(value);
      }
      if (text) children.push(text);
      return { tag: node.localName, attrs, children, ...(node.localName === "select" ? { value: node.value } : {}) };
    };
    return [...root.childNodes].map(walk).filter(Boolean);
  };
};

/** The open Dialog and Drawer examples, which a binding renders on demand (it makes the page behind them inert). */
const open = ["dialog.md", "drawer.md"];
const closed = ["dialog.md#2", "drawer.md#2"];
/** The contracts every binding's page renders as a matter of course, which `expectContracts` checks by default. */
export const overlayContracts = [...open, ...closed];

/**
 * Compares every `[data-contract]` container on the page with its markup example. `only` limits it to some contracts;
 * by default the open Dialog and Drawer examples are left to `expectOpenOverlayContracts` and the closed ones to Astro.
 */
export async function expectContracts(page, expect, { only, skip = [...open, ...closed] } = {}) {
  for (const [name, html] of Object.entries(contracts())) {
    if (only ? !only.includes(name) : skip.includes(name)) continue;
    const [rendered, expected] = await page.evaluate(([n, h]) => {
      // Parsed into a document of its own, where a select's value reflects its markup as it would on a page, and the
      // example's `<details name>` group does not meet the page's (which would close its open section natively).
      const host = document.implementation.createHTMLDocument("").body;
      host.innerHTML = h;
      return [window.canonical(document.querySelector(`[data-contract="${n}"]`)), window.canonical(host)];
    }, [name, html]);
    expect(rendered, `${name} matches its markup contract`).toEqual(expected);
  }
}

/** Plain HTML and Astro render the Dialog and Drawer closed, with `hidden`. */
export const expectClosedOverlayContracts = (page, expect) => expectContracts(page, expect, { only: closed });

/**
 * React and Vue render a Dialog and a Drawer only while open, into `[data-contract]` containers: the page opens them
 * (`window.strataOverlays(true)`), the markup is compared once their enter motion has ended, and they close again.
 */
export async function expectOpenOverlayContracts(page, expect) {
  await page.evaluate(() => window.strataOverlays(true));
  await page.waitForFunction(() => document.querySelector('[data-contract="dialog.md"] .ug-dialog') && document.querySelector('[data-contract="drawer.md"] .ug-drawer') && !document.querySelector("[data-strata-motion]"));
  await expectContracts(page, expect, { only: open });
  await page.evaluate(() => window.strataOverlays(false));
  await page.waitForFunction(() => !document.querySelector(".ug-dialog, .ug-drawer, .ug-scrim, [inert]"));
}
