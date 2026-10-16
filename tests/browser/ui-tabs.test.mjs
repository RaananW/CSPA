/**
 * Browser test of Strata Tabs in plain markup (`ui-tabs.html`: the anatomy page's markup, a vertical tablist with
 * manual activation and a right-to-left one, wired by `attachStrata`), driven by real pointer and keyboard input:
 * - a click selects a tab and shows its panel; `strata-tab-change` reports the tab and the panel;
 * - the arrow keys, Home and End move and select, wrapping and skipping a disabled tab; Tab leaves the tablist for
 *   the selected panel;
 * - vertical tablists use Up and Down; manual activation moves focus only until Enter or Space; right to left
 *   reverses the arrows;
 * - roles, names and selection in the accessibility tree; axe in light and dark.
 */
import { test, expect } from "../helpers/current-browser.mjs";
import AxeBuilder from "@axe-core/playwright";

const tags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function open(browser) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await page.goto("/ui-tabs.html");
  await page.waitForFunction(() => window.tabsCheck);
  return { context, page };
}

/** Each tab of a tablist (by the Tabs id): selected, in the tab order, and whether its panel shows. */
const state = (page, id) => page.evaluate(base => [...document.querySelectorAll(`[id^="${base}-tab-"]`)].map(tab => {
  const panel = document.getElementById(tab.getAttribute("aria-controls"));
  return `${tab.id.slice(base.length + 5)}:${tab.getAttribute("aria-selected") === "true" ? "selected" : "-"}:${tab.tabIndex}:${panel.hidden ? "hidden" : "shown"}`;
}), id);
const focused = page => page.evaluate(() => document.activeElement?.id ?? "");
const changes = page => page.evaluate(() => window.tabsCheck.changes.splice(0));

test("a click selects a tab and shows only its panel, and the change is reported", async ({ browser }) => {
  const { context, page } = await open(browser);
  expect(await state(page, "account")).toEqual(["profile:selected:0:shown", "security:-:-1:hidden", "billing:-:-1:hidden"]);
  await page.getByRole("tab", { name: "Security" }).click();
  expect(await state(page, "account")).toEqual(["profile:-:-1:hidden", "security:selected:0:shown", "billing:-:-1:hidden"]);
  await expect(page.getByRole("tabpanel", { name: "Security" })).toHaveText("Your password and two-step sign-in.");
  expect(await changes(page)).toEqual(["account-tab-security>account-panel-security"]);
  // Clicking the selected tab again changes nothing; the disabled tab cannot be clicked.
  await page.getByRole("tab", { name: "Security" }).click();
  await page.getByRole("tab", { name: "Billing" }).click({ force: true });
  expect(await state(page, "account")).toEqual(["profile:-:-1:hidden", "security:selected:0:shown", "billing:-:-1:hidden"]);
  expect(await changes(page)).toEqual([]);
  // A click on the indicator, inside the tab's box, reaches the tab.
  const indicator = await page.locator("#account-tab-security .ug-tab__indicator").boundingBox();
  await page.getByRole("tab", { name: "Profile" }).click();
  await page.mouse.click(indicator.x + indicator.width / 2, indicator.y + indicator.height / 2);
  expect(await state(page, "account")).toEqual(["profile:-:-1:hidden", "security:selected:0:shown", "billing:-:-1:hidden"]);
  await context.close();
});

test("the arrow keys, Home and End move and select, wrapping and skipping a disabled tab; Tab moves into the panel", async ({ browser }) => {
  const { context, page } = await open(browser);
  // Tab reaches the selected tab only: the others are out of the tab order.
  await page.locator("h1").click();
  await page.keyboard.press("Tab");
  expect(await focused(page)).toBe("account-tab-profile");
  await page.keyboard.press("ArrowRight");
  expect(await focused(page)).toBe("account-tab-security");
  expect(await state(page, "account")).toEqual(["profile:-:-1:hidden", "security:selected:0:shown", "billing:-:-1:hidden"]);
  // Billing is disabled: Right wraps past it to Profile, and Left wraps back to Security.
  await page.keyboard.press("ArrowRight");
  expect(await focused(page)).toBe("account-tab-profile");
  await page.keyboard.press("ArrowLeft");
  expect(await focused(page)).toBe("account-tab-security");
  await page.keyboard.press("Home");
  expect(await focused(page)).toBe("account-tab-profile");
  await page.keyboard.press("End");
  expect(await focused(page)).toBe("account-tab-security");
  // Up and Down do nothing on a horizontal tablist.
  await page.keyboard.press("ArrowDown");
  expect(await focused(page)).toBe("account-tab-security");
  expect(await changes(page)).toEqual(["account-tab-security>account-panel-security", "account-tab-profile>account-panel-profile",
    "account-tab-security>account-panel-security", "account-tab-profile>account-panel-profile", "account-tab-security>account-panel-security"]);
  // Tab leaves the tablist for the selected tab's panel.
  await page.keyboard.press("Tab");
  expect(await focused(page)).toBe("account-panel-security");
  await page.keyboard.press("Shift+Tab");
  expect(await focused(page)).toBe("account-tab-security");
  await context.close();
});

