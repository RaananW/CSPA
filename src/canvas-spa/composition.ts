import type { EffectWrapperOptions } from "@babylonjs/lite";
import { validateGeometry } from "./native";
import type { Ripple } from "./ripple";
import { effectUniforms, type EffectDescriptor, type ApplicationEffect } from "./effects";

interface CompositeLayer {
  matrix(): DOMMatrix;
  opacity(): number;
  canvas: HTMLCanvasElement;
  ripple?(): Ripple | undefined;
  effects?(): readonly EffectDescriptor[];
  effectsEnabled?(): boolean;
}

export function compositionUniforms(layers: CompositeLayer[], dpr: number, shift = 0, tint = 0) {
  const values = new Float32Array(4 + layers.length * 40);
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
    ], 4 + index * 40);
    values.set(effectUniforms(layer.effectsEnabled?.() === false ? [] : layer.effects?.()), 20 + index * 40);
  });
  return values;
}

export function compositionShader(count: number, custom: readonly (ApplicationEffect | undefined)[] = []): Pick<EffectWrapperOptions, "bindings" | "fragmentWGSL"> {
  const bindings: NonNullable<EffectWrapperOptions["bindings"]> = [];
  let declarations = "";
  let body = "";
  for (let index = 0; index < count; index++) {
    bindings.push({ binding: index * 2, kind: "texture", name: `layer${index}` },
      { binding: index * 2 + 1, kind: "sampler", textureBinding: `layer${index}` });
    declarations += `@group(0) @binding(${index * 2}) var layer${index}: texture_2d<f32>;
      @group(0) @binding(${index * 2 + 1}) var sampler${index}: sampler;\n`;
    if (custom[index]) declarations += `fn custom${index}(color: vec4f, local: vec2f, extent: vec2f, seconds: f32, parameters: vec4f) -> vec4f { ${custom[index]!.wgsl} }\n`;
    body += `{
      let local = vec2f(dot(state[${1 + index * 10}].xyz, vec3f(p, 1.0)),
        dot(state[${2 + index * 10}].xyz, vec3f(p, 1.0)));
      let extent = state[${3 + index * 10}].xy;
      if (all(local >= vec2f(0.0)) && all(local < extent)) {
        let wave = state[${4 + index * 10}];
        var redAt = warp(local, extent, wave.x, wave.y);
        var greenAt = redAt;
        var blueAt = redAt;
        for (var operation = 0u; operation < 3u; operation++) {
          let control = state[${5 + index * 10}u + operation * 2u];
          let parameters = state[${6 + index * 10}u + operation * 2u];
          if (control.x == 1.0) {
            redAt = warp(redAt, extent, parameters.x, control.y);
            greenAt = warp(greenAt, extent, parameters.x, control.y);
            blueAt = warp(blueAt, extent, parameters.x, control.y);
          }
          if (control.x == 2.0) {
            let delta = vec2f(parameters.x * cos(control.y * 3.0), parameters.x * sin(control.y * 3.0)) * edge(greenAt, extent);
            redAt += delta;
            blueAt -= delta;
          }
        }
        let red = textureSampleLevel(layer${index}, sampler${index}, bounded(redAt, extent), 0.0);
        let green = textureSampleLevel(layer${index}, sampler${index}, bounded(greenAt, extent), 0.0);
        let blue = textureSampleLevel(layer${index}, sampler${index}, bounded(blueAt, extent), 0.0);
        var sample = vec4f(red.r, green.g, blue.b, green.a);
        for (var operation = 0u; operation < 3u; operation++) {
          let control = state[${5 + index * 10}u + operation * 2u];
          let parameters = state[${6 + index * 10}u + operation * 2u];
          if (control.x == 3.0) {
            let noise = fract(sin(dot(floor(local) + vec2f(control.y * parameters.y), vec2f(12.9898, 78.233))) * 43758.5453);
            let alpha = select(select(smoothstep(parameters.x - 0.03, parameters.x + 0.03, noise), 1.0, parameters.x == 0.0), 0.0, parameters.x == 1.0);
            sample.a *= alpha;
          }
          ${custom[index] ? `if (control.x == 4.0) { sample = clamp(custom${index}(sample, local, extent, control.y, parameters), vec4f(0.0), vec4f(1.0)); }` : ""}
        }
        color = mix(color, sample.rgb, sample.a * state[${3 + index * 10}].z);
      }
    }\n`;
  }
  bindings.push({ binding: count * 2, kind: "uniform", uniformByteLength: (4 + count * 40) * 4 });
  return {
    bindings,
    fragmentWGSL: `${declarations}
      fn edge(local: vec2f, extent: vec2f) -> f32 { return smoothstep(0.0, 16.0, min(min(local.x, local.y), min(extent.x - local.x, extent.y - local.y))); }
      fn warp(local: vec2f, extent: vec2f, amplitude: f32, seconds: f32) -> vec2f {
        let delta = local - extent * 0.5;
        return local + delta / max(length(delta), 1.0) * sin(length(delta) * 0.18 - seconds * 4.0) * amplitude * edge(local, extent);
      }
      fn bounded(local: vec2f, extent: vec2f) -> vec2f { return clamp(local, vec2f(0.5), extent - vec2f(0.5)) / extent; }
      @group(0) @binding(${count * 2}) var<uniform> state: array<vec4f, ${1 + count * 10}>;
      @fragment fn effectFragment(input: EffectVertexOutput) -> @location(0) vec4f {
        let p = input.position.xy / state[0].x;
        var color = vec3f(1.0);
        ${body}
        return vec4f(mix(color, color.bgr, state[0].y), 1.0);
      }`,
  };
}
