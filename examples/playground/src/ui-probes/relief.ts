/**
 * Strata Phase 0 probes P0.2 (material pass), P0.3 (relief cost) and P0.5 (shadow outset), see
 * docs/ui-library/plan.md. Raw WebGPU and HTML-in-Canvas only, no Underglass runtime.
 *
 * `#face` is a panel of native controls in flat "face mode". Each native paint uploads it with
 * `drawElementImageToTexture`. A colour-only material pass samples the capture at exactly the pixel the
 * DOM put it (no displacement) and lights relief primitives analytically: a rounded-rectangle signed
 * distance per control gives its bevel normal, wells invert it, raised shapes cast a shadow along the key
 * light, and focus adds an emissive edge. Hover, press and focus change only the primitive buffer, never
 * the DOM, so they redraw without a new capture. The quad is drawn `outset` pixels larger than the panel
 * so the panel's own shadow can fall outside its box, while hit geometry stays the box.
 */
import { bufferUsage, firstPaint, hitAt, offsetWithin, startProbe, type DrawableCanvas, type Point } from "./common.ts";
import { reliefTokens } from "./tokens.ts";

const canvas = document.getElementById("stage") as DrawableCanvas;
const face = document.getElementById("face") as HTMLElement;
const status = document.getElementById("status")!;
const materialToggle = document.getElementById("material") as HTMLInputElement;
const controls = [...face.querySelectorAll<HTMLElement>("[data-relief]")];
const cssWidth = 640, cssHeight = 420;
const tokens = reliefTokens;
const capacity = 1100;
const floatsPerPrimitive = 12;

const shader = /* wgsl */ `
struct Uniforms { matrix: mat4x4f, canvas: vec2f, extent: vec2f, light: vec4f, params: vec4f, misc: vec4f }
struct Primitive { rect: vec4f, shape: vec4f, state: vec4f }
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var image: texture_2d<f32>;
@group(0) @binding(2) var imageSampler: sampler;
@group(0) @binding(3) var<storage, read> primitives: array<Primitive>;
struct Varyings { @builtin(position) position: vec4f, @location(0) local: vec2f }

@vertex fn vertexMain(@builtin(vertex_index) index: u32) -> Varyings {
  let corners = array(vec2f(0, 0), vec2f(1, 0), vec2f(0, 1), vec2f(1, 1));
  let outset = u.params.x;
  let local = corners[index] * (u.extent + 2 * outset) - outset;
  let h = u.matrix * vec4f(local, 0, 1);
  var out: Varyings;
  out.position = vec4f(2 * h.x / u.canvas.x - h.w, h.w - 2 * h.y / u.canvas.y, 0, h.w);
  out.local = local;
  return out;
}

fn roundedBox(p: vec2f, half: vec2f, radius: f32) -> f32 {
  let q = abs(p) - half + vec2f(radius);
  return length(max(q, vec2f(0))) + min(max(q.x, q.y), 0) - radius;
}
fn distanceTo(p: vec2f, primitive: Primitive) -> f32 {
  let half = primitive.rect.zw * 0.5;
  return roundedBox(p - primitive.rect.xy - half, half, primitive.shape.x);
}

@fragment fn fragmentMain(in: Varyings) -> @location(0) vec4f {
  let p = in.local;
  let inside = all(p >= vec2f(0)) && all(p <= u.extent);
  // Colour only: the capture is sampled exactly where the DOM laid it out.
  let sample = textureSampleLevel(image, imageSampler, clamp(p / u.extent, vec2f(0), vec2f(1)), 0);
  let alpha = select(0.0, sample.a, inside);
  let base = mix(vec3f(1), sample.rgb, alpha);
  if (u.params.w < 0.5) { return vec4f(base, 1); }

  let light = normalize(u.light.xyz);
  var shadow = 0.0;
  var shade = 0.0;
  var interior = 1.0;
  var glow = 0.0;
  let count = u32(u.misc.x);
  for (var i = 0u; i < count; i++) {
    let primitive = primitives[i];
    let raised = primitive.shape.z < 0.5;
    let hover = primitive.state.x;
    let pressed = primitive.state.y;
    var height = primitive.shape.y;
    if (raised) { height = height * (1 + ${tokens.hoverHeight - 1} * hover) * (1 - ${1 - tokens.pressHeight} * pressed); }
    let d = distanceTo(p, primitive);
    if (raised && d > 0) {
      // Cast shadow: the shape moved away from the light by its height, softened with height.
      let offset = -light.xy / light.z * height;
      let half = primitive.rect.zw * 0.5;
      let ds = roundedBox(p - primitive.rect.xy - half - offset, half, primitive.shape.x);
      shadow = max(shadow, (1 - smoothstep(-0.5 * height, 1.5 * height + 1, ds)) * u.params.z);
    }
    if (d <= 0) {
      let t = clamp(-d / u.params.y, 0, 1);
      if (t < 1) {
        // Quarter-round bevel: steep at the edge, flat where it meets the face.
        let e = 0.5;
        let gradient = normalize(vec2f(distanceTo(p + vec2f(e, 0), primitive) - distanceTo(p - vec2f(e, 0), primitive),
          distanceTo(p + vec2f(0, e), primitive) - distanceTo(p - vec2f(0, e), primitive)) + vec2f(1e-6));
        let angle = (1 - t) * 1.2;
        let slope = select(-1.0, 1.0, raised);
        let normal = normalize(vec3f(gradient * slope * sin(angle), cos(angle)));
        shade += (dot(normal, light) - light.z) * 0.55;
      } else {
        // Face interiors only brighten on hover and darken on press, within the interior budget.
        interior *= 1 + clamp(${tokens.hoverLift} * hover - ${tokens.pressSink} * pressed, -u.light.w, u.light.w);
      }
    }
    if (primitive.state.z > 0.5 && d > 0.5 && d < 3.5) { glow = 1; }
  }
  var lit = (base * interior + vec3f(shade)) * (1 - shadow);
  lit = mix(lit, u.misc.yzw, glow);
  return vec4f(clamp(lit, vec3f(0), vec3f(1)), 1);
}
`;

