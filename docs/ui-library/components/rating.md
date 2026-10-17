# Rating

Tier C. Follows the [anatomy template](../design-language.md#17-component-anatomy-template) and the
[conventions](README.md#conventions).

## 1. Purpose and native element

A score out of a small maximum (5 by default), shown as stars. Two forms:

- **Input:** native radios in a `<fieldset>` named by its `<legend>`, one per score, each named "1 star", "2 stars"
  and so on. Each radio is visually hidden over its star, so the star is its hit area. The WAI-ARIA
  [Radio Group pattern](https://www.w3.org/WAI/ARIA/apg/patterns/radio/) comes from the browser: one tab stop, arrow
  keys change the score, and the value takes part in a form.
- **Display:** a read-only score, which may be fractional (4.5), as one `role="img"` element named "4.5 out of 5 stars".

## 2. Object

**Stars printed on the panel**: captured content, not relief. A star is not a rounded box, so it has no primitive.

| Part | Shape | Height at 50% | Moves |
| --- | --- | --- | --- |
| Star (input) | A 24 px target holding a five-point star | Flat | No |
| Stars (display) | A row of stars, `font.size.base` high, filled to the score | Flat | No |

## 3. Faces and materials

| Part | Colour |
| --- | --- |
| Star up to the score | `accent` |
| Star above the score | `edge` (3:1 against the panel) |
| Star under the pointer, and the stars before it | `accent` at 55% over `edge`: a preview of that score |

## 4. Elevation per state

| State | Relief | Objects | CSS |
| --- | --- | --- | --- |
| Rest | Flat stars | Same | Same |
| Hover (input) | The preview colours | Same | Same |
| Focus-visible | `outline: focus.width solid accent` around the focused star's target | Same | Same |
| Disabled | Stars at 38% | Same | Same |

## 5. Relief primitives

None. The stars are captured content in every presentation.

## 6. Tokens it reads

`colour.accent`, `colour.edge`, `colour.text`, `space.1`, `space.2`, `target.min`, `font.size.small`,
`font.weight.strong`, `focus.*`.

## 7. DOM structure and overlay needs

```html
<fieldset class="ug-rating">
  <legend class="ug-rating__legend">Your rating</legend>
  <div class="ug-rating__stars">
    <label class="ug-rating__item">
      <input class="ug-rating__input" type="radio" name="score" value="1">
      <span class="ug-rating__star" aria-hidden="true"></span>
      <span class="ug-rating__label">1 star</span>
    </label>
    <label class="ug-rating__item">
      <input class="ug-rating__input" type="radio" name="score" value="2" checked>
      <span class="ug-rating__star" aria-hidden="true"></span>
      <span class="ug-rating__label">2 stars</span>
    </label>
    <label class="ug-rating__item">
      <input class="ug-rating__input" type="radio" name="score" value="3">
      <span class="ug-rating__star" aria-hidden="true"></span>
      <span class="ug-rating__label">3 stars</span>
    </label>
  </div>
</fieldset>
<span class="ug-rating-display" role="img" aria-label="4.5 out of 5 stars" style="--strata-rating: 0.9; --strata-rating-max: 5;"></span>
```

- Each item's label is visually hidden; it names its radio. `itemLabel(score, max)` in the bindings changes the
  wording.
- `Rating` takes `label`, `max` (5), `name` (generated when absent), `value` or `defaultValue`, a change callback
  and `disabled`. `RatingDisplay` takes `value` and `max`, and an optional `label` for its name; its
  `--strata-rating` (0–1) is the score over `max`, and `--strata-rating-max` sets how many stars it shows.
- No overlay.

## 8. Keyboard and screen reader

| Key | Action |
| --- | --- |
| Tab | Moves to the checked star (or the first) and out of the group |
| Arrow keys | Change the score by one, wrapping |
| Space | Selects the focused star |

- Announced as a radio group named by the legend, each star as "3 stars, radio button, 3 of 5". The display is an
  image named by its score.

## 9. CSS presentation

Each star is a 24 px target whose `::before` is the star shape (`clip-path`), so the focus outline is not clipped.
Stars up to the checked one are filled, through `:has()`; with none checked, all are unfilled. The display paints
two rows of stars with a mask: unfilled, and filled clipped to `--strata-rating`. Under `forced-colors` filled stars
are `Highlight` and unfilled ones `CanvasText`.

## 10. Tests

- **Bindings:** matches this markup; a click and arrow keys set and report the score; the value is submitted; filled
  stars follow the score; the display is an image named by its score.
- **GPU:** the stars are captured with no primitive; a real click on a star sets the score, and GPU stays on.
