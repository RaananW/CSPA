import type { EffectWrapperOptions } from "@babylonjs/lite";
import { validateGeometry } from "./native";
import type { Ripple } from "./ripple";

interface CompositeLayer {
  matrix(): DOMMatrix;
  opacity(): number;
  canvas: HTMLCanvasElement;
  ripple?(): Ripple | undefined;
}

export function compositionUniforms(layers: CompositeLayer[], dpr: number, shift = 0, tint = 0) {
  const values = new Float32Array(4 + layers.length * 16);
  values.set([dpr, tint, 0, 0]);
  layers.forEach((layer, index) => {
    const matrix = new DOMMatrix().translate(shift, 0).multiply(layer.matrix());
    validateGeometry(matrix);
    const inverse = matrix.inverse();
    values.set([
      inverse.a, inverse.c, inverse.e, 0,
      inverse.b, inverse.d, inverse.f, 0,
      layer.canvas.width, layer.canvas.height, layer.opacity(), 0,
      layer.ripple?.()?.amplitude ?? 0, (layer.ripple?.()?.seconds ?? 0) % 1000, 0, 0,
    ], 4 + index * 16);
  });
  return values;
}

export function compositionShader(count: number): Pick<EffectWrapperOptions, "bindings" | "fragmentWGSL"> {
  const bindings: NonNullable<EffectWrapperOptions["bindings"]> = [];
  let declarations = "";
  let body = "";
  for (let index = 0; index < count; index++) {
    bindings.push({ binding: index * 2, kind: "texture", name: `layer${index}` },
      { binding: index * 2 + 1, kind: "sampler", textureBinding: `layer${index}` });
    declarations += `@group(0) @binding(${index * 2}) var layer${index}: texture_2d<f32>;
      @group(0) @binding(${index * 2 + 1}) var sampler${index}: sampler;\n`;
    body += `{
      let local = vec2f(dot(state[${1 + index * 4}].xyz, vec3f(p, 1.0)),
        dot(state[${2 + index * 4}].xyz, vec3f(p, 1.0)));
      let extent = state[${3 + index * 4}].xy;
      if (all(local >= vec2f(0.0)) && all(local < extent)) {
        let wave = state[${4 + index * 4}];
        let delta = local - extent * 0.5;
        let radial = delta / max(length(delta), 1.0);
        let border = min(min(local.x, local.y), min(extent.x - local.x, extent.y - local.y));
        let offset = radial * sin(length(delta) * 0.18 - wave.y * 4.0) * wave.x * smoothstep(0.0, 16.0, border);
        let sampleAt = clamp(local + offset, vec2f(0.5), extent - vec2f(0.5));
        let sample = textureSampleLevel(layer${index}, sampler${index}, sampleAt / extent, 0.0);
        color = mix(color, sample.rgb, sample.a * state[${3 + index * 4}].z);
      }
    }\n`;
  }
  bindings.push({ binding: count * 2, kind: "uniform", uniformByteLength: (4 + count * 16) * 4 });
  return {
    bindings,
    fragmentWGSL: `${declarations}
      @group(0) @binding(${count * 2}) var<uniform> state: array<vec4f, ${1 + count * 4}>;
      @fragment fn effectFragment(input: EffectVertexOutput) -> @location(0) vec4f {
        let p = input.position.xy / state[0].x;
        var color = vec3f(1.0);
        ${body}
        return vec4f(mix(color, color.bgr, state[0].y), 1.0);
      }`,
  };
}
