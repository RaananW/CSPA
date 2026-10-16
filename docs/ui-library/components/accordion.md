# Accordion

Tier B. Follows the [anatomy template](../design-language.md#17-component-anatomy-template) and the
[conventions](README.md#conventions).

## 1. Purpose and native element

Shows a list of sections, each of which opens to reveal its content, so a long page stays short. Each section is
a native `<details>` with a `<summary>` header, which gives the WAI-ARIA
[Disclosure pattern](https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/) with no script: the summary is the
button, its expanded state comes from the browser, and the content is found by find-in-page even while closed.
Sections that share a `name` form an exclusive accordion: opening one closes the others, natively.

## 2. Object

A **stack of raised slabs**, one per section, like [Cards](card.md) with a gap between them. Each slab's header
row carries a **chevron** that turns when the section opens; the open section's content is on the same slab,
under the header.

| Part | Shape | Height at 50% | Moves |
| --- | --- | --- | --- |
| Section | Rounded plate, `radius.control`, `bevel.width` band | `elevation.raised` (3) | Grows and shrinks with its content |
| Header | The slab's top row, at least the density's control height | — | No |
| Chevron | A 7 px chevron at the header's end | Flat (in the captured content) | Turns 180° on open, over `motion.fast` |

The header covers the section's whole width, and is at least `target.min` (24) high, so it is the target
(WCAG 2.5.8).

## 3. Faces and materials

| Face | Colour role | Text role | Material role |
| --- | --- | --- | --- |
| Section slab | `secondary` | `text` | `control` (`matte`) |
| Header | None (on the slab); a 6% `text` tint on hover | `text`, strong | None |
| Chevron | `muted`; `text` on hover | — | None |

`data-strata-material` on a section or on the accordion overrides the material.

## 4. Elevation per state

| State | Relief | Objects | CSS |
| --- | --- | --- | --- |
| Rest, closed | Slab at `elevation.raised`, header only | Slab at raised height | Relief recipe at `raised` |
| Open (`open`) | The same slab, grown to hold its content; the chevron turned | Same | Same |
| Hover (header) | A 6% tint on the header; the chevron in `text` | Same | Same |
| Focus-visible (header) | `outline: focus.width solid accent` around the header | Same | Same |

The slab does not rise or travel: hover and press belong to the header, which is flat. Disabled, selected,
invalid and busy do not apply. Under `prefers-reduced-motion` the chevron turns at once.

## 5. Relief primitives

One `raised` primitive per section: the `<details>` element, from its border box. The header, chevron and content
are captured content on it.

## 6. Tokens it reads

| Token | Prop |
| --- | --- |
| `colour.secondary`, `colour.text`, `colour.muted` | — |
| `radius.control` | — (theme or scope) |
| `elevation.raised`, `bevel.*`, `shadow.*` | — |
| `material.roles.control` | `material` |
| `target.min`, `control.height`, `control.font`, `space.*`, `density` | `size` |
| `focus.width`, `focus.offset`, `motion.fast`, `motion.easing.standard` | — |
| `level` | `level` |

## 7. DOM structure and overlay needs

```html
<div class="ug-accordion">
  <details class="ug-accordion__item" data-strata-face="raised" name="faq" open>
    <summary class="ug-accordion__header">
      <span class="ug-accordion__title">Shipping</span>
      <span class="ug-accordion__chevron" aria-hidden="true"></span>
    </summary>
    <div class="ug-accordion__body">
      <p>Orders ship within two days.</p>
    </div>
  </details>
  <details class="ug-accordion__item" data-strata-face="raised" name="faq">
    <summary class="ug-accordion__header">
      <span class="ug-accordion__title">Returns</span>
      <span class="ug-accordion__chevron" aria-hidden="true"></span>
    </summary>
    <div class="ug-accordion__body">
      <p>Return any item within 30 days.</p>
    </div>
  </details>
</div>
```

- The outer `<div>` is the boundary element of the accordion, and each `<details>` of its section: refs, `class`
  and `style` reach them.
- **Exclusive:** the same `name` on every section (React and Vue: `exclusive`, which generates one, or `name`).
  Without a `name`, any number of sections can be open.
- **Open state:** the `open` attribute. React and Vue: `defaultOpen`, or `open` with `onOpenChange` (`v-model:open`
  in Vue), from the native `toggle` event. Astro: `open`.
- **Plain HTML and Astro** need no script: `<details>` is native.
- No overlay.

## 8. Keyboard and screen reader

| Key | Action |
| --- | --- |
| Tab, Shift+Tab | Move between the headers and the controls in open sections (native order) |
| Enter, Space | Open or close the focused section (native) |

- Each header is a button with an expanded state (`<summary>`), named by its title. Screen readers say
  "Shipping, expanded, button". The section is a `group`.
- Closed content is not focusable and not read, but find-in-page opens the section that holds a match.

## 9. CSS presentation

The `raised` recipe on each section, with the card's `secondary` colour. The header is a full-width row (no
marker, `list-style: none`) with the title and the chevron, drawn by two borders turned 45°. Under `forced-colors`
each section has a `CanvasText` border and the chevron is `ButtonText`.

## 10. Tests

- **Plain DOM:** a click on the header opens and closes its section; Enter and Space toggle; in an exclusive
  accordion opening one section closes the open one; without a `name`, sections open independently; roles and
  expanded state; axe in light and dark.
- **Bindings:** React, Vue and Astro render exactly the markup above; React and Vue report `onOpenChange`
  (`v-model:open`) and follow `open`.
- **GPU:** at Relief and Objects each section is a raised slab (an object slab at Objects); a real click on a
  header through the GPU opens it, with GPU on, and the slab grows to hold the content.
