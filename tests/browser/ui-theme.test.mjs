/**
 * Browser test of the Strata theme runtime (`@underglass/ui/dom`, page `ui-theme.html`): an applied theme
 * restyles the page over the defaults even when its sheet comes first, runtime updates and replacement restyle
 * live, scope overrides apply to their subtree only, application-only and out-of-range overrides are refused, and
 * colour overrides are checked for contrast on the scope's theme with their derived colours set. CSS only.
 */
import { test, expect } from "../helpers/current-browser.mjs";

test("Strata themes apply, update and scope live", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 900, height: 600 }, colorScheme: "light" });
  const page = await context.newPage();
  await page.goto("/ui-theme.html");
  await page.waitForFunction(() => window.strataThemeCheck);
  const check = (name, ...args) => page.evaluate(([n, a]) => window.strataThemeCheck[n](...a), [name, args]);
  const background = id => check("style", id, "background-color");

  // Defaults first; then a theme restyles the application.
  expect(await background("app-button")).toBe("rgb(37, 99, 235)");
  expect(await check("update", { colour: { accent: "#0f766e" }, light: { azimuth: 45 } })).toEqual([]);
  expect(await background("app-button")).toBe("rgb(15, 118, 110)");
  expect(await check("variable", "app-button", "--strata-light-azimuth")).toBe("45");
  // Runtime updates build on the theme in effect.
  expect(await check("update", { depth: 0.9 })).toEqual([]);
  expect(await check("variable", "app-button", "--strata-light-azimuth")).toBe("45");
  expect(await check("variable", "app-button", "--strata-depth")).toBe("0.9");
  // Replacing the theme starts again from the defaults; removing it restores them.
  expect(await check("replace", { colour: { accent: "#7c3aed" } })).toEqual([]);
  expect(await background("app-button")).toBe("rgb(124, 58, 237)");
  expect(await check("variable", "app-button", "--strata-light-azimuth")).toBe("323");
  await check("remove");
  expect(await background("app-button")).toBe("rgb(37, 99, 235)");

  // An invalid update is reported, and the page still gets it (report mode "silent" here; "throw" refuses it).
  const issues = await check("update", { colour: { accent: "#9fd3ff" } });
  expect(issues.map(issue => issue.message).join("; ")).toMatch(/focus colour on the panel/);

  // Scope overrides: depth, theme, density and size reach the subtree only.
  await check("replace", {});
  expect(await check("scope", { depth: 1, theme: "dark", density: "compact", size: "small", material: "gloss", tokens: { "radius.control": 4 } })).toEqual([]);
  expect(await check("attributes")).toMatchObject({ "data-strata-scope": "", "data-strata-theme": "dark", "data-strata-density": "compact", "data-strata-size": "small", "data-strata-material": "gloss" });
  expect(await check("variable", "scope-button", "--strata-depth")).toBe("1");
  expect(await check("style", "scope-button", "border-top-left-radius")).toBe("4px");
  // Compact (28) and small (−6) give 22, held at the 24 px target minimum.
  expect(Number.parseFloat(await check("style", "scope-button", "height"))).toBe(24);
  expect(await background("scope-button")).toBe("rgb(96, 145, 255)");
  expect(await check("style", "scope-check", "width")).toBe("16px");
  // The application outside the scope is unchanged.
  expect(await check("variable", "app-button", "--strata-depth")).toBe("0.5");
  expect(await background("app-button")).toBe("rgb(37, 99, 235)");
  expect(await check("style", "app-button", "border-top-left-radius")).toBe("8px");

  // Refused: light (application-only), out-of-range and unknown tokens, unknown values, and colours without a theme.
  const refused = await check("scope", { tokens: { "light.azimuth": 90, "radius.control": 60, "nope.x": 1 }, density: "dense", colour: { accent: "#0f766e" } });
  const messages = refused.map(({ path, message }) => `${path}: ${message}`);
  for (const expected of ["light.azimuth: is application-only and cannot be overridden in a scope", "radius.control: 60 is above the maximum 20", "nope.x: is not a Strata token", "density: dense is not one of compact, comfortable, spacious", "colour: colour overrides need the scope's theme, to check contrast"]) {
    expect(messages, expected).toContain(expected);
  }
  expect(await check("variable", "scope-button", "--strata-light-azimuth")).toBe("323");
  expect(await check("style", "scope-button", "border-top-left-radius")).toBe("8px");

  // Colours on a themed scope: applied with derived on- and -text colours, and checked for contrast.
  expect(await check("scope", { theme: "light", colour: { accent: "#0f766e" } })).toEqual([]);
  expect(await background("scope-button")).toBe("rgb(15, 118, 110)");
  expect(await check("variable", "scope-button", "--strata-colour-on-accent")).toBe("#ffffff");
  expect(await check("variable", "scope-button", "--strata-colour-accent-text")).toMatch(/^#[0-9a-f]{6}$/);
  const contrast = await check("scope", { theme: "light", colour: { accent: "#b9e6ff" } });
  expect(contrast.map(issue => issue.message).join("; ")).toMatch(/the focus colour on the panel is [\d.]+:1, under 3:1/);
  // Removing the scope removes everything it set.
  await check("clearScope");
  expect(await check("attributes")).toEqual({ id: "scope" });
  expect(await background("scope-button")).toBe("rgb(37, 99, 235)");
  await context.close();
});
