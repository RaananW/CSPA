---
"@underglass/core": minor
---

Relief materials draw their scene's shadow `outset` (up to 128 px per side) beyond the layer's box: shadows only, on every side the layer's clip does not cut. Native hits keep the border box, so the outset never takes a hit.
