# CanvasSPA implementation roadmap

**Evidence storage:** historical raw paths named below refer to the verified
external local archive, not files in this checkout. Only compact verdicts
remain tracked; [archive access, hashes and reproduction](archive-catalog.md).

This is a private experimental package, not an unchanged-app loader or release
commitment. The complete fourteen-phase plan is below. Phases1-10 are accepted
within their bounded engineering scope; Phase11 engineering is accepted but its
full human/physical gate is incomplete. Phases12-14 are proposed, not started or
authorized implementation. Planning/inspection was a preface, not an additional
numbered delivery phase. [Phase6](measurements.md) establishes no speedup:
root-wide capture/readback on edits remains a measured cost.

| Phase | State and bounded deliverables | Gate |
| --- | --- | --- |
| 1: Scaffold and native feasibility | **Bounded feasibility accepted.** Minimal Vite/TypeScript/React scaffold, native DOM baseline and diagnostic probe; public Lite/WebGPU versus WebGL2 feasibility and owning-canvas pixel-copy decision | Actual native capture/composition pixels, geometry and input, exact browser/API restrictions, useful DOM refusal/loss recovery and cleanup; a failed backend probe is not runtime support. See [feasibility](feasibility.md). |
| 2: Shared runtime and typed authoring | **Bounded engineering accepted.** `GPUHost`/`Surface`, browser-style compiler, layer registry, separate capture/frame schedulers, finite affine API and resource/capability state | Two independent layers share one renderer; static content is reused during GPU-only animation; typed text/button/controlled input works in GPU and DOM. No handwritten CSS is required for the typed path, not a general CSS-engine claim. See [API](api.md). |
| 3: Native interaction and lifecycle | **Bounded engineering accepted under conservative policies.** Native hit geometry, focus/forms, ordering, media/visibility, StrictMode, resize/DPR, loss/disposal and external native overlay boundaries | Original pointer/keyboard/state continuity and clean repeated lifecycle; unsupported scroll/clipping/nesting recover useful DOM; structural changes require explicit fresh admission. Human/device proxies do not certify actual accessibility or physical reset. See [adoption](adoption.md). |
| 4: Animation ownership and adapters | **Bounded engineering accepted.** Transactional CSS/WAAPI property ownership, narrow translated keyframes/timelines and trusted application-module adapter | Single animation ownership, actual pause/seek/release pixels, preservation of later application declarations, atomic diagnosed refusal of conflicts/unsupported timing and dependencies. See [animation API contract](api.md). |
| 5: Inert shader effect and paired demos | **Bounded engineering accepted.** Decorative ripple/refraction and paired existing-CSS/typed numeric-motion examples with deliberate GPU/DOM modes | Actual time-varying shader pixels without warped essential controls; equivalent original React input/button/form behavior, supported geometry and zero disposed resources. See [effects](effects.md). |
| 6: Evidence, comparison and documentation | **Bounded automated engineering accepted, with permanent provenance limits.** Matching React18/19 specimens, ordinary-DOM comparisons, edit latency/scaling/resource measurements and maintained docs | Reproducible versions/source/workloads and linked outcomes; distinguish CPU submission from GPU execution and polling/readback latency. No speedup claim; five original Phase6 fixture reports remain lost, not reconstructed. Human/physical validation is separate. See [measurements](measurements.md). |
| 7: External components and declarative transitions | Implemented and independently accepted within bounded application/compatibility scope, with the permanent five-fixture provenance exception disclosed in [measurements](measurements.md): original-element `useSurfaceRef` enrollment/restoration; Radix Dialog1.2.0 through public `Portal.container`; numeric `transition`/`transitionGroup`; single-subtree `Presence`; runnable `/integration.html` and maintained contracts | Original native controls, actual motion/exit pixels, atomic refusal, callback-ref identity/replacement/unmount, React18/19, normal-invalidation 300-frame cache interval and zero retirement passed. See [integration](integration.md). |
| 8: Integrated effects and constrained extensions | Implemented and independently accepted with explicit limits: validated `setEffects` handles preserving `setRipple`; bounded dissolve/chromatic displacement in one shared pass; trusted `defineEffect` color function; native `/effects.html` composer and [contracts](effects.md) | Native safety, actual alpha/order/bounds/time pixels, capability/compile failures, lifecycle/media/ownership, measured incremental costs and matching React18/19 passed; [Phase8 acceptance summary](../evidence/phase8-acceptance-summary.json). Manual/device/release gates remain open. |
| 9: Scaling and production hardening | [Independently accepted-with-limits on actual installed155](../evidence/phase9-independent/acceptance-v1.json): synchronous DOM presentation barrier and generation-safe retirement/reentry for bounded membership/order/position/size/DPR changes; conservative root-wide capture retained, no speedup; [adoption/manual checklist](adoption.md) | Independent React18/19:21 units/types/build/94 and140 browsers; final-source baseline-identical DPR2 text mismatch, not pixel equivalence; exact154 and manual/device gates UNVERIFIED; autonomous coordinator155 continuation is not explicit user155 approval or154 waiver |
| 10: Package/distribution preparation | **Independently accepted with limits** ([verdict](../evidence/phase10-independent/acceptance-summary.json)): private ESM library/declarations from the intentional entry; external matching React peers/public Lite; exact tarball contents gate; standalone [install/bootstrap/browser contract](distribution.md); actual tarball-installed React18/19 consumers | Independent23 units, pack8 and separate direct8 browser scenarios; strict Bundler/NodeNext types, original React controls, geometry/pixels/fault/loss recovery; owner38 source browsers not independently rerun, old full React18 matrix not run; not published, no license selected, not production-ready |
| 11: Human/native interaction and accessibility checks | **Engineering independently accepted with limits; human/physical validation pending** ([verdict](../evidence/phase11-independent/acceptance-summary.json)): native editable-boundary repair and actual installed React18/19 interaction audit | Full Phase11 INCOMPLETE: actual human OS IME/screen reader/everyday profile/background/physical display/device gates remain OPEN; proxies cannot close unavailable gates |
| 12: Dynamic lifecycle and performance envelope | **Proposed; NOT STARTED.** Safe automatic readmission/dynamic lifecycle for frequent membership/order/resize/DPR changes, cancellation/loss/media and retained original state; realistic edit-heavy performance budgets | Public lifecycle correctness before automatic admission; no stale output/native geometry or lost state; user-agreed frame/input/capture/resource limits against matched DOM on chosen hardware. Keep conservative capture unless public attribution proves a narrower correct path. |
| 13: Independent application adoption | **Proposed; NOT STARTED.** Independent real apps, chosen component/library integrations, public portal/layer ownership, application CSS, actionable diagnostics, stable typed APIs and explicit supported subsets | Reproduce native interaction/fallback/lifecycle in chosen applications and versions; framework/SSR/hydration support only for explicitly selected, verified targets. No custom reconciler, general CSS engine or complete UI kit. |
| 14: Release engineering and production pilot | **Proposed; NOT STARTED.** Reproducible browser/React CI, external artifact retention, security/dependency review, version/change and migration policy, separately decided licensing/publication, bounded observable pilot with DOM rollback/kill switch | Agreed correctness/compatibility/performance exit gates and demonstrated rollback before release; GPU readiness conditional on actual public native API availability and browser contract. Private packaging alone authorizes neither publication nor a production claim. |

