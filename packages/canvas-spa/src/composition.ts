import type { EffectWrapperOptions } from "@babylonjs/lite";
import { validateGeometry } from "./native.js";
import type { Ripple } from "./ripple.js";
import { effectUniforms, type EffectDescriptor, type ApplicationEffect } from "./effects.js";
import type { CompiledMotion } from "./compiled.js";

interface CompositeLayer {
  matrix(): DOMMatrix;
  clip?(matrix?: DOMMatrixReadOnly): { x: number; y: number; width: number; height: number } | undefined;
  opacity(): number;
  extent: { width: number; height: number };
  contentExtent?: { width: number; height: number; pixelWidth: number; pixelHeight: number };
  ripple?(): Ripple | undefined;
  effects?(): readonly EffectDescriptor[];
  effectsEnabled?(): boolean;
  compiledMotion?(): CompiledMotion | undefined;
}

export function compositionUniforms(layers: CompositeLayer[], dpr: number, shift = 0, tint = 0, capacity = layers.length,
  custom: readonly (ApplicationEffect | undefined)[] = [], compiled = false) {
  const values = new Float32Array(4 + capacity * (compiled ? 48 : 44));
  values.set([dpr, tint, 0, 0]);
  layers.forEach((layer, index) => {
    const motion = compiled ? layer.compiledMotion?.() : undefined;
    const base = motion ? new DOMMatrix().translate(motion.origin.x, motion.origin.y) : layer.matrix();
    const matrix = new DOMMatrix().translate(shift, 0).multiply(base);
    validateGeometry(matrix);
    const inverse = matrix.inverse();
    const content = layer.contentExtent ?? { width: layer.extent.width, height: layer.extent.height,
      pixelWidth: layer.extent.width, pixelHeight: layer.extent.height };
    values.set([
      inverse.a, inverse.c, inverse.e, content.pixelWidth / Math.max(1, content.width),
      inverse.b, inverse.d, inverse.f, content.pixelHeight / Math.max(1, content.height),
      layer.extent.width, layer.extent.height, motion ? 1 : layer.opacity(), custom.indexOf(layer.effects?.().find(value => value.kind === "custom")?.definition),
      layer.ripple?.()?.amplitude ?? 0, (layer.ripple?.()?.seconds ?? 0) % 1000, content.pixelWidth, content.pixelHeight,
    ], 4 + index * 44);
    values.set(effectUniforms(layer.effectsEnabled?.() === false ? [] : layer.effects?.()), 20 + index * 44);
    const clip = layer.clip?.(new DOMMatrix().translate(shift, 0).multiply(layer.matrix())) ?? { x: 0, y: 0, width: content.width, height: content.height };
    values.set([clip.x, clip.y, clip.width, clip.height], 44 + index * 44);
    if (compiled) values.set([motion ? motion.index + 1 : 0, motion?.phase ?? 0, 0, 0], 4 + capacity * 44 + index * 4);
  });
  return values;
}

