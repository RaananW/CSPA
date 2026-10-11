# Bounded effects (Phase8 implementation)

**Evidence storage:** historical raw paths named below refer to the verified
external local archive, not files in this checkout. Only compact verdicts
remain tracked; [archive access, hashes and reproduction](archive-catalog.md).

This gate uses the existing public Lite1.33.0 fullscreen compositor, not a
second renderer. No dependency changes are needed. Parameter-only updates use
one uniform buffer and one shared composition pass; there are no additional
textures or intermediate render targets. The limit is three unique operations
per enrolled layer, within the existing eight-layer budget.

Phase9 [actual155 accepted-with-limits hardening](../evidence/phase9-independent/acceptance-v1.json)
preserves this API and budget; exact154 remains unverified. Active
effects do not authorize unsafe structural output: changes to membership,
order/origin/size/DPR hide GPU presentation and require fresh admission.
Native capture stays neutral and root-attributed paint remains conservative.
See [adoption](adoption.md) for lifecycle/manual constraints.

The chosen extension is deliberately a **trusted application color function**,
not a shader graph, sandbox, remote loader, geometry/sampling extension or
resource allocator. An application supplies up to four bounded numeric
parameters and a WGSL function body. It receives only sampled color, local
coordinates, extent, seconds and a parameter vector. There are no engine objects
in the public contract. New custom definitions are prepared in idle DOM and
compiled during fresh hidden GPU admission. Parameter/time/chain updates to an
already admitted definition do not rebuild the shader.

## Contract

`setEffects(id, descriptors)` validates the complete chain before replacing
ownership. Every descriptor explicitly declares `bounds: "layer"`,
`interaction: "decorative"`, `media: "identity"`, `fallback: "static"` and
`time: { seconds, playing? }`. Only explicitly decorative, inert, aria-hidden
enrollments without interactive descendants are allowed. Pointer-transparent
GPU output is **not** justification for distorting or hiding native controls.

- `ripple`: `amplitude`0..12 CSS pixels.
- `chromatic`: `displacement`0..12 CSS pixels; red/blue sample displacement.
- `dissolve`: `amount`0..1, `speed`0..4; deterministic time-dependent alpha mask.
- `custom`: a `defineEffect` definition and exactly its declared parameter keys.

Sampling operations must precede color/alpha operations. Ripple/chromatic may
appear in either order; order is significant. Custom/dissolve may appear in
either order. No kind may repeat. Sampling clamps to the original layer and
fades displacement at its boundary; no effect expands output bounds. Zero
amplitude/displacement/amount is identity. Dissolve amount1 is transparent.
The shared compositor still presents its existing opaque white backdrop.

The handle exposes `seek`, `play`, `pause`, `cancel`, `dispose`, `state` and
`finished`. There is no implicit completion duration: playing is an explicitly
looping seconds clock (wrapped at1000 seconds, as in the compatible ripple).
Replacement resolves the previous handle as `replaced`;
cancel/dispose are idempotent, and stale handles cannot affect successors.
Other state-changing calls on retired handles throw. Invalid chains, parameter
keys, unsupported policies and unknown custom definitions leave ownership
unchanged. `setRipple` remains the compatible one-operation adapter and clears
the current chain when called with null.

Reduced motion presents identity and pauses playback; explicit `play` while
reduced motion is active throws. Fresh admission still compiles declared custom
definitions under reduced motion, so returning to normal motion can apply
them without a rebuild. Hidden documents pause clocks/drawing; visible
resumption does not catch up elapsed hidden time. Forced colors refreshes native
GPU content and supported structure changes retain motion and ownership. Loss,
factual unsupported effect/native boundaries and explicit disable retain usable original DOM with static
decoration and resolve active handles as `fallback`. Static fallback is not
claimed to reproduce a shader with CSS. Unmount disposes enrollment handles.
Normal native content invalidation stays enabled.

## Trusted custom authoring

