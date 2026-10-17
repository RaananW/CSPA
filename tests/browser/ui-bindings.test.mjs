/**
 * Browser test of the Strata Tier A bindings and Tabs, run against `@underglass/ui/react` (page `ui-react.html`) and
 * `@underglass/ui/vue` (page `ui-vue.html`), which render the same components with the same ids, names and state,
 * with no Underglass:
 * - each component renders exactly the markup example on its anatomy page (`docs/ui-library/components`), compared
 *   as canonical DOM (tags, attributes, class sets and text);
 * - real pointer and keyboard input on every control, with Field state, refs and attribute passthrough;
 * - roles, names and values of the surfaces and status components; Tabs follow their value and take the arrow keys;
 *   Accordion sections report and follow their open state; List rows are links, buttons or static;
 *   Table headers sort the rows; a Breadcrumb is a named landmark of links;
 *   Avatars show initials or a picture, named by the name; chips filter, and remove on request;
 *   Skeletons are hidden placeholders that shimmer, and stop under reduced motion; MessageBars announce by intent;
 *   Pagination moves between pages; a Toolbar is one tab stop with the arrow keys between its controls;
 *   an AppBar is the banner with its controls; a Tooltip shows on hover and focus, and Escape hides it;
 *   toasts appear in the status region and go after their time, which hovering stops;
 *   a Rating is set by click and arrow keys, fills up to its score and submits it, and its display is named by it;
 * - StrataProvider applies a theme and StrataScope a scope; axe finds no violations in the light and dark themes.
 */
import { test, expect } from "../helpers/current-browser.mjs";
import AxeBuilder from "@axe-core/playwright";
import { canonicalScript, expectContracts, expectOpenOverlayContracts } from "../helpers/strata-contract.mjs";

const bindings = ["react", "vue"];
const tags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

for (const binding of bindings) test(`Strata ${binding} components render their anatomy markup and behave natively`, async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await page.addInitScript(canonicalScript);
  await page.goto(`/ui-${binding}.html`);
  await page.waitForFunction(() => window.strataBinding);
  const state = () => page.evaluate(() => ({ clicks: window.strataBinding.clicks, italic: window.strataBinding.italic, email: window.strataBinding.email }));

  // Markup contracts.
  await expectContracts(page, expect);
  // A Dialog and a Drawer render only while open.
  await expectOpenOverlayContracts(page, expect);

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
    return { ref: window.strataBinding.refs.button === element, className: element.className, margin: element.style.marginRight, testid: element.dataset.testid };
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
  await expect(page.locator("#email-field .ug-field__error")).toHaveCount(0);
  expect((await state()).email).toBe("ada@example.com");
  expect(await page.evaluate(() => window.strataBinding.refs.input === document.activeElement)).toBe(true);
  // A Field with no help has no description; ids are unique across Fields.
  await expect(page.getByRole("textbox", { name: "Name" })).not.toHaveAttribute("aria-describedby");
  const ids = await page.locator("main input").evaluateAll(inputs => inputs.map(input => input.id).filter(Boolean));
  expect(new Set(ids).size).toBe(ids.length);
  // The wrapped TextField: the wrapper is the well, the ref is the input, and typing works.
  const search = page.getByRole("searchbox", { name: "Search" });
  await search.click();
  await page.keyboard.type("strata");
  await expect(search).toHaveValue("strata");
  expect(await page.evaluate(() => window.strataBinding.refs.wrapped === document.activeElement && document.activeElement.parentElement.dataset.strataFace === "well")).toBe(true);
  // A disabled Field disables its control.
  await expect(page.getByRole("textbox", { name: "Locked" })).toBeDisabled();

  // StrataScope renders its scope; StrataProvider applies a theme.
  await expect(page.locator("#scope")).toHaveAttribute("data-strata-size", "small");
  await expect(page.locator("#scope")).toHaveAttribute("data-strata-density", "compact");
  expect(await page.locator("#scoped").evaluate(element => getComputedStyle(element).getPropertyValue("--strata-depth").trim())).toBe("0.1");
  expect(await page.locator("#scoped").evaluate(element => element.getBoundingClientRect().height)).toBe(24);
  await page.evaluate(() => window.strataBinding.setAccent("#0f766e"));
  await expect(save).toHaveCSS("background-color", "rgb(15, 118, 110)");
  await page.evaluate(() => window.strataBinding.setAccent(undefined));
  await expect(save).toHaveCSS("background-color", "rgb(37, 99, 235)");

  // Accessibility in light and dark, with contrast decided in face mode.
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
  await context.close();
});

