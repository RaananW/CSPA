/**
 * `@underglass/ui/tokens`: the Strata design tokens and their framework-neutral runtime. The token source is
 * W3C Design Tokens JSON (also exported as `@underglass/ui/tokens.json`); the stylesheet generated from it is
 * `@underglass/ui/css/tokens.css`.
 */
import source from "./strata.tokens.json" with { type: "json" };
import type { TokenGroup } from "./model.ts";

/** The Strata token source (W3C Design Tokens format). */
export const strataTokens: TokenGroup = source as TokenGroup;

export { blend, flatten, namespace, numeric, resolve, themesOf, valueOf } from "./model.ts";
export type { ResolveOptions, ThemeInfo, Token, TokenGroup, TokenMeta, TokenNode, TokenValue } from "./model.ts";
export { contrast, luminance, nearBlack, onColour, parseHex, scale, toHex } from "./contrast.ts";
export type { Rgb } from "./contrast.ts";
export { validateTokens } from "./validate.ts";
export type { Issue } from "./validate.ts";
export { cssVariable, tokensToCss } from "./css.ts";
