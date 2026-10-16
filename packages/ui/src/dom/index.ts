/**
 * `@underglass/ui/dom`: framework-neutral runtime for the page: applying an application theme with runtime updates,
 * scope overrides for a subtree, and panel motion through depth. React, Vue and Astro bindings build on it.
 */
export { applyStrataTheme, strataScope } from "./theme.ts";
export type { AppliedTheme, ApplyThemeOptions, ReportMode, ScopeOptions, ScopeOverrides, StrataScope } from "./theme.ts";
export { strataEnter, strataLeave } from "./motion.ts";
export type { PanelMotionOptions } from "./motion.ts";