for (const binding of bindings) test(`Strata ${binding} Dialog is modal, controlled by open, and keeps focus and inert state`, async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await page.goto(`/ui-${binding}.html`);
  await page.waitForFunction(() => window.strataBinding);
  const opener = page.locator("#open-live");
  const dialog = page.getByRole("dialog", { name: "Live dialog" });
  const inert = () => page.evaluate(() => [...document.querySelectorAll("[inert]")].map(element => element.id || element.localName));
  // Closed, it renders nothing.
  await expect(page.locator("#live-dialog")).toHaveCount(0);
  await expect(page.locator(".ug-scrim")).toHaveCount(0);

  // Open: the panel and its scrim are body children, focus moves in, the app behind is inert, and the ref, class and
  // attributes reach the panel.
  await opener.click();
  await expect(dialog).toBeVisible();
  await expect(page.locator("#live-field")).toBeFocused();
  await expect(dialog).toHaveAccessibleDescription("Controlled by state.");
  expect(await dialog.evaluate(element => ({
    parent: element.parentElement === document.body, scrim: element.previousElementSibling?.className, modal: element.getAttribute("aria-modal"),
    className: element.className, ref: element === window.strataDialog.panel || element === window.strataBinding.liveDialog,
  }))).toEqual({ parent: true, scrim: "ug-scrim", modal: "true", className: expect.stringContaining("ug-panel ug-dialog"), ref: true });
  await expect(dialog).toHaveClass(/extra/);
  // The app's root and the tooltip portalled beside it in the body are inert behind the modal.
  expect(await inert()).toEqual(["root", "share-tip"]);
  // Tab stays inside.
  for (let step = 0; step < 6; step++) {
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => !document.activeElement?.closest("#root"))).toBe(true);
  }
  // Escape asks to close; the app sets open to false, the panel leaves and unmounts, and focus returns to the opener.
  await page.keyboard.press("Escape");
  await expect(page.locator("#live-dialog")).toHaveCount(0);
  await expect(opener).toBeFocused();
  expect(await inert()).toEqual([]);
  expect(await page.evaluate(() => window.strataDialog.reasons)).toEqual(["escape"]);

  // A close button that sets open to false closes it the same way, and it opens again.
  await opener.click();
  await expect(page.locator("#live-field")).toBeFocused();
  await page.locator("#live-done").click();
  await expect(page.locator("#live-dialog")).toHaveCount(0);
  await expect(opener).toBeFocused();
  expect(await inert()).toEqual([]);
  await opener.click();
  await expect(dialog).toBeVisible();
  await context.close();
});

for (const binding of bindings) test(`Strata ${binding} choice controls keep native keyboard and form behaviour`, async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await page.goto(`/ui-${binding}.html`);
  await page.waitForFunction(() => window.strataBinding);
  const choices = () => page.evaluate(() => window.strataBinding.choices);
  const main = page.locator("main");

  // Checkbox inside a Field with no label: help and error describe it; the row and Space toggle it.
  const terms = main.getByRole("checkbox", { name: "I accept the terms" });
  await expect(terms).toHaveAttribute("aria-invalid", "true");
  await expect(terms).toHaveAccessibleDescription("Required to continue. Error: accept the terms.");
  await main.getByText("I accept the terms").click();
  await expect(terms).toBeChecked();
  await expect(terms).not.toHaveAttribute("aria-invalid");
  await expect(terms).toHaveAccessibleDescription("Required to continue.");
  await terms.focus();
  await page.keyboard.press("Space");
  await expect(terms).not.toBeChecked();
  // Indeterminate is a property; a click clears it and checks the box, as native.
  const mixed = page.locator("#mixed");
  expect(await mixed.evaluate(input => input.indeterminate)).toBe(true);
  await mixed.click();
  expect(await mixed.evaluate(input => [input.indeterminate, input.checked])).toEqual([false, true]);
  expect((await choices()).mixed).toBe(false);

  // Switch: role switch, Space toggles, Enter does not; disabled is native; reverse keeps the DOM order.
  const wifi = main.getByRole("switch", { name: "Wi-Fi" });
  await wifi.focus();
  await page.keyboard.press("Space");
  await expect(wifi).not.toBeChecked();
  await page.keyboard.press("Enter");
  await expect(wifi).not.toBeChecked();
  expect((await choices()).wifi).toBe(false);
  await expect(main.getByRole("switch", { name: "Airplane mode" })).toBeDisabled();
  expect(await page.locator("#airplane").evaluate(input => [input.parentElement.className, input.parentElement.firstElementChild === input])).toEqual(["ug-switch ug-switch--reverse", true]);

  // RadioGroup: named by its legend, described by help and error, every radio invalid and required until a choice.
  const group = main.getByRole("group", { name: "Plan" });
  await expect(group).toHaveAccessibleDescription("You can change it later. Error: choose a plan.");
  const free = group.getByRole("radio", { name: "Free" }), pro = group.getByRole("radio", { name: "Pro" }), enterprise = group.getByRole("radio", { name: "Enterprise" });
  await expect(free).toHaveAttribute("aria-invalid", "true");
  await expect(free).toHaveAttribute("required", "");
  // Tab lands on the first radio when none is selected; arrows select, skip the disabled one and wrap.
  await page.locator("#airplane").evaluate(() => document.querySelector("#mixed").focus());
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await expect(free).toBeFocused();
  await page.keyboard.press("Space");
  await expect(free).toBeChecked();
  await page.keyboard.press("ArrowDown");
  await expect(pro).toBeChecked();
  await page.keyboard.press("ArrowDown");
  await expect(enterprise).toBeChecked();
  await page.keyboard.press("ArrowDown");
  await expect(free).toBeChecked();
  expect((await choices()).plan).toBe("free");
  await expect(free).not.toHaveAttribute("aria-invalid");
  await expect(group).toHaveAccessibleDescription("You can change it later.");

  // Select: the keyboard changes the value natively.
  const size = main.getByRole("combobox", { name: "Size" });
  await size.focus();
  await page.keyboard.press("ArrowDown");
  await expect(size).toHaveValue("l");
  expect((await choices()).size).toBe("l");

  // Slider: arrows step by 5, Home and End go to the ends; named and described by its Field.
  const volume = main.getByRole("slider", { name: "Volume" });
  await expect(volume).toHaveAccessibleDescription("0 to 100.");
  await volume.focus();
  await page.keyboard.press("ArrowRight");
  await expect(volume).toHaveValue("45");
  await page.keyboard.press("End");
  await expect(volume).toHaveValue("100");
  await page.keyboard.press("Home");
  expect((await choices()).volume).toBe(0);

  // TextArea: Enter is a new line, Tab leaves the field.
  const notes = main.getByRole("textbox", { name: "Notes" });
  await notes.click();
  await page.keyboard.type("one");
  await page.keyboard.press("Enter");
  await page.keyboard.type("two");
  expect((await choices()).notes).toBe("one\ntwo");
  await expect(notes).toHaveCSS("resize", "none");
  await page.keyboard.press("Tab");
  await expect(notes).not.toBeFocused();
  await context.close();
});

