## 2026-10-15 — Admit GPU while app code changes a layer every frame

- `enable()` no longer fails with `Native refresh did not settle within 3000 ms` when app code changes an
  enrolled layer on every frame (a `requestAnimationFrame` loop setting styles or attributes, as animation
  libraries and live charts do). CSS keyframe animations were not affected.
- Two causes, both fixed:
  - During admission every DOM mutation marked the layer membership as changed, even when no layer had
    joined or left. Drawing waits for membership to be reconciled, so each paint was skipped and asked for
    another. Only a real change in the layers (added, removed, replaced or reordered) now holds drawing;
    content and layout changes are already covered by the per-draw coverage check.
  - `settle()` waited until no native paint was requested at all, which never happens while content keeps
    changing. It now waits for the paint it was waiting for to complete (one that drew a frame); a newer
    request from later changes does not hold it. This also lets `settle()`, `disable()` and `animate()`
    finish on pages that never stop updating.
- New browser test: admission and `settle()` complete during a per-frame update loop, the first frame shows
  the layer (no blank frame), presented pixels keep changing, native hits reach the original controls in the
  updating layer, and the final colour is presented once the loop stops. It fails on the previous renderer
  with the settle timeout. The showcase validation now enables GPU while the ripple comparison animates and
  no longer pauses the comparison panes before `settle()`.
- Upstream: WICG html-in-canvas `5fb3df86` (2026-10-09, unchanged); Chromium hotlist 6783002 requires sign-in
  (not read); tested on Chrome Canary 158.0.8105.0 headless and headful. No browser API change is relied on.
