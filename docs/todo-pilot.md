# TODO application pilot

Open <http://127.0.0.1:5173/todo.html> (or `?strict` for development StrictMode).
Ordinary DOM is the default. Add with Enter or the native submit button,
complete/reopen with a checkbox or Space, edit titles live and confirm with
Enter, filter, and delete. There is no backend or persistent storage.

**Task interactions, not perpetual background art, trigger the transition.**
Add, complete/reopen, confirmed edit and deletion start a replaceable 900ms
radial ripple on captured striped artwork. The existing public shader samples
neighboring texture pixels at a time-varying displacement; this is not merely
a CSS transform/opacity transition. No claim is made that every possible CSS,
SVG or browser effect is incapable of a similar appearance.

## Integration and ownership

`src/apps/todo/model.ts` contains the pure reducer; `TodoApp.tsx` authors numeric
`Surface`/`Box` layout and appearance through the public API; `transition.ts`
owns one timeout and calls public `setRipple`. No application handwritten CSS
or direct engine/native-capture calls are needed. The browser still performs
HTML/CSS layout. `todo.html` has explicit host/shell CSS to align external
capture/output/ordinary destinations and inherit native control fonts.
The shell keeps accessible mode/reason/errors visible and puts full resource
JSON in collapsed details; initial New task is visible in a900x750 viewport.
This does not change the app's content or benchmark geometry/probe API.

Two enrolled surfaces stay fixed while React changes task rows. The original
forms, labels, buttons, controlled inputs and checkboxes live in one undistorted
surface. The separate artwork is inert, aria-hidden and pointer-transparent;
shader displacement cannot warp editable regions or control hit targets.
There is one engine and two textures, not one renderer per task.

Enable GPU requests real functional admission; unsupported capture/GPU/geometry
retains usable original DOM and reports the reason. Use ordinary DOM cancels
the pulse before recovery. Capture failure or changed host extent also restores
DOM and cancels the timer; fresh GPU entry is explicit. Same-root recovery
preserves task state, input identity, focus and selection. HMR instead retires
the previous adapter before creating a new root and intentionally resets tasks.
Disposal releases the timer, shell listeners and runtime/core ledgers.

Profiling, deterministic holds/clock advancement and fault injection are
separate in `src/demo/todo-demo.tsx`, `todo-probe.ts` and browser tests.
`window.todoProbe` is a diagnostic facade, not an application API.

## Findings and limits

The pilot is intentionally bounded to six tasks and 32-character titles, with
a fixed 420px controls layer and 280px artwork. Blank confirmed titles and a
seventh task give explicit inline errors. Very narrow layouts require ordinary
DOM; transformed scrolling/clipping and automatic resize admission remain
unsupported. A viewport resize changes the responsive shell's host width only
below its 760px maximum; an unchanged host extent is not a resize failure.

Inline SVG baseline space initially extended beyond its enrolled rectangle.
Numeric column layout makes the SVG a flex child and removes that overflow;
the renderer's conservative bounds policy was not weakened. Actual Vite HMR
requires the recognizable `import.meta.hot.accept()` expression, not an alias.
Neither integration correction changes reusable runtime behavior.

GPU decoration is optional: no-flags Chrome exercises a useful complete native
workflow and explicitly refuses experimental capture. DOM shows static artwork.
Reduced motion uses the existing runtime's identity effect policy. This is not
accessibility, IME, mobile, cross-browser or physical-device certification.
The subsequent [Phase 6 report](measurements.md) adds actual React18/19 behavior,
bounded headful/AX evidence and production costs, not full certification.
No performance improvement or heap/driver-memory claim is made.

## Reproduction and evidence

Use the pinned dependencies and installed Chrome documented in the README.
No additional package/browser installation is needed.

```sh
npm run test:unit
npm run build
npm run test:browser -- todo.test.mjs
npm test
```

Browser tests serialize writers and reuse responsive development port 5173;
the bounded production preview is port 5174. Do not start a competing server.
Evidence paths:

| Report under `evidence/todo/` | Verified outcome |
| --- | --- |
| `ordinary-no-flags.json` | Exact browser/build/launch flags; add/Space/edit/Enter/filter/delete, diagnosed refusal, zero disposal |
| `workflow-{false,true}.json` | Production profiling and development StrictMode; native GPU workflow, original root/input/focus/selection after DOM recovery |
| `task-transition.json`, `identity.png`, `task-phase-{0,07}.png`, `natural-finish.png` | Actual task trigger, distinct deterministic artwork pixels, unchanged essential pixels and both geometries, 300-frame counters and natural finish identity |
| `fallback-reentry.json` | Labelled synthetic capture exception, same original input/root and edited state; real host-width resize, explicit reentry and subsequent native task creation |
| `capacity.json` | Six tasks, explicit seventh-task refusal, one engine/two layers |
| `hmr.json` | Real timestamp-only Vite update, retired old ledgers/timer/listeners zero, new root native workflow |

The 300-frame interval is a **diagnostic continuation of a real task-triggered
effect**, held at deterministic positions and advanced through real RAFs at
1ms logical steps. It is not a claim that a natural 900ms pulse lasts 300 display
frames. Screenshots/readbacks precede the interval. Normal content invalidation
remains enabled; the interval requires zero extra actual React commits,
captures, pixel copies, native readbacks or uploads, including unchanged
admission counters. A subsequent real task action separately proves natural
900ms effect removal and exact identity artwork.

The full report is `evidence/todo-full-regression.log`; the previous accepted
Phase 4/5 report remains `evidence/phase45-full-regression.log`.

Final pilot validation passed **15 unit tests, TypeScript/Vite build and all
94 browser tests**, including all seven focused pilot cases. Installed Chrome
was 154.0.8037.98; package/browser versions and flags are unchanged from the
accepted gate. The final deterministic art comparisons changed 37,641 pixels
from identity to phase zero and 46,988 from zero to 0.7 seconds; essential-region
pixels and both canonical geometries were unchanged.

The settled interval recorded GPU frames 19 -> 319, actual React commits
2 -> 2, captures/copies/native readbacks 26 -> 26 each, uploads 4 -> 4, and
unchanged admission counters. The four uploads include genuine task/focus
content updates before settling, not four continuously recreated textures.
These absolute paint totals describe this run, not required constants; the
assertion is zero work deltas over 300 frames. All seven final reports and the
separately retired HMR controller have zero core/runtime resources, transition
timers and demo listeners.
