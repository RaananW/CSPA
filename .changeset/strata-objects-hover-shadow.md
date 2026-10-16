---
"@underglass/core": patch
"@underglass/react": patch
"@underglass/vue": patch
---

Soften cast shadows in the `relief` and `objects` materials. On a face interior held by the contrast guard, a cast shadow is now scaled to darken by at most `interior.max` instead of being cut off there, so a tall caster's shadow fades smoothly instead of standing as a flat grey plateau. In `objects` scenes, hover now raises an object's cap by a quarter of its height (it no longer multiplies the height by `state.hoverHeight`), and hit safety checks that hovered geometry.
