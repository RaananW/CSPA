# Example showcase and GitHub Pages preparation

The private `examples/showcase` npm workspace is a React SPA using the public
CanvasSPA package. Its catalog opens five live examples in the same app. The
engineering playground remains separate; raw reports, probes, test evidence and
private fixtures are not served.

| Example | What it shows |
| --- | --- |
| `#/layers` Postcard studio | Native text input, textarea and radio swatches/stamps edit a postcard surface live; an outbox surface lists saved cards with native **Reuse** buttons. |
| `#/motion` Card deck | Deal, Stack, Fan, Shuffle and Spin run one `transitionGroup` with a stagger slider; **Play layer journey** runs one `transition` on `showcase-card`. Poses pivot around card centres (`src/pose.ts`). Like buttons remain native during motion. |
| `#/effects` Shader lab | Presets, toggles and range sliders build a 1..3 operation `setEffects` chain (ripple, chromatic, dissolve and the custom `defineEffect` WGSL "aurora") on the decorative `showcase-art` layer. |
| `#/presence` Notification stack | Four stable toast surfaces use `Presence` enter/exit; Dismiss buttons are ordinary React buttons and `onComplete` results are logged. |
| `#/tasks` Small tasks | The maintained task component reused unchanged from `examples/playground`. |

All examples share a 1040x700 stage. A decorative backdrop and the decorative
`showcase-art` layer persist across examples (only their layout/content change).
The art layer always carries the aurora definition, at identity strength unless
the shader lab asks for more, because custom WGSL is compiled per layer during
fresh GPU admission; this lets the lab use it even when GPU was enabled on
another example. After any return to ordinary DOM the chain is re-attached so
the next explicit admission compiles it again. Browsers without WebGPU skip the
custom operation silently.

Deck motion, including rotation, runs the same typed transitions in ordinary DOM
and on the GPU. Rotating surfaces avoid `overflow: hidden` on the enrolled
element (a clipped GPU layer must stay axis-aligned); clipping happens on
descendants. Descendant CSS transitions/animations are allowed: they repaint
native content and do not block declarative motion or revoke GPU.

```sh
npm run dev:showcase       # builds the library first; localhost:5190/CSPA/
npm run build:showcase     # examples/showcase/dist only
npm run preview:showcase   # localhost:5191/CSPA/
# For a domain-root site/local root preview:
CANVAS_SHOWCASE_BASE=/ npm run build:showcase
```

The default base is `/CSPA/`. Override `CANVAS_SHOWCASE_BASE` with an absolute
directory path ending in `/` for a different project/domain. Hash URLs such as
`/CSPA/#/motion` load and reload without server rewrite rules. Catalog navigation,
search and categories stay in the SPA; no iframe capture is used.

The surrounding responsive chrome uses ordinary CSS; its hero motion stops
under `prefers-reduced-motion`. Enrolled example surfaces
use typed layout and appearance that compile to browser CSS, not a replacement
layout engine. The shared compositor retains the original React controls/state.
The task example reuses its existing authored CSS, original component and
decorative transition helper, with owned cleanup on example retirement.
The fixed-size live studio scrolls horizontally on small screens to preserve
native control geometry; the catalog itself reflows. Choosing another example
resets that example's local in-memory state, deliberately. No backend, analytics,
external font/CDN or local-storage persistence is added.

Ordinary DOM is the default. **Enable experimental GPU** requests actual
capability admission; raw refusal reasons remain visible. The shader affects
only inert aria-hidden artwork, never essential input geometry. Explicit DOM
recovery preserves original values and focus; disposal ends the app until
reload. Reduced motion is handled by the existing runtime. Accessibility,
physical-device and broader browser/production qualification remain open.

## Experimental GPU browser requirement

**GPU demos require Chrome Canary with HTML-in-Canvas enabled.** Ordinary DOM
mode works without experimental flags. The current native validation route
launches Canary with these switches, including the required native geometry
support:

```text
--enable-blink-features=CanvasDrawElement,ElementCanvasTransform
--enable-experimental-web-platform-features
```

After opening the page in that configured Canary session, choose **Enable
experimental GPU**. Flags alone do not guarantee support in every Canary build;
CanvasSPA checks working capture and geometry and reports refusal reasons.

## Deployment is a separate decision

`.github/workflows/showcase-pages.yml` prepares a manual build/deploy workflow:
immutable action refs, committed-lock restore, no browser downloads, a
showcase-only Pages artifact, and Pages/OIDC write permissions confined to the
deployment job. It has no push or pull-request trigger. The existing private
release workflow stays build-only. **Neither workflow dispatch nor Pages
activation/deployment/publication is authorized or performed by preparation.**

Before a future authorized deployment, an owner must confirm GitHub Pages
availability for this private repository/account plan and desired site
visibility. Private-source repositories can produce publicly reachable Pages
sites depending on account configuration; repository privacy is not a promise
of site privacy. Configure Pages to use GitHub Actions and review the
`github-pages` environment approval/access rules separately. Custom domains,
repository visibility and public release remain separate (license: Apache-2.0).
No hosted URL or successful deployment is claimed here.

The build emits only `index.html` and hashed CSS/JavaScript assets, with source
maps disabled. The build's output guard rejects unexpected files, source maps,
symlinks and known private-path/credential markers before successful completion.
Do not add `evidence`, private reports, fixtures or release
archives to its public directory. Browser compatibility still depends on the
actual current browser/API route, not Pages hosting.
