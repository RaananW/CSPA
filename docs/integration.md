# Phase 7 integration decisions

This bounded pilot uses **@radix-ui/react-dialog 1.2.0**, exactly pinned.
Registry metadata declares MIT and React/ReactDOM peers
`^16.8 || ^17.0 || ^18.0 || ^19.0 || ^19.0.0-rc`. The installed package's
public `Dialog.Portal` accepts `container`; this routes its original overlay
to the adapter-owned external host. Dialog Trigger/Close are real buttons;
the example's input/form stay native React controls. This is not certification
of all Radix components. Radix is unstyled: application CSS remains required
and is not replaced by Surface's typed authoring.

Chosen contracts before implementation:

- `useSurfaceRef` enrolls an existing direct persistent-root child, with no
  wrapper, node relocation or layout normalization. Its callback identity is
  stable for stable enrollment options. Invalid enrollment is atomic and
  reports a typed compatibility error. Replacement/null releases the old node.
- `useNativeOverlayHost` exposes the fixed external host for a library's
  public portal-container prop; no existing portal is moved.
- `Presence` retains one React-managed child subtree inside a stable enrolled
  boundary. Numeric enter/exit descriptors reuse the existing motion compiler.
  Replacement begins at the currently sampled transform; completion and
  cancellation are distinct. Bounded delay/stagger are descriptor timing, not
  a new scheduler or animation-library adapter.

Existing CSS transforms, clipping/scrolling, nested enrollment and competing
animations remain diagnosed restrictions. React-owned descendants never move.
Structural child removal can dirty capture; enrollment changes still recover
to DOM and require fresh admission. This section records the historical Phase7
gate; Phase8 is accepted separately and Phase9 hardening is
[accepted-with-limits on actual155](../evidence/phase9-independent/acceptance-v1.json),
not exact154 certification.

## Runnable integration and contracts

Open `/integration.html` on the established dev5173 service, add `?dom` for
native startup or `?strict` for genuine development StrictMode. The production
page uses the public profiling root/flush pair. Three original CSS-positioned
root children are enrolled, with one engine and three textures; Radix's modal
portal stays external to capture/root. The original native form, uncontrolled
card input, Dialog activation/focus trap/Escape/Close and ref replacement
work without cloned controls or descendant relocation.

The Phase9 specimen adds outside-root reorder/move/resize controls and a bounded
React-managed extra-layer fixture. These intentionally trigger DOM recovery;
request GPU again for fresh admission. The original keyed nodes, native input
value/focus/selection and Dialog state are retained. No React descendants move
outside their original subtree. [Adoption](adoption.md) describes migration.

