# Skeleton

Tier B. Follows the [anatomy template](../design-language.md#17-component-anatomy-template) and the
[conventions](README.md#conventions).

## 1. Purpose and native element

Holds the place of content that is loading, in its rough shape, so the layout does not jump when it arrives.
Renders `<span>` placeholders hidden from assistive technology (`aria-hidden="true"`): they carry no information.
What a screen reader needs is on the region that is loading: `aria-busy="true"` while it loads, and a
[Spinner](spinner.md) or a status message that says so. No APG pattern applies.

## 2. Object

None: flat placeholders on the surface, with a soft shimmer that runs across them. They have no depth and take no
input.

| Part | Shape | Height at 50% | Moves |
| --- | --- | --- | --- |
| Text line | A pill 0.8 em high, the line's width (`100%` by default; the last of several lines is 60%) | 0 | The shimmer |
| Circle | A circle (`size.indicator × 1.6` by default, an Avatar's size) | 0 | The shimmer |
| Rectangle | A rounded box, `radius.control` | 0 | The shimmer |

## 3. Faces and materials

| Face | Colour role | Text role | Material role |
| --- | --- | --- | --- |
| Placeholder | `track` | — | None |
| Shimmer | `panel` at 60%, a band sweeping across | — | None |

## 4. Elevation per state

| State | Relief | Objects | CSS |
| --- | --- | --- | --- |
| Rest | Flat, shimmering | Same | Same |

No other state applies. Under `prefers-reduced-motion` the shimmer stops and the placeholders are still.

## 5. Relief primitives

None. Placeholders are captured content: the shimmer is a CSS animation, presented fresh like any content update.

## 6. Tokens it reads

| Token | Prop |
| --- | --- |
| `colour.track`, `colour.panel` | — |
| `radius.pill`, `radius.control`, `size.indicator` | `size` |
| `motion.slow` | — |

## 7. DOM structure and overlay needs

```html
<span class="ug-skeleton ug-skeleton--circle" aria-hidden="true"></span>
<span class="ug-skeleton-text" aria-hidden="true">
  <span class="ug-skeleton ug-skeleton--text"></span>
  <span class="ug-skeleton ug-skeleton--text"></span>
  <span class="ug-skeleton ug-skeleton--text"></span>
</span>
<span class="ug-skeleton ug-skeleton--rect" aria-hidden="true" style="width: 100%; height: 120px;"></span>
```

- Each placeholder (or group of text lines) is the boundary element: refs, `class` and `style` reach it. `style`
  gives a size of its own.
- **Loading region:** put `aria-busy="true"` on the region that is loading, and a status (a Spinner with a label) in
  it; remove both, and the placeholders, when the content arrives.
- **React, Vue and Astro:** `<Skeleton shape="text" lines={3} />`, `<Skeleton shape="circle" />` and
  `<Skeleton shape="rect" width="100%" height={120} />`.
- No overlay.

## 8. Keyboard and screen reader

- Not focusable and not read. The region's `aria-busy` and its status say that content is loading.

## 9. CSS presentation

Inline blocks in `track` with a `panel` band sweeping across over 1.4 s (`background-position`), forever. Under
`prefers-reduced-motion` the band is gone. Under `forced-colors` placeholders are `GrayText` blocks.

## 10. Tests

- **Bindings:** React, Vue and Astro render exactly the markup above; placeholders are hidden from the
  accessibility tree; text lines, circle and rectangle sizes; the shimmer runs, and stops under reduced motion.
