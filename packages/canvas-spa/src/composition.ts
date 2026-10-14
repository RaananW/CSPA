import type { EffectWrapperOptions } from "@babylonjs/lite";
import { validateGeometry } from "./native.js";
import type { Ripple } from "./ripple.js";
import { effectUniforms, type EffectDescriptor, type ApplicationEffect } from "./effects.js";
import { LAYER_PASS_FLOATS, type CompiledMotion } from "./compiled.js";

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

/** Uniform floats per layer block (11 vec4s): inverse matrix + grid, extent/opacity, ripple, 3 effects, clip. */
const BLOCK = 44;

/** Writes one layer's 11-vec4 uniform block at `offset` and returns its canvas-space matrix and clip. */
function writeLayerBlock(values: Float32Array, offset: number, layer: CompositeLayer, shift: number, customIndex: number, compiled: boolean) {
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
    layer.extent.width, layer.extent.height, motion ? 1 : layer.opacity(), customIndex,
    layer.ripple?.()?.amplitude ?? 0, (layer.ripple?.()?.seconds ?? 0) % 1000, content.pixelWidth, content.pixelHeight,
  ], offset);
  values.set(effectUniforms(layer.effectsEnabled?.() === false ? [] : layer.effects?.()), offset + 16);
  const clip = layer.clip?.(new DOMMatrix().translate(shift, 0).multiply(layer.matrix())) ?? { x: 0, y: 0, width: content.width, height: content.height };
  values.set([clip.x, clip.y, clip.width, clip.height], offset + 40);
  return { matrix, clip, motion };
}

export function compositionUniforms(layers: CompositeLayer[], dpr: number, shift = 0, tint = 0, capacity = layers.length,
  custom: readonly (ApplicationEffect | undefined)[] = [], compiled = false) {
  const values = new Float32Array(4 + capacity * (compiled ? BLOCK + 4 : BLOCK));
  values.set([dpr, tint, 0, 0]);
  layers.forEach((layer, index) => {
    const { motion } = writeLayerBlock(values, 4 + index * BLOCK, layer, shift,
      custom.indexOf(layer.effects?.().find(value => value.kind === "custom")?.definition), compiled);
    if (compiled) values.set([motion ? motion.index + 1 : 0, motion?.phase ?? 0, 0, 0], 4 + capacity * BLOCK + index * 4);
  });
  return values;
}

/**
 * WGSL block for one layer: samples `layer${index}`, applies compiled motion and
 * effects, and hands the straight-alpha `sample` with its coverage-weighted alpha
 * to `emit`. Its uniforms start at `state[base]`; `playback` is the compiled slot.
 */
function layerBody(index: number, base: number, playback: number | undefined, custom: readonly (ApplicationEffect | undefined)[],
  decorativeAnimation: boolean, emit: (alpha: string) => string) {
  return `{
      var local = vec2f(dot(state[${base}].xyz, vec3f(p, 1.0)),
        dot(state[${base + 1}].xyz, vec3f(p, 1.0)));
      var compiledOpacity = 1.0;
      ${playback !== undefined ? `let playback = state[${playback}];
      if (playback.x > 0.0) {
        let motion = compiled_sample(u32(playback.x), playback.y);
        let delta = local - motion.position;
        let angle = motion.rotation * 0.017453292519943295;
        local = vec2f(cos(angle) * delta.x + sin(angle) * delta.y,
          -sin(angle) * delta.x + cos(angle) * delta.y) / motion.scale;
        compiledOpacity = motion.opacity;
      }` : ""}
      let extent = state[${base + 2}].xy;
      let clip = state[${base + 10}];
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
        let wave = state[${base + 3}];
        var redAt = warp(local, extent, wave.x, wave.y);
        var greenAt = redAt;
        var blueAt = redAt;
        for (var operation = 0u; operation < 3u; operation++) {
          let control = state[${base + 4}u + operation * 2u];
          let parameters = state[${base + 5}u + operation * 2u];
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
        let grid = vec2f(state[${base}].w, state[${base + 1}].w);
        let captured = wave.zw;
        let red = filtered(layer${index}, sampler${index}, redAt * grid, captured);
        let green = filtered(layer${index}, sampler${index}, greenAt * grid, captured);
        let blue = filtered(layer${index}, sampler${index}, blueAt * grid, captured);
        var sample = vec4f(red.r, green.g, blue.b, green.a);
        for (var operation = 0u; operation < 3u; operation++) {
          let control = state[${base + 4}u + operation * 2u];
          let parameters = state[${base + 5}u + operation * 2u];
          if (control.x == 3.0) {
            let noise = fract(sin(dot(floor(local) + vec2f(control.y * parameters.y), vec2f(12.9898, 78.233))) * 43758.5453);
            let alpha = select(select(smoothstep(parameters.x - 0.03, parameters.x + 0.03, noise), 1.0, parameters.x == 0.0), 0.0, parameters.x == 1.0);
            sample.a *= alpha;
          }
          ${custom.map((definition, customIndex) => definition
            ? `if (control.x == 4.0 && state[${base + 2}].w == ${customIndex}.0) { sample = clamp(custom${customIndex}(sample, local, extent, control.y, parameters), vec4f(0.0), vec4f(1.0)); }`
            : "").join("\n")}
        }
        ${decorativeAnimation ? `if (state[${base + 2}].w == 1.0) {
          sample.a *= 1.0 - 0.65 * (1.0 - abs(2.0 * fract(state[0].z / 2.0) - 1.0));
        }` : ""}
        ${emit(`sample.a * state[${base + 2}].z * compiledOpacity * coverage`)}
      }
    }\n`;
}

