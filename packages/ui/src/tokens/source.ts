/** The Strata token source (W3C Design Tokens format), the defaults every theme starts from. */
import source from "./strata.tokens.json" with { type: "json" };
import type { TokenGroup } from "./model.ts";

export const strataSource: TokenGroup = source as TokenGroup;
