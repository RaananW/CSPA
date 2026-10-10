# CanvasSPA implementation roadmap

**Evidence storage:** historical raw paths named below refer to the verified
external local archive, not files in this checkout. Only compact verdicts
remain tracked; [archive access, hashes and reproduction](archive-catalog.md).

This is a private experimental package, not an unchanged-app loader or release
commitment. Phases1-6 form the accepted baseline: native capture feasibility,
the owning-canvas pixel-copy pipeline, one persistent React root/shared engine,
typed authoring/motion, CSS/WAAPI ownership, inert ripple, TODO integration and
matching React18/19 measurements. [Phase6](measurements.md) establishes no
speedup: root-wide capture/readback on edits remains a measured cost.

| Phase | State and bounded deliverables | Gate |
| --- | --- | --- |
| 7: External components and declarative transitions | Implemented and independently accepted within bounded application/compatibility scope, with the permanent five-fixture provenance exception disclosed in [measurements](measurements.md): original-element `useSurfaceRef` enrollment/restoration; Radix Dialog1.2.0 through public `Portal.container`; numeric `transition`/`transitionGroup`; single-subtree `Presence`; runnable `/integration.html` and maintained contracts | Original native controls, actual motion/exit pixels, atomic refusal, callback-ref identity/replacement/unmount, React18/19, normal-invalidation 300-frame cache interval and zero retirement passed. See [integration](integration.md). |
| 8: Integrated effects and constrained extensions | Implemented and independently accepted with explicit limits: validated `setEffects` handles preserving `setRipple`; bounded dissolve/chromatic displacement in one shared pass; trusted `defineEffect` color function; native `/effects.html` composer and [contracts](effects.md) | Native safety, actual alpha/order/bounds/time pixels, capability/compile failures, lifecycle/media/ownership, measured incremental costs and matching React18/19 passed; [Phase8 acceptance summary](../evidence/phase8-acceptance-summary.json). Manual/device/release gates remain open. |
| 9: Scaling and production hardening | [Independently accepted-with-limits on actual installed155](../evidence/phase9-independent/acceptance-v1.json): synchronous DOM presentation barrier and generation-safe retirement/reentry for bounded membership/order/position/size/DPR changes; conservative root-wide capture retained, no speedup; [adoption/manual checklist](adoption.md) | Independent React18/19:21 units/types/build/94 and140 browsers; final-source baseline-identical DPR2 text mismatch, not pixel equivalence; exact154 and manual/device gates UNVERIFIED; autonomous coordinator155 continuation is not explicit user155 approval or154 waiver |

Phase9 is independently accepted-with-limits and recorded in private main.
The [archive catalog](archive-catalog.md) records the user-authorized raw-evidence
cleanup and rewritten phase history; old commit IDs in immutable verdicts are
archived provenance, not current-main ancestors.
Current membership/size/DPR changes still recover to DOM and require explicit
fresh admission. Route/shared-element transitions, springs, virtualization,
hydration, automatic external-animation conversion, general shader graphs and
remote shader loading are outside these bounded phases.

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
