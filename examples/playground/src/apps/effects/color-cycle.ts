import { defineEffect } from "@canvas-spa/react";

export const colorCycle = defineEffect({
  name: "poster-color-cycle",
  parameters: { strength: { min: 0, max: 1 }, rate: { min: 0, max: 4 } },
  geometry: "color", bounds: "layer", capabilities: ["webgpu"],
  wgsl: `let amount = parameters.x * (0.5 + 0.5 * sin(seconds * parameters.y));
    return vec4f(mix(color.rgb, color.bgr, amount * color.a), color.a);`,
});
