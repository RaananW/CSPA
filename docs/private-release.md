# Phase14 private release engineering

**Started, not release-qualified.** The selected pilot is the existing Phase13
task workspace, locally production-built on the qualified Mac/Canary157 route.
No external deployment, registry publication, license decision or real-user
profile is part of this engineering subset. Package identity stays private
`canvas-spa-phase-one@0.0.0`. [Open gates](open-issues.md) remain authoritative.

## Reproducible lanes

The current checkout is an npm workspace: tooling at the private root, the
canonical release manifest/source at `packages/canvas-spa`, and all ten page
entries at `examples/playground`. The runner copies these owners, grouped tests
and required tooling into each physical peer tree; it packs the child package,
not the tooling root. Package README and copied standalone distribution docs
are deliberate archive inputs. Existing Phase14 acceptance/seals remain exact
old-layout authorities, not qualification of newly restructured outputs.

Use existing provisioned dependencies with Node24.19.0/npm11.17.0. The runner
records actual tool versions, HEAD, source/lock inputs, physical peer resolution,
commands/exit codes and exact fresh archive member hashes. It never installs
dependencies or browsers. Missing tools/dependencies fail; provision them only
with separate authorization.

```sh
# Units, source/installed types, production/library builds and exact pack:
node scripts/release-validation.mjs build-only
# Original DOM pilot: no native flags, GPU not requested:
CANVAS_BROWSER_EXECUTABLE="/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary" \
  node scripts/release-validation.mjs dom
# Requested native pilot: exact current build + functional admission required:
CANVAS_BROWSER_EXECUTABLE="/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary" \
  node scripts/release-validation.mjs native
```

Both current browser lanes target actual CDP `Chrome/157.0.8100.0` and revision
`@799dbe91dfe8604f0327d070ecd6d2792a7d3d63`, recorded before fail-closed
assertions. Native additionally requires current functional admission,
owning-output pixels and original native task actions. A DOM recovery on a
requested-native gate is failure, not a GPU pass. Build-only explicitly records
GPU/browser lanes **not executed**. Ordinary DOM proves usability with GPU not
enabled, not native-method absence on157 or a154 waiver.

The 2026-10-12 target refresh records the actual new8100 identity in both flag
configurations before application qualification. The exact guard still rejects
wrong versions/revisions, including the previous8099 identity. This separately
bounded current-installed target does not reinterpret the accepted8098/8099
archives/verdicts or the retained failed8098-expected run.
Fresh WICG review remains at `5fb3df86d84de598c7f0fcfc5ee53de1df067e7d`
(2026-10-09); anonymous hotlist access returned only the Chromium shell, not
verified issue rows or landed-build evidence. Current functional native
admission, geometry/hits and changed W/I title owning pixels are required in
addition to exact browser identity; neither labels nor useful DOM count as GPU.

## Newly installed Canary qualification (2026-10-12)

Fresh headless local automation passed on the exact8100 product/revision above,
with executable SHA256
`65171c50389da7840d33c3479e1f43cf47d4275171f9ca822ee72270835981ec`.
These are new physical writable execution trees, not reruns inside accepted
8099 workspaces or retrospective changes to their verdicts.

| Gate | Fresh result |
| --- | --- |
| Showcase | 16 focused units, types, public library/declarations, project/root-base builds, sanitized output, catalog/search/category/direct reload/keyboard navigation, fresh mobile DOM contexts, synthetic absent-WebGPU refusal and explicit native activation passed |
| Release source and fresh packed consumers | 49 units per physical React18.3.1/19.3.0 peer in each lane, all ten production pages, library/declarations, strict Bundler/NodeNext types and safe thirteen-export Node import passed |
| Finite task workflow | Eight native and eight ordinary-DOM cases: React18/19, source/package, DPR1/2; original trusted input/edit/Save, state/value/focus/selection/root preservation, DOM rollback typing and zero final disposal passed; native additionally passed functional admission, owning pixels, current hits and explicit GPU reentry |
| Exact library archive | All four fresh archives remain 49,864 bytes/25 members, SHA256 `dc9cb834a36971e0980fa16262140768ddaabaf90fa2095c6c437114611f3bff`; installed members and current child manifest were checked |

The native showcase changed32W/32I owning-title comparison differed by8,719
pixels; the separate motion and decorative shader comparisons differed by
21,480 and8,735 pixels. Each native release24W/24I comparison differed by2,070
pixels at DPR1 and6,439 at DPR2. Actual React and ReactDOM versions were recorded
before peer assertions; ReactDOM18's source-backed production suffix remains
`18.3.1-next-f1338f8080-20240426`.

One settled showcase motion window lasted251.1ms: layer x advanced from
-11.678 to-28.107 and GPU frames84 to99, while captures/uploads stayed54/54.
This is short capture-reuse behavior proof, **not** a DOM/GPU performance
comparison, a React commit measurement, GPU execution timing or a physical
input/display latency result. Numeric budgets and broader manual/hardware
qualification remain open.

