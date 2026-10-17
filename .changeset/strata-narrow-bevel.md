---
"@underglass/core": patch
"@underglass/react": patch
"@underglass/vue": patch
---

Shallower bevels for narrow bands in the `relief` material: a primitive whose bevel band is narrower than `bevel.width` now has its slope scaled by the ratio, so a 2 px groove (a divider, a tab rail) is a shallow groove instead of a near-black line. Primitives at least two bevel widths across are unchanged.
