# Change notes

Each pull request that changes behaviour, public API or tooling adds **one new
file** here instead of editing a shared list. Separate files never conflict, so
parallel and stacked pull requests merge cleanly.

- Name it after the branch, for example `feat-transform-origin.md`.
- Start with a dated heading and write a few bullets for library users: what
  changed, what to do differently, and any limits.
- Include the upstream check AGENTS.md requires for capture, geometry or
  presentation changes: WICG proposal SHA/date, tracker access and the tested
  browser build.

When a release is cut, the notes are folded into the "Changes" sections of
[api.md](../api.md) (or a changelog) and the fragment files are deleted in the
same commit.

```md
## 2026-10-14 — Transform origin

- `Surface`, `useSurfaceRef` and `enroll` accept `origin`.
- Upstream: WICG html-in-canvas `5fb3df86` (2026-10-09); Chrome Canary 157.0.8102.0.
```
