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

## Rendering model

The Relief and Objects looks are specified independently of any engine in the
[Strata Rendering Model](../../docs/ui-library/rendering-model.md). This package ships its scene format, a reference
implementation and its conformance suite:

```ts
import { sceneSettings, shadePoint, strataTokens, validateScene } from "@underglass/ui/tokens";

const scene = { format: "strata-scene", version: 1, extent: { width: 200, height: 120 },
  ...sceneSettings(strataTokens, { depth: 0.5, theme: "light" }),
  primitives: [{ face: "raised", rect: [0, 0, 200, 120], radius: 14, height: 8, material: "matte" }] };
validateScene(scene);                                                       // [] when valid
const colour = shadePoint(scene, () => [0.91, 0.92, 0.94, 1], 100, 60);    // sRGB, 0–1
```

- **`@underglass/ui/scene.schema.json`:** the scene format as a JSON Schema.
- **`@underglass/ui/conformance/relief-1.json`:** scenes, sample points and expected colours. A renderer conforms
  when its decoded pixels are within 3 (of 255) on every channel.
- **`@underglass/ui/conformance/scene-3.json`:** version 3, the Scene level: stage scenes (`format: "strata-stage"`,
  a lit backdrop and particles, `shadeStage`) and objects reflecting an environment map.
- **`@underglass/ui/conformance/objects-2.json`:** the same for version 2, the Objects level. Version 2 scenes add a
  `camera` and may mix objects (`{ object: "key", rect, height, base, taper, travel, material }`, or a dome such as
  `{ object: "knob", rect, height, base, material, colour, bounds }`) into the back-to-front list.

## GPU presentation

With Underglass, Strata panels can be presented on the GPU: CSS paints flat faces and core's `relief` material paints
the depth, from the same tokens. Panels must be direct children of the Underglass root.

```ts
import { attachStrataGpu } from "@underglass/ui/gpu";

const strata = attachStrataGpu(controller);   // enrolls each .ug-panel among the root's children
// In the mount options: onStatusChange: () => strata.refresh()
strata.detach();                               // back to the CSS presentation
```

- **React and Vue:** `useStrataGpu(controller)` from `@underglass/ui/react` or `@underglass/ui/vue` attaches for the
  component's lifetime.
- **Astro:** call `attachStrataGpu` from a client `<script>` once Underglass is mounted.
- **What it reads:**
  - token values from each panel's resolved `--strata-*` custom properties, so depth, themes and scopes apply as
    they do in CSS;
  - states from `:hover`, `:active`, `:focus-visible` and `:disabled`;
  - geometry from layout, followed through CSS transitions.
- **When GPU is off** (fallback, forced colours or disabled): panels leave face mode, and the CSS relief is back.
- **The Objects level:** `attachStrataGpu(controller, { level: "objects" })`, or `data-strata-level="objects"` on a
  component, a panel or a scope (`level` on the bindings), presents components as objects (design language section
  6): buttons and selects become keys that travel when pressed, panels and cards slabs, fields gain a bezel,
  checkboxes, radios and switches become wells with their mark, dot or knob standing in them, and sliders a metal
  rail with a puck. The panel then takes core's `objects` material, seen through a camera centred on the stage. Knobs
  and pucks are drawn as domes in their own colour, so their CSS paint is hidden while the GPU draws them. Any
  component can set `data-strata-level="relief"` to stay at the Relief level inside an Objects panel.
- **The adjust policy** (off by default): `attachStrataGpu(controller, { level, adjust: { enabled: true },
  onAdjust })`. While the 95th percentile of frame intervals stays over `frameBudgetMs` (25) for
  `stepDownAfterFrames` (120) frames, levels step down, Scene to Objects to Relief. After `stepUpAfterFrames` (600)
  frames under 80% of the budget they step back up, never above what the page asks for. Every step calls `onAdjust`
  and dispatches `strata-adjust` on the root; `strata.cap()` reads the current cap. GPU stays on throughout. The
  defaults are provisional (open issue VAL-009).

## Panel motion

```ts
import { strataEnter, strataLeave } from "@underglass/ui/dom";

await strataLeave(panel);           // out through depth; inert meanwhile, invisible afterwards
await strataEnter(panel, { tilt: 8 }); // back in, tilted 8° while moving
```

Instant under `prefers-reduced-motion`. In face mode (GPU on) the same calls move the panel on the GPU:
`attachStrataGpu` hands it to core's `transition`, which scales, tilts and fades the layer about its centre as the CSS
motion does, while the panel's relief height travels from the modal level so its shadow follows. Native hits follow
the moving panel, and it stays inert until it has entered.

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

## Dialog and Drawer

`Dialog` and `Drawer` are modal top-level panels at `elevation.modal`, following the APG modal dialog pattern. They
are Strata panels, not `<dialog>` elements, so the GPU presentation can enroll them like any panel. Each renders a
`<section role="dialog" aria-modal="true">` and a `.ug-scrim` before it, into a container (the page body by default),
never inside a layer. Closed, React and Vue render nothing and plain HTML and Astro render both with `hidden`.
With `attachStrataGpu`, render them into the Underglass root (`container={controller.container}`): there they fill
the stage and are presented on the GPU while open, over a scrim the GPU fades.

```tsx
import { Button, Dialog, Drawer } from "@underglass/ui/react";

<Dialog open={open} onClose={() => setOpen(false)} title="Discard changes?" description="Your edits will be lost."
  actions={<Button variant="accent" onClick={discard}>Discard</Button>}>…</Dialog>
<Drawer open={filters} onClose={() => setFilters(false)} side="start" title="Filters">…</Drawer>
```

```html
<button data-strata-open="help">Help</button>
<!-- Astro: <Dialog id="help" title="Help">…<Fragment slot="actions"><Button data-strata-close="">Close</Button></Fragment></Dialog> -->
```

```ts
import { showStrataDialog } from "@underglass/ui/dom";

const dialog = showStrataDialog(panel, { onClose: reason => dialog.close(), closeOnScrim: true });
await dialog.close();               // reason is "escape", "scrim" or "close"
```

`showStrataDialog` is the one implementation behind every binding: it makes the rest of the page `inert` (each prior
value restored exactly), moves focus to `initialFocus`, the `[autofocus]` descendant or the first tabbable element,
returns it to the opener, closes on Escape (only the topmost of nested dialogs), and runs the panel motion. A scrim click
closes only with `closeOnScrim`, as a native `<dialog>` does. In plain HTML, `data-strata-open="id"` opens a panel and
`data-strata-close` inside it closes it (`attachStrata`). Anatomy: [Dialog](../../docs/ui-library/components/dialog.md),
[Drawer](../../docs/ui-library/components/drawer.md).

Next: the GPU presentation (`/gpu`), as the
[plan](../../docs/ui-library/plan.md) describes.
