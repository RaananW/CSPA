## 2026-10-14 — Transition effects on interactive layers

- `setEffects` accepts `interaction: "inert"` on any enrolled, non-decorative layer
  whose boundary element is not itself a control. Ripple, chromatic, dissolve and
  custom WGSL can now run on real components while they enter, leave or land, not
  only on decorative artwork.
- While such a handle is active the layer's content is inert (no clicks, focus or
  typing; focus inside it is lost) and the boundary keeps its hit area, so input
  over displaced pixels neither activates the layer's controls nor reaches a
  control underneath. Any end of the handle restores the content; making it
  interactive from application code ends the handle as `cancelled` and keeps GPU.
- New `EffectHandle.update(parameters)` changes parameters per frame without
  recompiling. A chain must use one interaction; mixing throws.
- `runtimeResources.transitionEffects` counts active transition effects;
  `decorativeEffects` keeps counting decorative ones.
- Upstream: WICG html-in-canvas `5fb3df86` (2026-10-09, unchanged); Chromium hotlist
  6783002 requires sign-in (not read); tested on Chrome Canary 158.0.8105.0, headless.
