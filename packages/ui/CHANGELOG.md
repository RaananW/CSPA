# @underglass/ui

## 0.1.0

Baseline development version. Never published; recorded here so the first published release has a
starting point.

- Strata design tokens (`@underglass/ui/tokens`, `@underglass/ui/tokens.json`): the W3C Design Tokens
  source, depth and theme resolution, contrast helpers and validation against the design language's
  invariants.
- The token stylesheet (`@underglass/ui/css/tokens.css`): CSS custom properties with depth blending,
  the light vector, light, dark and high-contrast themes, and density.
- The Tier A component stylesheet (`@underglass/ui/css`, `@underglass/ui/css/components.css`): relief from
  `data-strata-face` lit by the configured light, materials, states from native pseudo-classes, face mode for
  the GPU, and forced colours, reduced motion and reduced transparency.
- Component sizes (`data-strata-size`: small, medium, large) and high-contrast outlines.
- The theme runtime: `createStrataTheme`, `loadStrataTheme` and `StrataThemeError` in `/tokens`;
  `applyStrataTheme` (runtime updates) and `strataScope` (subtree overrides, validated) in `@underglass/ui/dom`.
- Panel motion through depth: `strataEnter` and `strataLeave` (inert while moving, instant under reduced motion).
