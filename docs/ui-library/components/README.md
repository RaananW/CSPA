# Strata component anatomy

One page per component, with the headings from
[section 17 of the design language](../design-language.md#17-component-anatomy-template). Each page is
the component's **markup contract** (section 18): plain HTML, React, Vue and Astro render exactly the DOM
it shows, and binding tests compare against it.

## Conventions

**Class names** use the `ug-` prefix, Bootstrap-style: a block (`ug-button`), modifiers
(`ug-button--accent`) and parts (`ug-switch__knob`). States come from native pseudo-classes and ARIA or
native attributes (`:hover`, `:active`, `:focus-visible`, `:checked`, `:disabled`, `aria-invalid`,
`aria-busy`, `aria-pressed`), never from state classes.

**Strata attributes** use the `data-strata-` prefix:

| Attribute | On | Meaning |
| --- | --- | --- |
| `data-strata-face` | Any element the material pass lights | The relief primitive: `raised`, `well`, `groove`, `knob`, `mark`, `ring` or `flat` (below) |
| `data-strata-material` | A face, a component or a scope | A material role (`buttonPrimary`) or preset (`lacquer`); overrides the role default |
| `data-strata-elevation` | A raised face | An elevation token name (`raised`, `floating`); the component's default when absent |
| `data-strata-level` | A component or a scope | `relief`, `objects` or `scene`, overriding the scope's level |
| `data-strata-depth` | A scope | Depth for the subtree, 0–1 |
| `data-strata-theme` | The root or a scope | `light`, `dark`, `contrast` or `contrast-dark`; the root follows the system without it |
| `data-strata-density` | The root or a scope | `compact`, `comfortable` or `spacious` |
| `data-strata-size` | A component or a scope | `small`, `medium` (default) or `large`: indicator, switch and control sizes |
| `data-strata-mode` | The root or a scope | `face`: the GPU paints relief, so CSS paints flat faces (no bevel, shadow or finish) |
| `data-strata-preview` | A control | `hover`, `active` or `focus`: shows a state statically, for specimens and tests only |

**Relief primitives.** Each is a rounded box (or a circle) taken from the element's border box and its
`border-radius`. The GPU reads them from the markers, and the CSS presentation styles the same elements.

| Primitive | Shape | Lighting | Shadow | Examples |
| --- | --- | --- | --- | --- |
| `raised` | Rounded box at an elevation | Bevel lit from the light, interior within `interior.max` | Cast, from height | Button key, card, panel |
| `well` | Rounded box sunk by `elevation.well` | Inverted bevel: the edge nearest the light is dark | Inner, from the rim | Field, switch track, checkbox box |
| `groove` | A thin well, at most 8 px high | As `well`, narrower bevel | Inner | Progress bar, slider rail, divider |
| `knob` | Circle (or pill) on a well | Spherical shading | Cast onto the well | Switch knob, slider thumb, radio dot |
| `mark` | A glyph or shape raised inside a well | Bevel on its outline | Small cast | Check mark, indeterminate bar |
| `ring` | Annulus, with an optional arc | As `groove`; the arc as the fill | Inner | Spinner |
| `flat` | Rounded box, no height | Material only, no bevel | None | Badge, divider in forced colours |

**Edges.** Wells, tracks and unchecked marks carry a 1 px `colour.edge` outline, so their shape meets 3:1
against the panel ([non-text contrast](../design-language.md#8-colour)). Knobs carry one when they do not
reach 3:1 against their track.

**Derived parts.** A slider's puck and a progress bar's fill have no element of their own: the GPU and the
CSS pseudo-elements (`::-webkit-slider-thumb`, `::-webkit-progress-value` and their equivalents) place them
from the native value.

Moving parts (`knob`, `mark`, a pressed key) never change the native element's box. Their travel lives in
the GPU pose and in CSS `transform`, inside the box (the [footprint rule](../design-language.md#6-objects)).

**Overlays.** Dialog and Drawer are top-level panels rendered into a container: the page body, or the Underglass
root, where `@underglass/ui/gpu` presents each as its own GPU panel over a GPU-faded scrim. They are never inside a layer
and are made modal by `showStrataDialog` (inert background, focus, Escape). Other floating parts (menus, popovers,
tooltips, select popups) still portal to the Underglass overlay host and are CSS-presented there. Tier A has no
overlays: the native `<select>` opens the browser's own list.

## Specimen

The [specimen page](../../../examples/playground/ui-specimen.html) (`ui-specimen.html` in the playground) shows
every token, material, elevation and Tier A state from `@underglass/ui/css` in plain HTML and CSS. Its browser
test is the accessibility harness: axe in every theme and under forced colours, contrast on decoded pixels, the
light and depth, reduced motion, keyboard input and reflow.

## Tier A

| Component | Native element | Object |
| --- | --- | --- |
| [Button](button.md) | `<button>` | Key |
| [IconButton](icon-button.md) | `<button>` with `aria-label` | Square key |
| [ToggleButton](toggle-button.md) | `<button aria-pressed>` | Latching key |
| [ButtonGroup](button-group.md) | `<div role="group">` | Keys on one plinth |
| [Link](link.md) | `<a href>` | None (flat text) |
| [Field](field.md) | `<div>` with `<label>`, help and error | None (layout) |
| [TextField](text-field.md) | `<input>` | Well with a bezel |
| [TextArea](text-area.md) | `<textarea>` | Well with a bezel |
| [Checkbox](checkbox.md) | `<input type="checkbox">` | Small well with a raised mark |
| [Radio and RadioGroup](radio.md) | `<input type="radio">` in `<fieldset>` | Round well with a knob |
| [Switch](switch.md) | `<input type="checkbox" role="switch">` | Track well with a knob |
| [Select](select.md) | `<select>` | Key with a chevron |
| [Slider](slider.md) | `<input type="range">` | Rail groove with a puck |
| [Card](card.md) | `<article>` or `<section>` | Raised slab |
| [Panel](panel.md) | `<section>` | Raised slab, the GPU layer unit |
| [Divider](divider.md) | `<hr>` | Groove |
| [Badge](badge.md) | `<span>` | Flat pill |
| [Spinner](spinner.md) | `<span role="status">` | Ring groove with an emissive arc |
| [ProgressBar](progress-bar.md) | `<progress>` | Groove with an emissive fill |

## Tier B

| Component | Native element | Object |
| --- | --- | --- |
| [Dialog](dialog.md) | `<section role="dialog" aria-modal>` | Raised slab at `elevation.modal`, over a scrim |
| [Drawer](drawer.md) | `<section role="dialog" aria-modal>` | Raised slab on a viewport edge |
| [Tabs](tabs.md) | `<button role="tab">` in a `role="tablist"` | Flat tabs over a rail groove; the selected tab's indicator is a mark in it |