export function compositionShader(count: number, custom: readonly (ApplicationEffect | undefined)[] = [], compiledWGSL?: string, decorativeAnimation = false): Pick<EffectWrapperOptions, "bindings" | "fragmentWGSL"> {
  const bindings: NonNullable<EffectWrapperOptions["bindings"]> = [];
  let declarations = (compiledWGSL ?? "") + custom.map((definition, index) => definition
    ? `fn custom${index}(color: vec4f, local: vec2f, extent: vec2f, seconds: f32, parameters: vec4f) -> vec4f { ${definition.wgsl} }\n` : "").join("");
  let body = "";
  for (let index = 0; index < count; index++) {
    bindings.push({ binding: index * 2, kind: "texture", name: `layer${index}` },
      { binding: index * 2 + 1, kind: "sampler", textureBinding: `layer${index}` });
    declarations += `@group(0) @binding(${index * 2}) var layer${index}: texture_2d<f32>;
      @group(0) @binding(${index * 2 + 1}) var sampler${index}: sampler;\n`;
    body += `{
      var local = vec2f(dot(state[${1 + index * 11}].xyz, vec3f(p, 1.0)),
        dot(state[${2 + index * 11}].xyz, vec3f(p, 1.0)));
      var compiledOpacity = 1.0;
      ${compiledWGSL ? `let playback = state[${1 + count * 11 + index}];
      if (playback.x > 0.0) {
        let motion = compiled_sample(u32(playback.x), playback.y);
        let delta = local - motion.position;
        let angle = motion.rotation * 0.017453292519943295;
        local = vec2f(cos(angle) * delta.x + sin(angle) * delta.y,
          -sin(angle) * delta.x + cos(angle) * delta.y) / motion.scale;
        compiledOpacity = motion.opacity;
      }` : ""}
      let extent = state[${3 + index * 11}].xy;
      let clip = state[${11 + index * 11}];
      // Analytic edge coverage: distance (in output pixels) from the pixel centre to the
      // nearest layer/clip edge. Axis-aligned layers on the pixel grid get exactly 0 or 1,
      // so untransformed output is unchanged; rotated/scaled edges are antialiased.
      let low = max(vec2f(0.0), clip.xy);
      let high = min(extent, clip.xy + clip.zw);
      // Layer units per output pixel along each local axis (exact for affine maps).
      let footprint = max(vec2f(length(vec2f(dpdx(local.x), dpdy(local.x))), length(vec2f(dpdx(local.y), dpdy(local.y)))), vec2f(1e-6));
      let inside = min(local - low, high - local) / footprint;
      let coverage = clamp(min(inside.x, inside.y) + 0.5, 0.0, 1.0);
      if (coverage > 0.0) {
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
        let red = filtered(layer${index}, sampler${index}, redAt * grid, captured);
        let green = filtered(layer${index}, sampler${index}, greenAt * grid, captured);
        let blue = filtered(layer${index}, sampler${index}, blueAt * grid, captured);
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
        ${decorativeAnimation ? `if (state[${3 + index * 11}].w == 1.0) {
          sample.a *= 1.0 - 0.65 * (1.0 - abs(2.0 * fract(state[0].z / 2.0) - 1.0));
        }` : ""}
        color = mix(color, sample.rgb, sample.a * state[${3 + index * 11}].z * compiledOpacity * coverage);
      }
    }\n`;
  }
  bindings.push({ binding: count * 2, kind: "uniform", uniformByteLength: (4 + count * (compiledWGSL ? 48 : 44)) * 4 });
  return {
    bindings,
    fragmentWGSL: `${declarations}
      fn edge(local: vec2f, extent: vec2f) -> f32 { return smoothstep(0.0, 16.0, min(min(local.x, local.y), min(extent.x - local.x, extent.y - local.y))); }
      fn warp(local: vec2f, extent: vec2f, amplitude: f32, seconds: f32) -> vec2f {
        let delta = local - extent * 0.5;
        return local + delta / max(length(delta), 1.0) * sin(length(delta) * 0.18 - seconds * 4.0) * amplitude * edge(local, extent);
      }
      fn premultipliedTexel(layer: texture_2d<f32>, tap: sampler, texel: vec2f) -> vec4f {
        let value = textureSampleLevel(layer, tap, texel / vec2f(textureDimensions(layer)), 0.0);
        return vec4f(value.rgb * value.a, value.a);
      }
      // Bilinear filtering in premultiplied space over the straight-alpha native capture,
      // so transparent neighbours do not darken antialiased edges. Pixel-aligned samples
      // have zero fractional weight and return the exact texel.
      fn filtered(layer: texture_2d<f32>, tap: sampler, texel: vec2f, captured: vec2f) -> vec4f {
        let position = clamp(texel, vec2f(0.5), captured - vec2f(0.5)) - vec2f(0.5);
        let base = floor(position);
        let weight = position - base;
        let low = base + vec2f(0.5);
        let high = min(base + vec2f(1.5), max(captured - vec2f(0.5), vec2f(0.5)));
        let value = mix(
          mix(premultipliedTexel(layer, tap, low), premultipliedTexel(layer, tap, vec2f(high.x, low.y)), weight.x),
          mix(premultipliedTexel(layer, tap, vec2f(low.x, high.y)), premultipliedTexel(layer, tap, high), weight.x), weight.y);
        return select(vec4f(0.0), vec4f(value.rgb / value.a, value.a), value.a > 1e-5);
      }
      @group(0) @binding(${count * 2}) var<uniform> state: array<vec4f, ${1 + count * (compiledWGSL ? 12 : 11)}>;
      @fragment fn effectFragment(input: EffectVertexOutput) -> @location(0) vec4f {
        let p = input.position.xy / state[0].x;
        var color = vec3f(1.0);
        ${body}
        return vec4f(mix(color, color.bgr, state[0].y), 1.0);
      }`,
  };
}
