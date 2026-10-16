/**
 * Browser test of the Strata Tier A bindings, run against `@underglass/ui/react` (page `ui-react.html`) and
 * `@underglass/ui/vue` (page `ui-vue.html`), which render the same components with the same ids, names and state,
 * with no Underglass:
 * - each component renders exactly the markup example on its anatomy page (`docs/ui-library/components`), compared
 *   as canonical DOM (tags, attributes, class sets and text);
 * - real pointer and keyboard input on every control, with Field state, refs and attribute passthrough;
 * - roles, names and values of the surfaces and status components;
 * - StrataProvider applies a theme and StrataScope a scope; axe finds no violations in the light and dark themes.
 */
import { test, expect } from "../helpers/current-browser.mjs";
import AxeBuilder from "@axe-core/playwright";
import { canonicalScript, expectContracts } from "../helpers/strata-contract.mjs";

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
  await expect(main.getByRole("status")).toHaveText("Loading results");
  const saving = page.locator("#saving");
  await expect(saving).toHaveAttribute("aria-busy", "true");
  await expect(saving.locator(".ug-spinner")).not.toHaveAttribute("role");
  await expect(main.getByRole("status")).toHaveCount(1);
  // ProgressBar: named by its Field label with a value; the indeterminate bar has no value.
  const upload = main.getByRole("progressbar", { name: "Upload" });
  await expect(upload).toHaveAttribute("value", "40");
  expect(await upload.evaluate(element => element.position)).toBeCloseTo(0.4, 5);
  const sync = main.getByRole("progressbar", { name: "Syncing" });
  expect(await sync.evaluate(element => [element.hasAttribute("value"), element.position])).toEqual([false, -1]);
  await context.close();
});
