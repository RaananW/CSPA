import type { EffectWrapperOptions } from "@babylonjs/lite";
import { validateGeometry } from "./native.js";
import type { Ripple } from "./ripple.js";
import { effectUniforms, type EffectDescriptor, type ApplicationEffect } from "./effects.js";

interface CompositeLayer {
  matrix(): DOMMatrix;
  clip?(matrix?: DOMMatrixReadOnly): { x: number; y: number; width: number; height: number } | undefined;
  opacity(): number;
  canvas: HTMLCanvasElement;
  contentExtent?: { width: number; height: number; pixelWidth: number; pixelHeight: number };
  ripple?(): Ripple | undefined;
  effects?(): readonly EffectDescriptor[];
  effectsEnabled?(): boolean;
}

export function compositionUniforms(layers: CompositeLayer[], dpr: number, shift = 0, tint = 0, capacity = layers.length,
  custom: readonly (ApplicationEffect | undefined)[] = []) {
  const values = new Float32Array(4 + capacity * 44);
  values.set([dpr, tint, 0, 0]);
  layers.forEach((layer, index) => {
    const matrix = new DOMMatrix().translate(shift, 0).multiply(layer.matrix());
    validateGeometry(matrix);
    const inverse = matrix.inverse();
    const content = layer.contentExtent ?? { width: layer.canvas.width, height: layer.canvas.height,
      pixelWidth: layer.canvas.width, pixelHeight: layer.canvas.height };
    values.set([
      inverse.a, inverse.c, inverse.e, content.pixelWidth / Math.max(1, content.width),
      inverse.b, inverse.d, inverse.f, content.pixelHeight / Math.max(1, content.height),
      layer.canvas.width, layer.canvas.height, layer.opacity(), custom.indexOf(layer.effects?.().find(value => value.kind === "custom")?.definition),
      layer.ripple?.()?.amplitude ?? 0, (layer.ripple?.()?.seconds ?? 0) % 1000, content.pixelWidth, content.pixelHeight,
    ], 4 + index * 44);
    values.set(effectUniforms(layer.effectsEnabled?.() === false ? [] : layer.effects?.()), 20 + index * 44);
    const clip = layer.clip?.(matrix) ?? { x: 0, y: 0, width: content.width, height: content.height };
    values.set([clip.x, clip.y, clip.width, clip.height], 44 + index * 44);
  });
  return values;
}

export function compositionShader(count: number, custom: readonly (ApplicationEffect | undefined)[] = []): Pick<EffectWrapperOptions, "bindings" | "fragmentWGSL"> {
  const bindings: NonNullable<EffectWrapperOptions["bindings"]> = [];
  let declarations = custom.map((definition, index) => definition
    ? `fn custom${index}(color: vec4f, local: vec2f, extent: vec2f, seconds: f32, parameters: vec4f) -> vec4f { ${definition.wgsl} }\n` : "").join("");
  let body = "";
  for (let index = 0; index < count; index++) {
    bindings.push({ binding: index * 2, kind: "texture", name: `layer${index}` },
      { binding: index * 2 + 1, kind: "sampler", textureBinding: `layer${index}` });
    declarations += `@group(0) @binding(${index * 2}) var layer${index}: texture_2d<f32>;
      @group(0) @binding(${index * 2 + 1}) var sampler${index}: sampler;\n`;
    body += `{
      let local = vec2f(dot(state[${1 + index * 11}].xyz, vec3f(p, 1.0)),
        dot(state[${2 + index * 11}].xyz, vec3f(p, 1.0)));
      let extent = state[${3 + index * 11}].xy;
      let clip = state[${11 + index * 11}];
      if (all(local >= vec2f(0.0)) && all(local < extent) && all(local >= clip.xy) && all(local < clip.xy + clip.zw)) {
        let wave = state[${4 + index * 11}];
        var redAt = warp(local, extent, wave.x, wave.y);
        var greenAt = redAt;
        var blueAt = redAt;
        for (var operation = 0u; operation < 3u; operation++) {
          let control = state[${5 + index * 11}u + operation * 2u];
          let parameters = state[${6 + index * 11}u + operation * 2u];
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
        let grid = vec2f(state[${1 + index * 11}].w, state[${2 + index * 11}].w);
        let captured = wave.zw;
        let dimensions = vec2f(textureDimensions(layer${index}));
        let red = textureSampleLevel(layer${index}, sampler${index}, bounded(redAt * grid, captured) / dimensions, 0.0);
        let green = textureSampleLevel(layer${index}, sampler${index}, bounded(greenAt * grid, captured) / dimensions, 0.0);
        let blue = textureSampleLevel(layer${index}, sampler${index}, bounded(blueAt * grid, captured) / dimensions, 0.0);
        var sample = vec4f(red.r, green.g, blue.b, green.a);
        for (var operation = 0u; operation < 3u; operation++) {
          let control = state[${5 + index * 11}u + operation * 2u];
          let parameters = state[${6 + index * 11}u + operation * 2u];
          if (control.x == 3.0) {
            let noise = fract(sin(dot(floor(local) + vec2f(control.y * parameters.y), vec2f(12.9898, 78.233))) * 43758.5453);
            let alpha = select(select(smoothstep(parameters.x - 0.03, parameters.x + 0.03, noise), 1.0, parameters.x == 0.0), 0.0, parameters.x == 1.0);
            sample.a *= alpha;
          }
          ${custom.map((definition, customIndex) => definition
            ? `if (control.x == 4.0 && state[${3 + index * 11}].w == ${customIndex}.0) { sample = clamp(custom${customIndex}(sample, local, extent, control.y, parameters), vec4f(0.0), vec4f(1.0)); }`
            : "").join("\n")}
        }
        color = mix(color, sample.rgb, sample.a * state[${3 + index * 11}].z);
      }
    }\n`;
  }
  bindings.push({ binding: count * 2, kind: "uniform", uniformByteLength: (4 + count * 44) * 4 });
  return {
    bindings,
    fragmentWGSL: `${declarations}
      fn edge(local: vec2f, extent: vec2f) -> f32 { return smoothstep(0.0, 16.0, min(min(local.x, local.y), min(extent.x - local.x, extent.y - local.y))); }
      fn warp(local: vec2f, extent: vec2f, amplitude: f32, seconds: f32) -> vec2f {
        let delta = local - extent * 0.5;
        return local + delta / max(length(delta), 1.0) * sin(length(delta) * 0.18 - seconds * 4.0) * amplitude * edge(local, extent);
      }
      fn bounded(local: vec2f, extent: vec2f) -> vec2f { return clamp(local, vec2f(0.5), extent - vec2f(0.5)); }
      @group(0) @binding(${count * 2}) var<uniform> state: array<vec4f, ${1 + count * 11}>;
      @fragment fn effectFragment(input: EffectVertexOutput) -> @location(0) vec4f {
        let p = input.position.xy / state[0].x;
        var color = vec3f(1.0);
        ${body}
        return vec4f(mix(color, color.bgr, state[0].y), 1.0);
      }`,
  };
}
