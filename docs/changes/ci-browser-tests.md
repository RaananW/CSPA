## 2026-10-14 — GPU browser suite in CI (self-hosted GPU runner)

- New `Browser` workflow runs a WebGPU/HTML-in-Canvas probe, a GPU admission smoke test and
  the full browser suite on a self-hosted runner labelled `gpu`. It is skipped until the
  repository variable `GPU_RUNNER` is `true`, and never runs fork pull requests.
- GitHub-hosted runners cannot run it (measured): Linux SwiftShader WebGPU loses its device
  on canvas presentation, Windows runners have no WebGPU adapter. Setup:
  `docs/ci-gpu-runner.md`.
- `CANVAS_BROWSER_EXTRA_ARGS` adds browser flags; `scripts/ci-browser.mjs` fetches the newest
  Chrome for Testing Canary. Canary 158.0.8104.0 passes the runtime suite on a hardware GPU.
