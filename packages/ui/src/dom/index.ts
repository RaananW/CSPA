/**
 * `@underglass/ui/dom`: framework-neutral runtime for the page: applying an application theme with runtime updates,
 * scope overrides for a subtree, panel motion through depth, and the behaviour native elements need in markup rendered
 * without a binding (`attachStrata`). React, Vue and Astro bindings build on it.
 */
export { applyStrataTheme, resolveStrataScope, strataScope } from "./theme.ts";
export type { AppliedTheme, ApplyThemeOptions, ReportMode, ScopeOptions, ScopeOverrides, StrataScope } from "./theme.ts";
export { strataEnter, strataLeave } from "./motion.ts";
export type { PanelMotionOptions } from "./motion.ts";
export { attachStrata } from "./behaviour.ts";
export type { PressedChange } from "./behaviour.ts";
