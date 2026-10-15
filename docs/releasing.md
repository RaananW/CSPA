# Releasing

The library packages are versioned and published with [Changesets](https://changesets.dev) and the
[Release workflow](../.github/workflows/release.yml). The tooling is in place but **dormant**: every
package is still `"private": true`, and the workflow does nothing until it is enabled. Nothing can
reach npm until both switches below are flipped.

## Versions

`@underglass/core`, `@underglass/react`, `@underglass/vue` and `@underglass/css-compiler` share one
version (a Changesets `fixed` group in [`.changeset/config.json`](../.changeset/config.json)):

- A release bumps all four together, to the largest bump any pending changeset asks for.
- The adapters and the compiler pin the exact core version they were released with, so an
  application always gets one core and one engine.
- While the version is 0.x, a **minor** bump marks a breaking change, and a **patch** bump marks a
  fix or an addition. The public API is the root and subpath exports documented in
  [api.md](api.md) and checked by `fixtures/package-consumer/public-types.ts`.
- Nobody picks version numbers by hand. Changesets computes them from the pending changesets.

The example apps (`@underglass/playground`, `@underglass/showcase`) are ignored by Changesets and
depend on `"*"`, so they always use the workspace's current library version.

## Changesets: one per pull request

A pull request that changes anything under `packages/` adds a changeset. CI fails without one.

```sh
npm run changeset              # pick the packages, the bump and write one user-facing sentence or more
npm run changeset -- --empty   # a package changed but users see no difference (tests, comments, build)
```

This writes a small Markdown file in `.changeset/`; commit it with the change. Write it for library
users: what changed, what to do differently, and any limits. For capture, geometry or presentation
changes, include the upstream check AGENTS.md requires (WICG proposal SHA and date, tracker access,
browser build tested). Changes outside `packages/` (tests, scripts, docs, examples) need no changeset;
the pull request description covers them.

The files in [docs/changes](changes/README.md) are the notes written before Changesets; they stay as
history, and their content is summarized in each package's `0.1.0` changelog entry.

## How a release happens

Once enabled, every push to `main` runs the Release workflow, which picks one mode:

1. **Changesets are pending:** it opens or updates a **Version Packages** pull request. That pull request
   applies the bump to every package, updates the core pins and `package-lock.json`, and prepends the
   collected changesets to each `CHANGELOG.md`. Review it like any pull request; merging it is the
   release decision.
2. **No changesets, and a public package's version is not on npm yet** (that is, right after the
   Version Packages pull request merges): it validates, packs and publishes.
   - **Pack** (hosted runner): build, typecheck, unit and compiler tests,
     `release-validation.mjs build-only` for both React peers, then pack the archives.
   - **GPU** (self-hosted GPU runner): the full browser suite and `test:package`, with React 18
     and 19, the HTML-in-Canvas flags on and off, at DPR 1 and 2.
   - **Publish** (`npm` environment): publishes the packed archives with npm trusted publishing and
     provenance, then pushes a git tag and a GitHub release per package, such as
     `@underglass/core@0.2.0`.
3. **Otherwise** it does nothing. This is always the case while the packages are private.

Publishing from a laptop is not part of the process. `publishConfig.provenance` makes `npm publish`
refuse outside a CI provider that can attest the build.

## Enabling releases

These steps are the owner's. They are account and repository settings that no pull request can make.

**Versioning only** (Version Packages pull requests and changelogs, packages still private):

1. In *Settings → Actions → General*, allow GitHub Actions to create and approve pull requests.
2. Set the repository variable `RELEASES_ENABLED` to `true`.

**Publishing to npm:**

1. On npmjs.com, in the `underglass` organization, add the GitHub repository `RaananW/underglass`, the
   workflow `release.yml` and the environment `npm` as a **trusted publisher** for each of the four
   packages. If npm requires a package to exist before it accepts a trusted publisher, publish its
   first version by hand from the release commit, then configure it. Provenance only works in CI, so
   that one publish has to run without it.
2. Create the GitHub environment `npm` (*Settings → Environments*). Add yourself as a required
   reviewer if every publish should wait for approval.
3. Keep the self-hosted GPU runner online with `GPU_RUNNER=true` ([ci-gpu-runner.md](ci-gpu-runner.md)).
   The workflow refuses to publish without it.
4. In a pull request, remove `"private": true` from the four package manifests, and update
   [distribution.md](distribution.md) and open issue SCOPE-005. When it merges, the workflow publishes the
   current version.

## Prereleases

To publish test versions under the `next` dist-tag instead of `latest`:

```sh
npx changeset pre enter next   # versions become 0.2.0-next.0, 0.2.0-next.1, ...
npx changeset pre exit         # back to normal releases on the next Version Packages pull request
```

Commit the `.changeset/pre.json` that `pre enter` creates; the workflow releases those versions as usual.
