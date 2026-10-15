/**
 * The Strata token model: reads the W3C Design Tokens source (`strata.tokens.json`) and resolves a token's value
 * for a depth and a theme. Strata's own metadata lives under `$extensions["dev.underglass.strata"]`:
 * `anchors` (values at depth 0, 0.5 and 1), `min`/`max`, `scope`, `options`, `invariant` and per-theme values.
 */

/** The extensions namespace for Strata metadata in the token source. */
export const namespace = "dev.underglass.strata";

/** Strata metadata on one token. */
export interface TokenMeta {
  /** Values at depth 0, 0.5 and 1; the value blends piecewise-linearly between them. */
  anchors?: [number, number, number];
  min?: number;
  max?: number;
  /** Whether a subtree scope or a component may override the token (`false`: application only). */
  scope?: boolean;
  /** Allowed values of a string token. */
  options?: string[];
  /** Validated in every configuration, never relaxed. */
  invariant?: boolean;
  /** Per-theme values, by theme name. */
  themes?: Record<string, TokenValue>;
}

export type TokenValue = string | number | string[];

/** One token in the source: a leaf with `$value`. */
export interface TokenNode {
  $type: string;
  $value: TokenValue;
  $description?: string;
  $extensions?: { [namespace]?: TokenMeta };
}

/** A theme declared on the source root. */
export interface ThemeInfo {
  scheme: "light" | "dark";
  contrast?: "more";
}

/** A group of tokens; the root may also declare the themes. */
export interface TokenGroup {
  $description?: string;
  $extensions?: { [namespace]?: { themes?: Record<string, ThemeInfo> } };
  [key: string]: TokenNode | TokenGroup | string | object | undefined;
}

/** A flattened token with its dotted path. */
export interface Token extends TokenNode {
  path: string;
  meta: TokenMeta;
}

/** Depth and theme to resolve values at. */
export interface ResolveOptions {
  depth?: number;
  theme?: string;
}

const isToken = (value: unknown): value is TokenNode => typeof value === "object" && value !== null && "$value" in value;

/** Every token in `source`, in source order, with its dotted path. */
export function flatten(source: TokenGroup): Token[] {
  const tokens: Token[] = [];
  const walk = (group: object, prefix: string) => {
    for (const [key, value] of Object.entries(group)) {
      if (key.startsWith("$") || typeof value !== "object" || value === null) continue;
      const path = prefix ? `${prefix}.${key}` : key;
      if (isToken(value)) tokens.push({ ...value, path, meta: value.$extensions?.[namespace] ?? {} });
      else walk(value, path);
    }
  };
  walk(source, "");
  return tokens;
}

/** The themes declared on the source root, by name. */
export function themesOf(source: TokenGroup): Record<string, ThemeInfo> {
  return source.$extensions?.[namespace]?.themes ?? { light: { scheme: "light" } };
}

/** A dimension's number of CSS pixels (`"3px"` → 3); numbers pass through. */
export function numeric(value: TokenValue): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number.parseFloat(value);
  throw new TypeError(`Not a numeric token value: ${JSON.stringify(value)}`);
}

/** Piecewise-linear blend of three anchors at `depth` (0 → first, 0.5 → second, 1 → third). */
export function blend([subtle, medium, bold]: readonly [number, number, number], depth: number): number {
  const d = Math.min(1, Math.max(0, depth));
  return d <= 0.5 ? subtle + (medium - subtle) * (d / 0.5) : medium + (bold - medium) * ((d - 0.5) / 0.5);
}

/** A token's value at a depth and theme: the theme's value if it has one, else blended anchors, else `$value`. */
export function valueOf(token: Token, { depth = 0.5, theme = "light" }: ResolveOptions = {}): TokenValue {
  const themed = token.meta.themes?.[theme];
  if (themed !== undefined) return themed;
  if (token.meta.anchors) {
    const value = blend(token.meta.anchors, depth);
    return token.$type === "dimension" ? `${round(value)}px` : round(value);
  }
  return token.$value;
}

/** Every token's value at a depth and theme, by dotted path. */
export function resolve(source: TokenGroup, options: ResolveOptions = {}): Record<string, TokenValue> {
  return Object.fromEntries(flatten(source).map(token => [token.path, valueOf(token, options)]));
}

const round = (value: number) => Math.round(value * 10000) / 10000;
