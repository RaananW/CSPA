# Phase13 bounded task workspace

This is the selected **client-only engineering implementation, awaiting fresh
independent acceptance**. It expands the existing `/todo.html` application;
it does not certify an arbitrary unchanged app, SSR/hydration, a component kit,
Phase14, publication or physical display continuity. Earlier TODO, package and
core acceptance records remain historical, immutable evidence.

## One authored application

`src/apps/todo/model.ts` owns one reducer and one original React control tree.
The local workflow supports at most six tasks, 32-character titles/search and
480-character notes. Search and completion filters combine; filtering a task
does not silently discard its selected details. The list and detail editor
share the same live title/notes state. Save trims the title and confirms an
edit; it is **not** backend persistence, a draft transaction or a network save.
Back preserves edits. Deletion requires explicit confirmation.

Three stable direct-root `Surface`s contain navigation/list, detail and inert
art. Typed layout/appearance compiles into ordinary browser CSS; the small
application stylesheet styles the same inputs, dialog and popover. DOM and GPU
are presentations of this one tree, not duplicated applications. The original
list scroll viewport and notes textarea retain native scrolling/editing.

`Presence` keeps a single detail subtree through its bounded 180ms exit and
rapid reversal. The application sets native `inert` and `aria-hidden` as soon
as selection clears: opacity does not make a control noninteractive. Focus
returns to the surviving original Details button, otherwise Search when the
trigger was filtered or deleted. Closing the confirmation while details remain
selected returns to the detail title; the popover retains native focus behavior.
This deterministic policy is authored
application behavior, not a library's generic focus restoration promise.

The pinned Radix Dialog1.2.0 uses its public `Portal.container`, an explicit
external native overlay host, focus trap, Escape and close autofocus. The
information popover uses `NativeOverlay` with authored CSS bounds and native
popover behavior. Neither is relocated or captured as a fake GPU control.
Declarative numeric detail motion and public decorative `setRipple` share the
existing renderer; art is native-inert, aria-hidden and nonessential. The same
art is static in DOM fallback.

## Public adopter bootstrap

The exact-package fixture `fixtures/package-consumer/todo-main.tsx` imports
only the intentional `canvas-spa-phase-one` entry. Its generated application
copies the actual task source and changes its API import to that entry; it does
not alias the core source or import a demo controller. The task app is example
source, **not** a new package export. An adopter authors/copies its application,
keeps its stylesheet and declares React/React DOM plus its chosen Radix version.
Only matching installed peer versions are reused during local validation.

```tsx
import { mountCanvasApp } from "canvas-spa-phase-one";
import { TodoApp } from "./task/TodoApp.js";
import { taskTransitions } from "./task/transition.js";
import "./task/todo.css";

let transitions: ReturnType<typeof taskTransitions>;
const controller = mountCanvasApp({
  captureHost, outputCanvas, ordinaryHost, overlayHost, strict: true,
  onStatus: message => { status.textContent = message; },
}, <TodoApp onTransition={event => transitions.pulse(event)} />);
transitions = taskTransitions(controller);
// Explicit user action: await controller.enable().
// Teardown: transitions.stop(); await controller.dispose();
```

All four empty connected hosts are siblings under one sized positioned frame,
outside the React root; only capture/output/ordinary fill that frame. The
overlay host is their sibling, not a descendant of the owning output canvas.
See [distribution](distribution.md) for host CSS and actual archive extraction.
No startup auto-enable, retry-on-commit or app-specific core abstraction is
introduced. Mounting a preexisting hydrated root is not part of this bootstrap.

`rendererDiagnostic` displays the raw reason with a small category:
active, caller lifecycle, admission, native capability, GPU error or
authored/framework boundary. Categories do not change runtime policy. A visible,
laid-out, unoccluded functional witness is mandatory before initial enable or
explicit reentry. Unproven initial admission stays useful DOM; an absent native
feature is distinguishable from a framework/layout boundary. Already-qualified
normal layout/scroll/media/membership changes retain GPU ownership under the
persisted bounded current-spec contract. Explicit disable/dispose and diagnosed
errors remain separate.

## Finite support and acceptance matrix

| Area | Selected route and observable gate |
| --- | --- |
| Application/state | Add, controlled search/status filtering, selection, title/notes, Save/Back/completion, confirmed deletion; original reducer/root/control identities |
| Native behavior | Trusted pointer/keyboard/form events, title focus, multiline notes/internal caret scroll, native popover, Radix trap/Escape and surviving/fallback focus destinations |
| Presentation | Three complete shared-renderer layers, owning-output pixels, current versus old/clipped native targets; no normal DOM mode transition or admission retry |
| Lifetime | Rapid Presence reversal, inert exit/deleted controls, explicit disable/reentry, capture failure/refusal, StrictMode and zero disposed resources/listeners/timers |
| Media/motion | Reduced motion and forced colors retain useful original controls; static DOM decoration; GPU-only settled motion distinct from native editing paints |
| Consumers | Source React18.3.1/19.3.0; exact physically extracted 25-member tarball; strict Bundler/NodeNext types; actual measured Canary157 DPR1/2 with enabled native feature and deliberately disabled-feature DOM |
| Scope boundary | Axis-aligned supported layout/scroll; nonreplaced list viewport and textarea; actual157 replaced canvas itself has no nonzero internal scroll in this qualified case |

The focused source workflow measures an explicit 300-frame GPU-only interval
after native/transition settling. The controller's advance operation performs
its own preparation settle; the demo probe now reports that actual interval
and retains the pre-preparation snapshot separately. Earlier 301-frame wrapper
failures remain raw evidence, not erased or reclassified as 300 passing frames.
Zero React/capture/upload/readback/copy delta applies **only to the settled
interval**. Live editing, focus/caret, native scroll and application actions
produce real owning native paints/captures; those totals are retained, not masked.
Screenshot/PNG reads are external test observation, not proof of zero-copy.

The new freeze links actual commands, every failure attempt, fresh CDP launch
identity, owning pixels, trusted events, source/package hashes and preservation
checks. Final acceptance belongs to the independent reviewer. Automated browser
accessibility semantics are bounded checks, not an OS screen-reader/IME audit.
Human physical continuity, universal text/DPR2 fidelity, transformed/mixed CSS,
arbitrary libraries, background/device-loss breadth and numeric application or
hardware performance budgets remain open. No speedup or release claim follows.
