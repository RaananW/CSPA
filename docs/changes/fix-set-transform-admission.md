## 2026-10-14 — Per-frame transforms no longer block GPU admission

- `setTransform` and `setOrigin` called while `enable()` is admitting no longer return
  the app to ordinary DOM. Previously, any call during admission wrote DOM transform
  declarations on every layer, and admission then failed with "Exclusive GPU
  presentation declarations were changed". Code that moves layers every frame (drag,
  springs, physics) could not be enabled while it was moving.
- During admission the new value is recorded and presented when admission completes,
  as declarative transitions already were. Updating native geometry every frame there
  instead would keep the native refresh from settling ("Native refresh did not settle
  within 3000 ms").
- Upstream: WICG html-in-canvas `5fb3df86` (2026-10-09, unchanged); Chromium hotlist
  6783002 requires sign-in (not read); tested on Chrome Canary 158.0.8105.0, headless.
