/**
 * Relief level for the Strata look prototypes: the P0.2 material pass, parameterised by a look. A drawable panel is
 * captured with HTML-in-Canvas and lit by a colour-only WebGPU pass: one rounded-rectangle primitive per
 * `[data-relief]` element gives bevels, wells and cast shadows; the panel casts its own shadow into an outset; focus
 * draws an anti-aliased accent edge. States come from native events on each primitive's control
 * (`data-relief-control`, else the element itself) and only change the primitive buffer.
 */
import { bufferUsage, firstPaint, offsetWithin, startProbe, type DrawableCanvas } from "../ui-probes/common.ts";
import { palette, type LookTokens } from "./variants.ts";

const floatsPerPrimitive = 12;
const capacity = 64;
const outset = 40;

const shader = (look: LookTokens) => /* wgsl */ `
struct Uniforms { matrix: mat4x4f, canvas: vec2f, extent: vec2f, light: vec4f, params: vec4f, misc: vec4f }
struct Primitive { rect: vec4f, shape: vec4f, state: vec4f }
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var image: texture_2d<f32>;
@group(0) @binding(2) var imageSampler: sampler;
@group(0) @binding(3) var<storage, read> primitives: array<Primitive>;
struct Varyings { @builtin(position) position: vec4f, @location(0) local: vec2f }

@vertex fn vertexMain(@builtin(vertex_index) index: u32) -> Varyings {
  let corners = array(vec2f(0, 0), vec2f(1, 0), vec2f(0, 1), vec2f(1, 1));
  let local = corners[index] * (u.extent + 2 * u.params.x) - u.params.x;
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
  let sample = textureSampleLevel(image, imageSampler, clamp(p / u.extent, vec2f(0), vec2f(1)), 0);
  let base = mix(vec3f(1), sample.rgb, select(0.0, sample.a, inside));
  let light = normalize(u.light.xyz);
  var shadow = 0.0;
  var shade = 0.0;
  var interior = 1.0;
  var glow = 0.0;
  for (var i = 0u; i < u32(u.misc.x); i++) {
    let primitive = primitives[i];
    let raised = primitive.shape.z < 0.5;
    let hover = primitive.state.x;
    let pressed = primitive.state.y;
    var height = primitive.shape.y;
    if (raised) { height = height * (1 + ${look.hoverHeight - 1} * hover) * (1 - ${1 - look.pressHeight} * pressed); }
    let d = distanceTo(p, primitive);
    if (raised && d > -1) {
      let offset = -light.xy / light.z * height;
      let half = primitive.rect.zw * 0.5;
      let ds = roundedBox(p - primitive.rect.xy - half - offset, half, primitive.shape.x);
      // Shadows only fall outside the shape (soft 1 px edge where they meet it).
      shadow = max(shadow, (1 - smoothstep(-0.5 * height, 1.5 * height + 1, ds)) * u.params.z * smoothstep(-1, 0.5, d));
    }
    let t = clamp(-d / u.params.y, 0, 1);
    let edge = 1 - smoothstep(-0.5, 0.5, d);
    if (t < 1) {
      let e = 0.5;
      let gradient = normalize(vec2f(distanceTo(p + vec2f(e, 0), primitive) - distanceTo(p - vec2f(e, 0), primitive),
        distanceTo(p + vec2f(0, e), primitive) - distanceTo(p - vec2f(0, e), primitive)) + vec2f(1e-6));
      let angle = (1 - t) * 1.2;
      let slope = select(-1.0, 1.0, raised);
      let normal = normalize(vec3f(gradient * slope * sin(angle), cos(angle)));
      shade += (dot(normal, light) - light.z) * ${look.bevelGain} * edge;
    } else {
      interior *= 1 + clamp(${look.hoverLift} * hover - ${look.pressSink} * pressed, -u.light.w, u.light.w);
    }
    // Anti-aliased focus edge from 0.5 to 3.5 px outside the shape.
    if (primitive.state.z > 0.5) { glow = max(glow, smoothstep(0.0, 1.0, d) * (1 - smoothstep(3.0, 4.0, d))); }
  }
  var lit = (base * interior + vec3f(shade)) * (1 - shadow);
  lit = mix(lit, u.misc.yzw, glow);
  return vec4f(clamp(lit, vec3f(0), vec3f(1)), 1);
}
`;

