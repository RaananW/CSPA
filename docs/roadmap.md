# CanvasSPA implementation roadmap

This is a private experimental package, not an unchanged-app loader or release
commitment. Phases1-6 form the accepted baseline: native capture feasibility,
the owning-canvas pixel-copy pipeline, one persistent React root/shared engine,
typed authoring/motion, CSS/WAAPI ownership, inert ripple, TODO integration and
matching React18/19 measurements. [Phase6](measurements.md) establishes no
speedup: root-wide capture/readback on edits remains a measured cost.

| Phase | State and bounded deliverables | Gate |
| --- | --- | --- |
| 7: External components and declarative transitions | Implemented and independently accepted within bounded application/compatibility scope, with the permanent five-fixture provenance exception disclosed in [measurements](measurements.md): original-element `useSurfaceRef` enrollment/restoration; Radix Dialog1.2.0 through public `Portal.container`; numeric `transition`/`transitionGroup`; single-subtree `Presence`; runnable `/integration.html` and maintained contracts | Original native controls, actual motion/exit pixels, atomic refusal, callback-ref identity/replacement/unmount, React18/19, normal-invalidation 300-frame cache interval and zero retirement passed. See [integration](integration.md). |
| 8: Integrated effects and constrained extensions | Implemented and independently accepted with explicit limits: validated `setEffects` handles preserving `setRipple`; bounded dissolve/chromatic displacement in one shared pass; trusted `defineEffect` color function; native `/effects.html` composer and [contracts](effects.md) | Native safety, actual alpha/order/bounds/time pixels, capability/compile failures, lifecycle/media/ownership, measured incremental costs and matching React18/19 passed; [final verdict](../evidence/phase8-independent/acceptance-v3.json). Manual/device/release gates remain open. |
| 9: Scaling and production hardening | Planned, not implemented: profile safe capture attribution for measured edit overhead; generation-safe bounded membership/resize refresh; manual compatibility checklist; adoption/migration docs | Matched old/new2/4/8-layer,DPR1/2 edit workloads with actual changed output; no dropped native invalidation; original state/focus through replacement; healthy fencing/readback retention; precise manual/device gaps and separate acceptance |

Phase7 acceptance and verified history push precede this Phase8 implementation;
Phase9 depends on Phase8 acceptance and its separately authorized checkpoint.
Names for planned APIs are not promises.
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

Before committing, inspect the exact staging set for secrets/private paths and
unintended generated files; preserve intentional sanitized historical evidence
and ignore installed dependencies, caches and profiles. Use the standard
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