The accepted [TODO application pilot](todo-pilot.md) sits between shader demos
and evidence work. It is a real-app milestone, not a fifteenth phase or a
renumbering: native add/edit/complete/remove/filter workflows, inert sampled-pixel
transitions, same-root state through fallback and clean disposal.

## Proposed continuation milestones

The following work needs separate authorization and chosen application/device
targets. It does not waive Phase11's outstanding human/physical release gates,
expand current support or promise deadlines/metrics.

**Dynamic lifecycle and performance:** first specify admission/retry/cancellation
semantics and prove frequent structural/resize/DPR changes during pending capture
and motion cannot reveal stale output or lose original state. Then measure
edit-heavy, scrolled and content-changing real workloads against matched DOM,
agree measurable budgets and validate fallback when those budgets cannot be met.
Loss/reduced-motion/forced-colors and healthy resource retirement remain gates;
unsafe capture suppression or manufactured speedup is not an optimization.

**Independent adoption:** select real applications and prioritized library
components; integrate through public refs/portals while preserving their CSS and
native controls. Record exact supported layout/effect/animation subsets, useful
diagnostics and API contracts, then independently verify recovery and interaction.
Only add framework/SSR/hydration gates if those targets are explicitly chosen.

**Release/pilot:** define reproducible browser/React CI and external evidence
retention, deterministic fixtures/package-consumer/bloat gates, focused security
and dependency review, version/change policy and migration guidance. Resolve
license/publication separately. Run an authorized bounded deployment with
observability and demonstrated DOM rollback/kill switch; release only after
agreed correctness, compatibility and performance gates pass. Experimental GPU
APIs cannot be certified into ordinary browser availability by these phases.

The [2026-10-10 user observations](adoption.md#user-observations-2026-10-10)
report keyboard/DOM/background-return usability and display-move DOM fallback.
They do not qualify all manual gates; screen reader/OS IME were not tested and
state retention during the physical display move is unconfirmed. Automatic
readmission is only a proposal, not implemented or authorized by this
documentation update. Current recovery still requires explicit fresh admission.

Phase9 is independently accepted-with-limits and recorded in private main.
The [archive catalog](archive-catalog.md) records the user-authorized raw-evidence
cleanup and rewritten phase history; old commit IDs in immutable verdicts are
archived provenance, not current-main ancestors.
Current membership/size/DPR changes still recover to DOM and require explicit
fresh admission. Route/shared-element transitions, springs, virtualization,
hydration, automatic external-animation conversion, general shader graphs and
remote shader loading are outside the currently implemented bounded scope.

## Private history policy

User-authorized history tracking uses private
[`RaananW/CSPA`](https://github.com/RaananW/CSPA), origin
`https://github.com/RaananW/CSPA.git`, main. The first commit after Phase7
acceptance explicitly includes the accepted Phases1-6 baseline plus Phase7;
there are no fabricated historical commits. Each later accepted phase receives
one commit and normal main push after its own acceptance.

Commit source/docs/tests and compact curated verdicts only, never raw reports,
screenshots or full performance dumps. Keep those in a verified local archive
outside the repository. Run `node scripts/check-evidence.mjs` against the exact
stage. History rewrites require explicit user approval; this cleanup has that
approval, not standing permission for later rewrites. Use the standard
Copilot coauthor trailer, verify private repository status and matching
local/remote main SHA after the normal push. This is not authorization to
publish, select a project license, release a package or modify upstream engines.
See [contributor instructions](../CONTRIBUTING.md).

## Open adoption gates

Real screen-reader/OS IME, everyday browser profile, physical device/display/
driver reset and genuine background-tab throttling remain unverified unless
explicitly recorded as performed. Synthetic visibility, CDP accessible trees
and configured-device destruction do not close these gates. No release-ready
or performance-improvement claim follows from the automated specimen suites.