for (const binding of bindings) test(`Strata ${binding} surfaces and status components expose their roles, names and values`, async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await page.goto(`/ui-${binding}.html`);
  await page.waitForFunction(() => window.strataBinding);
  const main = page.locator("main");

  // Panel: a region named by its title, at the floating level; Card: an article named by its title, with a footer.
  const panel = main.getByRole("region", { name: "Status" });
  await expect(panel).toHaveAttribute("data-strata-elevation", "floating");
  const card = panel.getByRole("article", { name: "Latency" });
  await expect(card.locator(".ug-card__body")).toHaveText("p95 is 41 ms.");
  await card.getByRole("button", { name: "Details" }).click();
  // Dividers are separators; the vertical one says so.
  await expect(page.locator("#rule")).toHaveRole("separator");
  await expect(page.locator("#vertical-rule")).toHaveAttribute("aria-orientation", "vertical");
  // ButtonGroup: a named group, vertical by class only.
  const view = main.getByRole("group", { name: "View" });
  await expect(view).toHaveClass("ug-button-group ug-button-group--vertical");
  await expect(view.getByRole("button")).toHaveCount(2);
  // Badge: a count above the limit reads 99+ and keeps the full number for assistive technology.
  await expect(page.locator("#inbox")).toHaveText("99+ (120)");
  expect(await page.locator("#inbox .ug-badge__full").evaluate(element => element.getBoundingClientRect().width)).toBeLessThanOrEqual(1);
  await expect(page.locator("#few")).toHaveText("7");
  // Spinner: a status that announces its label; inside a busy button it is hidden and has no role.
  // (A status takes no name from its content; its content is what the live region announces.)
  // (MessageBars elsewhere on the page are statuses too, so the Spinner's is looked for in its panel.)
  await expect(panel.getByRole("status")).toHaveText("Loading results");
  const saving = page.locator("#saving");
  await expect(saving).toHaveAttribute("aria-busy", "true");
  await expect(saving.locator(".ug-spinner")).not.toHaveAttribute("role");
  await expect(panel.getByRole("status")).toHaveCount(1);
  // ProgressBar: named by its Field label with a value; the indeterminate bar has no value.
  const upload = main.getByRole("progressbar", { name: "Upload" });
  await expect(upload).toHaveAttribute("value", "40");
  expect(await upload.evaluate(element => element.position)).toBeCloseTo(0.4, 5);
  const sync = main.getByRole("progressbar", { name: "Syncing" });
  expect(await sync.evaluate(element => [element.hasAttribute("value"), element.position])).toEqual([false, -1]);
  await context.close();
});

