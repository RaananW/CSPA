# Other frameworks and plain DOM

Underglass is split in two. `@underglass/core` is the runtime: the GPU engine, the
mount boundary, layers, motion and effects. It imports no UI framework.
`@underglass/react` is a thin React adapter over it. Anything that can put elements
in a `<div>` can use the core: plain DOM, another framework's adapter, or an Astro
island that uses one of them.

Everything in [Concepts](concepts.md) still holds. Layers are original elements, the
GPU draws them, and native hit testing, focus and input stay on those elements.

## Plain DOM

`mountApplicationModule` gives your code the adapter-owned container. Build your DOM
there, return a function that tears it down, then enroll each top-level section as a
layer:

```ts
import { createCanvasHosts, mountApplicationModule, compileStyle } from "@underglass/core";

const hosts = createCanvasHosts(document.getElementById("stage")!);
const panel = document.createElement("section");
Object.assign(panel.style, compileStyle(
  { x: 40, y: 40, width: 280, height: 160, padding: 16 },
  { background: "white", color: "#1d1b26", radius: 16 },
  true, // positioned: a layer
));
const button = document.createElement("button");
button.textContent = "Count 0";
let count = 0;
button.onclick = () => { button.textContent = `Count ${++count}`; };
panel.append(button);

const gpu = mountApplicationModule(hosts, {
  mount({ container }) {
    container.append(panel);
    return () => container.replaceChildren();
  },
});
gpu.enroll(panel, { id: "panel" });
await gpu.enable();
```

- **Updates are ordinary DOM writes.** The runtime watches the persistent root, so
  changing text, styles or children keeps GPU on and uploads fresh pixels. There is
  nothing to call after an update.
- **Layers are direct children of the container.** Enroll each one with
  `gpu.enroll(element, { id })` after it is connected, and call the returned release
  before you remove it.
- **Never move or clone the container yourself.** The runtime moves it between the
  page and the canvas; your elements, listeners and state stay where they are.
- `compileStyle` turns the typed `Layout` and `Appearance` into a style object with
  complete string values, so `Object.assign(element.style, ...)` applies it. Your own
  CSS works too.
- Motion, effects and the rest of the controller (`setTransform`, `transition`,
  `setEffects`, `disable`, `dispose`) are the same as in React.

The playground page `vanilla.html` is a complete example.

## Writing an adapter

A framework adapter has three jobs, and the React adapter in
`packages/underglass/src/react.tsx` shows each of them in about 200 lines:

1. **Mount once.** Construct a `CanvasRuntime` with the hosts and a
   `mount(container, runtime)` callback that creates exactly one persistent framework
   root in `container` and returns its synchronous unmount. Never remount it for
   GPU changes: the runtime moves the container with `moveBefore`, which keeps the
   framework's DOM and state.
2. **Register layers.** For a typed layer component, render one `<section drawable>`
   with `compileStyle(layout, appearance, true)` plus `transform-origin: 0 0`, then
   call `runtime.register({ id, element, layout, transform, origin, decorative })`
   once the element is in the DOM. Forward later changes with `runtime.update` and
   `runtime.setOrigin`, and call the returned release when it unmounts. For refs to
   the user's own elements, use `runtime.enroll(element, { id })`.
3. **Reconcile after each update.** Call `runtime.requestReconcile()` after the
   framework patches the DOM and before the browser paints (React's layout effects,
   Vue's post-flush hooks). Calls in one update coalesce into one GPU frame.

Depend on `@underglass/core` as a regular dependency and never bundle it, so every
adapter on a page shares one runtime and one engine.

Each adapter must pass the shared browser contract in
`tests/helpers/framework-contract.mjs`: GPU stays on through content, structure and
transform updates, the canvas shows fresh pixels, native hits land on the right
elements, and `disable`, `enable` and `dispose` keep the original root and state.
