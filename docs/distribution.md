# Private distribution preparation

Phase10 implementation is **prepared, independently accepted with limits**.
Phase11 engineering is **independently accepted with limits; human/physical
validation pending**. Full Phase11 remains incomplete; the repository's compact
Phase11 verdict and adoption checklist preserve the open gates.
The package is **not published, not production-ready**. The existing
`canvas-spa-phase-one@0.0.0` identity and `private: true` are retained;
no project license has been selected. Do not publish, create a registry
package, change visibility or infer redistribution permission from this build.

## Build and install locally

```sh
npm run build:library
npm pack --dry-run --json
# Choose an ignored directory for the actual archive:
npm pack --pack-destination fixtures/package-consumer/workspaces
# In a separate React application, install the actual generated .tgz:
npm install /path/to/canvas-spa-phase-one-0.0.0.tgz
```

Create the pack destination first. `prepack` rebuilds the intentional
`src/canvas-spa/index.ts` entry with existing Vite and emits TypeScript
declarations. The only public entry is ESM `canvas-spa-phase-one`; CommonJS
and internal subpath imports are not supported. The tarball contains only
`package.json`, README, this standalone distribution contract, one JS module
and the required declaration graph. No source maps, tests, demos, evidence,
profiles, absolute local paths, worker files or external asset paths ship.
WGSL is constructed from embedded strings in the module; no shader fetch,
worker URL or copied demo CSS is required.

React/React DOM are external matching-major peers (`^18.3.1 || ^19.0.0`),
not bundled duplicate roots. Actual tested pairs are18.3.1 and19.3.0;
the peer range is not certification of every version. Public Lite1.33.0
is an exact runtime dependency, not vendored, and its unrelated WebXR
declaration names require the exact `@types/webxr`0.5.24 dependency/reference.
CanvasSPA does not expose a WebXR feature. Radix, Lite GL, profiling and demo
dependencies are development-only. TypeScript7.0.2 is the tested compiler;
older compiler/DOM-library compatibility is unverified. Declaration references
resolve under Bundler and NodeNext with `skipLibCheck: false` and no implicit
ambient types. Top-level ESM import without browser globals is checked, not
SSR rendering or hydration certification. Bootstrap requires a browser DOM.
Only this standalone contract ships with README; other README links refer
to documentation/evidence in the repository checkout, not tarball contents.

## Minimal typed bootstrap

Provide empty, connected, same-document sibling hosts outside every React
root. The application owns their frame/CSS; there is no missing stylesheet
export or automatic global CSS injection.

```html
<style>
  [hidden] { display: none !important; }
  #frame { position: relative; width: 640px; height: 420px; }
  #capture, #output, #ordinary {
    position: absolute; inset: 0; width: 100%; height: 100%;
  }
  #output { pointer-events: none; }
</style>
<div id="frame">
  <canvas id="capture" hidden></canvas><canvas id="output" hidden></canvas>
  <div id="ordinary"></div><div id="overlay"></div>
</div>
```

```tsx
import { useState } from "react";
import { mountCanvasApp, Surface, Box, type MountCanvasOptions } from "canvas-spa-phase-one";

function App() {
  const [name, setName] = useState("");
  return <Surface id="editor"
    layout={{ x: 20, y: 20, width: 280, height: 200, padding: 12 }}
    appearance={{ background: "white", color: "black" }}>
    <Box layout={{ direction: "column", gap: 8 }}>
      <label htmlFor="name">Name</label>
      <input id="name" value={name} onChange={e => setName(e.target.value)} />
    </Box>
  </Surface>;
}
// Resolve and validate these references in your outside-root host setup.
const options: MountCanvasOptions = {
  captureHost, outputCanvas, ordinaryHost, overlayHost,
  onStatus: message => { statusElement.textContent = message; },
};
const controller = mountCanvasApp(options, <App />);
// DOM is useful now. GPU use is explicit, not a startup default:
const admitted = await controller.enable();
if (admitted.mode !== "gpu") console.info(admitted.reason);
// Later: await controller.disable(); await controller.dispose();
```

`Surface`/`Box` compile numeric layout and appearance to ordinary browser CSS.
`useSurfaceRef`/`enroll` selectively adopt original direct-root elements.
Keep all content inside the movable root in admitted boundaries; keep
unenrolled native content outside it, using the fixed `NativeOverlay` host
and a library's public portal-container API where needed.
`mountApplicationModule` accepts a trusted, already-imported local module
with a persistent-root cleanup callback; it is not a remote app loader.
The public root exports the typed controller, layout/appearance/transform,
enrollment, motion, effects and local module contracts. No private engine,
facade, profiling root or custom reconciler is required.

## Bounded browser policy