for (const binding of bindings) test(`Strata ${binding} Tabs follow their value, report changes and take the arrow keys`, async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await page.goto(`/ui-${binding}.html`);
  await page.waitForFunction(() => window.strataBinding);
  const list = page.getByRole("tablist", { name: "Preferences" });
  const selected = () => page.evaluate(() => ({ value: window.strataBinding.tab, tab: document.querySelector("#live-tabs-tab-general")?.closest("[role='tablist']").querySelector("[aria-selected='true']")?.id,
    panels: [...document.querySelectorAll("[id^='live-tabs-panel-']")].filter(panel => !panel.hidden).map(panel => panel.id) }));
  expect(await selected()).toEqual({ value: "general", tab: "live-tabs-tab-general", panels: ["live-tabs-panel-general"] });
  // A click selects through onChange (v-model); the controlled value drives the markup.
  await list.getByRole("tab", { name: "Privacy" }).click();
  expect(await selected()).toEqual({ value: "privacy", tab: "live-tabs-tab-privacy", panels: ["live-tabs-panel-privacy"] });
  await expect(page.getByRole("tabpanel", { name: "Privacy" })).toHaveText("Privacy settings.");
  // Arrows move focus and select, skipping the disabled tab; End and Home too.
  await page.keyboard.press("ArrowRight");
  await expect(list.getByRole("tab", { name: "Help" })).toBeFocused();
  expect(await selected()).toEqual({ value: "help", tab: "live-tabs-tab-help", panels: ["live-tabs-panel-help"] });
  await page.keyboard.press("Home");
  await expect(list.getByRole("tab", { name: "General" })).toBeFocused();
  expect((await selected()).value).toBe("general");
  await page.keyboard.press("End");
  expect((await selected()).value).toBe("help");
  // Only the selected tab is in the tab order.
  expect(await list.getByRole("tab").evaluateAll(tabs => tabs.map(tab => tab.tabIndex))).toEqual([-1, -1, -1, 0]);
  // Setting the value from outside selects that tab.
  await page.evaluate(() => window.strataBinding.setTab("privacy"));
  await expect(list.getByRole("tab", { name: "Privacy" })).toHaveAttribute("aria-selected", "true");
  // Vertical with manual activation: Down moves focus, Enter selects.
  const manual = page.getByRole("tablist", { name: "Manual" });
  await expect(manual).toHaveAttribute("aria-orientation", "vertical");
  await manual.getByRole("tab", { name: "One" }).focus();
  await page.keyboard.press("ArrowDown");
  await expect(manual.getByRole("tab", { name: "Two" })).toBeFocused();
  await expect(manual.getByRole("tab", { name: "Two" })).toHaveAttribute("aria-selected", "false");
  await page.keyboard.press("Enter");
  await expect(manual.getByRole("tab", { name: "Two" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel", { name: "Two" })).toHaveText("Second.");
  await context.close();
});

for (const binding of bindings) test(`Strata ${binding} Accordion reports and follows its sections' open state`, async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await page.goto(`/ui-${binding}.html`);
  await page.waitForFunction(() => window.strataBinding);
  const state = () => page.evaluate(() => ({ faq: window.strataBinding.faq, open: ["delivery", "warranty", "first", "second"].map(id => document.getElementById(id).open) }));
  expect(await state()).toEqual({ faq: { delivery: false, warranty: true }, open: [false, true, true, false] });
  // Exclusive: opening Delivery closes Warranty natively, and both changes are reported (v-model:open).
  await page.locator("#delivery summary").click();
  await expect.poll(state).toEqual({ faq: { delivery: true, warranty: false }, open: [true, false, true, false] });
  // Controlled: setting the state from outside opens a section.
  await page.evaluate(() => window.strataBinding.setFaq({ delivery: false, warranty: true }));
  await expect.poll(state).toEqual({ faq: { delivery: false, warranty: true }, open: [false, true, true, false] });
  // Uncontrolled, without a name: sections open independently, and stay as the user left them.
  await page.locator("#second summary").click();
  await page.locator("#first summary").click();
  await expect.poll(state).toEqual({ faq: { delivery: false, warranty: true }, open: [false, true, false, true] });
  // The exclusive accordion's sections share one generated name; the other has none.
  const names = await page.evaluate(() => ["delivery", "warranty", "first"].map(id => document.getElementById(id).getAttribute("name")));
  expect(names[0]).toMatch(/^accordion-/);
  expect(names[1]).toBe(names[0]);
  expect(names[2]).toBeNull();
  await context.close();
});

for (const binding of bindings) test(`Strata ${binding} List rows are links, buttons or static, and the whole row is the target`, async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await page.goto(`/ui-${binding}.html`);
  await page.waitForFunction(() => window.strataBinding);
  const list = page.getByRole("list", { name: "Folders" });
  await expect(list.getByRole("listitem")).toHaveCount(4);
  // A link row: named by its content, current, and followed by a click.
  const inbox = list.getByRole("link", { name: "Inbox 12 unread Now" });
  await expect(inbox).toHaveAttribute("aria-current", "page");
  await inbox.click();
  await expect(page).toHaveURL(/#inbox$/);
  // A button row fills the row: a click at its far end presses it, and so do Enter and Space.
  const archive = page.locator("#archive-row .ug-list__action");
  const row = await page.locator("#archive-row").boundingBox(), action = await archive.boundingBox();
  expect(Math.abs(row.width - action.width)).toBeLessThanOrEqual(1);
  expect(action.height).toBeGreaterThanOrEqual(24);
  await page.mouse.click(action.x + action.width - 4, action.y + action.height / 2);
  await archive.focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Space");
  await expect.poll(() => page.evaluate(() => window.strataBinding.rows)).toEqual({ archive: 3, locked: 0 });
  // A disabled button row does nothing; a static row is not focusable.
  await page.locator("#locked-row .ug-list__action").click({ force: true });
  await expect(page.locator("#locked-row .ug-list__action")).toBeDisabled();
  expect(await page.evaluate(() => window.strataBinding.rows.locked)).toBe(0);
  expect(await page.locator("#storage-row").evaluate(row => row.querySelectorAll("a, button, [tabindex]").length)).toBe(0);
  await context.close();
});

for (const binding of bindings) test(`Strata ${binding} Table sorts its rows from its header buttons, and follows a controlled order`, async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await page.goto(`/ui-${binding}.html`);
  await page.waitForFunction(() => window.strataBinding);
  const table = page.getByRole("table", { name: "Payments" });
  const column = index => table.locator("tbody tr").evaluateAll((rows, at) => rows.map(row => row.children[at].textContent), index);
  const sorted = () => table.locator("th").evaluateAll(headers => headers.map(header => header.getAttribute("aria-sort")));
  // Unsorted: the rows in the order given, no aria-sort.
  expect(await column(0)).toEqual(["1003", "1001", "1002"]);
  expect(await sorted()).toEqual([null, null, null]);
  // A click sorts ascending; a second click reverses it.
  await table.getByRole("button", { name: "Number" }).click();
  expect(await column(0)).toEqual(["1001", "1002", "1003"]);
  expect(await sorted()).toEqual(["ascending", null, null]);
  await table.getByRole("button", { name: "Number" }).click();
  expect(await column(0)).toEqual(["1003", "1002", "1001"]);
  expect(await sorted()).toEqual(["descending", null, null]);
  // The keyboard: Enter and Space on another column's button sort by it, by value for a numeric column.
  await table.getByRole("button", { name: "Amount" }).focus();
  await page.keyboard.press("Enter");
  expect(await column(2)).toEqual(["42", "87.5", "120"]);
  expect(await sorted()).toEqual([null, null, "ascending"]);
  await page.keyboard.press("Space");
  expect(await column(2)).toEqual(["120", "87.5", "42"]);
  await table.getByRole("button", { name: "Customer" }).click();
  expect(await column(1)).toEqual(["Ada Lovelace", "Alan Turing", "Grace Hopper"]);
  // Cells are associated with their column headers; the table is named by its caption.
  await expect(table.getByRole("columnheader", { name: "Customer" })).toHaveAttribute("scope", "col");
  await expect(table.getByRole("cell", { name: "Ada Lovelace" })).toBeVisible();
  // Controlled: a click reports the next order (onSortChange, v-model:sort) and the table shows the rows as given.
  const controlled = page.getByRole("table", { name: "Controlled" });
  await controlled.getByRole("button", { name: "Amount" }).click();
  expect(await page.evaluate(() => window.strataBinding.sort)).toEqual({ key: "amount", direction: "ascending" });
  expect(await controlled.locator("th").evaluateAll(headers => headers.map(header => header.getAttribute("aria-sort")))).toEqual([null, null, "ascending"]);
  expect(await controlled.locator("tbody tr td:first-child").allTextContents()).toEqual(["1003", "1001", "1002"]);
  await page.evaluate(() => window.strataBinding.setSort({ key: "number", direction: "descending" }));
  await expect(controlled.locator("th").first()).toHaveAttribute("aria-sort", "descending");
  await context.close();
});

