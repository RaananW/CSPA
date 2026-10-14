## 2026-10-14 — New custom effects without re-admission

- `setEffects` accepts a custom definition the layer was not admitted with while GPU
  is active. The layer gets a new pass: its WGSL is compiled and validated as a
  successor while the previous frame stays on screen, then it replaces the old pass.
  No DOM round-trip or fresh admission.
- A compile failure is still a diagnosed GPU failure that returns to ordinary DOM.
- Upstream: no capture/geometry change (WICG `5fb3df86`; Canary 157.0.8102.0).
