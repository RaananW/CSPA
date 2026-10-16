/**
 * Browser test of the first Tier A batch of `@underglass/ui/react` (page `ui-react.html`, plain React, no
 * Underglass):
 * - each component renders exactly the markup example on its anatomy page (`docs/ui-library/components`), compared
 *   as canonical DOM (tags, attributes, class sets and text);
 * - real pointer and keyboard input: Button, aria-disabled, disabled and busy, IconButton, uncontrolled and
 *   controlled ToggleButton, Link, Field with label, help, error and required, TextField with and without an icon;
 * - refs reach the native element, and className, style and other attributes pass through;
 * - StrataProvider applies a theme and StrataScope a scope;
 * - axe finds no violations in the light and dark themes.
 */
import { test, expect } from "../helpers/current-browser.mjs";
import AxeBuilder from "@axe-core/playwright";
import { readFileSync } from "node:fs";

const page_ = name => readFileSync(new URL(`../../docs/ui-library/components/${name}`, import.meta.url), "utf8");
const snippets = name => [...page_(name).matchAll(/```html\n([\s\S]*?)```/g)].map(match => match[1]);
const tags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

/** Canonical DOM: tag, sorted attributes (class as a sorted set), and children with whitespace-collapsed text. */
const canonical = () => {
  window.canonical = root => {
    const walk = node => {
      if (node.nodeType === Node.TEXT_NODE) { const text = node.textContent.replace(/\s+/g, " ").trim(); return text || null; }
      if (node.nodeType !== Node.ELEMENT_NODE) return null;
      const attrs = [...node.attributes].map(({ name, value }) => `${name}=${name === "class" ? value.split(/\s+/).filter(Boolean).sort().join(" ") : value}`).sort();
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
      return { tag: node.localName, attrs, children };
    };
    return [...root.childNodes].map(walk).filter(Boolean);
  };
};