for (const binding of bindings) test(`Strata ${binding} Breadcrumb is a named landmark of links, the last one the current page`, async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await page.goto(`/ui-${binding}.html`);
  await page.waitForFunction(() => window.strataBinding);
  const nav = page.locator("#live-breadcrumb");
  await expect(nav).toHaveRole("navigation");
  await expect(nav).toHaveAccessibleName("Breadcrumb");
  await expect(nav.getByRole("listitem")).toHaveCount(3);
  await expect(nav.getByRole("link")).toHaveText(["Home", "Reports", "Latency"]);
  await expect(nav.getByRole("link", { name: "Latency" })).toHaveAttribute("aria-current", "page");
  await expect(nav.getByRole("link", { name: "Reports" })).not.toHaveAttribute("aria-current");
  // The separators are drawn by CSS and are not read: the accessibility tree has only the links.
  expect(await nav.ariaSnapshot()).not.toMatch(/- text:/);
  // Each link is at least the target size, and a click follows it.
  expect((await nav.getByRole("link", { name: "Home" }).boundingBox()).height).toBeGreaterThanOrEqual(24);
  await nav.getByRole("link", { name: "Reports" }).click();
  await expect(page).toHaveURL(/#reports$/);
  await context.close();
});

for (const binding of bindings) test(`Strata ${binding} Avatar shows initials named by the name, sizes with the size, and hides when decorative`, async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await page.goto(`/ui-${binding}.html`);
  await page.waitForFunction(() => window.strataBinding);
  // Initials: the first letters of the first and last words; the name is what is read.
  await expect(page.locator("#avatar-small")).toHaveText("AL");
  await expect(page.locator("#avatar-medium")).toHaveText("P");
  await expect(page.locator("#avatar-large")).toHaveText("GH");
  await expect(page.locator("#avatar-small")).toHaveRole("img");
  await expect(page.locator("#avatar-small")).toHaveAccessibleName("Ada Lovelace");
  await expect(page.getByRole("img", { name: "Plato" })).toHaveCount(1);
  // Decorative: not in the accessibility tree; the name beside it is read once.
  await expect(page.locator("#avatar-decorative")).toHaveAttribute("aria-hidden", "true");
  await expect(page.getByRole("img", { name: "Alan Turing" })).toHaveCount(0);
  // Round coins, 1.6 × the indicator: 25.6, 32 and 38.4 px across.
  const sizes = await page.evaluate(() => ["small", "medium", "large"].map(size => {
    const element = document.getElementById(`avatar-${size}`), box = element.getBoundingClientRect();
    return [Math.round(box.width * 10) / 10, Math.round(box.height * 10) / 10, getComputedStyle(element).borderRadius];
  }));
  expect(sizes).toEqual([[25.6, 25.6, "50%"], [32, 32, "50%"], [38.4, 38.4, "50%"]]);
  await context.close();
});

