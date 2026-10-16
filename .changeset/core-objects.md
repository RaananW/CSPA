---
"@underglass/core": minor
"@underglass/react": minor
"@underglass/vue": minor
---

Add the `objects` material: `setMaterial(id, { kind: "objects", scene })` takes a Strata scene in version 2 of the rendering model, whose back-to-front list also holds objects (keys, slabs, bezels, wells, rails, marks, knobs, pucks) seen through a perspective camera. Their tops keep the captured content in place and nothing is drawn outside a control; an object that would be is drawn at the Relief level and listed in `state().materials[].degraded`. Relief scenes also gain shadow occlusion by later primitives, which changes no conformance colour.
