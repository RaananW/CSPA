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

## Known prototype limits

- **Metal:** there is no environment map, so knobs and keys are glossy plastic rather than metal.
- **Shadow mismatch:** Objects shadows come from a coarse shadow map and are a little lighter than
  the Relief shadows.
- **Engines:** each GPU panel has its own engine and device here. Underglass uses one shared engine.
- **Light theme only:** dark and high-contrast themes come with the tokens.
