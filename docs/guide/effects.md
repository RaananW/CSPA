# Effects

Effects are per-pixel GPU programs applied to a **decorative** layer, one that is
inert, `aria-hidden` and has no interactive elements. Keep artwork in its own
decorative `Surface` next to the interactive one. In ordinary DOM the layer simply
shows its original content.

```tsx
<Surface id="art" decorative layout={{ x: 360, y: 20, width: 400, height: 300, overflow: "hidden" }}>
  <Illustration />
</Surface>
```

```tsx
const handle = gpu.setEffects("art", [
  { kind: "ripple", parameters: { amplitude: 6 }, time: { seconds: 0, playing: true },
    bounds: "layer", interaction: "decorative", media: "identity", fallback: "static" },
]);
handle.pause(); handle.seek(1.5); handle.play(); handle.cancel();
```

`bounds`, `interaction`, `media` and `fallback` are explicit on purpose: they state
that the effect stays inside the layer, never touches interactive content, keeps
the media as is, and falls back to the static original. A chain has 1–3 effects,
each kind once. Sampling effects (ripple, chromatic) come before colour effects
(dissolve, custom).

| Effect | Parameters | What it does |
| --- | --- | --- |
| `ripple` | `amplitude` 0–12 px | Radial wave that displaces where pixels sample from (refraction) |
| `chromatic` | `displacement` 0–12 px | Shifts the red and blue channels apart |
| `dissolve` | `amount` 0–1, `speed` 0–4 | Animated noise mask over alpha |
| `custom` | your own, up to 4 | Your WGSL colour function (below) |

`gpu.setRipple(id, { amplitude, seconds, playing })` is a shortcut for a single
ripple; `setRipple(id, null)` clears it.

## Your own WGSL

```ts
import { defineEffect } from "@canvas-spa/react";

export const sepia = defineEffect({
  name: "sepia-glow",
  parameters: { amount: { min: 0, max: 1 } },
  geometry: "color", bounds: "layer", capabilities: ["webgpu"],
  wgsl: `
    let tone = vec3f(dot(color.rgb, vec3f(0.393, 0.769, 0.189)),
                     dot(color.rgb, vec3f(0.349, 0.686, 0.168)),
                     dot(color.rgb, vec3f(0.272, 0.534, 0.131)));
    return vec4f(mix(color.rgb, tone, parameters.x), color.a);`,
});

gpu.setEffects("art", [{ kind: "custom", definition: sepia, parameters: { amount: 0.8 },
  time: { seconds: 0 }, bounds: "layer", interaction: "decorative", media: "identity", fallback: "static" }]);
```

The body is the inside of
`fn(color: vec4f, local: vec2f, extent: vec2f, seconds: f32, parameters: vec4f) -> vec4f`:

- `color` is the layer's pixel.
- `local` is its position in CSS pixels; `extent` is the layer size.
- `parameters` holds your values in declaration order.

It may change colour and alpha but not geometry: use `ripple` or `chromatic` before
it for displacement.

- Definitions are **trusted application code**: up to 4 parameters and 4096
  characters. Never build WGSL from user input.
- A new definition can be applied while GPU is on. It compiles in the background and
  appears when ready; the previous frame stays meanwhile. A compile error returns the
  app to DOM with the compiler message as the reason.
- Changing parameters or time never recompiles.

## Live media

Anything that paints inside the decorative layer is captured, including CSS
animations and `<video>` (a camera stream works too). The showcase's webcam pond
refracts a camera image together with HTML text and CSS-animated fish.
