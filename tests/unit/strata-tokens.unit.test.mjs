/**
 * Unit tests for the Strata design tokens (`packages/ui/src/tokens/strata.tokens.json`) and their runtime
 * (`@underglass/ui/tokens`): the source passes every invariant of `docs/ui-library/design-language.md` in every
 * theme, validation catches each kind of broken rule, values resolve by depth and theme, and the generated
 * stylesheet declares every token. Run with `npm run test:unit`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { blend, contrast, cssVariable, flatten, onColour, parseHex, resolve, strataTokens, themesOf, tokensToCss, validateTokens } from "../../packages/ui/src/tokens/index.ts";

const copy = () => structuredClone(strataTokens);
const NS = "dev.underglass.strata";
const messages = source => validateTokens(source).map(({ path, message }) => `${path}: ${message}`);

test("the token source passes every invariant in every theme", () => {
  assert.deepEqual(messages(strataTokens), []);
  assert.deepEqual(Object.keys(themesOf(strataTokens)), ["light", "dark", "contrast", "contrast-dark"]);
  assert.ok(flatten(strataTokens).length > 100, "token count");
});

test("validation reports out-of-range values, anchors, options and missing theme values", () => {
  const source = copy();
  source.depth.$value = 1.5;
  source.object.keyHeight.$extensions[NS].anchors = [4, 9, 12];
  source.bevel.profile.$value = "ogee";
  delete source.colour.edge.$extensions[NS].themes["contrast-dark"];
  const found = messages(source);
  assert.ok(found.includes("depth: default 1.5 is above the maximum 1"), found.join("\n"));
  assert.ok(found.includes("object.keyHeight: the 50% anchor 9 differs from the default"));
  assert.ok(found.includes("bevel.profile: default ogee is not an option"));
  assert.ok(found.includes("colour.edge: has no value for the contrast-dark theme"));
});

test("validation reports text and non-text contrast failures on lit faces", () => {
  const source = copy();
  source.colour.muted.$extensions[NS].themes.light = "#9a9ea8";
  source.colour.edge.$extensions[NS].themes.dark = "#4e5462";
  source.colour.track.$extensions[NS].themes.dark = "#4e5460";
  const found = messages(source).join("\n");
  assert.match(found, /colour \(light\): muted text on the panel at ×1 is [\d.]+:1, under 4.5:1/);
  assert.match(found, /colour \(dark\): the edge on the panel at ×1 is [\d.]+:1, under 3:1/);
  assert.match(found, /colour \(dark\): the accent fill on the track is 2\.\d+:1, under 3:1/);
});

test("validation reports elevation order, the taper rule, unknown presets and scoped light", () => {
  const source = copy();
  source.elevation.floating.$extensions[NS].anchors = [6, 20, 16];
  source.elevation.floating.$value = "20px";
  source.object.taper.$extensions[NS].anchors = [2, 3, 0];
  source.material.roles.knob.$value = "velvet";
  source.light.azimuth.$extensions[NS].scope = true;
  const found = messages(source).join("\n");
  assert.match(found, /elevation: level 3 is not above level 2 at anchor 1/);
  assert.match(found, /object\.taper: must be positive where keys have height \(anchor 2\)/);
  assert.match(found, /material\.roles\.knob: uses an unknown preset velvet/);
  assert.match(found, /light\.azimuth: must be application-only/);
});

test("values resolve by depth and theme", () => {
  assert.equal(blend([2, 3, 5], 0), 2);
  assert.equal(blend([2, 3, 5], 0.25), 2.5);
  assert.equal(blend([2, 3, 5], 0.75), 4);
  const subtle = resolve(strataTokens, { depth: 0 }), bold = resolve(strataTokens, { depth: 1, theme: "dark" });
  assert.equal(subtle["elevation.raised"], "2px");
  assert.equal(bold["elevation.raised"], "5px");
  assert.equal(bold["colour.panel"], "#2c3038");
  assert.equal(resolve(strataTokens, { theme: "contrast" })["bevel.gain"], 0);
  assert.equal(resolve(strataTokens)["light.azimuth"], 323);
});

test("on-colours pick white or near-black, whichever contrasts more", () => {
  assert.deepEqual(onColour(parseHex("#2563eb")), [255, 255, 255]);
  assert.deepEqual(onColour(parseHex("#6091ff")), [16, 18, 22]);
  assert.ok(Math.abs(contrast([0, 0, 0], [255, 255, 255]) - 21) < 1e-9);
});

test("the stylesheet declares every token in a cascade layer, with every theme", () => {
  const css = tokensToCss(strataTokens);
  assert.match(css, /^\/\* @underglass\/ui tokens/);
  assert.match(css, /@layer strata\.tokens \{/);
  for (const token of flatten(strataTokens)) assert.ok(css.includes(`${cssVariable(token.path)}:`), token.path);
  for (const theme of ["dark", "contrast", "contrast-dark"]) assert.ok(css.includes(`[data-strata-theme="${theme}"] {`), theme);
  assert.match(css, /@media \(prefers-color-scheme: dark\)/);
  assert.match(css, /@media \(prefers-contrast: more\) and \(prefers-color-scheme: dark\)/);
  assert.equal(cssVariable("object.keyHeight"), "--strata-object-key-height");
  assert.equal(cssVariable("material.roles.buttonPrimary"), "--strata-material-roles-button-primary");
});

test("derived role text colours reach 4.5:1 on every lit surface in every theme", () => {
  const css = tokensToCss(strataTokens);
  const interior = resolve(strataTokens)["interior.max"];
  for (const theme of Object.keys(themesOf(strataTokens))) {
    const values = resolve(strataTokens, { theme });
    const block = theme === "light" ? css.slice(css.indexOf(':root, [data-strata-theme="light"]')) : css.slice(css.indexOf(`[data-strata-theme="${theme}"] {`));
    for (const role of ["accent", "success", "warning", "danger", "info"]) {
      const hex = block.match(new RegExp(`--strata-colour-${role}-text: (#[0-9a-f]{6});`))[1];
      for (const surface of ["panel", "field", "stage", "secondary"]) {
        for (const factor of [1, 1 + interior, 1 - interior]) {
          const lit = parseHex(values[`colour.${surface}`]).map(channel => Math.min(255, channel * factor));
          assert.ok(contrast(parseHex(hex), lit) >= 4.5, `${theme}: ${role}-text on ${surface} at ×${factor}`);
        }
      }
    }
  }
});

test("validation requires an outline wherever a theme turns the bevel off", () => {
  const source = copy();
  source.outline.width.$extensions[NS].themes["contrast-dark"] = "0px";
  assert.ok(messages(source).includes("outline.width (contrast-dark): must be at least 1 px where the bevel gain is 0"), messages(source).join("; "));
});

test("an application theme applies its changes over the defaults and validates them", async () => {
  const { createStrataTheme, loadStrataTheme, StrataThemeError } = await import("../../packages/ui/src/tokens/index.ts");
  const theme = createStrataTheme({ depth: 0.4, light: { azimuth: 45 }, colour: { accent: "#0f766e" }, roles: { buttonPrimary: "lacquer" } });
  assert.deepEqual(theme.issues, []);
  const values = resolve(theme.source, { depth: 0.4 });
  assert.equal(values.depth, 0.4);
  assert.equal(values["light.azimuth"], 45);
  assert.equal(values["colour.accent"], "#0f766e");
  assert.equal(resolve(theme.source, { theme: "dark" })["colour.accent"], "#6091ff", "a plain colour sets the light theme only");
  assert.equal(values["material.roles.buttonPrimary"], "lacquer");
  // The defaults are untouched, and the theme's stylesheet goes into the theme layer.
  assert.equal(resolve(strataTokens)["light.azimuth"], 323);
  assert.match(theme.css(), /@layer strata\.theme \{/);
  assert.match(theme.css(), /--strata-light-azimuth: 45;/);
  // Serialisation round-trips through JSON.
  const loaded = loadStrataTheme(JSON.parse(JSON.stringify(theme.toJSON())));
  assert.deepEqual(loaded.issues, []);
  assert.equal(resolve(loaded.source)["colour.accent"], "#0f766e");
  // Per-theme colours, explicit tokens (which replace the depth blend) and new anchors.
  const custom = createStrataTheme({ colour: { accent: { light: "#1d4ed8", dark: "#7aa2ff" } }, tokens: { "elevation.raised": "4px" }, anchors: { "object.keyHeight": [3, 6, 10] } });
  assert.deepEqual(custom.issues, []);
  assert.equal(resolve(custom.source, { theme: "dark" })["colour.accent"], "#7aa2ff");
  assert.equal(resolve(custom.source, { depth: 0 })["elevation.raised"], "4px");
  assert.equal(resolve(custom.source, { depth: 1 })["object.keyHeight"], "10px");
  // Runtime updates build on a theme.
  const updated = createStrataTheme({ depth: 0.9 }, { base: theme });
  assert.equal(resolve(updated.source)["light.azimuth"], 45);
  assert.equal(resolve(updated.source).depth, 0.9);
  // Broken rules are reported, and strict mode throws.
  const bad = createStrataTheme({ colour: { accent: "#9fd3ff", sky: "#fff" }, tokens: { "radius.control": "40px", "nope.x": 1 }, anchors: { "radius.small": [1, 2, 3] } });
  const found = bad.issues.map(({ path, message }) => `${path}: ${message}`);
  for (const expected of ["nope.x: is not a Strata token", "colour.sky: is not a Strata colour role", "radius.small: is not a depth-blended token", "radius.control: default 40 is above the maximum 20"]) assert.ok(found.includes(expected), `${expected} in ${found.join("; ")}`);
  assert.ok(found.some(issue => /colour \(light\): the focus colour on the panel/.test(issue)));
  assert.throws(() => createStrataTheme({ depth: 3 }, { strict: true }), StrataThemeError);
});