function customDeclarations(custom: readonly (ApplicationEffect | undefined)[]) {
  return custom.map((definition, index) => definition
    ? `fn custom${index}(color: vec4f, local: vec2f, extent: vec2f, seconds: f32, parameters: vec4f) -> vec4f { ${definition.wgsl} }\n` : "").join("");
}

const helpers = `
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
      }`;

/**
 * One fullscreen pass compositing `count` layers over white. Used by the
 * experimental worker compositor; the main renderer draws one pass per layer.
 */
export function compositionShader(count: number, custom: readonly (ApplicationEffect | undefined)[] = [], compiledWGSL?: string, decorativeAnimation = false): Pick<EffectWrapperOptions, "bindings" | "fragmentWGSL"> {
  const bindings: NonNullable<EffectWrapperOptions["bindings"]> = [];
  let declarations = (compiledWGSL ?? "") + customDeclarations(custom);
  let body = "";
  for (let index = 0; index < count; index++) {
    bindings.push({ binding: index * 2, kind: "texture", name: `layer${index}` },
      { binding: index * 2 + 1, kind: "sampler", textureBinding: `layer${index}` });
    declarations += `@group(0) @binding(${index * 2}) var layer${index}: texture_2d<f32>;
      @group(0) @binding(${index * 2 + 1}) var sampler${index}: sampler;\n`;
    body += layerBody(index, 1 + index * 11, compiledWGSL ? 1 + count * 11 + index : undefined, custom, decorativeAnimation,
      alpha => `color = mix(color, sample.rgb, ${alpha});`);
  }
  bindings.push({ binding: count * 2, kind: "uniform", uniformByteLength: (4 + count * (compiledWGSL ? BLOCK + 4 : BLOCK)) * 4 });
  return {
    bindings,
    fragmentWGSL: `${declarations}${helpers}
      @group(0) @binding(${count * 2}) var<uniform> state: array<vec4f, ${1 + count * (compiledWGSL ? 12 : 11)}>;
      @fragment fn effectFragment(input: EffectVertexOutput) -> @location(0) vec4f {
        let p = input.position.xy / state[0].x;
        var color = vec3f(1.0);
        ${body}
        return vec4f(mix(color, color.bgr, state[0].y), 1.0);
      }`,
  };
}

