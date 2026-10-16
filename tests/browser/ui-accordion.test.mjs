/**
 * Browser test of the Strata Accordion in plain markup (`ui-accordion.html`: the anatomy page's exclusive accordion
 * and one without a name), driven by real pointer and keyboard input. `<details>` is native, so no script runs:
 * - a click on a header opens and closes its section; Enter and Space toggle it;
 * - sections that share a name are exclusive; without one they open independently;
 * - each header is a button with its expanded state; axe in light and dark.
 */
import { test, expect } from "../helpers/current-browser.mjs";
import AxeBuilder from "@axe-core/playwright";

const tags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function open(browser) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await page.goto("/ui-accordion.html");
  await page.waitForLoadState("networkidle");
  return { context, page };
}

/** Which sections of an accordion (by its section's aria-label) are open. */
const opened = (page, label) => page.locator(`section[aria-label="${label}"] details`).evaluateAll(items => items.map(item => item.open));

test("a click or Enter and Space on a header opens and closes it; a shared name makes sections exclusive", async ({ browser }) => {
  const { context, page } = await open(browser);
  const exclusive = page.locator('section[aria-label="Exclusive"]');
  expect(await opened(page, "Exclusive")).toEqual([true, false]);
  await expect(exclusive.getByText("Orders ship within two days.")).toBeVisible();
  await expect(exclusive.getByText("Return any item within 30 days.")).toBeHidden();
  // Opening Returns closes Shipping: they share a name.
  await exclusive.getByText("Returns").click();
  expect(await opened(page, "Exclusive")).toEqual([false, true]);
  await expect(exclusive.getByText("Return any item within 30 days.")).toBeVisible();
  // A click on the open header closes it.
  await exclusive.getByText("Returns").click();
  expect(await opened(page, "Exclusive")).toEqual([false, false]);
  // The keyboard: Tab to a header, Enter and Space toggle it.
  await page.locator("h1").click();
  await page.keyboard.press("Tab");
  await expect(exclusive.locator("summary").first()).toBeFocused();
  await page.keyboard.press("Enter");
  expect(await opened(page, "Exclusive")).toEqual([true, false]);
  await page.keyboard.press("Tab");
  await page.keyboard.press("Space");
  expect(await opened(page, "Exclusive")).toEqual([false, true]);
  // Without a name, sections open independently.
  expect(await opened(page, "Independent")).toEqual([true, false]);
  await page.locator('section[aria-label="Independent"]').getByText("Second").click();
  expect(await opened(page, "Independent")).toEqual([true, true]);
  // The header covers the section's width and is at least the target size.
  const header = await exclusive.locator("summary").first().boundingBox(), item = await exclusive.locator("details").first().boundingBox();
  expect(Math.abs(header.width - item.width)).toBeLessThanOrEqual(2);
  expect(header.height).toBeGreaterThanOrEqual(24);
  await context.close();
});

test("headers are buttons with an expanded state, and the accordion passes axe in light and dark", async ({ browser }) => {
  const { context, page } = await open(browser);
  // Chrome's own accessibility tree: each header is a disclosure button, named by its title, with its expanded state.
  // A header in a named (exclusive) group is DisclosureTriangleGrouped.
  const cdp = await context.newCDPSession(page);
  const { nodes } = await cdp.send("Accessibility.getFullAXTree");
  const header = name => {
    const node = nodes.find(candidate => candidate.name?.value === name && /^DisclosureTriangle/.test(candidate.role?.value));
    return node && { role: node.role.value, expanded: node.properties?.find(property => property.name === "expanded")?.value.value ?? false };
  };
  expect(header("Shipping")).toEqual({ role: "DisclosureTriangleGrouped", expanded: true });
  expect(header("Returns")).toEqual({ role: "DisclosureTriangleGrouped", expanded: false });
  expect(header("First")).toEqual({ role: "DisclosureTriangle", expanded: true });
  await expect(page.locator('section[aria-label="Exclusive"] details').first()).toHaveRole("group");
  // The chevron is decorative.
  expect(await page.locator(".ug-accordion__chevron").evaluateAll(parts => parts.every(part => part.getAttribute("aria-hidden") === "true"))).toBe(true);
  const summary = violations => violations.map(v => `${v.id}: ${v.nodes.map(node => node.target.join(" ")).join(", ")}`);
  for (const theme of ["light", "dark"]) {
    await page.evaluate(value => { document.documentElement.dataset.strataTheme = value; }, theme);
    expect(summary((await new AxeBuilder({ page }).withTags(tags).analyze()).violations), `axe, ${theme}`).toEqual([]);
  }
  await context.close();
});
