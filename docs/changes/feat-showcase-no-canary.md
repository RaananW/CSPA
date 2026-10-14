## 2026-10-14 — Showcase: help for visitors without Canary

- The showcase detects (without starting the GPU) whether the browser has HTML-in-Canvas.
  If not, the studio shows how to get GPU mode: install Canary, two flags with copy
  buttons, restart. A **Show what GPU mode looks like** button opens a Canary screenshot
  of the current example.
- The Status line explains each runtime reason in plain language, with the exact
  reason under **Details**.
- The showcase asset guards accept hashed JPEG previews (checked to be JPEG); JS and CSS
  keep the private-content scan. The README gallery images moved to
  `examples/showcase/src/previews/` so both use one copy.
