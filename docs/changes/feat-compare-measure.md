## 2026-10-15 — Showcase: time each side of GPU or CSS?

- **Measure both** in the `#/compare` panel times each side alone: both sides paused, CSS only,
  then Underglass only (GPU mode only), 0.5 s settling and 1.5 s of frames each. Each pane's strip
  then shows its average rendering work per frame and the part above idle; the panel lists all
  three. Results are kept per comparison, setting and mode, and the previous Animate choice returns.
- Headful Chrome Canary 158.0.8105.0, GPU mode, CSS vs Underglass ms/frame (idle ~1–2): cells
  14.1 vs 3.4, burn 5.7 vs 2.7, ripple 4.5 vs 2.4, glow 4.4 vs 3.5, frosted glass 2.3 vs 2.4.
- `npm run test:showcase` presses Measure in both lanes.
- Showcase only; no library change.
