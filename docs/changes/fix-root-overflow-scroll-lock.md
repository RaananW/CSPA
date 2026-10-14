## 2026-10-14 — Modal scroll locks keep GPU

- Single-axis overflow on `<html>`, or on `<body>` when it propagates to the viewport,
  no longer returns the app to ordinary DOM. Dialog libraries lock page scrolling this
  way while a modal is open (Fluent UI v9 sets `overflow-y: clip` on `<html>` and
  `overflow-y: hidden` on `<body>`), which previously failed with "Single-axis
  visible/clip external overflow is outside the bounded rectangular viewport contract".
- Root overflow applies to the viewport, which always clips; it is not a clip of an
  ancestor box. Single-axis overflow on any other ancestor of the canvas still uses
  ordinary DOM.
- Upstream: WICG html-in-canvas `5fb3df86` (2026-10-09, unchanged); Chromium hotlist
  6783002 requires sign-in (not read); tested on Chrome Canary 158.0.8105.0, headless.
