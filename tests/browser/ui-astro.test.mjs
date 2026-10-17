/**
 * Browser test of the Strata Astro components (`@underglass/ui/astro`): builds the static fixture site
 * (`fixtures/astro-strata`) with Astro, serves its output through request routing, and checks that
 * - each component renders exactly the markup example on its anatomy page (a Dialog and a Drawer closed, with `hidden`);
 * - the page works with JavaScript off: labels, native keyboard on radios, select, slider, checkbox and switch, roles,
 *   names, values and Field descriptions;
 * - with JavaScript, `attachStrata` toggles ToggleButton, blocks aria-disabled activation and sets indeterminate;
 * - axe finds no violations in light and dark, with contrast decided in face mode.
 */
import { test, expect } from "../helpers/current-browser.mjs";
import AxeBuilder from "@axe-core/playwright";
import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalScript, expectClosedOverlayContracts, expectContracts, overlayContracts } from "../helpers/strata-contract.mjs";

const root = fileURLToPath(new URL("../../fixtures/astro-strata/", import.meta.url));
const dist = new URL("../../fixtures/astro-strata/dist/", import.meta.url);
const origin = "http://strata-astro.test";
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml" };
const tags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

test.beforeAll(async () => {
  test.setTimeout(180000);
  process.env.ASTRO_TELEMETRY_DISABLED = "1";
  const { build } = await import("astro");
  await build({ root, logLevel: "error", telemetry: false });
});

/** A page whose requests to the fixture origin are served from the built site. */
async function open(browser, options = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, ...options });
  await context.route(`${origin}/**`, async route => {
    const path = new URL(route.request().url()).pathname;
    const file = new URL(`.${path.endsWith("/") ? `${path}index.html` : path}`, dist);
    try { await route.fulfill({ body: await readFile(file), contentType: types[extname(file.pathname)] ?? "application/octet-stream" }); }
    catch { await route.fulfill({ status: 404, body: "" }); }
  });
  const page = await context.newPage();
  await page.addInitScript(canonicalScript);
  await page.goto(`${origin}/`);
  return { context, page };
}

test("Strata Astro components render their anatomy markup and work without JavaScript", async ({ browser }) => {
  const { context, page } = await open(browser, { javaScriptEnabled: false });
  // Astro renders no sort buttons: its Table matches the static example (table.md#2) only.
  await expectContracts(page, expect, { skip: [...overlayContracts, "table.md"] });
  // A Dialog and a Drawer render closed, with `hidden`.
  await expectClosedOverlayContracts(page, expect);
  // closeOnScrim renders data-strata-close-on-scrim, only where it is set.
  await expect(page.locator("#sort-drawer")).toHaveAttribute("data-strata-close-on-scrim", "");
  await expect(page.locator("section:has(#filters-title)")).not.toHaveAttribute("data-strata-close-on-scrim");
  const main = page.locator("main");

  // Fields: label, required suffix, description and error, all server-rendered.
  const email = main.getByRole("textbox", { name: "Email (required)" });
  await expect(email).toHaveAttribute("aria-invalid", "true");
  await expect(email).toHaveAccessibleDescription("We only use it for receipts. Error: enter an address like name@example.com.");
  await main.getByText("Email (required)").click();
  await expect(email).toBeFocused();
  await page.keyboard.type("ada@example.com");
  await expect(email).toHaveValue("ada@example.com");
  await expect(main.getByRole("textbox", { name: "Locked" })).toBeDisabled();
  await expect(main.getByRole("searchbox", { name: "Search" })).toHaveAccessibleDescription("Titles and tags.");

  // Choices: the label row toggles a checkbox; Space toggles a switch; radios follow native arrow keys.
  const terms = main.getByRole("checkbox", { name: "I accept the terms" });
  await expect(terms).toHaveAccessibleDescription("Required to continue.");
  await main.getByText("I accept the terms").click();
  await expect(terms).toBeChecked();
  const wifi = main.getByRole("switch", { name: "Wi-Fi" });
  await expect(wifi).toBeChecked();
  await wifi.focus();
  await page.keyboard.press("Space");
  await expect(wifi).not.toBeChecked();
  const group = main.getByRole("group", { name: "Plan" });
  await expect(group).toHaveAccessibleDescription("You can change it later.");
  const free = group.getByRole("radio", { name: "Free" });
  await free.focus();
  await page.keyboard.press("Space");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await expect(group.getByRole("radio", { name: "Enterprise" })).toBeChecked();
  await expect(free).toHaveAttribute("required", "");
  const size = main.getByRole("combobox", { name: "Size" });
  await expect(size).toHaveValue("m");
  await size.focus();
  await page.keyboard.press("ArrowDown");
  await expect(size).toHaveValue("l");
  const volume = main.getByRole("slider", { name: "Volume" });
  await expect(volume).toHaveAccessibleDescription("0 to 100.");
  await volume.focus();
  await page.keyboard.press("End");
  await expect(volume).toHaveValue("100");

  // Surfaces and status components.
  await expect(main.getByRole("region", { name: "Status" })).toHaveAttribute("data-strata-elevation", "floating");
  await expect(main.getByRole("article", { name: "Latency" }).getByRole("button", { name: "Details" })).toBeVisible();
  await expect(page.locator("#inbox")).toHaveText("99+ (120)");
  await expect(main.getByRole("status")).toHaveText("Loading results");
  await expect(page.locator("#saving .ug-spinner")).toHaveAttribute("aria-hidden", "true");
  await expect(main.getByRole("progressbar", { name: "Upload" })).toHaveAttribute("value", "40");
  expect(await main.getByRole("progressbar", { name: "Syncing" }).evaluate(element => element.hasAttribute("value"))).toBe(false);
  await expect(page.locator("#scope")).toHaveAttribute("data-strata-size", "small");
  // The provider's theme sheet is server-rendered.
  await expect(page.locator("#save")).toHaveCSS("background-color", "rgb(29, 78, 216)");
  await context.close();
});

