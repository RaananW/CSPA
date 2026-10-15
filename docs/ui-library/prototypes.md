# Strata look prototypes

Phase 1 of the [plan](plan.md#phase-1-define-the-design-language) settles the look from pictures before the
spec is written. The prototype page shows three candidate looks, each in all three presentations, with
real native controls. The prototypes are throwaway engineering, not components.

**Open it:** `npm run dev`, then `/ui-proto-look.html` in Chrome Canary with HTML-in-Canvas enabled
(the CSS row works in any browser).

## What is on the page

| | A · Subtle | B · Medium | C · Bold |
| --- | --- | --- | --- |
| **Relief** (default level) | Soft, short shadows, gentle bevels | The Phase 0 probe values | Deep bevels, long shadows |
| **Objects** (opt-in level) | Low keys (4 px), matte | Keys 8 px, satin | Tall keys (12 px), glossy |
| **CSS only** (fallback) | The same look from CSS | | |

**Held constant:** the light (from the top left), the palette (neutral greys, blue accent), the type and
the layout. Only how physical the look feels changes.

**What to try:**
- Hover and press Cancel and Save.
- Toggle Notifications.
- Type in the field.
- Tab through the controls to see the focus edge.

## Questions for the reviewer

1. **How physical?** A, B or C, or between two of them (for example "B's bevels with A's shadows").
2. **Light direction.** Top left is the convention, and it becomes fixed for the whole language. Keep it?
3. **Mood references.** Any products, objects or materials Strata should feel like?
4. **Palette.** Keep neutral greys with a blue accent, or use a brand colour?
5. **Name.** Keep "Strata"?

## Tuning page

After the first review (2026-10-15) the choice was "between A and B, leaning strongly to B", with depth,
light direction and theme as settings. `/ui-proto-tune.html` shows one panel as Relief, Objects and CSS only,
driven live by:

- **Depth:** 0% to 100%. 0% = A, 50% = B, 100% = C, blending bevel, shadows, heights, key travel, taper and gloss.
- **Light from** (azimuth, default 323°, the top left) and **light height** (elevation, default 41°).
- **Theme** (light or dark) and **accent** colour. Text on the accent switches between white and near-black
  for contrast, and the readout reports the accent's text contrast at rest and when lit.

The URL hash keeps the settings, so a configuration can be shared as a link. The default depth is 50%. If the
preferred spot is elsewhere, the scale is re-centred so that spot becomes the 50% default.

## Known prototype limits

- **Metal:** there is no environment map, so knobs and keys are glossy plastic rather than metal.
- **Shadow mismatch:** Objects shadows come from a coarse shadow map and are a little lighter than
  the Relief shadows.
- **Engines:** each GPU panel has its own engine and device here. Underglass uses one shared engine.
- **Themes:** the tuning page has a first dark theme; its highlight strengths still need tuning (the CSS
  highlight rim is too bright on dark). High contrast comes with the tokens.