/** Per-layer pass uniforms: header, bounding box, frame size, one layer block, compiled slot. */
const LAYER_HEADER = 12;
if (LAYER_PASS_FLOATS !== LAYER_HEADER + BLOCK + 4) throw new Error("Per-layer uniform layout mismatch");
/** GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT; literal so the shader can be generated outside a browser. */
const VERTEX_AND_FRAGMENT = 3;
/** Straight-alpha source-over onto the opaque output: the GPU equivalent of mix(dst, src, alpha). */
export const layerBlend: GPUBlendState = {
  color: { srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha", operation: "add" },
  alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" },
};

/**
 * Shader for drawing one layer as its own blended pass. The vertex stage emits a
 * single triangle covering the layer's canvas-space bounding box, so a layer only
 * shades the pixels it can touch; fragments outside the layer are discarded.
 */
export function layerShader(custom?: ApplicationEffect, compiledWGSL?: string): Pick<EffectWrapperOptions, "bindings" | "fragmentWGSL" | "vertexWGSL"> {
  const definitions = custom ? [custom] : [];
  return {
    bindings: [
      { binding: 0, kind: "texture", name: "layer0" },
      { binding: 1, kind: "sampler", textureBinding: "layer0" },
      { binding: 2, kind: "uniform", uniformByteLength: LAYER_PASS_FLOATS * 4, visibility: VERTEX_AND_FRAGMENT },
    ],
    vertexWGSL: `struct EffectVertexOutput { @builtin(position) position: vec4f, @location(0) uv: vec2f };
      @vertex fn effectFullscreenVertex(@builtin(vertex_index) vertex: u32) -> EffectVertexOutput {
        // state[1]: layer bounding box (x0, y0, x1, y1) and state[2].xy: frame size, in CSS pixels.
        let bounds = state[1];
        let size = max(state[2].xy, vec2f(1.0));
        let corner = vec2f(f32(vertex == 1u), f32(vertex == 2u)) * 2.0;
        let at = bounds.xy + corner * (bounds.zw - bounds.xy);
        var output: EffectVertexOutput;
        output.position = vec4f(at.x / size.x * 2.0 - 1.0, 1.0 - at.y / size.y * 2.0, 0.0, 1.0);
        output.uv = corner;
        return output;
      }`,
    fragmentWGSL: `${compiledWGSL ?? ""}${customDeclarations(definitions)}
      @group(0) @binding(0) var layer0: texture_2d<f32>;
      @group(0) @binding(1) var sampler0: sampler;${helpers}
      @group(0) @binding(2) var<uniform> state: array<vec4f, ${LAYER_PASS_FLOATS / 4}>;
      @fragment fn effectFragment(input: EffectVertexOutput) -> @location(0) vec4f {
        let p = input.position.xy / state[0].x;
        ${layerBody(0, LAYER_HEADER / 4, compiledWGSL ? (LAYER_HEADER + BLOCK) / 4 : undefined, definitions, false,
          alpha => `let rgb = mix(sample.rgb, sample.bgr, state[0].y);
        return vec4f(rgb, ${alpha});`)}
        discard;
        return vec4f(0.0);
      }`,
  };
}

/**
 * Uniforms for one layer pass. Also returns the pass's canvas-space bounding box
 * (padded for antialiasing, clamped to the frame) used by its vertex stage.
 */
export function layerUniforms(layer: CompositeLayer, dpr: number, frame: { width: number; height: number }, shift = 0, tint = 0,
  custom?: ApplicationEffect, compiled = false) {
  const values = new Float32Array(LAYER_PASS_FLOATS);
  const definition = layer.effects?.().find(value => value.kind === "custom")?.definition;
  const { matrix, clip, motion } = writeLayerBlock(values, LAYER_HEADER, layer, shift, custom && definition === custom ? 0 : -1, compiled);
  if (compiled) values.set([motion ? motion.index + 1 : 0, motion?.phase ?? 0, 0, 0], LAYER_HEADER + BLOCK);
  // Compiled motion moves the layer inside the shader, so it may cover the whole frame.
  const corners = motion ? [] : [[clip.x, clip.y], [clip.x + clip.width, clip.y], [clip.x, clip.y + clip.height], [clip.x + clip.width, clip.y + clip.height]]
    .map(([x, y]) => matrix.transformPoint({ x: Math.min(Math.max(x!, 0), layer.extent.width), y: Math.min(Math.max(y!, 0), layer.extent.height) }));
  const pad = 2;
  const bounds = motion ? [0, 0, frame.width, frame.height] : [
    Math.max(0, Math.min(...corners.map(point => point.x)) - pad), Math.max(0, Math.min(...corners.map(point => point.y)) - pad),
    Math.min(frame.width, Math.max(...corners.map(point => point.x)) + pad), Math.min(frame.height, Math.max(...corners.map(point => point.y)) + pad),
  ];
  values.set([dpr, tint, 0, 0, ...bounds, frame.width, frame.height, 0, 0]);
  return values;
}
