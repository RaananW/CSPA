/**
 * Custom WGSL colour effect for the poster page (`effects.html`, `demo/effects-demo.tsx`). It shows how an app
 * authors an effect with the public `defineEffect` and applies it as a `kind: "custom"` descriptor.
 */
import { defineEffect } from "@underglass/react";

/**
 * A `"color"` effect that oscillates between the layer's colour and its red/blue-swapped colour.
 * `parameters.x` is `strength` and `parameters.y` is `rate` (declared order); `seconds` is the effect clock.
 * The mix is weighted by alpha so transparent pixels are unchanged.
 */
export const colorCycle = defineEffect({
  name: "poster-color-cycle",
  parameters: { strength: { min: 0, max: 1 }, rate: { min: 0, max: 4 } },
  geometry: "color", bounds: "layer", capabilities: ["webgpu"],
  wgsl: `let amount = parameters.x * (0.5 + 0.5 * sin(seconds * parameters.y));
    return vec4f(mix(color.rgb, color.bgr, amount * color.a), color.a);`,
});
