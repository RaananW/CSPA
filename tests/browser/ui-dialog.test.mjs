/**
 * Browser test of Strata Dialog and Drawer in plain markup (`ui-dialog.html`: the anatomy pages' markup wired by
 * `attachStrata`, plus `showStrataDialog` from script and a native `<dialog>`), driven by real keyboard and pointer input:
 * - opening moves focus inside; Tab and Shift+Tab never land on the page behind, which is inert, and a pointer click on
 *   the scrim does not reach it; Escape or a close button closes and focus returns to the opener; an element that was
 *   inert before stays inert;
 * - nested dialogs: Escape closes only the top one, and closing it restores the one below;
 * - the scrim closes only with `closeOnScrim`; `onClose` receives the reason;
 * - each Drawer side lays out on its edge;
 * - axe finds no violations with a Dialog and a Drawer open, in light and dark;
 * - the accessibility snapshot of the open Dialog equals that of a native `<dialog>` opened with `showModal()`;
 * - opening is instant under reduced motion and takes the panel motion otherwise.
 */
import { test, expect } from "../helpers/current-browser.mjs";
import AxeBuilder from "@axe-core/playwright";

const tags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const backgrounds = ["#page", "#pre-inert", "#footer"];

async function open(browser, options = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, ...options });
  const page = await context.newPage();
  await page.goto("/ui-dialog.html");
  await page.waitForFunction(() => window.dialogCheck);
  return { context, page };
}

const settled = page => page.waitForFunction(() => !document.querySelector("[data-strata-motion]"));
/** What has focus now: its id, and whether it is inside a panel or the page behind. */
const focused = page => page.evaluate(() => {
  const element = document.activeElement;
  return { id: element?.id ?? "", tag: element?.localName, inside: !!element?.closest(".ug-dialog, .ug-drawer"), behind: !!element?.closest("#page, #pre-inert, #footer") };
});
const inertStates = (page, selectors) => page.evaluate(list => list.map(selector => document.querySelector(selector).inert), selectors);

test("a Dialog is modal: focus stays inside, the page behind is inert, and Escape returns focus to the opener", async ({ browser }) => {
  const { context, page } = await open(browser);
  const dialog = page.locator("#dialog");
  const scrim = page.locator(".ug-scrim").first();
  await expect(dialog).toBeHidden();
  await expect(scrim).toBeHidden();

  // Opening by pointer moves focus to the first tabbable element and makes the background inert.
  await page.locator("#open-dialog").click();
  await expect(dialog).toBeVisible();
  await expect(scrim).toBeVisible();
  await settled(page);
  await expect(page.locator("#dialog-input")).toBeFocused();
  expect(await inertStates(page, backgrounds)).toEqual([true, true, true]);
  expect(await inertStates(page, ["#dialog"])).toEqual([false]);
  await expect(dialog).toHaveAttribute("role", "dialog");

  // Tab and Shift+Tab cycle inside the dialog and never land on the page behind.
  const order = [];
  for (let step = 0; step < 10; step++) {
    await page.keyboard.press("Tab");
    const state = await focused(page);
    expect(state.behind, `Tab ${step} landed on ${state.id}`).toBe(false);
    expect(state.inside || state.tag === "body", `Tab ${step} left the dialog for ${state.tag}#${state.id}`).toBe(true);
    order.push(state.id || state.tag);
  }
  expect(order).toEqual(expect.arrayContaining(["dialog-input", "open-nested", "dialog-cancel", "dialog-confirm"]));
  for (let step = 0; step < 10; step++) {
    await page.keyboard.press("Shift+Tab");
    const state = await focused(page);
    expect(state.behind, `Shift+Tab ${step} landed on ${state.id}`).toBe(false);
    expect(state.inside || state.tag === "body", `Shift+Tab ${step} left the dialog for ${state.tag}#${state.id}`).toBe(true);
  }

  // A click on the scrim over a page button does not reach the button, and (closeOnScrim is off) does not close.
  const behind = await page.locator("#bg-button").boundingBox();
  const point = { x: behind.x + behind.width / 2, y: behind.y + behind.height / 2 };
  expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.className, point)).toContain("ug-scrim");
  await page.mouse.click(point.x, point.y);
  expect(await page.evaluate(() => window.dialogCheck.backgroundClicks)).toBe(0);
  await expect(dialog).toBeVisible();

  // Escape closes, hides the panel and its scrim, restores the page and returns focus to the opener.
  await page.locator("#dialog-input").focus();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(scrim).toBeHidden();
  await expect(page.locator("#open-dialog")).toBeFocused();
  // Inert is restored exactly: only the element that was inert before stays so.
  expect(await inertStates(page, backgrounds)).toEqual([false, true, false]);
  expect(await page.evaluate(() => [...document.querySelectorAll("[inert]")].map(element => element.id))).toEqual(["pre-inert"]);
  await page.locator("#bg-button").click();
  expect(await page.evaluate(() => window.dialogCheck.backgroundClicks)).toBe(1);

  // A close button inside closes it too, by keyboard, and focus returns to the opener again.
  await page.locator("#open-dialog").focus();
  await page.keyboard.press("Enter");
  await expect(dialog).toBeVisible();
  await settled(page);
  await page.locator("#dialog-cancel").focus();
  await page.keyboard.press("Space");
  await expect(dialog).toBeHidden();
  await expect(page.locator("#open-dialog")).toBeFocused();
  expect(await page.evaluate(() => [...document.querySelectorAll("[inert]")].map(element => element.id))).toEqual(["pre-inert"]);
  await context.close();
});