Application integration imports only `src/canvas-spa/index.ts`. See the
[API examples](api.md#original-element-refs-and-library-overlays) for
`useSurfaceRef`, `useNativeOverlayHost`, `Presence` and controller
`transition`/`transitionGroup`. Ref IDs/options and Presence's ID/runtime stay
stable for a lifetime; changing descriptor props alone does not restart.
The imperative enrollment release is idempotent. Invalid original-element
enrollment throws typed codes before registration/attribute changes.

Transitions support the existing numeric channels/easings with one normal
iteration and at most60000ms including delay/stagger. A group prepares1..8
distinct IDs at one epoch, with0..1000ms index stagger. Competing animation
owners and DOM individual/important presentation dependencies refuse;
applied DOM samples are also checked for actual CSS precedence. New transitions
and replacement are committed only after every member's presentation is
staged and the complete group is revalidated. A preparation failure rolls
back still-owned declarations/priorities and leaves prior handles, epochs and
canonical transforms intact, including reduced-motion endpoint preparation.
Style-dependent and cross-member CSS selectors can therefore refuse a group
without orphaning an earlier member. Cancellation
restores the starting canonical transform and still-owned declarations;
replacement starts at the prior current sample. Reduced motion completes at
the endpoint. Ref DOM completion/recovery restores app-authored CSS rather
than permanently rewriting it; use authored CSS for the settled DOM state.

Presence retains the same subtree on exit, reverses without remount during
interruption, and mounts one new subtree after prior removal. Exit completion
or lifecycle cancellation removes retained content; parent unmount cancels
and suppresses stale callbacks. Initial present content is settled. Native
content stays interactive until React removes it; zero opacity is not a focus
or hit-test disable. Animate only the intended stable boundary. Content changes
still invalidate/capture normally. Membership/bounds/DPR/unsupported clipping
still require conservative DOM recovery and explicit fresh admission.

## Implementer validation (independent acceptance pending)

Final serial commands:

```sh
npm run test:react18
npm run test:react19
```

React18's matching18.3.1/DOM18.3.1/types18.3.31/18.3.7 fixture passes
TypeScript/build and68 shared runtime/animation/TODO/integration browser cases.
React19.3.0/DOM19.3.0/types19.3.0 passes15 units, TypeScript/build and114 serial
browser cases. Both record actual production and development18.3.1 or19.3.0,
resolved Dialog1.2.0/MIT/peer metadata and the identical shared-source hash
`069805d808e3f1946699c4c327799c147ba5a9813111dae06be5b2e6c8ea1671`.
Primary lock remains unchanged by matrix execution. The15-case integration
suite is included in both matrices. Focused transactional checks and the
original P7-1 reproduction also pass; the independent changes-required report
is preserved as historical evidence, not replaced by implementer results.

These accepted Phase7 reports used installed Chrome154.0.8037.98 and established
experimental native flags; the separate no-flags launch confirms useful DOM.
Current Phase9 runs record installed155.0.8059.40; their passes do not satisfy
the remaining exact154 gate. See [current verification](verification.md).
No browser download, everyday-profile change or upstream-engine patch.
Radix emits client-directive bundler warnings in this client-only Vite build;
they are not hidden and do not establish SSR/hydration support.

| Proof | Maintained evidence |
| --- | --- |
| Matching majors/dependency resolution | [React18 matrix](../evidence/phase7/react18/matrix.json), [React19 matrix](../evidence/phase7/react19/matrix.json); matching `build.log`/`behavior.log` or `full.log` |
| Original native input/form/focus/selection/refs/CSS; public Dialog overlay | `evidence/phase7/integration/native-{false,true}.json`; changed actual screenshot bytes >100, same root/input through recovery, external overlay focus trap/return |
| Atomic enrollment, callback replacement and20 retired lifetimes | [enrollment.json](../evidence/phase7/integration/enrollment.json); every retired core/runtime ledger and demo listener zero; one new active engine |
| Actual entering/exiting/interrupted/exited/reentered pixels | `presence-{false,true}.json` and matching PNGs in `evidence/phase7/integration/`; green `[20,200,90,255]` at rest, white after exit, intermediate alpha/translation pixels on enter/exit |
| Nonidentity native affine hit | [affine-transition.json](../evidence/phase7/integration/affine-transition.json); translation/rotation/nonuniform scale, canonical/public native coefficients within1e-5, real coordinate click focuses the original input and keyboard edits it |
| Replacement, repeated cancel, rapid toggles, reduced motion and DOM recovery | [transition-outcomes.json](../evidence/phase7/integration/transition-outcomes.json), presence reports |
| Shared epoch/stagger and atomic invalid groups | [coordinated.json](../evidence/phase7/integration/coordinated.json), [unmount-and-declarations.json](../evidence/phase7/integration/unmount-and-declarations.json); second DOM boundary's important CSS refuses before first starts |
| Transactional CSS preparation, prior-handle preservation and reduced motion | [fresh group](../evidence/phase7/integration/group-preparation-false.json), [existing transition](../evidence/phase7/integration/group-preparation-true.json), [reduced endpoint](../evidence/phase7/integration/group-preparation-false-reduced.json), [original P7-1 rerun](../evidence/phase7/integration/p7-1-reproduction.json); exact declarations/priorities, canonical phase and resource counts unchanged on refusal |
| Later app declarations/attribute and parent unmount | Same unmount report: later opacity/priority and drawable value preserved; parent removes one child, cancels motion and emits no stale completion callback |
| Genuine diagnostic loss and real HMR | [presence-loss.json](../evidence/phase7/integration/presence-loss.json), [hmr.json](../evidence/phase7/integration/hmr.json); usable original controls/reentry, zero final/old lifetimes |
| Useful ordinary browser DOM | [no-flags.json](../evidence/phase7/integration/no-flags.json); actual native form and Dialog focus/dismissal |

React18 reports and PNGs are copied under
`evidence/phase7/react18/reports/phase7/integration/`; primary reports above
are React19. Final normal-invalidation intervals use300 **real** RAF frames
of a60000ms numeric transition after settling, not a claim that an800ms exit
lasts300 display frames:

| Runtime / mode | GPU frames | React commits | Captures/copies/readbacks | Uploads |
| --- | --- | --- | --- | --- |
| React18 production | 163 ->463 | 10 ->10 | 33 ->33 each | 3 ->3 |
| React18 development StrictMode | 166 ->466 | 12 ->12 | 33 ->33 each | 3 ->3 |
| React19 production | 169 ->469 | 10 ->10 | 43 ->43 each | 3 ->3 |
| React19 development StrictMode | 169 ->469 | 11 ->11 | 43 ->43 each | 3 ->3 |

Admission counters also remain unchanged. Later native content edits increase
capture/upload and change output; native invalidation is not disabled. Natural
enter/exit completion and pixels are checked separately. Full preserved suites
also pass healthy pending fence/readback retention cases; no healthy resource
is force-destroyed to produce a zero ledger.

These are implementer results, not the parent's separate Phase7 acceptance.
Historical Phase6/parent reports remain untouched. No speedup is established.
Actual screen-reader/OS IME, physical-device/display/reset, everyday-profile
and genuine background-tab throttling remain unverified manual gates. Synthetic
visibility and diagnostic configured-device destruction do not substitute.
The [roadmap](roadmap.md) records planned Phases8/9 and private accepted-phase
history policy.
