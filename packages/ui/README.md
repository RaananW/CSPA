# Strata for Underglass experimental private package

`@underglass/ui@0.1.0` is **Strata**, the 3D design language and component library for Underglass. It is
private and not published or release-qualified. The design language is specified in
[docs/ui-library](../../docs/ui-library/design-language.md).

This version ships the **tokens** layer only:

```ts
import { strataTokens, resolve, validateTokens } from "@underglass/ui/tokens";

const values = resolve(strataTokens, { depth: 0.2, theme: "dark" });
values["elevation.raised"]; // "2.4px"
validateTokens(strataTokens); // [] when every invariant holds
```

```html
<link rel="stylesheet" href="node_modules/@underglass/ui/dist/css/tokens.css" />
<!-- or, with a bundler: import "@underglass/ui/css/tokens.css"; -->

<html data-strata-theme="dark">            <!-- light, dark, contrast, contrast-dark; default: follows the system -->
  <aside data-strata-scope style="--strata-depth: 0.2" data-strata-density="compact">…</aside>
</html>
```

- **Every token is a custom property:** `colour.accent` is `--strata-colour-accent`, and `object.keyHeight` is
  `--strata-object-key-height`.
- **Depth:** depth-blended tokens follow `--strata-depth` (0–1). Set it on the root, or on a `data-strata-scope`
  element for a subtree.
- **Themes:** without `data-strata-theme`, the root follows `prefers-color-scheme`. `prefers-contrast: more`
  selects the high-contrast themes.
- **Derived values:** `--strata-colour-on-accent` (text on role colours), `--strata-light-x`, `-y` and `-z` (the
  light vector), `--strata-shadow-dx` and `-dy` (shadow offset per pixel of height), and
  `--strata-control-height` and `--strata-panel-padding` (from the density).

The stylesheet sits in the `strata.tokens` cascade layer, so unlayered application CSS overrides it. The build
validates the tokens against the design language's invariants (contrast on lit faces in every theme, non-text
contrast, elevation order, the taper rule) and fails on any broken rule.

Next: the component stylesheet (`@underglass/ui/css`), plain-DOM behaviour (`/dom`), the GPU presentation
(`/gpu`) and React, Vue and Astro bindings, as the [plan](../../docs/ui-library/plan.md) describes.