async function start() {
  const gpu = await startProbe(canvas, cssWidth, cssHeight);
  const { device } = gpu;
  const module = device.createShaderModule({ code: shader });
  const pipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: { module, entryPoint: "vertexMain" },
    fragment: { module, entryPoint: "fragmentMain", targets: [{ format: gpu.format }] },
    primitive: { topology: "triangle-strip" },
  });
  const uniforms = device.createBuffer({ size: 128, usage: bufferUsage.UNIFORM | bufferUsage.COPY_DST });
  const storage = device.createBuffer({ size: capacity * floatsPerPrimitive * 4, usage: bufferUsage.STORAGE | bufferUsage.COPY_DST });
  const sampler = device.createSampler({ magFilter: "linear", minFilter: "linear" });
  let bindGroup: GPUBindGroup | undefined;
  let material = true;
  let synthetic = 0;
  const matrix = new DOMMatrix().translate((cssWidth - face.offsetWidth) / 2, (cssHeight - face.offsetHeight) / 2);
  const states = new Map(controls.map(control => [control, { hover: 0, pressed: 0, focus: 0 }]));

  // Primitive 0 is the panel; then one per [data-relief] control; then `synthetic` far-away ones for the cost probe.
  function primitives(): Float32Array {
    const data = new Float32Array((1 + controls.length + synthetic) * floatsPerPrimitive);
    const radius = (element: Element) => parseFloat(getComputedStyle(element).borderTopLeftRadius) || 0;
    data.set([0, 0, face.offsetWidth, face.offsetHeight, radius(face), tokens.panelHeight, 0, 0, 0, 0, 0, 0], 0);
    controls.forEach((control, index) => {
      const at = offsetWithin(control, face);
      const well = control.dataset.relief === "well";
      const state = states.get(control)!;
      data.set([at.x, at.y, control.offsetWidth, control.offsetHeight, radius(control), well ? tokens.wellDepth : tokens.raisedHeight, well ? 1 : 0, 0,
        state.hover, state.pressed, state.focus, 0], (index + 1) * floatsPerPrimitive);
    });
    for (let index = 0; index < synthetic; index++) {
      data.set([-10000 - index * 40, -10000, 32, 24, 6, tokens.raisedHeight, 0, 0, 0, 0, 0, 0], (1 + controls.length + index) * floatsPerPrimitive);
    }
    return data;
  }

  function encode(pass: GPURenderPassEncoder) {
    const data = primitives();
    device.queue.writeBuffer(storage, 0, data);
    const values = new Float32Array(32);
    values.set(matrix.toFloat32Array(), 0);
    values.set([cssWidth, cssHeight, face.offsetWidth, face.offsetHeight], 16);
    values.set([...tokens.light, tokens.interiorMax], 20);
    values.set([tokens.outset, tokens.bevel, tokens.shadowStrength, material ? 1 : 0], 24);
    values.set([data.length / floatsPerPrimitive, ...tokens.accent.map(channel => channel / 255)], 28);
    device.queue.writeBuffer(uniforms, 0, values);
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup!);
    pass.draw(4);
  }

  let drawing: Promise<unknown> = Promise.resolve();
  const redraw = () => (drawing = drawing.then(() => bindGroup && gpu.present(encode, true)));
  canvas.addEventListener("paint", () => {
    if (gpu.upload(face)) bindGroup = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [
      { binding: 0, resource: { buffer: uniforms } }, { binding: 1, resource: gpu.texture!.createView() },
      { binding: 2, resource: sampler }, { binding: 3, resource: { buffer: storage } }] });
    void redraw();
  });

  // States come from native input on the original controls; they only change the primitive buffer.
  for (const control of controls) {
    const state = states.get(control)!;
    const update = (change: Partial<typeof state>) => { Object.assign(state, change); void redraw(); };
    control.addEventListener("pointerenter", () => update({ hover: 1 }));
    control.addEventListener("pointerleave", () => update({ hover: 0, pressed: 0 }));
    control.addEventListener("pointerdown", () => update({ pressed: 1 }));
    control.addEventListener("pointerup", () => update({ pressed: 0 }));
    control.addEventListener("focus", () => update({ focus: control.matches(":focus-visible") ? 1 : 0 }));
    control.addEventListener("blur", () => update({ focus: 0 }));
  }
  materialToggle.addEventListener("change", () => { material = materialToggle.checked; void redraw(); });

  canvas.updateElementGeometry(face, { canvasTransform: matrix });
  await firstPaint(canvas);
  await drawing;

  const box = () => canvas.getBoundingClientRect();
  return {
    dpr: gpu.dpr,
    tokens: () => tokens,
    settle: () => drawing,
    setMaterial(on: boolean) { material = on; materialToggle.checked = on; return redraw(); },
    /** Face-local CSS point to client coordinates (the panel is only translated). */
    project(local: Point): Point { const b = box(); return { x: b.left + canvas.clientLeft + matrix.e + local.x, y: b.top + canvas.clientTop + matrix.f + local.y }; },
    pixel: gpu.pixel,
    /** Several drawn pixels in one call, for region comparisons. */
    pixels: (points: Point[]) => points.map(point => gpu.pixel(point)),
    hit: hitAt,
    hits: (points: Point[]) => points.map(hitAt),
    extent: () => ({ width: face.offsetWidth, height: face.offsetHeight, radius: parseFloat(getComputedStyle(face).borderTopLeftRadius) || 0 }),
    controls: () => controls.map(control => ({ id: control.id, kind: control.dataset.relief, ...offsetWithin(control, face),
      width: control.offsetWidth, height: control.offsetHeight, radius: parseFloat(getComputedStyle(control).borderTopLeftRadius) || 0, ...states.get(control)! })),
    counts: () => ({ ...gpu.counts }),
    /**
     * Cost probe: with `count` extra primitives, animates one control's hover value for `frames` frames
     * without touching the DOM, and times each frame from encode to queue completion (not pure GPU time).
     */
    async measure(count: number, frames: number) {
      await drawing;
      synthetic = count;
      const animated = states.get(controls.find(control => control.id === "save")!)!;
      const before = { ...gpu.counts };
      const times: number[] = [];
      for (let frame = 0; frame < frames; frame++) {
        animated.hover = 0.5 + 0.5 * Math.sin(frame / 8);
        const started = performance.now();
        await gpu.present(encode, false);
        times.push(performance.now() - started);
      }
      animated.hover = 0;
      synthetic = 0;
      await redraw();
      times.sort((a, b) => a - b);
      return { primitives: 1 + controls.length + count, frames, uploads: gpu.counts.uploads - before.uploads,
        mean: times.reduce((sum, time) => sum + time, 0) / frames, p95: times[Math.floor(frames * 0.95)]! };
    },
  };
}

declare global { interface Window { reliefProbe: { ready: Promise<Awaited<ReturnType<typeof start>>>; error?: string } } }
const ready = start();
window.reliefProbe = { ready };
ready.then(() => { status.textContent = "Relief probe ready"; }, error => { window.reliefProbe.error = String(error); status.textContent = `Probe unavailable: ${error}`; });
