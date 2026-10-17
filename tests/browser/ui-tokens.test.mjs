/**
 * Browser test of the generated Strata token stylesheet (`@underglass/ui/css/tokens.css`, page `ui-tokens.html`):
 * depth-blended tokens computed by CSS match the token runtime at every depth and in nested scopes, the light
 * vector and shadow offset follow the light angles, themes switch by attribute and by media preference
 * (`prefers-color-scheme`, `prefers-contrast`), theme overrides of blended tokens reset in nested themes, and
 * density sets the control height. CSS only; no GPU is involved.
 */
import { test, expect } from "../helpers/current-browser.mjs";

const scope = (style, attributes = {}) => ({ attributes: { "data-strata-scope": "", ...attributes }, style });

test("the Strata token stylesheet computes depth, light, themes and density", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 900, height: 600 }, colorScheme: "light" });
  const page = await context.newPage();
  await page.goto("/ui-tokens.html");
  await page.waitForFunction(() => window.strataTokenCheck);
  const evaluate = (expression, options) => page.evaluate(([e, o]) => window.strataTokenCheck.evaluate(e, o), [expression, options]);
  const resolved = options => page.evaluate(o => window.strataTokenCheck.resolve(o), options);
  const variable = path => `var(--strata-${path.split(".").map(part => part.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)).join("-")})`;

  // Depth blending in CSS equals the runtime's blend, at each depth, for lengths and numbers (layout rounds lengths to
  // 1/64 px, so lengths compare to 0.05 px).
  for (const depth of [0, 0.25, 0.5, 0.8, 1]) {
    const expected = await resolved({ depth });
    for (const path of ["elevation.raised", "elevation.modal", "object.keyHeight", "bevel.width"]) {
      expect(await evaluate(variable(path), { scopes: [scope(`--strata-depth: ${depth}`)] }), `${path} at depth ${depth}`).toBeCloseTo(Number.parseFloat(expected[path]), 1);
    }
    for (const path of ["shadow.strength", "bevel.gain"]) {
      expect(await evaluate(variable(path), { kind: "number", scopes: [scope(`--strata-depth: ${depth}`)] }), `${path} at depth ${depth}`).toBeCloseTo(expected[path], 2);
    }
  }
  // The root defaults to 50%, and a nested scope blends at its own depth, not its parent's.
  expect(await evaluate(variable("elevation.raised"))).toBeCloseTo(3, 2);
  expect(await evaluate(variable("elevation.raised"), { scopes: [scope("--strata-depth: 1"), scope("--strata-depth: 0")] })).toBeCloseTo(2, 2);
  // `data-strata-depth` sets depth from the attribute where typed attr() is supported.
  if (await page.evaluate(() => CSS.supports("x: attr(x type(*))"))) {
    expect(await evaluate(variable("elevation.raised"), { scopes: [{ attributes: { "data-strata-depth": "1" } }] })).toBeCloseTo(5, 2);
  }

  // The light vector and the shadow offset per pixel of height follow the light angles (default 323°, 41°). The
  // light is application-only, so it is set on the root, and a scope cannot change it.
  const light = (azimuth, elevation) => { const a = azimuth * Math.PI / 180, e = elevation * Math.PI / 180; return [Math.sin(a) * Math.cos(e), -Math.cos(a) * Math.cos(e), Math.sin(e)]; };
  for (const [azimuth, elevation] of [[323, 41], [230, 46], [90, 20]]) {
    await page.evaluate(([a, e]) => { document.documentElement.style.setProperty("--strata-light-azimuth", a); document.documentElement.style.setProperty("--strata-light-elevation", e); }, [String(azimuth), String(elevation)]);
    const [x, y, z] = light(azimuth, elevation);
    const at = expression => evaluate(expression, { kind: "number", scopes: [scope("--strata-light-azimuth: 0")] });
    // Shifted by 2 so negative components stay measurable as widths.
    expect(await at("(var(--strata-light-x) + 2)") - 2, `light x at ${azimuth}°`).toBeCloseTo(x, 3);
    expect(await at("(var(--strata-light-y) + 2)") - 2, `light y at ${azimuth}°`).toBeCloseTo(y, 3);
    expect(await at("var(--strata-light-z)"), `light z at ${elevation}°`).toBeCloseTo(z, 3);
    expect(await at("(var(--strata-shadow-dx) + 10)") - 10, `shadow dx at ${azimuth}°`).toBeCloseTo(-x / z, 3);
    expect(await at("(var(--strata-shadow-dy) + 10)") - 10, `shadow dy at ${azimuth}°`).toBeCloseTo(-y / z, 3);
  }

  // Themes by attribute, nested themes, and derived on-colours.
  const panel = theme => evaluate(variable("colour.panel"), { kind: "colour", scopes: theme ? [{ attributes: { "data-strata-theme": theme } }] : [] });
  expect(await panel()).toBe("rgb(233, 235, 239)");
  expect(await panel("dark")).toBe("rgb(44, 48, 56)");
  expect(await panel("contrast")).toBe("rgb(255, 255, 255)");
  expect(await panel("contrast-dark")).toBe("rgb(0, 0, 0)");
  expect(await evaluate(variable("colour.panel"), { kind: "colour", scopes: [{ attributes: { "data-strata-theme": "dark" } }, { attributes: { "data-strata-theme": "light" } }] })).toBe("rgb(233, 235, 239)");
  expect(await evaluate(variable("colour.on-accent"), { kind: "colour" })).toBe("rgb(255, 255, 255)");
  expect(await evaluate(variable("colour.on-accent"), { kind: "colour", scopes: [{ attributes: { "data-strata-theme": "dark" } }] })).toBe("rgb(16, 18, 22)");
  // Material colours alias the colour roles, so they follow the theme of their subtree.
  expect(await evaluate(variable("material.presets.matte.base.colour"), { kind: "colour", scopes: [{ attributes: { "data-strata-theme": "dark" } }] })).toBe("rgb(44, 48, 56)");
  // High contrast drops the bevel gain to 0; a light subtree inside it gets the blended gain back.
  expect(await evaluate(variable("bevel.gain"), { kind: "number", scopes: [{ attributes: { "data-strata-theme": "contrast" } }] })).toBeCloseTo(0, 3);
  expect(await evaluate(variable("bevel.gain"), { kind: "number", scopes: [{ attributes: { "data-strata-theme": "contrast" } }, { attributes: { "data-strata-theme": "light" } }] })).toBeCloseTo(0.55, 2);

  // Media preferences pick the root theme when the page fixes none.
  await page.emulateMedia({ colorScheme: "dark" });
  expect(await panel()).toBe("rgb(44, 48, 56)");
  await page.emulateMedia({ colorScheme: "dark", contrast: "more" });
  expect(await panel()).toBe("rgb(0, 0, 0)");
  await page.emulateMedia({ colorScheme: "light", contrast: "more" });
  expect(await panel()).toBe("rgb(255, 255, 255)");
  // A page that fixes the light theme still honours prefers-contrast.
  expect(await panel("light")).toBe("rgb(255, 255, 255)");
  await page.emulateMedia({ colorScheme: "light", contrast: "no-preference" });

  // Density sets the control height, the panel padding and the gaps between controls and between groups.
  expect(await evaluate("var(--strata-control-height)")).toBe(34);
  expect(await evaluate("var(--strata-control-height)", { scopes: [{ attributes: { "data-strata-density": "compact" } }] })).toBe(28);
  expect(await evaluate("var(--strata-panel-padding)", { scopes: [{ attributes: { "data-strata-density": "spacious" } }] })).toBe(24);
  expect(await evaluate("var(--strata-gap-control)")).toBe(12);
  expect(await evaluate("var(--strata-gap-group)")).toBe(20);
  expect(await evaluate("var(--strata-gap-control)", { scopes: [{ attributes: { "data-strata-density": "compact" } }] })).toBe(8);
  expect(await evaluate("var(--strata-gap-group)", { scopes: [{ attributes: { "data-strata-density": "compact" } }] })).toBe(16);
  expect(await evaluate("var(--strata-gap-control)", { scopes: [{ attributes: { "data-strata-density": "spacious" } }] })).toBe(16);
  expect(await evaluate("var(--strata-gap-group)", { scopes: [{ attributes: { "data-strata-density": "spacious" } }] })).toBe(24);
  await context.close();
});
