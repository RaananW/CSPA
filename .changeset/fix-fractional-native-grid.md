---
"@underglass/core": patch
---

Fix GPU admission for layers laid out at fractional CSS sizes (for example an auto-height panel at 377.25 px): their native capture grid is fractional, and the renderer kept reallocating a whole-texel texture for it, so admission failed with "Native refresh did not settle". Textures now round the grid up.
