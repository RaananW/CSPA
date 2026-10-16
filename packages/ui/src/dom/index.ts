/**
 * `@underglass/ui/dom`: framework-neutral runtime for the page: applying an application theme with runtime updates,
 * and scope overrides for a subtree. React, Vue and Astro bindings build on it.
 */
export { applyStrataTheme, strataScope } from "./theme.ts";
export type { AppliedTheme, ApplyThemeOptions, ReportMode, ScopeOptions, ScopeOverrides, StrataScope } from "./theme.ts";