test("Strata React components render their anatomy markup and behave natively", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await page.addInitScript(canonical);
  await page.goto("/ui-react.html");
  await page.waitForFunction(() => window.strataReact);
  const state = () => page.evaluate(() => ({ clicks: window.strataReact.clicks, italic: window.strataReact.italic, email: window.strataReact.email }));

  // Markup contracts.
  const contracts = { "button.md": snippets("button.md")[0], "icon-button.md": snippets("icon-button.md")[0], "toggle-button.md": snippets("toggle-button.md")[0], "link.md": snippets("link.md")[0], "field.md": snippets("field.md")[0], "text-field.md": snippets("text-field.md")[0], "text-field.md#2": snippets("text-field.md")[1] };
  for (const [name, html] of Object.entries(contracts)) {
    const [rendered, expected] = await page.evaluate(([n, h]) => {
      const template = document.createElement("template");
      template.innerHTML = h;
      return [window.canonical(document.querySelector(`[data-contract="${n}"]`)), window.canonical(template.content)];
    }, [name, html]);
    expect(rendered, `${name} matches its markup contract`).toEqual(expected);
  }

  // Button: pointer and keyboard activate once each; type="button" never submits the form.
  const save = page.locator("#save");
  await save.click();
  await save.focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Space");
  expect((await state()).clicks).toMatchObject({ save: 3, submit: 0 });
  // aria-disabled stays focusable but does not activate; disabled is native.
  const blocked = page.locator("#blocked");
  await blocked.click({ force: true });
  await blocked.focus();
  await expect(blocked).toBeFocused();
  await page.keyboard.press("Enter");
  await page.locator("#disabled").click({ force: true });
  expect((await state()).clicks).toMatchObject({ blocked: 0, disabled: 0 });
  await expect(page.locator("#busy")).toHaveAttribute("aria-busy", "true");
  // IconButton: named by its label.
  await page.getByRole("button", { name: "Close" }).click();
  expect((await state()).clicks.close).toBe(1);
  // ToggleButton: uncontrolled and controlled, by pointer and Space.
  const bold = page.locator("#bold"), italic = page.locator("#italic");
  await bold.click();
  await expect(bold).toHaveAttribute("aria-pressed", "true");
  await bold.focus();
  await page.keyboard.press("Space");
  await expect(bold).toHaveAttribute("aria-pressed", "false");
  await expect(italic).toHaveAttribute("aria-pressed", "true");
  await italic.click();
  await expect(italic).toHaveAttribute("aria-pressed", "false");
  expect((await state()).italic).toBe(false);
  // Strata props become attributes; ref, className, style and other attributes pass through.
  await expect(page.locator("#large")).toHaveAttribute("data-strata-size", "large");
  await expect(page.locator("#large")).toHaveAttribute("data-strata-material", "lacquer");
  expect(await page.evaluate(() => {
    const element = document.getElementById("save");
    return { ref: window.strataReact.refs.button === element, className: element.className, margin: element.style.marginRight, testid: element.dataset.testid };
  })).toEqual({ ref: true, className: "ug-button ug-button--accent extra", margin: "4px", testid: "save" });

  // Link: Enter follows it; the standalone link is at least 24 by 24.
  await page.locator("#inline-link").focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#guide$/);
  const standalone = await page.locator("#standalone-link").boundingBox();
  expect(Math.min(standalone.width, standalone.height)).toBeGreaterThanOrEqual(24);

  // Field: the label focuses the control, required shows, the description lists only existing parts, and the
  // error comes and goes with aria-invalid.
  const email = page.getByRole("textbox", { name: "Email (required)" });
  await page.locator("main").getByText("Email (required)").click();
  await expect(email).toBeFocused();
  await expect(email).toHaveAttribute("required", "");
  expect(await email.getAttribute("aria-describedby")).toMatch(/^\S+-help$/);
  await expect(email).toHaveAccessibleDescription("We only use it for receipts.");
  await page.keyboard.type("ada");
  await expect(email).toHaveAttribute("aria-invalid", "true");
  await expect(email).toHaveAccessibleDescription("We only use it for receipts. Error: enter an address like name@example.com.");
  await page.keyboard.type("@example.com");
  await expect(email).not.toHaveAttribute("aria-invalid");
  await expect(page.locator("main .ug-field__error")).toHaveCount(0);
  expect((await state()).email).toBe("ada@example.com");
  expect(await page.evaluate(() => window.strataReact.refs.input === document.activeElement)).toBe(true);
  // A Field with no help has no description; ids are unique across Fields.
  await expect(page.getByRole("textbox", { name: "Name" })).not.toHaveAttribute("aria-describedby");
  const ids = await page.locator("main input").evaluateAll(inputs => inputs.map(input => input.id));
  expect(new Set(ids).size).toBe(ids.length);
  // The wrapped TextField: the wrapper is the well, the ref is the input, and typing works.
  const search = page.getByRole("searchbox", { name: "Search" });
  await search.click();
  await page.keyboard.type("strata");
  await expect(search).toHaveValue("strata");
  expect(await page.evaluate(() => window.strataReact.refs.wrapped === document.activeElement && document.activeElement.parentElement.dataset.strataFace === "well")).toBe(true);
  // A disabled Field disables its control.
  await expect(page.getByRole("textbox", { name: "Locked" })).toBeDisabled();

  // StrataScope renders its scope; StrataProvider applies a theme.
  await expect(page.locator("#scope")).toHaveAttribute("data-strata-size", "small");
  await expect(page.locator("#scope")).toHaveAttribute("data-strata-density", "compact");
  expect(await page.locator("#scoped").evaluate(element => getComputedStyle(element).getPropertyValue("--strata-depth").trim())).toBe("0.1");
  expect(await page.locator("#scoped").evaluate(element => element.getBoundingClientRect().height)).toBe(24);
  await page.evaluate(() => window.strataReact.setAccent("#0f766e"));
  await expect(save).toHaveCSS("background-color", "rgb(15, 118, 110)");
  await page.evaluate(() => window.strataReact.setAccent(undefined));
  await expect(save).toHaveCSS("background-color", "rgb(37, 99, 235)");

  // Accessibility in light and dark, with contrast decided in face mode.
  for (const theme of ["light", "dark"]) {
    await page.evaluate(value => { document.documentElement.dataset.strataTheme = value; }, theme);
    const relief = await new AxeBuilder({ page }).include("main").withTags(tags).analyze();
    expect(relief.violations.map(v => v.id), `axe, ${theme}`).toEqual([]);
    await page.evaluate(() => { document.documentElement.dataset.strataMode = "face"; });
    const face = await new AxeBuilder({ page }).include("main").withTags(tags).analyze();
    expect(face.violations.map(v => v.id), `axe, ${theme}, face mode`).toEqual([]);
    expect(face.incomplete.filter(result => result.id === "color-contrast").flatMap(result => result.nodes.map(node => node.target.join(" "))), `undecided contrast, ${theme}`).toEqual([]);
    await page.evaluate(() => { delete document.documentElement.dataset.strataMode; });
  }
  await context.close();
});