Retained local runs are `evidence/showcase/run-298270fc-ec21-4b12-9a97-75ef059bd539`,
`evidence/phase14/run-de6438de-12dc-4af1-9942-0ee033b8bb3c` (native), and
`evidence/phase14/run-75115d01-6f88-4e50-9ead-0b842d560990` (DOM). The earlier
`evidence/showcase/run-801c26d7-c18b-45d4-831c-aeb20c9226a7` failed before
browser assertions because isolated runners did not copy `docs/showcase.md`,
newly read by the browser-requirement unit. Both copy inventories now include
that guide, with a regression; the failed run remains retained.

All owned qualification previews/browsers were closed; the user's existing
5173/5180 previews were not restarted. Library/application sources, manifests
and locks did not change. This is bounded fresh automated qualification, not
a new independent acceptance, full browser-suite run, hosted deployment,
public release or exhaustive historical-integrity audit.

## Hosted build-only definition

`.github/workflows/private-release.yml` defines a manual, read-only-permission
hosted **build-only** lane with exact lock restore and no browser downloads.
Actions are pinned to commit SHAs and checkout credentials are not persisted.
It has not been dispatched or qualified. Hosted ordinary browser/native
capability is not assumed. No artifact upload is defined: raw local outputs may
contain environment paths/browser argv and require privacy review before any
sharing. Authorized CI dependency restore is a definition, not permission for
local installation or registry updates during this task.

## Isolation and retained artifacts

Each invocation creates a unique ignored `evidence/phase14/run-<UUID>` and
physical writable source/consumer/dependency trees for each matching React peer.
Root overrides are refused; existing physical path segments are checked before
directory creation and the created path is checked again.
No new execution uses sealed source workspaces, directory symlinks or sealed
optimizer outputs. Physical dependency copies exclude `.vite`, `.vite-temp`
and tool shim directories; Vite runs with owned caches. Root dependencies and
accepted sources remain read-only inputs. Actual browser React/ReactDOM versions
are recorded before assertions; the source-backed React18 production DOM suffix
is accepted, not a guessed major.

Command records, logs, runtime/browser snapshots and terminal result are written
once. Failures stay in their unique run and return nonzero. No fixed destination
or old archive is reused. Retention depends on maintainer storage; no duration,
automatic upload or durable hosted-artifact promise is made. The dependency
inventory is not a completed vulnerability review. A separate read-only
existing-runtime assessment found no high-confidence exploitable findings in
31 reviewed baseline files. A GitHub reviewed-advisory metadata lookup of99
locked npm package/version pairs returned HTTP200 and zero matches with no
next page. This is not `npm audit`, dependency-source inspection, artifact
integrity or security certification. The release-script/CI delta was independently
reviewed, and the exact thirteen-path private engineering freeze was independently
qualified-accepted and persisted at [4a973abb](https://github.com/RaananW/CSPA/commit/4a973abb8218c71365571c03c15ca9fa566d4d5b);
this is not whole-release qualification. INT-001 and INT-002 remain unchanged:
five lost originals and one damaged generated metadata file are not restored.

## Pilot and rollback

The source task app receives production/type checks and the same finite browser
pilot through a generated source-import bootstrap. The package pilot uses
the physically extracted **fresh current archive**, not a core alias or the
older accepted25-member tarball. Changed README/distribution inputs therefore
receive new member hashes. Strict Bundler and NodeNext consumers use the public
entry and the same copied authored task controls.

At DPR1/2 in React18.3.1/19.3.0, the finite pilot edits a native selected task,
saves, observes owning pixels in requested GPU mode, then explicitly calls public
`controller.disable()` while original notes retain value/focus/selection/root/
control identity. GPU resources return to their ordinary DOM baseline; original
roots/canvases/lifetime listeners intentionally survive until disposal.
Native typing remains useful in DOM. A visible explicit
`enable()` must actually readmit in the native lane; final `dispose()` retires
resources/timers/listeners. No automatic retry or duplicate React tree is added.
Snapshots preserve real capture/upload/frame/resource counters; no approved
numeric budgets, speedup, physical frame join or universal compatibility follows.

Applications may wire their external kill switch to `disable()`; they must
surface raw status/reasons and await resource retirement. `dispose()` permanently
ends that controller and root. The maintained consumer already exposes Enable
GPU, Recover DOM and Dispose controls; essential semantics remain native.

## Version and migration proposal

This is a policy proposal, not a release/version change. Future experimental
browser/API changes require explicit compatibility decisions and source plus
exact-installed-package functional proof, not silent legacy adaptation.
Breaking public types, ownership, enrollment or lifecycle behavior should have
a recorded migration note, replacement example and independently accepted
native/DOM rollback path before a separately authorized version change.
Keep original state/control ownership, explicit initial admission, diagnostic
refusal and public portals. Do not migrate by cloning controls or hiding errors.

License, publication, security/contact ownership, observability service, pilot
performance budgets and full release readiness remain separate decisions.
