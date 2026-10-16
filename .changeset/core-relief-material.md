---
"@underglass/core": minor
"@underglass/react": minor
"@underglass/vue": minor
---

Add the built-in `relief` material: `setMaterial(id, { kind: "relief", scene })` shades a Strata Rendering Model scene (bevels, wells, finishes, cast shadows, focus edges and ring arcs for up to 256 relief primitives) on any enrolled layer, with face interiors held to the model's contrast guard. `MaterialHandle.update(scene)` changes states and geometry without recompiling. New exported types: `CustomMaterial`, `ReliefMaterial`, `ReliefScene`, `ReliefPrimitive` and `ReliefSceneMaterial`.
