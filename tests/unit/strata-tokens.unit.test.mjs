/**
 * Unit tests for the Strata design tokens (`docs/ui-library/tokens/strata.tokens.json`) against the invariants in
 * `docs/ui-library/design-language.md`: every default lies in its range, depth anchors are consistent, elevation
 * levels stay in order, text and indicators meet contrast on lit faces in both themes, the focus colour stands
 * out, the taper rule holds on a large stage, and light tokens are application-only. Run with `npm run test:unit`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const tokens = JSON.parse(readFileSync(new URL("../../docs/ui-library/tokens/strata.tokens.json", import.meta.url), "utf8"));
const NS = "dev.underglass.strata";
const numeric = value => (typeof value === "string" ? parseFloat(value) : value);

/** Every token (an object with `$value`) with its dotted path. */
function* leaves(node, path = []) {
  if (node && typeof node === "object" && "$value" in node) { yield [path.join("."), node]; return; }
  for (const [key, child] of Object.entries(node)) if (!key.startsWith("$")) yield* leaves(child, [...path, key]);
}
const get = path => path.split(".").reduce((node, key) => node[key], tokens);
const channel = value => { const c = value / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const luminance = ([r, g, b]) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
const contrast = (a, b) => { const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (high + 0.05) / (low + 0.05); };
const rgb = hex => [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16));
const themed = (role, theme) => rgb(get(`colour.${role}`).$extensions[NS].themes[theme]);
/** White or near-black, whichever contrasts more with `colour` (the derived on-colour rule). */
const onColour = colour => (contrast(colour, [255, 255, 255]) >= contrast(colour, [16, 18, 22]) ? [255, 255, 255] : [16, 18, 22]);
const scale = (colour, factor) => colour.map(value => Math.min(255, Math.round(value * factor)));

test("every token has a type and a default inside its range, and depth anchors agree with the default", () => {
  let count = 0;
  for (const [path, token] of leaves(tokens)) {
    count++;
    assert.ok(token.$type, `${path}: $type`);
    const extension = token.$extensions?.[NS] ?? {};
    const value = numeric(token.$value);
    if (typeof value === "number") {
      if (extension.min !== undefined) assert.ok(value >= extension.min, `${path}: ${value} >= ${extension.min}`);
      if (extension.max !== undefined) assert.ok(value <= extension.max, `${path}: ${value} <= ${extension.max}`);
    }
    if (extension.anchors) {
      assert.equal(extension.anchors.length, 3, `${path}: three anchors`);
      assert.equal(extension.anchors[1], value, `${path}: the 50% anchor is the default`);
      for (const anchor of extension.anchors) {
        if (extension.min !== undefined) assert.ok(anchor >= extension.min, `${path}: anchor ${anchor} in range`);
        if (extension.max !== undefined) assert.ok(anchor <= extension.max, `${path}: anchor ${anchor} in range`);
      }
    }
    if (extension.options) assert.ok(extension.options.includes(token.$value), `${path}: default is an option`);
  }
  assert.ok(count > 60, `token count ${count}`);
});

test("elevation levels stay in order at every depth anchor", () => {
  const levels = ["ground", "raised", "floating", "overlay", "modal"].map(level => get(`elevation.${level}`).$extensions[NS].anchors);
  for (let anchor = 0; anchor < 3; anchor++) {
    for (let index = 1; index < levels.length; index++) assert.ok(levels[index][anchor] > levels[index - 1][anchor], `level ${index} above ${index - 1} at anchor ${anchor}`);
  }
});

test("text and indicators meet contrast on lit faces in the light and dark themes", () => {
  const interior = get("interior.max").$value;
  for (const theme of ["light", "dark"]) {
    const panel = themed("panel", theme);
    assert.ok(contrast(themed("text", theme), panel) >= 4.5, `${theme}: text on panel`);
    assert.ok(contrast(themed("muted", theme), panel) >= 4.5, `${theme}: muted on panel`);
    assert.ok(contrast(themed("text", theme), themed("field", theme)) >= 4.5, `${theme}: text in fields`);
    // Text on role colours holds at rest, at the largest lit brightening and at the largest darkening.
    for (const role of ["accent", "success", "warning", "danger", "info"]) {
      const colour = themed(role, theme);
      for (const factor of [1, 1 + interior, 1 - interior]) {
        const ratio = contrast(onColour(colour), scale(colour, factor));
        assert.ok(ratio >= 4.5, `${theme}: text on ${role} at ×${factor} is ${ratio.toFixed(2)}`);
      }
    }
    // The accent doubles as the focus colour: at least 3:1 against the panel it is drawn on.
    assert.ok(contrast(themed("accent", theme), panel) >= 3, `${theme}: focus colour against the panel`);
  }
});

test("the taper rule holds on a 1920 by 1080 stage at every depth anchor", () => {
  const radius = Math.hypot(960, 540);
  const heights = get("object.keyHeight").$extensions[NS].anchors, tapers = get("object.taper").$extensions[NS].anchors;
  const minimum = numeric(get("camera.distance").$value);
  for (let anchor = 0; anchor < 3; anchor++) {
    const h = heights[anchor], taper = tapers[anchor];
    // Distance derived as in design-language.md section 2.
    const distance = Math.max(minimum, radius * h / taper + h);
    const drift = radius * h / (distance - h);
    assert.ok(drift <= taper + 1e-9, `anchor ${anchor}: drift ${drift.toFixed(2)} <= taper ${taper}`);
  }
});

test("material roles use existing presets, and colour aliases point at colour roles", () => {
  const presets = Object.keys(tokens.material.presets);
  for (const preset of ["matte", "satin", "gloss", "lacquer", "glass", "metal", "emissive"]) assert.ok(presets.includes(preset), `preset ${preset}`);
  for (const [role, token] of Object.entries(tokens.material.roles)) {
    assert.ok(presets.includes(token.$value), `role ${role} uses a preset`);
    assert.ok(!role.includes("."), `role name ${role} has no dot (Design Tokens naming)`);
  }
  for (const [path, token] of leaves(tokens.material)) {
    if (typeof token.$value === "string" && token.$value.startsWith("{")) {
      assert.equal(token.$type, "color", `${path}: alias type`);
      assert.ok(get(token.$value.slice(1, -1)), `${path}: alias ${token.$value} resolves`);
    }
  }
  // Lacquer is the glass-coated preset: a strong, sharp clear coat.
  assert.ok(tokens.material.presets.lacquer.coat.strength.$value >= 0.9 && tokens.material.presets.lacquer.coat.roughness.$value <= 0.1);
});

test("light and other application-only tokens cannot be overridden in a scope", () => {
  for (const group of ["light", "environment"]) for (const [path, token] of leaves(tokens[group])) assert.equal(token.$extensions[NS].scope, false, `${group}.${path}`);
  assert.equal(get("bevel.profile").$extensions[NS].scope, false);
  assert.equal(get("target.min").$extensions[NS].invariant, true);
  assert.ok(numeric(get("focus.width").$extensions[NS].min) >= 2, "focus width floor");
});