test("nested dialogs: Escape closes only the top one and restores the one below", async ({ browser }) => {
  const { context, page } = await open(browser);
  await page.locator("#open-dialog").click();
  await settled(page);
  await page.locator("#open-nested").click();
  const nested = page.locator("#nested");
  await expect(nested).toBeVisible();
  await settled(page);
  // The nested dialog holds focus; the dialog below is inert as well as the page.
  await expect(page.locator("#nested-close")).toBeFocused();
  expect(await inertStates(page, [...backgrounds, "#dialog", "#nested"])).toEqual([true, true, true, true, false]);

  await page.keyboard.press("Escape");
  await expect(nested).toBeHidden();
  await expect(page.locator("#dialog")).toBeVisible();
  await expect(page.locator("#open-nested")).toBeFocused();
  expect(await inertStates(page, [...backgrounds, "#dialog"])).toEqual([true, true, true, false]);

  await page.keyboard.press("Escape");
  await expect(page.locator("#dialog")).toBeHidden();
  await expect(page.locator("#open-dialog")).toBeFocused();
  expect(await page.evaluate(() => [...document.querySelectorAll("[inert]")].map(element => element.id))).toEqual(["pre-inert"]);
  await context.close();
});

test("the scrim closes a Dialog only with closeOnScrim, and onClose receives the reason", async ({ browser }) => {
  const { context, page } = await open(browser);
  // data-strata-close-on-scrim: a click on the scrim, away from the panel, closes it.
  await page.locator("#open-scrim").click();
  await expect(page.locator("#scrim-dialog")).toBeVisible();
  await settled(page);
  await page.mouse.click(8, 8);
  await expect(page.locator("#scrim-dialog")).toBeHidden();
  await expect(page.locator("#open-scrim")).toBeFocused();

  // From script, with onClose: the scrim and Escape report their reasons, and the caller closes.
  await page.locator("#open-api").click();
  const api = page.locator("#api-dialog");
  await expect(api).toBeVisible();
  await settled(page);
  // No tabbable content: the panel itself takes focus.
  await expect(api).toBeFocused();
  await page.mouse.click(8, 8);
  await expect(api).toBeHidden();
  await page.locator("#open-api").click();
  await settled(page);
  await page.keyboard.press("Escape");
  await expect(api).toBeHidden();
  expect(await page.evaluate(() => window.dialogCheck.reasons)).toEqual(["scrim", "escape"]);
  await expect(page.locator("#open-api")).toBeFocused();
  await context.close();
});

