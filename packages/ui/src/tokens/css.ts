/**
 * Generates the token stylesheet: every token as a CSS custom property (`colour.accent` → `--strata-colour-accent`),
 * as the design language's runtime mechanism describes (section 15). The stylesheet computes depth-blended values
 * and the light vector with `calc()`, so changing `--strata-depth` or the light angles restyles without
 * regenerating CSS. Everything sits in the `strata.tokens` cascade layer, so unlayered application CSS wins.
 *
 * - **Depth:** `--strata-depth` (0–1) is set on the root or on a scope element (`data-strata-scope` with an inline
 *   `--strata-depth`, or `data-strata-depth` where typed `attr()` is supported). Depth-blended tokens are
 *   re-declared on every scope, so each subtree blends at its own depth.
 * - **Themes:** `data-strata-theme` (`light`, `dark`, `contrast`, `contrast-dark`) on the root or a scope. Without it
 *   the root follows `prefers-color-scheme`, and `prefers-contrast: more` turns light into `contrast` and dark into
 *   `contrast-dark`.
 * - **Derived values:** text on role colours (`--strata-colour-on-accent` and so on), the light vector
 *   (`--strata-light-x`, `-y`, `-z`), the shadow offset per pixel of height (`--strata-shadow-dx`, `-dy`), and the
 *   density's control height and panel padding.
 */
import { onColour, parseHex, toHex } from "./contrast.ts";
import { flatten, themesOf, type Token, type TokenGroup, type TokenValue } from "./model.ts";

/** The custom property for a token path: `object.keyHeight` → `--strata-object-key-height`. */
export function cssVariable(path: string): string {
  return `--strata-${path.split(".").map(part => part.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)).join("-")}`;
}

/** Roles that carry text, so they get a derived `on-` colour. */
const textRoles = ["accent", "success", "warning", "danger", "info"];

/** Control height and panel padding per density (section 13). */
const densities: Record<string, [number, number]> = { compact: [28, 12], comfortable: [34, 18], spacious: [40, 24] };

const genericFonts = new Set(["serif", "sans-serif", "monospace", "cursive", "fantasy", "system-ui", "ui-serif", "ui-sans-serif", "ui-monospace", "ui-rounded", "emoji", "math"]);
const number = (value: number) => String(Math.round(value * 10000) / 10000);

/** A token's literal CSS value. */
function literal(token: Token, value: TokenValue = token.$value): string {
  if (typeof value === "string" && /^\{[^}]+\}$/.test(value)) return `var(${cssVariable(value.slice(1, -1))})`;
  switch (token.$type) {
    case "fontFamily": return (Array.isArray(value) ? value : [String(value)]).map(name => (genericFonts.has(name) ? name : `"${name}"`)).join(", ");
    case "cubicBezier": return Array.isArray(value) ? `cubic-bezier(${value.join(", ")})` : String(value);
    default:
      if (typeof value === "number") return number(value);
      if (Array.isArray(value)) return value.join(" ");
      return value;
  }
}

/** A depth-blended value: piecewise-linear through the three anchors, driven by `--strata-depth-t` (−1 to 1). */
function blended(token: Token): string {
  const [subtle, medium, bold] = token.meta.anchors!;
  const unit = token.$type === "dimension" ? "px" : "";
  if (subtle === medium && medium === bold) return `${number(medium)}${unit}`;
  const t = "var(--strata-depth-t)";
  return `calc(${number(medium)}${unit} + ${number(medium - subtle)}${unit} * min(${t}, 0) + ${number(bold - medium)}${unit} * max(${t}, 0))`;
}

const block = (selector: string, lines: string[], indent = "  ") => `${indent}${selector} {\n${lines.map(line => `${indent}  ${line}`).join("\n")}\n${indent}}`;

