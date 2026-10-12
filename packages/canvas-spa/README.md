# CanvasSPA experimental private package

`canvas-spa-phase-one@0.0.0` is a private ESM library with matching React18.3.1
or React19 peers and public Babylon Lite. It is not published or release-qualified.

Import supported runtime APIs from `canvas-spa-phase-one`. The separate
`canvas-spa-phase-one/build` export is for build tooling, providing compositor
generation and animation lowering; other internal subpaths are not exported.
The private `@canvas-spa/css-compiler` package supplies opt-in JSON-configured
Vite/webpack integration and generated `CompiledProgramSet` artifacts.
Pass one to `mountCanvasApp` and explicitly call `ownCompiledAnimation` after
original-element enrollment. Existing runtime CSS/WAAPI APIs remain available
for noncompiled applications.

The opt-in `canvas-spa-phase-one/experimental-worker` adapter and
`canvas-spa-phase-one/experimental-worker/thread` entry move shared WebGPU
composition/upload and decorative clocks to an app-owned module worker.
Generate its literal program with `workerCompositorProgram` from `/build`.
React/DOM/layout/capture remain on the main thread; essential controls have
fixed geometry. This is a separate bounded experiment, not a CSS speedup,
arbitrary-component worker adapter or replacement for the default runtime.

React retains the original controls and state. GPU admission requires
functional native capture, current hit geometry and the qualified browser
contract; useful default DOM is not proof of GPU support.

See the bundled [distribution contract](docs/distribution.md) for bootstrap,
peer requirements, browser limits and explicit disable/disposal.
Repository examples, tooling and historical evidence are not package contents.
Whole-release, manual, performance-budget, licensing and publication decisions
remain open.