test("each Drawer side lays out on its edge", async ({ browser }) => {
  const { context, page } = await open(browser);
  const edges = {
    start: rect => rect.left === 0 && rect.top === 0 && rect.height === rect.viewport.height && rect.width < rect.viewport.width / 2,
    end: rect => rect.right === rect.viewport.width && rect.top === 0 && rect.height === rect.viewport.height && rect.width < rect.viewport.width / 2,
    top: rect => rect.top === 0 && rect.left === 0 && rect.width === rect.viewport.width && rect.height < rect.viewport.height / 2,
    bottom: rect => rect.bottom === rect.viewport.height && rect.left === 0 && rect.width === rect.viewport.width && rect.height < rect.viewport.height / 2,
  };
  for (const side of Object.keys(edges)) {
    await page.locator(`#open-${side}`).click();
    const drawer = page.locator(`#drawer-${side}`);
    await expect(drawer).toBeVisible();
    await settled(page);
    const rect = await drawer.evaluate(element => {
      const { left, top, right, bottom, width, height } = element.getBoundingClientRect();
      return { left, top, right, bottom, width, height, viewport: { width: document.documentElement.clientWidth, height: document.documentElement.clientHeight } };
    });
    expect(edges[side](rect), `${side}: ${JSON.stringify(rect)}`).toBe(true);
    expect(await drawer.evaluate(element => getComputedStyle(element).position)).toBe("fixed");
    // Focus moves in, the page is inert, and Escape closes and returns focus.
    expect((await focused(page)).inside).toBe(true);
    expect(await inertStates(page, backgrounds)).toEqual([true, true, true]);
    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
    await expect(page.locator(`#open-${side}`)).toBeFocused();
  }
  await context.close();
});

test("a Dialog and a Drawer pass axe when open, in light and dark", async ({ browser }) => {
  const { context, page } = await open(browser);
  const summary = violations => violations.map(v => `${v.id}: ${v.nodes.map(node => node.target.join(" ")).join(", ")}`);
  for (const theme of ["light", "dark"]) {
    await page.evaluate(value => { document.documentElement.dataset.strataTheme = value; }, theme);
    await page.locator("#open-dialog").click();
    await settled(page);
    expect(summary((await new AxeBuilder({ page }).withTags(tags).analyze()).violations), `axe, dialog, ${theme}`).toEqual([]);
    await page.keyboard.press("Escape");
    await expect(page.locator("#dialog")).toBeHidden();
    await page.locator("#open-end").click();
    await settled(page);
    expect(summary((await new AxeBuilder({ page }).withTags(tags).analyze()).violations), `axe, drawer, ${theme}`).toEqual([]);
    await page.keyboard.press("Escape");
    await expect(page.locator("#drawer-end")).toBeHidden();
  }
  await context.close();
});

test("the accessibility snapshot of an open Dialog equals a native modal <dialog> with the same content", async ({ browser }) => {
  const { context, page } = await open(browser);
  await page.locator("#open-dialog").click();
  await settled(page);
  const strata = await page.locator("#dialog").ariaSnapshot();
  await page.keyboard.press("Escape");
  await expect(page.locator("#dialog")).toBeHidden();

  await page.locator("#open-native").click();
  await expect(page.locator("#native")).toBeVisible();
  const native = await page.locator("#native").ariaSnapshot();
  expect(strata).toContain("dialog \"Discard changes?\"");
  expect(strata).toBe(native);
  // Both are modal in the accessibility tree: role dialog, named, with the page behind unreachable.
  await expect(page.getByRole("dialog", { name: "Discard changes?" })).toHaveCount(1);
  await context.close();
});

test("opening is instant under reduced motion and moves through depth otherwise", async ({ browser }) => {
  const reduced = await open(browser, { reducedMotion: "reduce" });
  await reduced.page.locator("#open-dialog").click();
  await expect(reduced.page.locator("#dialog-input")).toBeFocused();
  const instant = await reduced.page.evaluate(() => ({ focus: window.dialogCheck.focusTimes[0], motion: document.getElementById("dialog").dataset.strataMotion, animations: document.getAnimations().length }));
  expect(instant.motion).toBeUndefined();
  expect(instant.animations).toBe(0);
  expect(instant.focus).toBeLessThan(150);
  // Closing is instant too: the panel is hidden and focus is back within one frame.
  await reduced.page.keyboard.press("Escape");
  await reduced.page.waitForFunction(() => document.getElementById("dialog").hidden && document.activeElement?.id === "open-dialog", null, { timeout: 150 });
  await reduced.context.close();

  const moving = await open(browser);
  await moving.page.locator("#open-dialog").click();
  await expect(moving.page.locator("#dialog")).toHaveAttribute("data-strata-motion", "enter");
  await expect(moving.page.locator("#dialog-input")).toBeFocused();
  expect(await moving.page.evaluate(() => window.dialogCheck.focusTimes[0])).toBeGreaterThan(250);
  await moving.context.close();
});