for (const binding of bindings) test(`Strata ${binding} Chip is a tag, a filter that follows its state, or removable through its named button`, async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await page.goto(`/ui-${binding}.html`);
  await page.waitForFunction(() => window.strataBinding);
  // A tag is its text, and not focusable.
  await expect(page.locator("#tag-chip")).toHaveText("Design");
  expect(await page.locator("#tag-chip").evaluate(chip => chip.localName)).toBe("span");
  // A filter chip is a toggle button that reports its state, by click and by Space.
  const remote = page.getByRole("button", { name: "Remote" });
  await expect(remote).toHaveAttribute("aria-pressed", "false");
  await remote.click();
  await expect(remote).toHaveAttribute("aria-pressed", "true");
  expect((await page.evaluate(() => window.strataBinding.chips)).remote).toBe(true);
  await page.keyboard.press("Space");
  await expect(remote).toHaveAttribute("aria-pressed", "false");
  expect((await remote.boundingBox()).height).toBeGreaterThanOrEqual(24);
  // A disabled filter chip does nothing.
  await page.locator("#locked-chip").click({ force: true });
  await expect(page.locator("#locked-chip")).toHaveAttribute("aria-pressed", "false");
  // A removable chip: its remove button is named by the label, and Enter asks for removal.
  const remove = page.getByRole("button", { name: "Remove ada@example.com" });
  await remove.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#ada-chip")).toHaveCount(0);
  expect((await page.evaluate(() => window.strataBinding.chips)).removed).toEqual(["ada"]);
  await context.close();
});

for (const binding of bindings) test(`Strata ${binding} Skeleton placeholders are hidden, sized by shape, and shimmer unless motion is reduced`, async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await page.goto(`/ui-${binding}.html`);
  await page.waitForFunction(() => window.strataBinding);
  // Hidden from the accessibility tree; the region says it is busy.
  await expect(page.locator("#loading-region")).toHaveAttribute("aria-busy", "true");
  expect(await page.locator("#loading-region").ariaSnapshot()).toBe("");
  // A circle is an avatar's size; two text lines, the last one 60% wide.
  const shapes = await page.evaluate(() => {
    const circle = document.getElementById("skeleton-circle").getBoundingClientRect(), lines = [...document.querySelectorAll("#skeleton-lines .ug-skeleton")].map(line => line.getBoundingClientRect().width);
    return { circle: [circle.width, circle.height], ratio: Math.round((lines[1] / lines[0]) * 100) };
  });
  expect(shapes).toEqual({ circle: [32, 32], ratio: 60 });
  // The shimmer runs; under reduced motion it stops.
  expect(await page.locator("#skeleton-circle").evaluate(element => getComputedStyle(element).animationName)).toBe("ug-skeleton-shimmer");
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(await page.locator("#skeleton-circle").evaluate(element => [getComputedStyle(element).animationName, getComputedStyle(element).backgroundImage])).toEqual(["none", "none"]);
  await context.close();
});