/** The token stylesheet for `source`. */
export function tokensToCss(source: TokenGroup): string {
  const tokens = flatten(source);
  const themes = themesOf(source);
  const isAlias = (token: Token) => typeof token.$value === "string" && token.$value.startsWith("{");

  // Plain values inherit from the root. Depth-blended values and aliases are re-declared on every scope.
  const root: string[] = [], scoped: string[] = ["--strata-depth-t: calc(clamp(-1, 2 * var(--strata-depth) - 1, 1));"];
  for (const token of tokens) {
    const name = cssVariable(token.path);
    if (token.meta.anchors) {
      const value = blended(token);
      scoped.push(`${name}: ${token.meta.themes ? `var(--strata-theme-${name.slice(9)}, ${value})` : value};`);
    } else if (isAlias(token)) scoped.push(`${name}: ${literal(token)};`);
    else if (!token.meta.themes) root.push(`${name}: ${literal(token)};`);
  }
  root.push(
    "--strata-light-x: calc(sin(var(--strata-light-azimuth) * 1deg) * cos(var(--strata-light-elevation) * 1deg));",
    "--strata-light-y: calc(-1 * cos(var(--strata-light-azimuth) * 1deg) * cos(var(--strata-light-elevation) * 1deg));",
    "--strata-light-z: calc(sin(var(--strata-light-elevation) * 1deg));",
    "--strata-shadow-dx: calc(-1 * var(--strata-light-x) / var(--strata-light-z));",
    "--strata-shadow-dy: calc(-1 * var(--strata-light-y) / var(--strata-light-z));",
  );

  // Each theme's values, including derived on-colours.
  const themeLines = (theme: string) => {
    const lines = [`color-scheme: ${themes[theme]!.scheme};`];
    for (const token of tokens) {
      const value = token.meta.themes?.[theme];
      const name = cssVariable(token.path);
      // A theme without its own value restores the depth-blended one inside another theme's subtree.
      if (value === undefined) { if (token.meta.themes && token.meta.anchors) lines.push(`--strata-theme-${name.slice(9)}: initial;`); continue; }
      lines.push(token.meta.anchors ? `--strata-theme-${name.slice(9)}: ${literal(token, value)};` : `${name}: ${literal(token, value)};`);
      const role = token.path.replace(/^colour\./, "");
      if (token.path.startsWith("colour.") && textRoles.includes(role)) lines.push(`${cssVariable(`colour.on-${role}`)}: ${toHex(onColour(parseHex(String(value))))};`);
    }
    return lines;
  };
  const contrastOf = (scheme: "light" | "dark") => Object.entries(themes).find(([, info]) => info.scheme === scheme && info.contrast === "more")?.[0];
  const plainOf = (scheme: "light" | "dark") => Object.entries(themes).find(([, info]) => info.scheme === scheme && !info.contrast)?.[0];
  const light = plainOf("light") ?? "light", dark = plainOf("dark");

  const parts = [
    "/* @underglass/ui tokens, generated from strata.tokens.json by tokensToCss. Do not edit. */",
    "@layer strata.tokens {",
    block(":root", [...root, `--strata-control-height: ${densities.comfortable![0]}px;`, `--strata-panel-padding: ${densities.comfortable![1]}px;`]),
    block(":root, [data-strata-scope], [data-strata-depth], [data-strata-theme]", scoped),
    "  @supports (x: attr(x type(*))) {",
    block("[data-strata-depth]", ["--strata-depth: attr(data-strata-depth type(<number>), 0.5);"], "    "),
    "  }",
    ...Object.entries(densities).map(([density, [height, padding]]) => block(`[data-strata-density="${density}"]`, [`--strata-control-height: ${height}px;`, `--strata-panel-padding: ${padding}px;`])),
    block(`:root, [data-strata-theme="${light}"]`, themeLines(light)),
    ...Object.keys(themes).filter(theme => theme !== light).map(theme => block(`[data-strata-theme="${theme}"]`, themeLines(theme))),
  ];
  if (dark) parts.push("  @media (prefers-color-scheme: dark) {", block(":root:not([data-strata-theme])", themeLines(dark), "    "), "  }");
  const contrastLight = contrastOf("light"), contrastDark = contrastOf("dark");
  if (contrastLight) parts.push("  @media (prefers-contrast: more) {", block(`:root:not([data-strata-theme]), [data-strata-theme="${light}"]`, themeLines(contrastLight), "    "), "  }");
  if (dark && contrastDark) {
    parts.push("  @media (prefers-contrast: more) {", block(`[data-strata-theme="${dark}"]`, themeLines(contrastDark), "    "), "  }");
    parts.push("  @media (prefers-contrast: more) and (prefers-color-scheme: dark) {", block(":root:not([data-strata-theme])", themeLines(contrastDark), "    "), "  }");
  }
  parts.push("}");
  return `${parts.join("\n")}\n`;
}
