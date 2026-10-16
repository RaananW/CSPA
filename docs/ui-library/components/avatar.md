# Avatar

Tier B. Follows the [anatomy template](../design-language.md#17-component-anatomy-template) and the
[conventions](README.md#conventions).

## 1. Purpose and native element

Represents a person or an entity with a picture or their initials. Renders a `<span>`: with a picture, it holds a
native `<img>` whose `alt` is the name; with initials, the span has `role="img"` and is named by the name, so a
screen reader reads "Ada Lovelace", not "AL". An avatar beside the name in text is decorative and hidden from
assistive technology. No APG pattern applies.

## 2. Object

A **raised coin**: a round plate at `elevation.raised` with a bevel, standing on the surface. It has no moving
parts and takes no input.

| Part | Shape | Height at 50% | Moves |
| --- | --- | --- | --- |
| Coin | Circle, `1.6 × size.indicator` across (26, 32 or 38 px) | `elevation.raised` (3) | No |
| Initials or picture | Centred in the coin; a picture is clipped to it | Flat (captured content) | No |

## 3. Faces and materials

| Face | Colour role | Text role | Material role |
| --- | --- | --- | --- |
| Coin | `secondary` | `text`, strong, at 40% of the coin's size | `control` (`matte`) |
| Picture | The image | — | `control` |

`data-strata-material` on the avatar overrides the material.

## 4. Elevation per state

| State | Relief | Objects | CSS |
| --- | --- | --- | --- |
| Rest | Coin at `elevation.raised` | A round slab at raised height | Relief recipe at `raised` |

Hover, pressed, focus, selected, invalid, busy and disabled do not apply: an avatar is not a control. An avatar
inside a link or button takes that control's states from it.

## 5. Relief primitives

One `raised` primitive: the `<span>`, from its border box and its 50% `border-radius`. At the Objects level it is a
round slab.

## 6. Tokens it reads

| Token | Prop |
| --- | --- |
| `colour.secondary`, `colour.text` | — |
| `size.indicator` | `size` |
| `elevation.raised`, `bevel.*`, `shadow.*` | — |
| `material.roles.control` | `material` |
| `font.weight.strong` | — |
| `level` | `level` |

## 7. DOM structure and overlay needs

```html
<span class="ug-avatar" data-strata-face="raised" role="img" aria-label="Ada Lovelace">
  <span class="ug-avatar__initials" aria-hidden="true">AL</span>
</span>
<span class="ug-avatar" data-strata-face="raised">
  <img class="ug-avatar__image" src="/people/grace.jpg" alt="Grace Hopper">
</span>
<span class="ug-avatar" data-strata-face="raised" aria-hidden="true">
  <span class="ug-avatar__initials">AT</span>
</span>
```

- The outer `<span>` is the boundary element: refs, `class` and `style` reach it.
- **Initials** come from the name: the first letter of its first and last words, upper-cased ("Ada Lovelace" is
  AL, "Plato" is P).
- **Decorative** (the `decorative` prop): `aria-hidden="true"` and no name, for an avatar beside the name in text.
- **React, Vue and Astro:** `<Avatar name src? decorative?>`; `size` and `material` as for every component.
- No overlay.

## 8. Keyboard and screen reader

- Not focusable, and no keys. An avatar is an image named by the person's name, or nothing when decorative.

## 9. CSS presentation

An inline grid, square, `border-radius: 50%`, with the `raised` recipe and `secondary` background; the initials are
centred, strong and `0.4×` the coin's size; a picture covers the coin (`object-fit: cover`). Under `forced-colors` the
coin has a `CanvasText` border.

## 10. Tests

- **Bindings:** React, Vue and Astro render exactly the markup above; initials from names; the picture's `alt`; a
  decorative avatar is hidden; the three sizes; axe in light and dark.
- **GPU:** at Relief and Objects the avatar is one round raised primitive (a slab at Objects) with a radius of half
  its width.