for (const binding of bindings) test(`Strata ${binding} MessageBar announces by intent, and its actions and dismiss button work`, async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await page.goto(`/ui-${binding}.html`);
  await page.waitForFunction(() => window.strataBinding);
  // The role follows the intent: polite for information and success, assertive for warnings and errors.
  const roles = await page.evaluate(() => ["info", "success", "warning", "danger"].map(intent => document.getElementById(`message-${intent}`).getAttribute("role")));
  expect(roles).toEqual(["status", "status", "alert", "alert"]);
  // Each intent has its own stripe colour and icon shape.
  const looks = await page.evaluate(() => ["info", "success", "warning", "danger"].map(intent => {
    const icon = document.querySelector(`#message-${intent} .ug-message-bar__icon`), style = getComputedStyle(icon);
    return `${style.backgroundColor}|${style.maskImage.length}|${style.maskImage.slice(-60)}`;
  }));
  expect(new Set(looks).size).toBe(4);
  // The action is an ordinary button; the dismiss button is named, and Enter asks for dismissal.
  const live = page.locator("#message-live");
  await expect(live).toHaveRole("alert");
  await live.getByRole("button", { name: "Retry" }).click();
  expect((await page.evaluate(() => window.strataBinding.messages)).upgrades).toBe(1);
  await live.getByRole("button", { name: "Dismiss" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#message-live")).toHaveCount(0);
  await context.close();
});

for (const binding of bindings) test(`Strata ${binding} Pagination moves between pages with its keys, and disables Previous and Next at the ends`, async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await page.goto(`/ui-${binding}.html`);
  await page.waitForFunction(() => window.strataBinding);
  const nav = page.locator("#live-pagination");
  const shown = () => nav.locator(".ug-pagination__item").evaluateAll(items => items.map(item => item.textContent || (item.querySelector(".ug-pagination__link--previous") ? "<" : ">")).join(" "));
  await expect(nav).toHaveRole("navigation");
  await expect(nav).toHaveAccessibleName("Pagination");
  expect(await shown()).toBe("< 1 2 3 4 5 … 12 >");
  await expect(nav.getByRole("button", { name: "Page 1", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(nav.getByRole("button", { name: "Previous page" })).toBeDisabled();
  // A click on a page, and Enter on Next, move through onPageChange (v-model:page).
  await nav.getByRole("button", { name: "Page 5", exact: true }).click();
  expect(await page.evaluate(() => window.strataBinding.page)).toBe(5);
  expect(await shown()).toBe("< 1 … 4 5 6 … 12 >");
  await nav.getByRole("button", { name: "Next page" }).focus();
  await page.keyboard.press("Enter");
  expect(await page.evaluate(() => window.strataBinding.page)).toBe(6);
  await expect(nav.getByRole("button", { name: "Page 6", exact: true })).toHaveAttribute("aria-current", "page");
  // At the last page, Next is disabled.
  await page.evaluate(() => window.strataBinding.setPage(12));
  await expect(nav.getByRole("button", { name: "Next page" })).toBeDisabled();
  expect(await shown()).toBe("< 1 … 8 9 10 11 12 >");
  // The skipped runs are hidden; the keys are at least the target size.
  expect(await nav.locator("[aria-hidden='true']").count()).toBe(1);
  expect((await nav.getByRole("button", { name: "Page 1", exact: true }).boundingBox()).height).toBeGreaterThanOrEqual(24);
  await context.close();
});

for (const binding of bindings) test(`Strata ${binding} Toolbar is one tab stop, with the arrows, Home and End between its controls`, async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await page.goto(`/ui-${binding}.html`);
  await page.waitForFunction(() => window.strataBinding);
  const toolbar = page.getByRole("toolbar", { name: "Editing" });
  const focused = () => page.evaluate(() => document.activeElement?.id);
  // Tab enters on the first control; once inside, the toolbar is one stop: Tab leaves it.
  await page.locator("#live-toolbar").evaluate(element => element.previousElementSibling?.focus?.());
  await page.locator("#tool-cut").focus();
  expect(await focused()).toBe("tool-cut");
  await page.keyboard.press("Tab");
  expect(await page.evaluate(() => !document.activeElement?.closest("#live-toolbar"))).toBe(true);
  await page.keyboard.press("Shift+Tab");
  expect(await focused()).toBe("tool-cut");
  // Right skips the disabled Copy but not the aria-disabled Paste, and wraps; Left, Home and End.
  await page.keyboard.press("ArrowRight");
  expect(await focused()).toBe("tool-paste");
  await page.keyboard.press("ArrowRight");
  expect(await focused()).toBe("tool-wrap");
  await page.keyboard.press("ArrowRight");
  expect(await focused()).toBe("tool-cut");
  await page.keyboard.press("ArrowLeft");
  expect(await focused()).toBe("tool-wrap");
  await page.keyboard.press("Home");
  expect(await focused()).toBe("tool-cut");
  await page.keyboard.press("End");
  expect(await focused()).toBe("tool-wrap");
  // The control last focused is the tab stop: leave and come back.
  await page.keyboard.press("Space");
  await expect(page.locator("#tool-wrap")).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Shift+Tab");
  expect(await focused()).toBe("tool-wrap");
  await expect(toolbar).toHaveAttribute("aria-label", "Editing");
  await context.close();
});

for (const binding of bindings) test(`Strata ${binding} AppBar is the banner landmark, with its controls at its ends and a title that truncates`, async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await page.goto(`/ui-${binding}.html`);
  await page.waitForFunction(() => window.strataBinding);
  const bar = page.getByRole("banner");
  await expect(bar).toHaveCount(1);
  await expect(bar).toHaveAttribute("id", "live-app-bar");
  await expect(bar.locator(".ug-app-bar__title")).toHaveText("Strata check");
  await bar.getByRole("button", { name: "Sign in" }).click();
  expect(await page.evaluate(() => window.strataBinding.appBar)).toBe(1);
  // The start control comes first and the end control last; the title takes the space between and does not wrap.
  const layout = await bar.evaluate(element => {
    const start = element.querySelector(".ug-app-bar__start").getBoundingClientRect(), title = element.querySelector(".ug-app-bar__title"),
      end = element.querySelector(".ug-app-bar__end").getBoundingClientRect();
    title.textContent = "A very long title ".repeat(20);
    const box = title.getBoundingClientRect();
    return { order: start.right <= box.left && box.right <= end.left, oneLine: box.height < 40, truncated: title.scrollWidth > title.clientWidth };
  });
  expect(layout).toEqual({ order: true, oneLine: true, truncated: true });
  await context.close();
});

for (const binding of bindings) test(`Strata ${binding} Tooltip describes its trigger, shows on hover and focus above it, and hides on leave and Escape`, async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await page.goto(`/ui-${binding}.html`);
  await page.waitForFunction(() => window.strataBinding);
  const share = page.locator("#share"), tip = page.locator("#share-tip");
  // The trigger is described by the tooltip, which is portalled to the body.
  await expect(share).toHaveAccessibleDescription("Shares this page with your team");
  expect(await tip.evaluate(element => element.parentElement === document.body)).toBe(true);
  await expect(tip).toBeHidden();
  // Hover: shown after the delay, above the trigger and centred on it.
  await share.hover();
  await expect(tip).toBeVisible();
  const [a, t] = [await share.boundingBox(), await tip.boundingBox()];
  expect(t.y + t.height).toBeLessThanOrEqual(a.y);
  expect(Math.abs(t.x + t.width / 2 - (a.x + a.width / 2))).toBeLessThanOrEqual(1);
  // The pointer can move onto the tooltip without hiding it; leaving both hides it.
  await page.mouse.move(t.x + t.width / 2, t.y + t.height / 2, { steps: 4 });
  await page.waitForTimeout(250);
  await expect(tip).toBeVisible();
  await page.mouse.move(5, 5);
  await expect(tip).toBeHidden();
  // Keyboard focus shows it at once; Escape hides it and keeps focus.
  await page.locator("#share").evaluate(element => element.blur());
  await page.keyboard.press("Tab");
  await share.focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  await expect(share).toBeFocused();
  await expect(tip).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(tip).toBeHidden();
  await expect(share).toBeFocused();
  await context.close();
});

