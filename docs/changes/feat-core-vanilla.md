## 2026-10-15 — Plain DOM on `@underglass/core`

- New guide page, [Other frameworks and plain DOM](../guide/frameworks.md): mounting a plain-DOM app
  with `mountApplicationModule`, enrolling its sections with `controller.enroll`, and the three jobs
  of a framework adapter (mount once, register layers, reconcile after each update).
- New playground page `vanilla.html`: the shared framework-adapter app with no UI framework, styled
  with `compileStyle` and updated only with ordinary DOM writes.
- New shared browser contract `tests/helpers/framework-contract.mjs`, which every adapter page must
  pass: GPU stays on through content, structure and transform updates, the canvas shows fresh pixels,
  native hits land on the moved elements, and disable, enable and dispose keep the original root and
  state. `tests/browser/vanilla.test.mjs` runs it on the plain-DOM page at DPR 1 and 2.
- No library code changed.