Useful ordinary DOM startup and diagnosed refusal work without native-capture
flags in the installed Chrome automation profile. GPU requires working
`CanvasDrawElement`, `ElementCanvasTransform`, experimental web-platform APIs,
WebGPU and state-preserving connected same-document `Element.moveBefore`.
Feature presence alone is insufficient: admission verifies actual native
capture pixels, staging/upload/output pixels and applied native hit geometry.
This is experimental Chromium support, not a general WebGL fallback or a
promise about Safari, Firefox, all Chromium builds or arbitrary applications.
The package runner records actual CDP browser build/revision and launch flags
separately for flagged and unflagged temporary profiles. It uses only the
installed macOS Google Chrome executable; no downloads, installs or everyday
profile/global flag changes are permitted.

Implementation checks on2026-10-10 recorded Chrome155.0.8059.40,
revision `@cfaadc5a132d78e1828635aa8405a499f3e14864`, through CDP (not a
user-agent version guess). Independent acceptance confirmed the bounded
package and separate direct-consumer contracts, not browser approval.

| Actual target | Bounded observed result |
| --- | --- |
| Installed Chrome155, clean headless profile, no native flags, DPR1/2, React18/19 | Capture/draw/geometry unavailable despite WebGPU/moveBefore presence; exact admission diagnostic and original useful DOM/native controls |
| Same installed build, clean headless profile, explicit native/experimental flags, DPR1/2, React18/19 | Native/GPU admission pixels, red/green decoded application pixels, transformed native hits, controlled input/form/counters and same-root DOM recovery/reentry |
| Exact Chrome154, other Chromium builds, Safari, Firefox, everyday profiles | Untested here; no availability or compatibility claim |

Changes to membership/order/origin/size/frame/DPR recover the original DOM;
await retirement and explicitly enable fresh admission. No automatic refresh
is provided. The hard layer limit is eight, subject to the pixel budget.
Nested/foreign enrollment, unsupported native scrolling or clipping, forced
colors, missing APIs and budget/compile failures diagnose usable DOM.
Editable/top-layer refusal includes the enrolled root itself and
`contenteditable=""`/`plaintext-only`, not only explicitly `"true"` descendants.
Long native input text and selection can generate a real input scroll event
and cancel GPU admission with a diagnosed lifecycle transition, retaining DOM;
native-input scrolling is not a supported GPU interaction.
Nonaffine/disappearing effects require inert, aria-hidden, noninteractive
decoration separate from essential controls. Reduced motion remains honored.
Capture stays conservative on root-wide native paint; no speedup is claimed.
DPR2 text rasterization is not DOM/GPU pixel equivalent.

Exact Chrome154.0.8037.98 remains **UNVERIFIED**. Historical actual155
continuation after user unavailability was not explicit155 approval or a154
waiver; browser transition cause/date is unknown. Screen readers, actual OS
IME, everyday profiles, real background throttling, physical displays/devices
and resets remain manual gates; CDP, synthetic visibility and `device.destroy`
cannot close them. The five lost original Phase6 fixture reports remain a
provenance exception, not repaired by package tests.

## Reproducible consumer gate and release checklist

```sh
# Always creates a fresh ignored root; do not run concurrent browser writers:
CANVAS_EVIDENCE_ROOT=evidence/phase10/my-run npm run test:package
# A reviewer uses evidence/phase10-independent/<fresh-run>.
# Phase11 focused native compatibility extension, still actual tarball installs:
CANVAS_EVIDENCE_ROOT=evidence/phase11/my-run CANVAS_INTERACTION_AUDIT=1 npm run test:package
```

The runner packs twice, enforces the shared exact contents allowlist,
installs the actual tarball into independent React18 and19 workspaces,
checks dependency/type resolution, both compiler module-resolution modes,
safe top-level import, production builds and original mounted React controls.
Flagged/unflagged browser checks exercise pointer/keyboard/forms, controlled
and uncontrolled values, same-root recovery, selective enrollment, native/GPU
decoded pixels and safe disposal. Raw outputs/workspaces/archives are ignored;
the six historical compact verdicts remain immutable. This gate does not
rerun full benchmarks or certify all UI semantics.

| Release gate | Current boundary |
| --- | --- |
| Independent Phase10 and Phase11 engineering acceptance | Accepted with limits; full Phase11 human/physical validation remains pending |
| Local pack/install/type/browser checks | Implemented reproducible runner; inspect its fresh results |
| License, final package name, public visibility, npm publication | Separate user decisions; no publish authorization |
| Human/device/accessibility and exact154/provenance gates | Open; see limits above and repository adoption checklist |
| Release CI, lifecycle automatic refresh, broad framework/browser support | Outside Phase10 scope |
