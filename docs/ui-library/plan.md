# Plan: a 3D UI component library with its own design language

**Status:** accepted plan (2026-10-15). Nothing here is implemented yet and nothing
here changes current behaviour. Later phases may refine it through their own PRs.

**Names:** the design language is **Strata**; the package is `@underglass/ui`.

## Goal

A library of the basic UI elements that Fluent, Material UI and Bootstrap all ship
(buttons, fields, toggles, cards, tabs, dialogs and so on), with **one** consistent 3D
design language of its own. The work comes in two stages:

1. **Define the design language** as a written spec, tokens, a static specimen page and
   rough GPU prototypes.
2. **Implement it** inside this repository, as part of Underglass.

Requirements:

- **Different from every other UI library.** Underglass sits on a full 3D engine
  (lights, shadows, meshes, PBR materials, particles, physics). The language uses it.
- **Web-first.** The target is websites and web applications. 3D experiences built
  around UI (configurators, games, data scenes) come later.
- **Standalone.** The library works in any page with no Underglass present, as plain
  HTML and CSS, and through framework components.
- **Highly usable with Underglass.** With Underglass in GPU mode the same components
  get real depth, light and material without any change to their markup or state.
- **GPU-first, with an HTML and CSS fallback.** The GPU presentation is the primary
  design target.
- **HTML-in-Canvas and pure HTML.** Every control is a real DOM element, drawn by the
  GPU through HTML-in-Canvas. Nothing is cloned or redrawn as a canvas imitation.
