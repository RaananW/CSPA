/**
 * Strata Phase 0 probe P0.1 (docs/ui-library/plan.md): does a perspective `canvasTransform` give exact
 * native hits on the installed browser? Raw WebGPU and HTML-in-Canvas only, no Underglass runtime.
 *
 * The drawable `#face` holds four native buttons. Each native paint uploads it with
 * `drawElementImageToTexture`, and it is drawn onto a quad projected by one 4x4 matrix (element-local CSS
 * pixels to canvas CSS pixels, with perspective). The same matrix is registered with
 * `updateElementGeometry`, so the browser hit-tests the face where it is drawn. `window.projectiveProbe`
 * lets the browser test set a tilt, project local points and read back drawn pixels.
 */
import { bufferUsage, firstPaint, hitAt, startProbe, type DrawableCanvas, type Point } from "./common.ts";

/** Degrees around the face's centre, and the CSS perspective distance in pixels (0: none, affine). */
export interface Tilt { rotateX: number; rotateY: number; perspective: number }

const canvas = document.getElementById("stage") as DrawableCanvas;
const face = document.getElementById("face")!;
const status = document.getElementById("status")!;
const buttons = [...face.querySelectorAll("button")];
const cssWidth = 640, cssHeight = 420;

const shader = /* wgsl */ `
struct Uniforms { matrix: mat4x4f, canvas: vec2f, extent: vec2f }
@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var image: texture_2d<f32>;
@group(0) @binding(2) var imageSampler: sampler;
struct Varyings { @builtin(position) position: vec4f, @location(0) uv: vec2f }
@vertex fn vertexMain(@builtin(vertex_index) index: u32) -> Varyings {
  let corners = array(vec2f(0, 0), vec2f(1, 0), vec2f(0, 1), vec2f(1, 1));
  let corner = corners[index];
  // Homogeneous canvas CSS position; clip space keeps w so UVs interpolate perspective-correctly.
  let h = uniforms.matrix * vec4f(corner * uniforms.extent, 0, 1);
  var out: Varyings;
  out.position = vec4f(2 * h.x / uniforms.canvas.x - h.w, h.w - 2 * h.y / uniforms.canvas.y, 0, h.w);
  out.uv = corner;
  return out;
}
@fragment fn fragmentMain(in: Varyings) -> @location(0) vec4f { return textureSample(image, imageSampler, in.uv); }
`;

/** Element-local CSS pixels to canvas CSS pixels: centre the face, apply perspective, then rotate about its centre. */
function faceMatrix(tilt: Tilt): DOMMatrix {
  const matrix = new DOMMatrix().translate(cssWidth / 2, cssHeight / 2);
  // Column-major 16-value form: index 11 is m34, the CSS perspective(d) term -1/d.
  if (tilt.perspective > 0) matrix.multiplySelf(new DOMMatrix([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, -1 / tilt.perspective, 0, 0, 0, 1]));
  return matrix.rotateAxisAngle(0, 1, 0, tilt.rotateY).rotateAxisAngle(1, 0, 0, tilt.rotateX)
    .translate(-face.offsetWidth / 2, -face.offsetHeight / 2);
}

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
  const uniforms = device.createBuffer({ size: 80, usage: bufferUsage.UNIFORM | bufferUsage.COPY_DST });
  const sampler = device.createSampler({ magFilter: "linear", minFilter: "linear" });
  let bindGroup: GPUBindGroup | undefined;
  let tilt: Tilt = { rotateX: 20, rotateY: -35, perspective: 700 };
  let matrix = faceMatrix(tilt);

  // Draws the face with the current matrix and reads the frame back.
  function draw() {
    if (!bindGroup) return Promise.resolve();
    const data = new Float32Array(20);
    data.set(matrix.toFloat32Array(), 0);
    data.set([cssWidth, cssHeight, face.offsetWidth, face.offsetHeight], 16);
    device.queue.writeBuffer(uniforms, 0, data);
    return gpu.present(pass => { pass.setPipeline(pipeline); pass.setBindGroup(0, bindGroup!); pass.draw(4); }, true);
  }

  let drawing: Promise<unknown> = Promise.resolve();
  const redraw = () => (drawing = drawing.then(draw));
  canvas.addEventListener("paint", () => {
    if (gpu.upload(face)) bindGroup = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [
      { binding: 0, resource: { buffer: uniforms } }, { binding: 1, resource: gpu.texture!.createView() }, { binding: 2, resource: sampler }] });
    void redraw();
  });

  function setTilt(next: Tilt) {
    tilt = next;
    matrix = faceMatrix(tilt);
    canvas.updateElementGeometry(face, { canvasTransform: matrix });
    status.textContent = `tilt ${JSON.stringify(tilt)}\nmatrix ${matrix.toString()}`;
    return redraw();
  }

  await firstPaint(canvas);
  await setTilt(tilt);

  for (const button of buttons) button.addEventListener("click", () => {
    const count = Number(button.dataset.clicks ?? 0) + 1;
    button.dataset.clicks = String(count);
    button.textContent = `${button.id.toUpperCase()} ${count}`;
  });
  const sliders = ["rotate-x", "rotate-y", "perspective"].map(id => document.getElementById(id) as HTMLInputElement);
  for (const slider of sliders) slider.addEventListener("input", () =>
    void setTilt({ rotateX: Number(sliders[0]!.value), rotateY: Number(sliders[1]!.value), perspective: Number(sliders[2]!.value) }));

  return {
    dpr: gpu.dpr,
    setTilt,
    /** Waits for any pending draw, so `pixel` reflects the latest native paint. */
    settle: () => drawing,
    requested: () => [...matrix.toFloat64Array()],
    applied: () => { const actual = canvas.getElementTransform(face); return { values: [...actual.toFloat64Array()], is2D: actual.is2D }; },
    /** Face-local CSS point to viewport (client) coordinates, through the projective matrix. */
    project(local: Point): Point {
      const point = matrix.transformPoint(new DOMPoint(local.x, local.y, 0, 1));
      const box = canvas.getBoundingClientRect();
      return { x: box.left + canvas.clientLeft + point.x / point.w, y: box.top + canvas.clientTop + point.y / point.w };
    },
    pixel: gpu.pixel,
    /** Each button's face-local rectangle and click count. */
    targets: () => buttons.map(button => ({ id: button.id, x: button.offsetLeft, y: button.offsetTop,
      width: button.offsetWidth, height: button.offsetHeight, clicks: Number(button.dataset.clicks ?? 0) })),
    extent: () => ({ width: face.offsetWidth, height: face.offsetHeight }),
    hit: hitAt,
    counts: () => ({ ...gpu.counts }),
  };
}

declare global { interface Window { projectiveProbe: { ready: Promise<Awaited<ReturnType<typeof start>>>; error?: string } } }
const ready = start();
window.projectiveProbe = { ready };
ready.catch(error => { window.projectiveProbe.error = String(error); status.textContent = `Probe unavailable: ${error}`; });
