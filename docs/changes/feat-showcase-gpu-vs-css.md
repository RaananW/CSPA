## 2026-10-14 — Showcase: GPU or CSS?

- New showcase example `#/compare`: six comparisons, each done twice side by side, the best
  CSS technique on the left and Underglass on the right. Glowing tiles, ripple, channel split,
  burn away, recolouring 2,052 cells, and frosted glass, where CSS wins (Underglass shaders are
  per-pixel colour functions and cannot blur).
- A meter in the panel shows main-thread rendering work per frame and the frame rate; visitors
  animate both sides, one side or neither. Measured headful on Chrome Canary 158.0.8105.0 in GPU
  mode, CSS only vs Underglass only, about: cells 13 vs 2.6 ms/frame, ripple 4.9 vs 2.7,
  burn 4.9 vs 3.0, 104 glowing tiles 3.6 vs 3.1 (both paused: about 1.6).
- `npm run test:showcase` covers it in both lanes: every comparison keeps the lane's mode, the
  colour map is grey in DOM and coloured on the GPU, a paused pane is frozen and a running
  one is fresh, and native hits land on the original radio inputs.
- Showcase only; no library change.
