/**
 * Browser check that the generated WGSL samplers agree with the generated JS samplers (which drive native
 * hit geometry). Run by `scripts/compiler-validation.mjs` against a real WebGPU adapter; not a unit test.
 */
import assert from "node:assert/strict";

/**
 * Loads a generated module `source` in `page`, evaluates every animation's WGSL sampler in a compute
 * shader at many times (including +/-0.001ms around boundaries) and compares the f32 results with
 * `animation.sample(time)`. `referenceTimes[i]` adds extra times for animation `i`. Throws on the first
 * mismatch and returns `{ count, maximumError }`.
 */
export async function verifyGPUSamplers(page, source, referenceTimes = []) {
  const result = await page.evaluate(async ({ source, referenceTimes }) => {
    const compiled = (await import(`data:text/javascript;base64,${btoa(source)}`)).default;
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) throw new Error("GPU sampler parity requires a real WebGPU adapter");
    const device = await adapter.requestDevice();
    const buffers = [];
    try {
      // One entry per sample: the shader input and the JS result it must match.
      const inputs = [], expected = [], samples = [];
      for (const [index, animation] of compiled.animations.entries()) {
        const { duration, delay, iterations } = animation.timing;
        // Boundary times: start, the largest accepted time, and delay plus whole multiples of the duration.
        const times = [0, 1e12, delay, delay + duration, delay + duration * 2, ...(referenceTimes[index] ?? [])];
        if (Number.isFinite(iterations)) times.push(delay + duration * iterations);
        // A dense sweep over the first four durations.
        for (let step = 0; step <= 2000; step++) times.push(delay + duration * step / 500);
        // Probe each time and its neighbors 0.001ms either side, so values at and next to each boundary are compared.
        for (const boundary of [...times]) for (const delta of [-0.001, 0, 0.001]) {
          const time = boundary + delta;
          if (time < 0 || time > 1e12) continue;
          // Input vec4f per sample: (animation index + 1, bounded phase from `normalizeTime`, unused, unused).
          inputs.push(index + 1, animation.normalizeTime(time), 0, 0);
          expected.push(animation.sample(time));
          samples.push({ animation: animation.id, time });
        }
      }
      const values = new Float32Array(inputs), count = expected.length;
      // Buffers are recorded so the `finally` block can destroy them.
      const buffer = (size, usage) => {
        const value = device.createBuffer({ size, usage });
        buffers.push(value);
        return value;
      };
      const input = buffer(values.byteLength, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST);
      // Two vec4f (32 bytes) per sample: (x, y, scaleX, scaleY) and (rotation, opacity, 0, 0).
      const output = buffer(count * 32, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC);
      const readback = buffer(count * 32, GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ);
      device.queue.writeBuffer(input, 0, values);
      // The generated sampler functions precede the first binding in the layer fragment WGSL, so the text
      // before `@group(0)` can be reused in a compute shader.
      const samplers = compiled.programs[0].fragmentWGSL.split("@group(0)")[0];
      const module = device.createShaderModule({ code: `${samplers}
        @group(0) @binding(0) var<storage,read> input:array<vec4f>;
        @group(0) @binding(1) var<storage,read_write> output:array<vec4f>;
        @compute @workgroup_size(64) fn main(@builtin(global_invocation_id) id:vec3u) {
          if(id.x>=arrayLength(&input)){return;}
          let motion=compiled_sample(u32(input[id.x].x),input[id.x].y);
          output[id.x*2u]=vec4f(motion.position,motion.scale);
          output[id.x*2u+1u]=vec4f(motion.rotation,motion.opacity,0.0,0.0);
        }` });
      // Surface WGSL compile errors with their messages instead of an opaque pipeline failure.
      const info = await module.getCompilationInfo();
      if (info.messages.some(message => message.type === "error")) throw new Error(info.messages.map(message => message.message).join("\n"));
      const pipeline = await device.createComputePipelineAsync({ layout: "auto", compute: { module, entryPoint: "main" } });
      const group = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [
        { binding: 0, resource: { buffer: input } }, { binding: 1, resource: { buffer: output } },
      ] });
      const encoder = device.createCommandEncoder(), pass = encoder.beginComputePass();
      pass.setPipeline(pipeline); pass.setBindGroup(0, group); pass.dispatchWorkgroups(Math.ceil(count / 64)); pass.end();
      encoder.copyBufferToBuffer(output, 0, readback, 0, count * 32);
      device.queue.submit([encoder.finish()]);
      await readback.mapAsync(GPUMapMode.READ);
      const actual = new Float32Array(readback.getMappedRange());
      const keys = ["x", "y", "scaleX", "scaleY", "rotation", "opacity"];
      let maximumError = 0;
      // `actual` holds 8 floats per sample (two vec4f); the first six are compared with the JS fields.
      for (let index = 0; index < count; index++) for (let field = 0; field < keys.length; field++) {
        const error = Math.abs(actual[index * 8 + field] - expected[index][keys[field]]);
        maximumError = Math.max(maximumError, error);
        // Tolerance is 1e-4, relative for values above 1.
        if (!Number.isFinite(error) || error > 0.0001 * Math.max(1, Math.abs(expected[index][keys[field]]))) {
          throw new Error(`GPU/native sampler mismatch at case ${index}/${keys[field]} (${samples[index].animation}, ${samples[index].time}ms): ${actual[index * 8 + field]} vs ${expected[index][keys[field]]}`);
        }
      }
      readback.unmap();
      return { count, maximumError };
    // Release GPU resources even when a comparison throws.
    } finally {
      for (const buffer of buffers) buffer.destroy();
      device.destroy();
    }
  }, { source, referenceTimes });
  assert.ok(result.count > 0);
  return result;
}