for (const binding of bindings) test(`Strata ${binding} toasts appear in the status region outside the app, go after their time unless hovered, and act and dismiss`, async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await page.goto(`/ui-${binding}.html`);
  await page.waitForFunction(() => window.strataBinding);
  const region = page.getByRole("region", { name: "Notifications" });
  const toasts = page.locator(".ug-toast");
  await page.locator("#notify").click();
  await expect(toasts).toHaveCount(1);
  // In the top layer, at the end of the body outside the app, inside the persistent status list.
  expect(await page.evaluate(() => { const section = document.querySelector(".ug-toast-region");
    return { open: section.matches(":popover-open"), parent: section.parentElement === document.body, outside: !document.getElementById("root").contains(section),
      status: section.querySelector("[role='status']").contains(document.querySelector(".ug-toast")) }; })).toEqual({ open: true, parent: true, outside: true, status: true });
  await expect(region).toBeVisible();
  // It goes by itself after its time (1.5 s), and the region is hidden when it is empty.
  await expect(toasts).toHaveCount(0, { timeout: 4000 });
  await expect(region).toBeHidden();
  // Hovering stops the time.
  await page.locator("#notify").click();
  const box = await toasts.first().boundingBox();
  await page.mouse.move(box.x + 10, box.y + box.height / 2);
  await page.waitForTimeout(2500);
  await expect(toasts).toHaveCount(1);
  // The action runs and dismisses it.
  await toasts.first().getByRole("button", { name: "Undo" }).click();
  await expect(toasts).toHaveCount(0);
  expect(await page.evaluate(() => window.strataBinding.toasts)).toBe(1);
  // A fourth toast dismisses the oldest; the dismiss button dismisses one.
  await page.mouse.move(5, 5);
  for (let index = 0; index < 4; index++) await page.locator("#notify").click();
  await expect(toasts).toHaveCount(3);
  await toasts.first().getByRole("button", { name: "Dismiss" }).click();
  await expect(toasts).toHaveCount(2);
  await context.close();
});

for (const binding of bindings) test(`Strata ${binding} Rating is set by click and arrow keys, fills up to its score, submits it, and its display is named by it`, async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await page.goto(`/ui-${binding}.html`);
  await page.waitForFunction(() => window.strataBinding);
  await page.locator("#live-rating").scrollIntoViewIfNeeded();
  const group = page.getByRole("group", { name: "Quality" });
  const star = name => group.getByRole("radio", { name, exact: true });
  await expect(star("3 stars")).toBeChecked();
  const display = page.getByRole("img", { name: "3 out of 5 stars" });
  await expect(display).toBeVisible();
  // Filled stars follow the score: the first three use the accent, the rest the edge colour.
  const fills = () => page.locator("#live-rating .ug-rating__star").evaluateAll(stars => stars.map(star => getComputedStyle(star, "::before").backgroundColor));
  const [accent, edge] = await page.evaluate(() => { const style = getComputedStyle(document.querySelector("#live-rating")); return [style.getPropertyValue("--strata-colour-accent"), style.getPropertyValue("--strata-colour-edge")]; });
  const filled = await fills();
  expect(new Set(filled.slice(0, 3)).size).toBe(1);
  expect(filled[3]).not.toBe(filled[0]);
  expect(filled[3]).toBe(filled[4]);
  expect(accent && edge).toBeTruthy();
  // A real click on the fifth star; the pointer leaves so no hover preview remains.
  const fifth = await page.locator("#live-rating .ug-rating__item").nth(4).boundingBox();
  await page.mouse.click(fifth.x + fifth.width / 2, fifth.y + fifth.height / 2);
  await page.mouse.move(5, 5);
  await expect(star("5 stars")).toBeChecked();
  expect(await page.evaluate(() => window.strataBinding.score)).toBe(5);
  await expect(page.getByRole("img", { name: "5 out of 5 stars" })).toBeVisible();
  expect(new Set(await fills()).size).toBe(1);
  // Arrow keys change the score by one, natively.
  await page.keyboard.press("ArrowLeft");
  await expect(star("4 stars")).toBeChecked();
  expect(await page.evaluate(() => window.strataBinding.score)).toBe(4);
  expect(await page.evaluate(() => new FormData(document.getElementById("score-form")).get("quality"))).toBe("4");
  // Each star is a 24 px target.
  for (const box of await page.locator("#live-rating .ug-rating__item").evaluateAll(items => items.map(item => item.getBoundingClientRect().toJSON()))) {
    expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(24);
  }
  await context.close();
});
