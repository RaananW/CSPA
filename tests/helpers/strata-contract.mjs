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
    "select.md", "slider.md", "button-group.md", "divider.md", "badge.md", "spinner.md", "progress-bar.md", "card.md", "panel.md"];
  const map = Object.fromEntries(names.map(name => [name, examples(name)[0]]));
  map["text-field.md#2"] = examples("text-field.md")[1];
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

/** Compares every `[data-contract]` container on the page with its markup example. */
export async function expectContracts(page, expect) {
  for (const [name, html] of Object.entries(contracts())) {
    const [rendered, expected] = await page.evaluate(([n, h]) => {
      // Parsed into a live container, so a select's value reflects its markup as it would on a page.
      const host = document.createElement("div");
      host.hidden = true;
      host.innerHTML = h;
      document.body.append(host);
      const expected = window.canonical(host);
      host.remove();
      return [window.canonical(document.querySelector(`[data-contract="${n}"]`)), expected];
    }, [name, html]);
    expect(rendered, `${name} matches its markup contract`).toEqual(expected);
  }
}
