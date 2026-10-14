## 2026-10-14 — GPU admission works at fractional canvas positions

- Functional admission no longer fails when the output canvas sits on a fractional
  CSS pixel (scrollbars, centred layouts). Previously every showcase example stayed in
  ordinary DOM in a normal Canary window with "Functional native geometry/clip probe
  failed interior/clipped hit testing".
- Cause: on a rotated layer Chromium hit-tests `canvasClip` by its canvas-space bounding
  box, not the rotated rectangle. The probe's "clipped" test point was 0.04 CSS px
  outside that box. It now sits at least 2.4 CSS px clear of every boundary (probe
  extent up to 32 px, marker points away from colour, clip and element edges).
- The same bounding-box behaviour would let clipped-away content of a rotated layer
  with its own `overflow: hidden` stay clickable, so such a layer with overflowing
  content now uses ordinary DOM instead of mismatching hits.
- Upstream: WICG html-in-canvas `5fb3df86` (2026-10-09, unchanged); Chromium hotlist
  6783002 requires sign-in (not read); measured on Chrome Canary 157.0.8102.0, headless
  and headful.
