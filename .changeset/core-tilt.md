---
"@underglass/core": minor
"@underglass/react": minor
"@underglass/vue": minor
"@underglass/css-compiler": minor
---

Add tilted layers: `Transform` gains `tiltX`, `tiltY` (at most ±60 degrees, as CSS `rotateX`/`rotateY`) and `perspective` (default 1600 px), in `setTransform`, `animate` and typed motion. On the GPU, pixels and native hits follow the projection; in ordinary DOM the same matrix is applied as `matrix3d`. Admission proves projective hit testing on the installed browser before tilt is allowed on the GPU. A tilted layer must not be clipped by a viewport or its own overflow (crbug.com/573454036, WICG html-in-canvas#186). The per-layer uniform block grows to 56 floats and compiled program sets move to version 4: rebuild them with the matching CSS compiler.
