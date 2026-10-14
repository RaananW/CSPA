## 2026-10-14 — Showcase: webcam pond (experimental)

- New example `#/pond`: an optional camera image reflected on a koi pond, refracted
  together with the pond floor, text typed into a native input and CSS-animated fish by
  a continuous ripple, and lit by a custom WGSL water shader (caustics, depth, glints).
  A rotated native lily-pad layer feeds the fish; **Drop a pebble** splashes the ripple.
- Privacy: video only, started by an explicit button press and browser permission;
  frames stay in the page and its GPU canvas; nothing is recorded, uploaded or sent;
  Stop, leaving the example or closing the tab stops every track. The panel states this.
- Measured on Canary 157.0.8102.0: `<video>` frames are captured by
  `drawElementImageToTexture` and a playing video produces native paint events, so the
  pond layer refreshes at display rate (~57 uploads/s headful). A 2D canvas copy of the
  video was not captured, so the original `<video>` element is used.