test("Strata Astro components get their browser behaviour from attachStrata and pass axe", async ({ browser }) => {
  const { context, page } = await open(browser);
  const main = page.locator("main");
  await page.waitForFunction(() => document.getElementById("mixed").indeterminate === true);

  // ToggleButton: click and Space toggle aria-pressed and report the change.
  const bold = page.locator("#bold");
  const changes = await page.evaluateHandle(() => { const list = []; document.addEventListener("strata-pressed-change", event => list.push(event.detail.pressed)); return list; });
  await bold.click();
  await expect(bold).toHaveAttribute("aria-pressed", "true");
  await bold.focus();
  await page.keyboard.press("Space");
  await expect(bold).toHaveAttribute("aria-pressed", "false");
  expect(await changes.jsonValue()).toEqual([true, false]);
  // A filter chip toggles like a ToggleButton; a chip's remove button reports strata-remove from the chip.
  const remote = page.locator("#remote-chip");
  await remote.click();
  await expect(remote).toHaveAttribute("aria-pressed", "true");
  await remote.focus();
  await page.keyboard.press("Space");
  await expect(remote).toHaveAttribute("aria-pressed", "false");
  expect(await changes.jsonValue()).toEqual([true, false, true, false]);
  const removed = await page.evaluateHandle(() => { const list = []; document.addEventListener("strata-remove", event => list.push(event.target.id)); return list; });
  await page.getByRole("button", { name: "Remove ada@example.com" }).click();
  expect(await removed.jsonValue()).toEqual(["ada-chip"]);
  // A TreeView runs from its markup: Right opens an item, Enter selects it, and both are reported from the item.
  const treeEvents = await page.evaluateHandle(() => { const list = []; for (const type of ["strata-expand", "strata-select"]) document.addEventListener(type, event => list.push(`${type}:${event.target.dataset.strataValue}`)); return list; });
  const src = page.locator("#astro-tree [data-strata-value='src']");
  await src.focus();
  await page.keyboard.press("ArrowRight");
  await expect(src).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  await expect(page.locator("#astro-tree [data-strata-value='src/app.ts']")).toHaveAttribute("aria-selected", "true");
  expect(await page.locator("#astro-tree [role='treeitem'][tabindex='0']").count()).toBe(1);
  expect(await treeEvents.jsonValue()).toEqual(["strata-expand:src", "strata-select:src/app.ts"]);
  // A Carousel runs from its markup: Next shows the next slide, wrapping, and reports strata-slide.
  const slides = await page.evaluateHandle(() => { const list = []; document.addEventListener("strata-slide", event => list.push(event.detail.index)); return list; });
  const carousel = page.locator("#astro-carousel");
  await carousel.getByRole("button", { name: "Next slide" }).click();
  await expect(carousel.locator(".ug-carousel__slide:not([hidden])")).toHaveText("Two");
  await expect(carousel.getByRole("button", { name: "Slide 2" })).toHaveAttribute("aria-current", "true");
  await carousel.getByRole("button", { name: "Next slide" }).click();
  await expect(carousel.locator(".ug-carousel__slide:not([hidden])")).toHaveText("One");
  expect(await slides.jsonValue()).toEqual([1, 0]);
  // A Menu from markup: opening focuses its first item, Down moves, Enter chooses (reported) and closes it.
  const choices = await page.evaluateHandle(() => { const list = []; document.addEventListener("strata-select", event => { if (event.target.closest(".ug-menu")) list.push(event.detail.index); }); return list; });
  await page.locator("#astro-menu-open").click();
  await expect(page.locator("#astro-menu")).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.activeElement?.textContent)).toBe("Copy");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page.locator("#astro-menu")).toBeHidden();
  expect(await choices.jsonValue()).toEqual([1]);
  expect(await page.evaluate(() => document.activeElement?.id)).toBe("astro-menu-open");
  // A MessageBar's dismiss button reports strata-dismiss from the bar.
  const dismissed = await page.evaluateHandle(() => { const list = []; document.addEventListener("strata-dismiss", event => list.push(event.target.id)); return list; });
  await page.locator("#astro-message").getByRole("button", { name: "Dismiss" }).click();
  expect(await dismissed.jsonValue()).toEqual(["astro-message"]);
  // Tooltip (attachStrata): the contract's trigger is hidden, so a tooltip is added for a visible control.
  await page.evaluate(() => {
    document.getElementById("astro-cut").setAttribute("aria-describedby", "astro-cut-tip");
    document.body.insertAdjacentHTML("beforeend", '<div class="ug-tooltip" id="astro-cut-tip" role="tooltip" popover="manual">Cuts the selection</div>');
  });
  await page.locator("#astro-cut").hover();
  await expect(page.locator("#astro-cut-tip")).toBeVisible();
  await page.mouse.move(5, 5);
  await expect(page.locator("#astro-cut-tip")).toBeHidden();
  // Toolbar (attachStrata): one tab stop once focus enters; the arrows move, skipping the disabled control.
  await page.locator("#astro-cut").focus();
  expect(await page.locator("#astro-toolbar button").evaluateAll(buttons => buttons.map(button => button.getAttribute("tabindex")))).toEqual(["0", null, "-1"]);
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("#astro-paste")).toBeFocused();
  expect(await page.locator("#astro-toolbar button").evaluateAll(buttons => buttons.map(button => button.getAttribute("tabindex")))).toEqual(["-1", null, "0"]);
  // aria-disabled: focusable, and no click reaches the page's listeners or submits the form.
  const blocked = page.locator("#blocked");
  await page.evaluate(() => {
    window.blockedClicks = 0;
    document.getElementById("blocked").addEventListener("click", () => { window.blockedClicks++; });
    document.getElementById("form").addEventListener("submit", event => { event.preventDefault(); window.blockedClicks += 100; });
  });
  await blocked.click({ force: true });
  await blocked.focus();
  await expect(blocked).toBeFocused();
  await page.keyboard.press("Enter");
  expect(await page.evaluate(() => window.blockedClicks)).toBe(0);
  // Indeterminate: set from the markup, cleared by a click, as native.
  const mixed = page.locator("#mixed");
  await mixed.click();
  expect(await mixed.evaluate(input => [input.indeterminate, input.checked])).toEqual([false, true]);

  for (const theme of ["light", "dark"]) {
    await page.evaluate(value => { document.documentElement.dataset.strataTheme = value; }, theme);
    const relief = await new AxeBuilder({ page }).include("main").withTags(tags).analyze();
    expect(relief.violations.map(v => v.id), `axe, ${theme}`).toEqual([]);
    await page.evaluate(() => { document.documentElement.dataset.strataMode = "face"; });
    const face = await new AxeBuilder({ page }).include("main").withTags(tags).analyze();
    expect(face.violations.map(v => v.id), `axe, ${theme}, face mode`).toEqual([]);
    // Selects draw their chevron with background gradients; their label contrast is checked on pixels in ui-specimen.
    const undecided = face.incomplete.filter(result => result.id === "color-contrast").flatMap(result => result.nodes.filter(node => !node.html.includes("ug-select")).map(node => node.target.join(" ")));
    expect(undecided, `undecided contrast, ${theme}`).toEqual([]);
    await page.evaluate(() => { delete document.documentElement.dataset.strataMode; });
  }
  await expect(main).toBeVisible();
  await context.close();
});