`defineEffect` freezes the schema and requires `geometry: "color"`,
`bounds: "layer"`, `capabilities: ["webgpu"]`. Its WGSL body returns `vec4f`;
parameter vector ordering is declaration insertion order. Results are clamped
to0..1. WGSL is trusted local application code, **not** made safe by TypeScript
or text validation. Do not load untrusted source. The supported body is a
bounded pure color calculation, without external bindings or entry points.
Compilation uses bounded public configured-device shader diagnostics; actual shared
pipeline validation occurs while output is hidden. Failure is diagnosed and
recovers to DOM through the existing healthy-fence/loss lifecycle.

See `examples/playground/src/apps/effects/color-cycle.ts` for an effect authored outside runtime
modules through the public API. `/effects.html` is a native poster composer:
form edits change original captured content, motion and effects compose on
separate inert artwork, and native input/library overlays remain undistorted.
The original artwork callback sets `element.inert = true` before ref enrollment
because the pinned React18 types do not expose JSX `inert`; no types upgrade,
duplicate element or CSS normalization is used.

```tsx
import { defineEffect } from "../canvas-spa";

export const tint = defineEffect({
  name: "warm-tint",
  parameters: { strength: { min: 0, max: 1 } },
  geometry: "color", bounds: "layer", capabilities: ["webgpu"],
  wgsl: "return vec4f(mix(color.rgb, vec3f(1.0, 0.4, 0.2), parameters.x), color.a);",
});

// After mounting an authored inert/aria-hidden decorative boundary in DOM:
const effect = controller.setEffects("art", [{
  kind: "custom", definition: tint, parameters: { strength: 0.5 },
  bounds: "layer", interaction: "decorative", media: "identity",
  fallback: "static", time: { seconds: 0, playing: false },
}]);
await controller.enable(); // Explicit fresh hidden compilation/admission.
effect.seek(0.5); // Parameters/time of this admitted definition need no rebuild.
effect.cancel(); // Identity original decoration; does not cancel affine motion.
```

Schema names are1..48 lowercase/digit/hyphen characters beginning lowercase, parameter keys1..32
alphanumeric characters beginning lowercase. There are1..4 parameters with
finite ordered ranges bounded to absolute1e6, and at most4096 WGSL characters.
Descriptor seconds are0..1e6; unsupported capability/policies or unknown/excess
parameter keys throw before ownership mutation. Definition validation is not
shader compilation. A compiler or application-pipeline failure during
`enable()` returns diagnosed DOM state and retires the handle as `fallback`.
Final controller disposal retires an active handle as `disposed`.
Admission revalidates enrolled capture dimensions and visibility after the
asynchronous pipeline check, refusing late changes before revealing output.

## Reproduce and inspect

Build before focused production tests and keep all browser writers serial:

```sh
npm run test:unit
npm run build
CANVAS_EVIDENCE_ROOT=evidence/phase9/effects-rerun npm run test:browser -- effects.test.mjs
CANVAS_EVIDENCE_ROOT=evidence/phase9/react18-rerun npm run test:react18
CANVAS_EVIDENCE_ROOT=evidence/phase9/react19-rerun npm run test:react19
```

Install only the already-pinned matching fixture dependencies if absent, using
the [contributor setup](../CONTRIBUTING.md). No new effect dependency is required.
The recorded implementation matching-major gate is78 shared React18 browser
cases and124 full React19 browser cases plus18 units, types and production
builds. Three routing-only units were added afterward for P8-A1; independent
final independent acceptance passed21 units/types/build/124 browsers and
retained source-identical React18 types/build/78 browsers. Actual mounted
React18.3.1/19.3.0 and Dialog resolution are in the
[React18 matrix (archived raw)](archive-catalog.md) and
[React19 matrix (archived raw)](archive-catalog.md).

