# Tabs

Tier B. Follows the [anatomy template](../design-language.md#17-component-anatomy-template) and the
[conventions](README.md#conventions).

## 1. Purpose and native element

Shows one of several panels of related content in the same place, chosen from a row of tabs. Renders a
`role="tablist"` of native `<button role="tab">` elements and one `role="tabpanel"` per tab, following the
WAI-ARIA [Tabs pattern](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/) with automatic activation: moving focus to
a tab selects it. HTML has no tabs element, so the roles are explicit, and the keyboard and selection come from
`@underglass/ui/dom` (plain HTML and Astro) or from the binding (React and Vue). Navigation between pages is a
set of [Links](link.md), not tabs.

## 2. Object

A **rail** (a groove) runs under the row of tabs. The selected tab's **indicator**, a short accent bar, stands
in the rail under that tab. The tabs themselves are flat: text on the panel, like a [Link](link.md).

| Part | Shape | Height at 50% | Moves |
| --- | --- | --- | --- |
| Rail | A pill 4 px high along the tablist's bottom edge (its end edge when vertical), sunk by `elevation.well` | −`elevation.well` | No |
| Indicator | A pill 4 px high under the selected tab, inset by `space.2` at both ends | A `mark`: raised in the rail | Shows under the newly selected tab |
| Tab | The label on the panel, no face | 0 | No |

Each tab is at least `target.min` (24) high and the density's control height, so the whole tab is the target
(WCAG 2.5.8). The indicator lies inside its tab's box: a click on it reaches the tab.

## 3. Faces and materials

| Face | Colour role | Text role | Material role |
| --- | --- | --- | --- |
| Rail | `track` | — | `rail` (`metal`) |
| Indicator | `accent` | — | `indicator` (`emissive`) |
| Tab, selected | None (sits on the panel) | `text` | None |
| Tab, not selected | None | `muted`; `text` on hover | None |
| Panel | None (sits on the panel) | `text` | None |

The indicator meets 3:1 against the rail and the panel. Selection is shown by the indicator's shape and by the
label's colour, never by colour alone. `data-strata-material` on the tablist overrides the rail and indicator
materials.

## 4. Elevation per state

| State | Relief | Objects | CSS |
| --- | --- | --- | --- |
| Rest | Rail at `−elevation.well`; the indicator raised in it under the selected tab | The indicator is a mark standing on the panel | Inset rail, `accent` indicator |
| Hover | Label in `text` | Same | Label in `text` |
| Pressed (`:active`) | Label in `text` | Same | Same |
| Focus-visible | `outline: focus.width solid accent` around the tab | Same | Same |
| Selected (`aria-selected="true"`) | The indicator under this tab; the label in `text` | Same | Same |
| Disabled | Label at 38%; skipped by the arrow keys | Same | `opacity: 0.38` on the label |

Busy and invalid do not apply. Under `prefers-reduced-motion` nothing changes: the indicator has no transition.

## 5. Relief primitives

Two kinds: the rail is a `groove` (`<span class="ug-tabs__rail">`, the tablist's first child, so it is drawn
first and the indicator stands on it), and each tab's indicator is a `mark` (`<span class="ug-tab__indicator">`),
shown only while its tab is selected. The tabs and panels have no face.

## 6. Tokens it reads

| Token | Prop |
| --- | --- |
| `colour.track`, `colour.accent`, `colour.text`, `colour.muted`, `colour.edge` | — |
| `radius.pill`, `radius.small` | — (theme or scope) |
| `elevation.well`, `object.keyHeight`, `state.*` | — |
| `material.roles.rail`, `material.roles.indicator` | `material` |
| `target.min`, `control.height`, `control.font`, `space.*`, `density` | `size` |
| `focus.width`, `focus.offset` | — |
| `level` | `level` |

## 7. DOM structure and overlay needs

```html
<div class="ug-tabs">
  <div class="ug-tabs__list" role="tablist" aria-label="Account">
    <span class="ug-tabs__rail" data-strata-face="groove" aria-hidden="true"></span>
    <button class="ug-tab" type="button" role="tab" id="account-tab-profile" aria-selected="true" aria-controls="account-panel-profile">
      <span class="ug-tab__label">Profile</span>
      <span class="ug-tab__indicator" data-strata-face="mark" aria-hidden="true"></span>
    </button>
    <button class="ug-tab" type="button" role="tab" id="account-tab-security" aria-selected="false" aria-controls="account-panel-security" tabindex="-1">
      <span class="ug-tab__label">Security</span>
      <span class="ug-tab__indicator" data-strata-face="mark" aria-hidden="true"></span>
    </button>
    <button class="ug-tab" type="button" role="tab" id="account-tab-billing" aria-selected="false" aria-controls="account-panel-billing" tabindex="-1" disabled>
      <span class="ug-tab__label">Billing</span>
      <span class="ug-tab__indicator" data-strata-face="mark" aria-hidden="true"></span>
    </button>
  </div>
  <div class="ug-tabs__panel" role="tabpanel" id="account-panel-profile" aria-labelledby="account-tab-profile" tabindex="0">
    <p>Your name and photo.</p>
  </div>
  <div class="ug-tabs__panel" role="tabpanel" id="account-panel-security" aria-labelledby="account-tab-security" tabindex="0" hidden>
    <p>Your password and two-step sign-in.</p>
  </div>
  <div class="ug-tabs__panel" role="tabpanel" id="account-panel-billing" aria-labelledby="account-tab-billing" tabindex="0" hidden>
    <p>Your plan and invoices.</p>
  </div>
</div>
```

- The outer `<div>` is the boundary element: refs, `class` and `style` reach it. A vertical tablist is the class
  `ug-tabs--vertical` on it and `aria-orientation="vertical"` on the tablist; the rail and indicators move to the
  end edge.
- **Ids:** each tab is `{id}-tab-{value}` and each panel `{id}-panel-{value}`, from the component's `id` (generated
  when absent) and each tab's `value`. Values must be valid in an id.
- **Roving focus:** only the selected tab is in the tab order; the others have `tabindex="-1"`. Each panel has
  `tabindex="0"`, so Tab moves from the tablist into the panel even when it holds nothing focusable.
- Unselected panels have `hidden`. A disabled tab is a native `disabled` button.
- **Manual activation:** `data-strata-activation="manual"` on the tablist (the `activation="manual"` prop in
  React, Vue and Astro): the arrow keys only move focus, and Enter or Space selects.
- **Plain HTML:** `attachStrata` selects a tab on click and handles the keys below. It updates `aria-selected`,
  `tabindex` and `hidden`, and dispatches a bubbling `strata-tab-change` event from the tab with
  `{ tab, panel }`. **React and Vue:** `<Tabs>` holds the selection (`value`, `defaultValue`, `onChange`; `v-model`
  in Vue) around `<TabList>`, `<Tab>` and `<TabPanel>`. **Astro:** `<Tabs>` renders its tabs from `tabs` and each
  panel from the slot named by its value.
- No overlay.

## 8. Keyboard and screen reader

| Key | Action |
| --- | --- |
| Tab | Into the tablist, onto the selected tab; from there into its panel |
| Right Arrow, Left Arrow | The next or previous enabled tab, wrapping; reversed in right-to-left text. Up and Down when vertical |
| Home, End | The first or last enabled tab |
| Enter, Space | Selects the focused tab (it is a button), for manual activation |

- Roles `tablist`, `tab` and `tabpanel`. Each tab names its panel through `aria-controls`, and each panel is
  named by its tab through `aria-labelledby`. Screen readers say "tab, 1 of 3, selected".
- The tablist is named by `aria-label` (the `label` prop) or by `aria-labelledby`.
- Moving to a tab selects it at once (automatic activation), which suits panels that are already rendered.

## 9. CSS presentation

The tablist is a flex row over its rail: the rail is the progress bar's groove (a `track` pill with an inner
shadow), 4 px high, along the bottom. Tabs are transparent buttons with the control font, at least the density's
control height, with `space.4` inline padding. The selected tab's indicator is an `accent` pill on the rail with a
small cast shadow from the light. Under `forced-colors` the rail is a `CanvasText` line and the indicator is
`Highlight`; the selected label stays `ButtonText`, so the indicator carries selection.

## 10. Tests

- **Plain DOM:** a click selects a tab and shows its panel; the arrow keys, Home and End move and select,
  wrapping and skipping a disabled tab; up and down when vertical; right to left reverses the arrows; manual
  activation moves focus only until Enter or Space; Tab goes from the selected tab into its panel;
  `strata-tab-change` reports the tab and the panel.
- **Bindings:** React, Vue and Astro render exactly the markup above; React and Vue follow `value` and report
  `onChange` (`v-model`), with real arrow keys.
- **GPU:** at Relief and Objects, the rail is a groove and the selected tab's indicator a mark; a real click on
  another tab moves the indicator there with GPU on, the pixels under the new tab show it, and the arrow keys
  select through the GPU.
- **Accessibility:** axe with the tabs in light and dark; the tab and panel roles, names and selection.