/** Mounts the relief level for `face` (a drawable child of `canvas`) with the given look. */
export async function mountRelief(canvas: DrawableCanvas, face: HTMLElement, look: LookTokens) {
  const width = canvas.clientWidth, height = canvas.clientHeight;
  const gpu = await startProbe(canvas, width, height);
  const { device } = gpu;
  const module = device.createShaderModule({ code: shader(look) });
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
  const matrix = new DOMMatrix().translate((width - face.offsetWidth) / 2, (height - face.offsetHeight) / 2);
  const elements = [...face.querySelectorAll<HTMLElement>("[data-relief]")];
  const controlOf = (element: HTMLElement) => (element.dataset.reliefControl ? face.querySelector<HTMLElement>(`#${element.dataset.reliefControl}`) : null) ?? element;
  const states = new Map<HTMLElement, { hover: number; pressed: number; focus: number }>();
  for (const element of elements) if (!states.has(controlOf(element))) states.set(controlOf(element), { hover: 0, pressed: 0, focus: 0 });
  const radius = (element: Element) => parseFloat(getComputedStyle(element).borderTopLeftRadius) || 0;

  function encode(pass: GPURenderPassEncoder) {
    const data = new Float32Array((1 + elements.length) * floatsPerPrimitive);
    data.set([0, 0, face.offsetWidth, face.offsetHeight, radius(face), look.panelHeight, 0, 0, 0, 0, 0, 0], 0);
    elements.forEach((element, index) => {
      const at = offsetWithin(element, face);
      const well = element.dataset.relief === "well";
      const state = states.get(controlOf(element))!;
      // A control's focus edge is drawn once, around its outermost shape.
      const focus = state.focus && !element.parentElement?.closest("[data-relief]") ? 1 : 0;
      data.set([at.x, at.y, element.offsetWidth, element.offsetHeight, radius(element), well ? look.wellDepth : look.raisedHeight, well ? 1 : 0, 0,
        state.hover, state.pressed, focus, 0], (index + 1) * floatsPerPrimitive);
    });
    device.queue.writeBuffer(storage, 0, data);
    const values = new Float32Array(32);
    values.set(matrix.toFloat32Array(), 0);
    values.set([width, height, face.offsetWidth, face.offsetHeight], 16);
    values.set([...look.light, look.interiorMax], 20);
    values.set([outset, look.bevel, look.shadowStrength, 1], 24);
    values.set([data.length / floatsPerPrimitive, ...palette.accent.map(channel => channel / 255)], 28);
    device.queue.writeBuffer(uniforms, 0, values);
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup!);
    pass.draw(4);
  }

  let drawing: Promise<unknown> = Promise.resolve();
  const redraw = () => (drawing = drawing.then(() => bindGroup && gpu.present(encode, false)));
  canvas.addEventListener("paint", () => {
    if (gpu.upload(face)) bindGroup = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [
      { binding: 0, resource: { buffer: uniforms } }, { binding: 1, resource: gpu.texture!.createView() },
      { binding: 2, resource: sampler }, { binding: 3, resource: { buffer: storage } }] });
    void redraw();
  });
  for (const [control, state] of states) {
    const update = (change: Partial<typeof state>) => { Object.assign(state, change); void redraw(); };
    control.addEventListener("pointerenter", () => update({ hover: 1 }));
    control.addEventListener("pointerleave", () => update({ hover: 0, pressed: 0 }));
    control.addEventListener("pointerdown", () => update({ pressed: 1 }));
    control.addEventListener("pointerup", () => update({ pressed: 0 }));
    control.addEventListener("keydown", event => { if (event.key === " " || event.key === "Enter") update({ pressed: 1 }); });
    control.addEventListener("keyup", () => update({ pressed: 0 }));
    control.addEventListener("focus", () => update({ focus: control.matches(":focus-visible") ? 1 : 0 }));
    control.addEventListener("blur", () => update({ focus: 0 }));
  }
  canvas.updateElementGeometry(face, { canvasTransform: matrix });
  await firstPaint(canvas);
  await drawing;
  return { counts: () => ({ ...gpu.counts }), settle: () => drawing };
}