| Proof | Current Phase8 evidence |
| --- | --- |
| Decoded identity/time/alpha/bounds, sampling and color order; essential native equality | [Production pixels (archived raw)](archive-catalog.md), [development StrictMode pixels (archived raw)](archive-catalog.md), matching named PNGs |
|300-frame effects and motion/effects, normal invalidation, content update| [Production independence (archived raw)](archive-catalog.md), [development independence (archived raw)](archive-catalog.md) |
| Atomic chain refusal/snapshots/stale cancellation | [Handles (archived raw)](archive-catalog.md) |
| Media and usable fallback | [Media (archived raw)](archive-catalog.md) |
| Genuine compiler rejection, hidden failure and reentry | [Compiler (archived raw)](archive-catalog.md) |
| Synthetic capability/pipeline failure and late mutation, final active-handle disposal | [Failure paths (archived raw)](archive-catalog.md) |
| Actual diagnostic loss, twenty StrictMode retirements and real HMR | [Retirement (archived raw)](archive-catalog.md) |
| Healthy pending fence retains resources until genuine queue completion | [Healthy fence (archived raw)](archive-catalog.md) |
| Byte preservation, matched hashes and CPU/resource costs | [Implementation report (archived raw)](archive-catalog.md) |

React18 executes the same cases and retains independent outputs under
`evidence/phase8/react18/reports/effects/`. Existing Phase7 integration and
P7-1 transaction checks are rerun, not replaced. The report compares every
versioned baseline evidence file to commit
`3c508a848b9673fd1d691e76fa26b651dccf2ab9` (rewritten Phase7; original ID is
archived in the [catalog](archive-catalog.md)); the private byte backup was made
before tests.955/955 preserved Git bytes do not restore the five lost
Phase6 originals or change the permanent disclosure.

Each effect cost window has300 synchronous CPU `frameWorkMs` samples from
the existing measurement sink. The report includes median/p95/max and
differences from neutral within each build/major, plus initial custom compile
CPU samples. These single bounded windows are noisy, not an optimization
comparison or GPU execution timing. The common generalized shader performs
three channel samples even in identity mode. Uniform storage increases from
64 to160bytes/layer (two-layer buffer144 to336bytes); the pass/texture/target
count does not increase. Driver memory and GPU timestamps remain unmeasured.

## Evidence routing

All browser/matrix writers default to regenerable `evidence/regression/current`.
`CANVAS_EVIDENCE_ROOT=evidence/phase9/<distinct-run>` selects current output.
Independent acceptance uses `CANVAS_EVIDENCE_ROOT=evidence/phase9-independent/<distinct-run>`;
the shared test/matrix/reporter/sanitizer routing and probe support that exact
root and its descendants. The probe defaults to the selected root's `chrome/`
directory; `EVIDENCE_DIR` overrides must use one of the same named roots.
Accepted evidence is read-only; other evidence roots are refused. Without a
selected root, the probe defaults to `evidence/regression/current/chrome`.
Performance comparison/smoke fixtures follow the same root's `performance/`
directory, regenerable `evidence/regression/current/performance` by default.
Historical Phase8 runs used `evidence/phase8/performance`; that root and its
independent reports are now read-only. The Phase8 report generator refuses
before writing. Source-copy React18 reports read the same
selected root. Sanitization visits only the selected output root, never all
archives. Back up/hash committed evidence before runs and audit afterward.

Phase8 is independently accepted with explicit limits; see the
[Phase8 acceptance summary](../evidence/phase8-acceptance-summary.json) and its
fresh `run-v3/` reports. Initial P8-A1/A2 findings and the original implementation
report remain historical and unchanged.
The implementation report and matrix counts above describe the original
implementation gates; the linked independent verdict records final acceptance.
CPU/frame samples describe added, non-equivalent effect work, not a DOM speedup.
GPU timestamps are unavailable (`null`); bounded ledgers are not driver-memory
or physical-device leak proof. OS IME, real screen readers, physical devices,
display/reset behavior, everyday profiles and real background throttling remain
unverified.
