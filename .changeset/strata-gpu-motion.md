---
---

Move presented Strata panels through depth on the GPU: `strataEnter` and `strataLeave` from `@underglass/ui/dom` hand a panel in face mode to `@underglass/ui/gpu`, which uses core's `transition`. This is in the private @underglass/ui package; it is not published, so users see no difference.
