---
"@underglass/core": minor
"@underglass/css-compiler": minor
"@underglass/react": minor
"@underglass/vue": minor
---

Add `setMaterial(id, descriptor)`: a persistent, colour-only material on any enrolled layer, interactive or decorative (`interaction: "material"`). The layer's controls keep taking input. The runtime evaluates the material on a neutral grey, never on the captured pixels, and scales the layer by one brightness factor limited to `interior.max` (at most 0.1), so text and its background change together and contrast holds. A material runs before the effect chain in the same pass, persists across ordinary DOM and readmission, and is reported in `runtimeResources.materials` and `state().materials`. The per-layer uniform block grows from 44 to 52 floats (`LAYER_BLOCK_FLOATS`), and compiled program sets are now version 3: rebuild them with the matching CSS compiler.