- **Fully accessible, and tested.** WCAG 2.2 AA and the WAI-ARIA Authoring Practices in
  every presentation, enforced by automated tests (see [Accessibility](#accessibility)).

## Decisions (2026-10-15)

| Topic | Decision |
| --- | --- |
| How much 3D | **Design in 3D, project down.** Every control is designed as a real 3D object. Sites choose how much of it they show through three presentation levels: Relief (default), Objects (opt-in), Scene (opt-in, later). |
| Main use | Web-first: ordinary sites and apps with a fixed camera. 3D experiences later. |
| CSS fallback | A complete design system for the **static** look (light, shadow, bevel, colour). Clearly simpler for **motion and materials** (live lighting, refraction, meshes). |
| Contract | Underglass is unreleased, so its contract may change. The changes this plan needs are additive (see [Contract changes](#contract-changes)). |
| Auto-adjust | Stepping down from Objects to Relief on a slow device is an **opt-in policy** that the app enables, with a diagnostic each time it acts. Never silent, never a DOM fallback. |
| Phase 1 | Includes rough GPU prototypes, so the language is judged from pictures. They are prototypes, not finished components. |
| Names | Design language **Strata**, package `@underglass/ui`. |
| Package shape | **One package** with subpath exports (`/tokens`, `/css`, `/dom`, `/gpu`, `/react`, `/vue`, `/astro`) and optional peers, so the design language versions as one unit and an app installs only the framework it uses. |
| Frameworks | **Standalone-first, not React-first.** Tokens, HTML and CSS, behaviour and GPU integration are framework-neutral; thin bindings render the same markup. React first, Vue second, and Astro components that render the markup on the server, with islands or the plain-DOM runtime for interaction. Other stacks use the markup and the plain-DOM runtime. No Web Components as the shared layer. See the [design language](design-language.md#18-distribution-and-frameworks). |
| Accessibility | WCAG 2.2 AA and WAI-ARIA Authoring Practices, fully supported and tested, with automated checking (axe) as a test dependency. |
| Dialog and Drawer | Enrolled top-level panels (`role="dialog"`, `aria-modal`, inert background), so the highest elevation gets GPU depth, provided they pass the same native focus and keyboard tests as `<dialog>`. |
| Meshes | Generated in code from tokens (parametric), so object proportions follow the tokens. No authored mesh assets. |
| Look (2026-10-15, from the prototypes) | Between the subtle (A) and medium (B) prototypes, leaning strongly to B. Depth is a **setting**: 0% = A, 50% = B, 100% = C, blending every depth token continuously. The default is 50%, centred on the chosen look ([tuning page](prototypes.md#tuning-page)). |
| Light and theme | **Configurable per application**, with defaults: light from the top left (azimuth 323°, elevation 41°), light theme, neutral greys, blue accent. Dark theme alongside. |
| Configurability | **As much as possible.** Every token is configurable within a validated range, in layers: defaults, application theme, runtime updates, subtree scopes, component props and visitor preferences. A short list of invariants is validated, never silently relaxed: one light per application, the footprint and taper rule, contrast on lit faces, visible focus, target size, reduced motion and elevation order. See the [design language](design-language.md#15-theming-and-configuration). |

## Constraints that shape the language

| Fact | Source | Consequence for the language |
| --- | --- | --- |
| A layer's hit geometry is one matrix per element (`canvasTransform`), so a drawn face must be planar for hits to be exact. | WICG proposal; [architecture](../architecture.md#pixel-and-input-topology) | Interactive surfaces are **flat faces**. Curvature, bevels and thickness are light, shading or decoration, never bent hit areas. |
| `canvasTransform` takes a `DOMMatrixInit` (4x4), but the proposal's own WebGL 3D-card example maps hits to an axis-aligned rectangle, and precise hit testing ([WICG #148](https://github.com/WICG/html-in-canvas/issues/148)) is still open. | WICG `5fb3df86`, `Examples/webGL.html` | Perspective tilt of an **interactive** face at rest is unproven. Phase 0 must prove projective hits on the installed build before the language relies on it. |
| Underglass layers are 2D affine today: one canonical affine matrix drives GPU drawing and native hits, and admission checks six affine coefficients. | [architecture](../architecture.md#functional-admission-separate-from-content-work) | Perspective needs core work (a projective canonical matrix), gated by Phase 0. |
| Rotated `canvasClip` is hit-tested by bounding box (Chromium 573454036, WICG #186). | [upstream](../upstream/README.md) | Tilted faces must not sit in clipping ancestors, the same rule as rotated layers today. |
| Layers are budgeted (32 by default, 64 max, 2,000,000 captured pixels), and layers cannot nest. | [api](../api.md#supported-boundary-budgets-and-failure) | A component is **not** a layer. The layer unit is a **panel** (a card, a toolbar, a dialog). Depth inside a panel comes from passes over that panel's single capture. |
| Shader effects run only on decorative layers, or on interactive layers while inert during a transition. | [effects guide](../guide/effects.md) | Lighting an interactive panel at rest needs a new, narrower effect class (see [Contract changes](#contract-changes)). |
| A layer is captured at its own box, so anything painted outside it is cut off. | [components guide](../guide/components.md#4-keep-everything-inside-the-box) | Cast shadows and meshes that reach outside a panel are drawn by the GPU pass (needs an outset), and by an inner wrapper in CSS. |
| `<dialog>`, popovers and menus go through the DOM overlay host. | [components guide](../guide/components.md#5-send-dialogs-popovers-and-menus-to-the-overlay-host) | Overlays are CSS-presented even in GPU mode, so the CSS recipe must hold up next to GPU panels. |
| The runtime is framework-neutral (`@underglass/core`), with thin React and Vue adapters, and plain DOM can enroll layers directly. | [frameworks guide](../guide/frameworks.md) | The library's GPU integration targets core, so plain-HTML pages, React and Vue all get GPU presentation. |

## The language: design in 3D, project down

Every control is first a **3D object**: a button is a key with a defined bevel and
travel, a switch is a lever in a recessed track, a slider is a knob on a rail, a text
field is a well cut into a face. Each object has proportions, a material from a small
fixed set and is lit by the application's one light. Everything a site shows is a
projection of those objects.

### Presentation levels

| Level | What you see | Who it is for | Without GPU |
| --- | --- | --- | --- |
| **Relief** (default) | The object seen head-on: flat lit faces, bevels, contact and cast shadows, physical states | Every site | CSS relief, close to the GPU look |
| **Objects** (opt-in) | Real meshes with PBR materials, depth, key travel, lever throws, knob rotation | Sites that want to stand out | The same CSS relief |
| **Scene** (opt-in, later) | Ambient 3D around the UI: particles, physics flourishes, environment light | Showpiece pages | Nothing (decorative only) |

The level is set once on a provider (or the plain-DOM root) and can be overridden per
component. A Relief site still looks like this library and no other, because its light,
bevels and materials come from the same objects.

### Rules

- **Flat faces carry input.** Every interactive surface is a flat face parallel to the
  screen at rest. Text sits on faces and is never extruded, curved or shaded into low
  contrast.
- **The native control is the object's footprint.** At the Objects level the mesh is
  decoration drawn around and behind the native element, and the element's box is the
  part of the object you press (the top of the key, the switch's track). Clicks always
  land on the original `<button>` or `<input>`. The control's state drives the mesh
  (`checked` throws the lever), never the other way round.
- **Depth is real but bounded.** Faces sit on a small set of discrete heights.
- **One light for the whole application.** A key light, ambient and rim light. An
  application may set the light's direction (default: top left), but every panel,
  component and level in it shares that one light, and it never changes with theme or
  state. One consistent light is the signature of the language.
- **States are physical.** Hover lifts, press sinks, focus lights the edge, disabled
  turns matte and flat. On the GPU these are uniform changes, not recaptures, and a
  control's hit area never moves.
- **Space moves, controls do not.** Whole panels may travel through depth. Individual
  controls stay put in screen space.
- **One token source.** Tokens generate the GPU parameters, the mesh proportions and
  the CSS recipe, so all presentations agree.

### Auto-adjust (opt-in)

An app may enable an adjust policy: when frame time stays over budget at the Objects
level, components step down to Relief, and step back up when it recovers. The policy
is off by default, reports every change through a diagnostic event, and never leaves
GPU mode. Thresholds and hysteresis are part of the policy's API.

## Architecture: tiers over one DOM

```text
T0  Spec + tokens        design-language docs, tokens (JSON), generated CSS variables,
                         mesh and material parameters
T1  HTML + CSS           class-based styles for plain markup; no JavaScript required
T2  Behaviour            framework-neutral state sync and keyboard behaviour where native
                         elements need help (tabs, menus); plain DOM
T3  Framework bindings   React first, Vue second, Astro; thin, render the T1 markup
T4  GPU presentation     over @underglass/core: panel enrollment, material, relief and
                         object passes, depth motion, adjust policy
```

- T0 to T3 have **no dependency** on Underglass. T1 works without any JavaScript.
- T3 renders exactly the markup T1 documents, so a plain page and a framework app look
  the same.
- T4 depends only on `@underglass/core` public API, so it serves plain DOM, React and
  Vue alike. Anything it needs from the runtime is added to core as a generic feature
  with its own PR and tests, not as a UI-library special case.
- In GPU mode the integration sets a presentation attribute on the root. Component CSS
  then paints **flat faces only** (no CSS shadows or bevel gradients) and the GPU adds
  the relief. In DOM mode the CSS paints the relief itself. One stylesheet, no double
  lighting.

## Contract changes

Underglass is unreleased; these changes are **additive**. No current example or test
needs rewriting.

1. **Material effect class.** Effect `interaction` is `"decorative" | "inert"` today
   (`packages/core/src/effects.ts`). Add `"material"`: allowed on interactive layers at
   rest, colour changes only, no displacement, with a bounded brightness change on face
   interiors so text contrast holds. Custom effects are already declared
   `geometry: "color"`, so the rule exists; the new class reuses it. The runtime policy
   check (`packages/core/src/runtime.ts`, "Effects are decorative/inert only") gains
   the material case.
2. **Two chains per layer.** A layer can hold its always-on material and a temporary
   transition effect at the same time. Internal change.
3. **Relief primitives.** A layer can carry a bounded list of shapes (rounded rectangle,
   circle, pill, and a ring with an optional arc for spinners) in layer-local coordinates, each with height, material and state, lit
   analytically (signed distance fields). Hover, press and focus are uniform updates
   with no recapture. The list is rebuilt on the reconciliation triggers core already
   has (resize, mutation, layout).
4. **Object pass.** Meshes anchored to element boxes inside a layer, lit by the shared
   light, depth-composited with the layer's capture. Decorative: never hit-tested.
   Needs instancing and a mesh budget, like the layer budget.
5. **Shadow outset.** A layer pass may draw outside its box for cast shadows and
   meshes; hit geometry stays the box.
6. **Projective transforms.** A projective canonical matrix, its admission check and
   native hit witnesses. Only if Phase 0 proves projective hits; otherwise panel tilt
   stays transition-only.

The [GPU-first contract](../architecture.md#gpu-first-contract) wording changes from
"effects never touch interactive layers" to "effects that move pixels never touch live
controls". This is written as an architecture note in the first core PR.

## Phase 0: upstream check and feasibility probes

Required by [AGENTS.md](../../AGENTS.md) before any capture, geometry or presentation
work. Each probe is a playground page plus a browser test; results are in the
[Phase 0 report](phase0.md). Phase 0 runs **alongside**
the Phase 1 prototypes, which share its pages.

| Probe | Question | Pass condition |
| --- | --- | --- |
| P0.1 Projective hits | Does `updateElementGeometry` with a perspective `canvasTransform` (non-zero `m34`) give exact native hits on the installed Canary? | `getElementTransform` returns the full matrix; `elementFromPoint` and real pointer input land on the right control at interior and near-edge points of a tilted face, at DPR 1 and 2, headless and headful. |
| P0.2 Material pass | Can a colour-only pass run on an **interactive** layer at rest without moving pixels, breaking hits or lowering text contrast below the token minimum? | Decoded pixels show shading; hits unchanged; measured text contrast above AA on worst-case lighting; GPU stays active through hover, press, focus and typing. |
| P0.3 Relief cost | How many relief primitives per panel, at what cost, with state changes causing no recapture? | Bounded primitive count chosen; state animation adds zero captures and uploads over 300 frames. |
| P0.4 Object pass | Can meshes anchored to element boxes render in the shared engine, composited with the capture, at 60 fps? | A mesh budget chosen; GPU stays active; hits land on the native footprint, never on mesh-only pixels. |
| P0.5 Shadow outset | Can a pass draw outside the layer box, with hits clipped to the box? | Shadow and mesh pixels outside the box; no hit outside it. |
| P0.6 CSS parity | How close can the CSS recipe get to the Relief look with the same tokens? | A perceptual difference budget per component state. |

Record separately, as the repo requires: the WICG proposal SHA and date, what the
Chromium hotlist exposed without sign-in, and the browser build actually tested.
Starting point for this plan: WICG `5fb3df86d84de598c7f0fcfc5ee53de1df067e7d`
(2026-10-09, still the latest commit on 2026-10-15); hotlist access not rechecked; no
browser was run for this plan.

**If P0.1 fails:** the language still works. Faces stay screen-aligned at rest, tilt is
limited to transitions (with `interaction: "inert"`), and the CSS fallback may use CSS
3D transforms, which the browser hit-tests natively.

## Phase 1: define the design language

Lives in `docs/ui-library/`, reviewed as a spec, proved by a static specimen page and
rough GPU prototypes.

### Prototypes

Throwaway playground pages, not components. One panel with a **Button**, a **Switch**
and a **TextField**, each at the **Relief** and **Objects** levels, under the real light
model, next to the CSS relief of the same panel. Iterate on light, materials, bevel and
heights until the look is agreed, then write the numbers into the spec.

### Spec contents

Each section states the rule, its tokens, the GPU rendering at each level, the CSS
recipe and the accessibility limit.

1. **Principles.** The rules above, worded so a reviewer can check them.
2. **Space.** World units mapped to CSS pixels, one fixed camera (focal length and
   vanishing point per stage), the elevation scale (for example 0 ground, 1 raised,
   2 floating, 3 overlay, 4 modal) and the maximum panel tilt.
3. **Light.** The configurable key light (azimuth and elevation, with their allowed
   ranges and the default), ambient and rim intensities, and how light and dark themes
   change intensity and colour but never direction.
4. **Materials.** A small closed PBR set: *matte* (default face), *glass* (accent;
   refractive on the GPU, frosted in CSS), *metal* (hardware: levers, knobs, rails) and
   *emissive* (indicators, focus edges). Each lists PBR parameters and the CSS recipe.
5. **Shape.** Corner radius scale, thickness scale, **one** bevel profile, and the
   *well* (inset) form for inputs and tracks.
6. **Objects.** The canonical 3D object for each control: proportions, moving parts,
   travel and pivot, and how it projects to Relief and to CSS.
7. **Elevation and shadow.** Contact and cast shadows derived from light and height, so
   no component chooses its own shadow.
8. **Colour.** Palette, semantic roles (accent, neutral, success, warning, danger,
   info) and contrast measured on the lit face in its worst case.
9. **Typography.** Type scale on faces; text is never lit, extruded or tilted at rest.
10. **Iconography.** Flat icons on faces; 3D glyphs only at the Objects or Scene level.
11. **Interaction states.** Rest, hover, pressed, focus-visible, selected/checked,
    disabled, invalid and busy, as changes of height, light, material or object pose.
12. **Motion.** Duration and easing tokens, physical travel at the Objects level, panel
    enter and exit through depth, and the reduced-motion rule: state changes become
    instant pose and light changes, with no parallax, tilt or particles.
13. **Layout and density.** Grid, spacing scale, compact and comfortable density.
14. **Accessibility.** Contrast, a focus indicator that survives every presentation and
    forced colours, reduced motion, reduced transparency (glass turns matte), forced
    colours (the language flattens to a high-contrast 2D mode).
15. **Theming.** Light, dark and high contrast; what an application may change (depth,
    light direction, colour and accent, radius within limits) and what is fixed (the
    elevation scale's structure, the bevel profile, one light per application). Every
    configuration is checked for contrast on lit faces.
16. **Presentation levels and adjust policy.** What each level adds, per-component
    overrides, and the opt-in adjust policy.
17. **Component anatomy template.** For each component: object, faces, material,
    elevation per state, relief primitives, mesh parts, DOM structure, the WAI-ARIA
    pattern it follows and its overlay needs.

### Deliverables and exit criteria

- `docs/ui-library/design-language.md` and per-component anatomy pages.
- Tokens in one JSON source (W3C Design Tokens format) with generated CSS variables.
- A static specimen page in pure HTML and CSS: every token, material, elevation and
  state. It is also the visual reference for later tests.
- The prototype pages and their agreed screenshots at both levels.

Exit when all 17 sections are written, every Tier A component has an anatomy page,
the specimen passes contrast checks in light, dark and high contrast, and the
prototypes' look is accepted.

## Phase 2: tokens and the CSS foundation (T0, T1)

- Token runtime: the JSON tokens resolve, per layer and scope, to CSS custom properties
  (`--strata-*`), typed TypeScript values and GPU and mesh parameters, **at runtime**, so
  every setting can change live. A validator reports invariant breaks in development (strict mode
  throws). The token unit test checks the defaults on every change.
- Class-based CSS for plain HTML (Bootstrap-style: `ug-button`, `ug-button--accent`,
  states through native pseudo-classes and ARIA attributes).
- Two CSS modes in one stylesheet: *relief* (CSS paints depth) and *face* (flat faces
  for the GPU), switched by a root attribute. The relief recipe is computed in CSS with `calc()`
  from the custom properties, so a theme change restyles without regenerating CSS.
- CSS 3D transforms for panel motion in the fallback, respecting reduced motion.

## Phase 3: components (T2, T3)

Native elements first, following [Building components](../guide/components.md): a ref
to the root, `class` and `style` passthrough, a portal container for anything that
floats, and no boundary transforms. React bindings first, Vue second, then Astro components.

| Tier | Components |
| --- | --- |
| A, foundation | Button, IconButton, ToggleButton, ButtonGroup, Link, Field (label, help, error), TextField, TextArea, Checkbox, Radio and RadioGroup, Switch, Select (native), Slider (native range), Card, Panel, Divider, Badge, Spinner, ProgressBar |
| B, everyday | Tabs, Accordion, List, Table, Avatar, Chip and Tag, Tooltip, MessageBar, Toast, Breadcrumb, Pagination, Toolbar, AppBar, Skeleton, Dialog, Drawer |
| C, later | Menu, Popover, Combobox, DatePicker, Stepper, NavigationRail, TreeView, Carousel, Rating, SegmentedControl |

Each component ships with its anatomy page, a plain-DOM browser test without
Underglass, its WAI-ARIA Authoring Practices pattern, and the automated
[accessibility](#accessibility) tests. A component is not done until they pass.

## Phase 4: GPU presentation (T4)

1. The core features from [Contract changes](#contract-changes), each its own PR with
   GPU tests, in order: material class and two chains, relief primitives, shadow
   outset, object pass, projective transforms (only if P0.1 passed).
2. **UI integration over core.** A panel helper that enrolls a panel and collects relief
   primitives and mesh anchors from `data-strata-face` markers inside it; state sync from
   pointer, focus and ARIA attributes; the presentation-mode switch; presentation levels;
   the adjust policy; depth transitions built on core motion and presence.
3. **Bindings.** Thin React and Vue wrappers over the integration, Astro components with
   client-side attachment, and a plain-DOM entry, matching the repo's adapter pattern.
4. **Overlays.** Tooltip, Menu, Popover and Select popups stay in the overlay host and
   use the CSS relief recipe. Dialog and Drawer are enrolled top-level panels with
   `role="dialog"`, `aria-modal`, focus containment, Escape to close, focus return and
   an inert background. If they cannot match `<dialog>` on the accessibility tests
   below, they fall back to `<dialog>` in the overlay host.

## Phase 5: Scene level (later)

Decorative 3D around the UI on the shared engine: particles, physics flourishes (for
example confetti on submit, cards settling), environment light and backdrops.
Decorative only, so it never affects hits or controls. Scoped after Tier A ships at
both Relief and Objects levels.

## Accessibility

Strata targets **WCAG 2.2 level AA** and follows the **WAI-ARIA Authoring Practices**
pattern for every component. This holds in every presentation: plain CSS, Relief,
Objects and Scene. Nothing about accessibility is GPU-specific, because the original
elements stay in the accessibility tree and the GPU only draws them.

**Design rules** (in the spec, enforced by tests):

- Native elements first; ARIA only where no native element exists, following the
  pattern's roles, states and properties.
- Full keyboard operation with the pattern's keys, a logical focus order, no focus
  traps except in modal panels, and focus returned when a panel closes.
- A visible focus indicator in every presentation that meets WCAG 2.2 focus appearance
  (2.4.11 and 2.4.13 as a goal), and survives forced colours.
- Text contrast 4.5:1 and non-text contrast 3:1, measured on the **lit** face in its
  worst case at every level, in light, dark and high contrast.
- Target size at least 24 by 24 CSS pixels (2.5.8).
- Meshes, particles and depth are decorative: never the only carrier of meaning, never
  in the accessibility tree.
- `prefers-reduced-motion`: no parallax, tilt, travel or particles; instant state
  changes. `prefers-reduced-transparency`: glass turns matte. `forced-colors`: the
  language flattens to system colours in 2D. `prefers-contrast: more`: high-contrast
  theme.
- Text resizes to 200% and reflows at 320 CSS pixels wide without loss (1.4.4, 1.4.10).

**Tests:**

| Check | How | Where |
| --- | --- | --- |
| Rule violations | axe-core through `@axe-core/playwright` (new exact-pinned dev dependency) on every component page and state | Plain DOM and GPU mode, light, dark, high contrast |
| Same tree in every mode | Playwright accessibility snapshot of each page in DOM mode equals the snapshot in GPU mode at each level | Browser suite |
| Keyboard patterns | Real key presses through each pattern (Tab order, arrows, Home/End, Escape, Enter/Space), asserting focus and state | Every component |
| Focus visibility | Decoded pixels show the focus indicator at the focused control's drawn position, in GPU and DOM | Every focusable component |
| Contrast on lit faces | Build-time token checks plus decoded-pixel contrast samples from the GPU output | Specimen and prototypes |
| Preferences | `forced-colors`, `prefers-reduced-motion`, `prefers-reduced-transparency` and `prefers-contrast` emulated, asserting the rules above while GPU stays active | Browser suite |
| Zoom and reflow | 200% text and 320 px viewport without loss or overlap | Specimen and gallery |
| Screen readers | Manual pass with NVDA and JAWS on Windows and VoiceOver on macOS, using a recorded script per component | Before each release; recorded in [open issues](../open-issues.md) until performed |

Screen-reader testing is the one check automation cannot replace. It stays a recorded
manual gate, as it already is for Underglass.

## Verification

Per [AGENTS.md](../../AGENTS.md#verifying-a-change):

- **Plain DOM:** every component without Underglass, in plain HTML, React, Vue and Astro, with
  real pointer and keyboard input, not `element.click()`.
- **GPU:** for every component, state and level, GPU stays active, pixels are fresh,
  native hits land on the original control (never on mesh-only pixels), and state
  animation causes no recapture. Fallback tests do not count toward this. Integration
  pages also pass the shared contract in `tests/helpers/framework-contract.mjs`.
- **Adjust policy:** stepping down and up keeps GPU active, reports each change, and
  does nothing unless enabled.
- **Parity:** Relief and CSS screenshots of the specimen stay within the P0.6 budget.
- **Accessibility:** every check in [Accessibility](#accessibility), on every component.
- **Headful Canary** for anything touching capture, geometry or admission.
- `npm run typecheck`, `npm run test:unit`, `node --test tests/compiler/*.test.mjs`,
  `npm run test:browser`, and `npm run test:showcase` once the showcase gains a
  component gallery.

## Repository layout

```text
packages/ui/                 @underglass/ui (new package)
  src/tokens/                JSON source of truth, token runtime, validation, CSS generator
  src/css/                   T1 stylesheets (generated variables + component CSS)
  src/dom/                   T2 framework-neutral behaviour
  src/react/, src/vue/,      T3 bindings (optional peers)
  src/astro/
  src/gpu/                   T4 integration (optional peer @underglass/core)
docs/ui-library/             plan, design-language spec, component anatomy pages
examples/playground/         P0 probes and Phase 1 prototypes
examples/showcase/           component gallery page
tests/browser/ui-*.test.mjs  new files, so suites do not conflict
```

## Risks

- **Projective hits unproven (P0.1).** Mitigated by a language that works without tilt
  at rest.
- **Contract change.** Lighting an interactive layer is new ground; it must stay narrow
  (colour only, bounded) and be tested as such.
- **Text legibility under light.** Mitigated by bounded interior shading and build-time
  contrast checks.
- **Presentations drifting apart.** Mitigated by one token source and a measured parity
  budget.
- **Object-level performance.** Many meshes per page; mitigated by instancing, a mesh
  budget and the opt-in adjust policy.
- **Overlays look flatter in GPU mode,** because they are CSS-presented.
- **Layer budget.** Large apps may want more panels than 32 or 64 layers; the guidance
  must steer toward few large panels.
- **Accessibility of GPU-drawn panels.** Assistive tools that rely on element geometry
  (magnifiers, focus highlighting) read it from the canvas element transform; tilted
  panels must keep it correct. Covered by the focus-visibility tests and the manual
  screen-reader gate.
- **Package policy.** [CONTRIBUTING](../../CONTRIBUTING.md#change-boundaries) allows
  core plus one thin package per framework adapter. `@underglass/ui` is a deliberate,
  decided exception; the PR that creates it updates that paragraph.

## Left to later phases

These are design questions the spec or a phase answers, not open plan decisions:

- Exact token values (light angles, heights, radii, palette), settled through the
  Phase 1 prototypes.
- The adjust policy's default thresholds, from measurements on a low-end GPU (P0.4 found no pressure
  on a fast machine).
- The draw-call budget per panel, once the Tier A objects exist. P0.4 showed instances are cheap
  ([report](phase0.md#p04-object-pass)). (Relief primitives: settled at 256 per panel by P0.3,
  [Phase 0 report](phase0.md#p02-p03-and-p05-relief-material-pass-its-cost-and-the-shadow-outset).)
- ~~Whether panel tilt at rest is allowed, settled by P0.1.~~ Settled: allowed. P0.1 passed
  on Canary 158 ([Phase 0 report](phase0.md#p01-projective-hits)).

## Pull request sequence

One concern per PR, stacked where they depend on each other:

1. This plan (docs only).
2. Phase 0 probes and Phase 1 prototypes (playground pages, browser tests, report).
3. Design-language spec and tokens (docs and JSON).
4. Specimen page and token build (T0, T1 foundation), with the accessibility test
   harness (axe, accessibility snapshots, preference emulation) so every later
   component PR is checked from its first commit.
5. Core: material class and two chains, with the contract note.
6. Core: relief primitives. 7. Core: shadow outset. 8. Core: object pass.
9. Core: projective transforms (only if P0.1 passes).
10. Tier A components, a few per PR, CSS and bindings.
11. GPU integration (T4), adjust policy and showcase gallery.
12. Tier B, then Tier C, then the Scene level.