test("a vertical tablist uses Up and Down, and manual activation selects only on Enter or Space", async ({ browser }) => {
  const { context, page } = await open(browser);
  await page.getByRole("tab", { name: "General" }).focus();
  await page.keyboard.press("ArrowDown");
  expect(await focused(page)).toBe("settings-tab-privacy");
  // Manual: focus moved, the selection did not.
  expect(await state(page, "settings")).toEqual(["general:selected:0:shown", "privacy:-:-1:hidden", "help:-:-1:hidden"]);
  await page.keyboard.press("ArrowRight");
  expect(await focused(page)).toBe("settings-tab-privacy");
  await page.keyboard.press("Enter");
  expect(await state(page, "settings")).toEqual(["general:-:-1:hidden", "privacy:selected:0:shown", "help:-:-1:hidden"]);
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowUp");
  expect(await focused(page)).toBe("settings-tab-help");
  await page.keyboard.press("Space");
  expect(await state(page, "settings")).toEqual(["general:-:-1:hidden", "privacy:-:-1:hidden", "help:selected:0:shown"]);
  expect(await changes(page)).toEqual(["settings-tab-privacy>settings-panel-privacy", "settings-tab-help>settings-panel-help"]);
  await context.close();
});

test("right to left reverses the arrow keys", async ({ browser }) => {
  const { context, page } = await open(browser);
  await page.getByRole("tab", { name: "One" }).focus();
  await page.keyboard.press("ArrowLeft");
  expect(await focused(page)).toBe("rtl-tab-two");
  await page.keyboard.press("ArrowRight");
  expect(await focused(page)).toBe("rtl-tab-one");
  await page.keyboard.press("ArrowRight");
  expect(await focused(page)).toBe("rtl-tab-three");
  expect(await state(page, "rtl")).toEqual(["one:-:-1:hidden", "two:-:-1:hidden", "three:selected:0:shown"]);
  await context.close();
});

test("tabs expose their roles, names and selection, and pass axe in light and dark", async ({ browser }) => {
  const { context, page } = await open(browser);
  const list = page.getByRole("tablist", { name: "Account" });
  await expect(list.getByRole("tab")).toHaveCount(3);
  await expect(list.getByRole("tab", { name: "Profile" })).toHaveAttribute("aria-selected", "true");
  await expect(list.getByRole("tab", { name: "Billing" })).toBeDisabled();
  await expect(page.getByRole("tabpanel", { name: "Profile" })).toBeVisible();
  await expect(page.getByRole("tablist", { name: "Settings" })).toHaveAttribute("aria-orientation", "vertical");
  // The rail and indicators are decorative.
  expect(await page.locator(".ug-tabs__rail, .ug-tab__indicator").evaluateAll(parts => parts.every(part => part.getAttribute("aria-hidden") === "true"))).toBe(true);
  // The selected tab's indicator shows, under it; the others are not drawn.
  const shown = await page.evaluate(() => [...document.querySelectorAll("#account-tab-profile, #account-tab-security")].map(tab => {
    const indicator = tab.querySelector(".ug-tab__indicator"), box = indicator.getBoundingClientRect(), outer = tab.getBoundingClientRect();
    const visible = indicator.checkVisibility();
    return { visible, inside: !visible || (box.left >= outer.left && box.right <= outer.right && box.bottom <= outer.bottom + 0.5) };
  }));
  expect(shown).toEqual([{ visible: true, inside: true }, { visible: false, inside: true }]);
  const summary = violations => violations.map(v => `${v.id}: ${v.nodes.map(node => node.target.join(" ")).join(", ")}`);
  for (const theme of ["light", "dark"]) {
    await page.evaluate(value => { document.documentElement.dataset.strataTheme = value; }, theme);
    expect(summary((await new AxeBuilder({ page }).withTags(tags).analyze()).violations), `axe, ${theme}`).toEqual([]);
  }
  await context.close();
});
