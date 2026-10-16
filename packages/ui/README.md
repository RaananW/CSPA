# Strata for Underglass experimental private package

`@underglass/ui@0.1.0` is **Strata**, the 3D design language and component library for Underglass. It is
private and not published or release-qualified. The design language is specified in
[docs/ui-library](../../docs/ui-library/design-language.md).

This version ships the **tokens** layer and the **CSS** for the Tier A components:

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

`@underglass/ui/css` is the whole stylesheet: tokens plus the Tier A components, in the `strata.components` layer.
The markup for each component is its [anatomy page](../../docs/ui-library/components/README.md); the relief comes
from `data-strata-face` on that markup, lit from the configured light. `@underglass/ui/css/tokens.css` and
`@underglass/ui/css/components.css` are the two halves.

```html
<button type="button" class="ug-button ug-button--accent" data-strata-face="raised">Save</button>
```

## Themes and scopes at runtime

```ts
import { createStrataTheme } from "@underglass/ui/tokens";
import { applyStrataTheme, strataScope } from "@underglass/ui/dom";

// An application theme, validated against every rule of the design language.
const theme = createStrataTheme({ depth: 0.4, light: { azimuth: 45 }, colour: { accent: "#0f766e" } });
const applied = applyStrataTheme(theme);         // report: "error" (default), "warn", "silent" or "throw"
applied.update({ depth: 0.7 });                   // runtime change, on top of the theme in effect

// A flatter, compact sidebar. Light tokens are application-only and are refused here.
strataScope(document.querySelector("aside"), { depth: 0.2, density: "compact", size: "small" });

// Themes serialise to W3C Design Tokens JSON.
const json = theme.toJSON();
```

- **Theme layer:** an applied theme's stylesheet goes into the `strata.theme` cascade layer, above the defaults and
  below the components, whichever stylesheet loads first.
- **Scope colours:** colour overrides in a scope need the scope's `theme`, so their contrast can be checked. The
  derived on- and -text colours are set with them.

## Panel motion

```ts
import { strataEnter, strataLeave } from "@underglass/ui/dom";

await strataLeave(panel);           // out through depth; inert meanwhile, invisible afterwards
await strataEnter(panel, { tilt: 8 }); // back in, tilted 8° while moving
```

Instant under `prefers-reduced-motion`. In face mode (GPU on) the CSS motion is off; the GPU presentation moves the
panel.

## React

```tsx
import "@underglass/ui/css";
import { Button, Field, StrataProvider, StrataScope, TextField } from "@underglass/ui/react";

<StrataProvider theme={{ colour: { accent: "#0f766e" } }}>
  <section className="ug-panel" data-strata-face="raised" aria-label="Account">
    <Field label="Email" help="We only use it for receipts." error={error} required>
      <TextField type="email" value={email} onChange={event => setEmail(event.target.value)} />
    </Field>
    <Button variant="accent" onClick={save}>Save</Button>
  </section>
  <StrataScope depth={0.2} density="compact">…</StrataScope>
</StrataProvider>
```

Every Tier A component: `Button`, `IconButton`, `ToggleButton`, `ButtonGroup`, `Link`, `Field`, `TextField`,
`TextArea`, `Checkbox`, `RadioGroup` with `Radio`, `Switch`, `Select`, `Slider`, `Card`, `Panel`, `Divider`, `Badge`,
`Spinner` and `ProgressBar`. Each renders exactly
the markup on its [anatomy page](../../docs/ui-library/components/README.md), forwards a ref to its native element,
and passes `className`, `style` and native attributes through. `size`, `material` and `level` become the Strata
attributes. React 18.3 and 19 are optional peers.

## Vue

```ts
import "@underglass/ui/css";
import { Button, Field, StrataProvider, TextField } from "@underglass/ui/vue";

// Render functions or templates; the same components, props and markup as React.
h(Field, { label: "Email", error: error.value }, () => h(TextField, { type: "email", modelValue: email.value, "onUpdate:modelValue": set }));
h(Button, { variant: "accent", onClick: save }, () => "Save");
```

All 19 Tier A components, with `v-model` on TextField, TextArea, Select and Slider (`modelValue`), Checkbox and Switch
(a boolean), RadioGroup (the selected value), and ToggleButton (`v-model:pressed`). Attributes and listeners fall
through to the native element; Checkbox, Switch and Radio send `class` and `style` to the label row and the rest to the
input. Vue 3.5 is an optional peer.

## Astro

```astro
---
import "@underglass/ui/css";
import { Button, Panel, RadioGroup, TextField } from "@underglass/ui/astro";
---
<Panel title="Account">
  <TextField label="Email" type="email" help="We only use it for receipts." required />
  <RadioGroup legend="Plan" value="free" options={[{ value: "free", label: "Free" }, { value: "pro", label: "Pro" }]} />
  <Button variant="accent" type="submit">Save</Button>
</Panel>
```

The same 19 components, rendered to HTML on the server with no JavaScript. Controls take the Field props themselves,
and RadioGroup renders its radios from `options`. ToggleButton state, `aria-disabled` and checkbox `indeterminate`
come from `attachStrata` (`@underglass/ui/dom`), which the components load. For plain HTML or other server templates,
call `attachStrata()` yourself. Astro 7.3 is an optional peer.

Next: the GPU presentation (`/gpu`), as the
[plan](../../docs/ui-library/plan.md) describes.
