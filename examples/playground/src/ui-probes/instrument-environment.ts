/**
 * Environments for the Instrument probes (docs/ui-library/instrument.md, "Materials are configuration"; probe I0.4):
 * - **The studio**, generated in code (no asset), per design language section 4: mostly dark, a key softbox, a fill
 *   and a strip overhead. It is authored in a canonical frame, with the key at longitude 0 and at the key light's
 *   height, encoded as a Radiance `.hdr` in memory and loaded with Lite's `loadHdrEnvironment` (which prefilters it and
 *   builds the BRDF table and the irradiance harmonics). `setEnvironmentRotation` then turns it about world y (the
 *   screen's vertical) so that the softbox lies exactly in the key light's direction, `studioRotation(light)`.
 * - **The capture probe**: the layer's own capture as a local environment, so metal and glass reflect the faceplate
 *   print and the neighbouring controls. A cube texture is filled from the capture on the GPU: from the probe's
 *   capture point, a direction that leaves the projection box through its back face (the face plane, z = 0) inside the
 *   panel sees the capture at that point; any other direction sees the studio. The box's other faces are far away, so
 *   the studio stays at infinity. The mips are a direction-space blur chain, so rough
 *   materials see a blurred page. Lite's `setPbrLocalEnvironment` (box projection) binds the cube directly, so
 *   refreshing its texels updates every material that uses it without a rebuild.
 */
import { loadHdrEnvironment, type EnvironmentTextures, type SceneContext } from "@babylonjs/lite";

export interface KeyLight { azimuth: number; elevation: number }
type Vec3 = [number, number, number];

/** World direction towards the key light (y up, +z away from the viewer); the harness's light uses the same axes. */
export function towardsLight({ azimuth, elevation }: KeyLight): Vec3 {
  const a = (azimuth * Math.PI) / 180, e = (elevation * Math.PI) / 180;
  return [Math.sin(a) * Math.cos(e), Math.cos(a) * Math.cos(e), -Math.sin(e)];
}
/**
 * Lite rotates the environment lookup about world y: a world direction `w` reads the cube at `rotateY(w, θ)`, with
 * `rotateY(v, θ) = (x cos θ + z sin θ, y, −x sin θ + z cos θ)`. The canonical key `(0, Ly, −r)` is seen from
 * `rotateY(K, −θ) = (r sin θ, Ly, −r cos θ)`, which is the light direction for `θ = atan2(Lx, −Lz)`.
 */
export function studioRotation(light: KeyLight) {
  const [x, , z] = towardsLight(light);
  return Math.atan2(x, -z);
}
export const rotateY = ([x, y, z]: Vec3, angle: number): Vec3 => {
  const c = Math.cos(angle), s = Math.sin(angle);
  return [x * c + z * s, y, -x * s + z * c];
};

/** The studio's radiance tokens (linear, HDR). */
export const studioTokens = { floor: 0.03, ceiling: 0.25, key: 12, keyRadius: 0.24, keySoftness: 0.1, fill: 1.2, fillRadius: 0.55, front: 0.12, frontRadius: 0.9, strip: 2.5, stripLow: 0.2, stripHigh: 0.34 };

/** Studio radiance for a direction in the environment's canonical frame. */
function studioRadiance(direction: Vec3, light: KeyLight): Vec3 {
  const [, ly] = towardsLight(light), r = Math.sqrt(Math.max(0, 1 - ly * ly));
  const t = studioTokens, [x, y, z] = direction;
  const smooth = (edge0: number, edge1: number, value: number) => { const k = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0))); return k * k * (3 - 2 * k); };
  const angle = (a: Vec3) => Math.acos(Math.min(1, Math.max(-1, a[0] * x + a[1] * y + a[2] * z)));
  // A dark room rising towards the ceiling (2B.7's studio: a dark floor rising to a bright ceiling).
  let value = t.floor + (t.ceiling - t.floor) * smooth(-0.35, 0.65, y);
  // The key softbox at longitude 0 and the light's height; a broad fill opposite it (longitude 180°, low).
  value += t.key * smooth(t.keyRadius + t.keySoftness, t.keyRadius, angle([0, ly, -r]));
  value += t.fill * smooth(t.fillRadius + 0.3, t.fillRadius, angle([0, -0.35, Math.sqrt(1 - 0.35 * 0.35)])) * 0.5;
  // A broad, dim panel in front of the panel (behind the viewer), so face-on metal reads as metal, not black.
  value += t.front * smooth(t.frontRadius + 0.4, t.frontRadius, angle([0, 0, -1]));
  // The strip: a band all around at 12–20° above the horizon, so it is the same under any rotation; in front of the
  // panel it is a light bar above the viewer, the reflection band that crowned caps and chrome catch.
  value += t.strip * smooth(t.stripLow - 0.04, t.stripLow, y) * smooth(t.stripHigh + 0.04, t.stripHigh, y);
  // Slightly cool, like the neutral studio of the Objects level.
  return [value * 0.97, value * 0.99, value];
}

/**
 * The studio as a Radiance `.hdr` (RLE scanlines of literal runs), `width` × `width / 2`. The first file row is +y.
 * Measured on Lite 1.33.0 (by reading the loaded cube back, `readCube`): file column longitude `l` lands at the cube
 * direction whose `atan2(z, x)` is `90° − l`, i.e. `(sin l, ·, cos l)`, so the generator writes that direction.
 */
export function studioHdr(light: KeyLight, width = 512): Uint8Array {
  const height = width / 2;
  const header = new TextEncoder().encode(`#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y ${height} +X ${width}\n`);
  // Per row: a 4-byte RLE header, then each of the four channels as literal runs of at most 128 bytes.
  const runsPerChannel = Math.ceil(width / 128);
  const rowBytes = 4 + 4 * (width + runsPerChannel);
  const bytes = new Uint8Array(header.length + height * rowBytes);
  bytes.set(header);
  let offset = header.length;
  const channels = [new Uint8Array(width), new Uint8Array(width), new Uint8Array(width), new Uint8Array(width)];
  for (let row = 0; row < height; row++) {
    const polar = ((row + 0.5) / height) * Math.PI;
    for (let column = 0; column < width; column++) {
      const longitude = ((column + 0.5) / width - 0.5) * 2 * Math.PI;
      const direction: Vec3 = [Math.sin(polar) * Math.sin(longitude), Math.cos(polar), Math.sin(polar) * Math.cos(longitude)];
      const [r, g, b] = studioRadiance(direction, light), peak = Math.max(r, g, b);
      if (peak < 1e-32) { for (const channel of channels) channel[column] = 0; continue; }
      // frexp: peak = m · 2^exponent with m in [0.5, 1), so every channel byte stays below 256.
      const exponent = Math.floor(Math.log2(peak)) + 1, scale = 256 / 2 ** exponent;
      channels[0]![column] = Math.min(255, Math.floor(r * scale)); channels[1]![column] = Math.min(255, Math.floor(g * scale));
      channels[2]![column] = Math.min(255, Math.floor(b * scale)); channels[3]![column] = exponent + 128;
    }
    bytes.set([2, 2, width >> 8, width & 255], offset);
    offset += 4;
    for (const channel of channels) for (let start = 0; start < width; start += 128) {
      const count = Math.min(128, width - start);
      bytes[offset++] = count;
      bytes.set(channel.subarray(start, start + count), offset);
      offset += count;
    }
  }
  return bytes.subarray(0, offset);
}

/** Loads the studio into `scene` as its environment (no skybox, no ground). */
export async function loadStudio(scene: SceneContext, light: KeyLight, faceSize = 256): Promise<EnvironmentTextures> {
  const url = URL.createObjectURL(new Blob([studioHdr(light) as BlobPart], { type: "image/vnd.radiance" }));
  try {
    return await loadHdrEnvironment(scene, url, { faceSize, skipSkybox: true, skipGround: true });
  } finally {
    URL.revokeObjectURL(url);
  }
}

// WebGPU flags by value (the DOM library declares the interfaces but not these namespaces).
const usage = { COPY_SRC: 0x01, TEXTURE_BINDING: 0x04, RENDER_ATTACHMENT: 0x10, UNIFORM: 0x40, COPY_DST_BUFFER: 0x08 } as const;

const probeShader = /* wgsl */ `
struct Shared { boxMin: vec4f, boxMax: vec4f, centre: vec4f, layer: vec4f };
struct Face { face: u32, size: f32, spread: f32, pad: f32 };
@group(0) @binding(0) var<uniform> probe: Shared;
@group(0) @binding(1) var<uniform> info: Face;
@group(0) @binding(2) var linearSampler: sampler;
@group(1) @binding(0) var capture: texture_2d<f32>;
@group(1) @binding(1) var studio: texture_cube<f32>;
@group(1) @binding(2) var previous: texture_cube<f32>;

@vertex fn vertexMain(@builtin(vertex_index) index: u32) -> @builtin(position) vec4f {
  var corners = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  return vec4f(corners[index], 0.0, 1.0);
}
// Cube face directions (WebGPU's layer order +X, -X, +Y, -Y, +Z, -Z), u right and v down across the face.
fn faceDirection(face: u32, texel: vec2f) -> vec3f {
  let u = texel.x / info.size * 2.0 - 1.0;
  let v = texel.y / info.size * 2.0 - 1.0;
  switch face {
    case 0u: { return normalize(vec3f(1.0, -v, -u)); }
    case 1u: { return normalize(vec3f(-1.0, -v, u)); }
    case 2u: { return normalize(vec3f(u, 1.0, v)); }
    case 3u: { return normalize(vec3f(u, -1.0, -v)); }
    case 4u: { return normalize(vec3f(u, -v, 1.0)); }
    default: { return normalize(vec3f(-u, -v, -1.0)); }
  }
}
fn rotateY(v: vec3f, angle: f32) -> vec3f { let c = cos(angle); let s = sin(angle); return vec3f(v.x * c + v.z * s, v.y, -v.x * s + v.z * c); }
fn srgbToLinear(c: vec3f) -> vec3f { return select(pow((c + 0.055) / 1.055, vec3f(2.4)), c / 12.92, c <= vec3f(0.04045)); }

// Mip 0: a stored direction s is read for the world direction rotateY(w, rotation) = s (Lite applies the environment
// rotation after the parallax correction). From the capture point, w leaves the box somewhere: through the face plane
// it sees the capture there, anywhere else the studio.
@fragment fn fill(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let s = faceDirection(info.face, position.xy);
  let w = rotateY(s, -probe.centre.w);
  var colour = textureSampleLevel(studio, linearSampler, s, 0.0).rgb;
  if (probe.layer.w > 0.5 && w.z > 1e-5) {
    let c = probe.centre.xyz;
    let far = max((probe.boxMin.xyz - c) / w, (probe.boxMax.xyz - c) / w);
    let t = min(far.x, min(far.y, far.z));
    if (far.z <= t * 1.0001) {
      let hit = c + w * t;
      // World to layer-local CSS px, then to capture texels.
      let local = vec2f(hit.x + probe.layer.x, probe.layer.y - hit.y) * probe.layer.z;
      let size = vec2f(textureDimensions(capture));
      if (all(local >= vec2f(0.0)) && all(local < size)) {
        let texel = textureSampleLevel(capture, linearSampler, local / size, 0.0);
        colour = mix(colour, srgbToLinear(texel.rgb), texel.a);
      }
    }
  }
  return vec4f(colour, 1.0);
}
// Mip n: a 5 × 5 Gaussian over the previous mip in the plane tangent to the direction, about one texel of this mip
// wide, so each level is roughly the roughness Lite's lod mapping reads it for.
@fragment fn blur(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let s = faceDirection(info.face, position.xy);
  let up = select(vec3f(0.0, 1.0, 0.0), vec3f(1.0, 0.0, 0.0), abs(s.y) > 0.99);
  let tx = normalize(cross(up, s));
  let ty = cross(s, tx);
  var sum = vec3f(0.0);
  var weight = 0.0;
  for (var i = -2; i <= 2; i++) {
    for (var j = -2; j <= 2; j++) {
      let o = vec2f(f32(i), f32(j));
      let k = exp(-dot(o, o) / 3.0);
      sum += textureSampleLevel(previous, linearSampler, normalize(s + (tx * o.x + ty * o.y) * info.spread), 0.0).rgb * k;
      weight += k;
    }
  }
  return vec4f(sum / weight, 1.0);
}
`;

export interface CaptureProbeOptions {
  /** Cube face size in texels (a power of two). */
  size: number;
  /** The environment rotation of the scene that uses the probe (`setEnvironmentRotation`). */
  rotation: number;
  /** The layer's rect on the face plane, in world units. */
  panel: { minX: number; minY: number; maxX: number; maxY: number };
  /** How far in front of the face the cube is captured (world units), on the panel's centre line. */
  captureHeight: number;
  /**
   * How far the projection box reaches beyond the panel and towards the viewer. Lite reads the cube in the direction
   * from the capture point to where the reflected ray leaves the box; with walls this far, a ray that does not meet the
   * face reads (almost) its own direction, so the studio stays at infinity and only the face plane is near.
   */
  reach: number;
  /** World x and y to layer-local CSS px: `local = (x + offsetX, offsetY − y)`. */
  offsetX: number; offsetY: number;
  dpr: number;
}

/**
 * A cube environment filled from a layer's capture (see the module header). `environment` shares the studio's BRDF
 * table, sampler and irradiance; `projection` is what `setPbrLocalEnvironment` takes; `refresh` re-renders every face
 * and mip from the capture (or, with `page` false, from the studio only) and returns the submitted command buffer's
 * completion.
 */
export function createCaptureProbe(device: GPUDevice, studio: EnvironmentTextures, options: CaptureProbeOptions) {
  const { size, panel, reach } = options;
  const mipLevelCount = Math.log2(size) + 1;
  const format: GPUTextureFormat = "rgba16float";
  const cube = device.createTexture({ label: "instrument-capture-probe", size: [size, size, 6], format, mipLevelCount,
    usage: usage.TEXTURE_BINDING | usage.RENDER_ATTACHMENT | usage.COPY_SRC });
  const environment: EnvironmentTextures = { ...studio, specularCube: cube, specularCubeView: cube.createView({ dimension: "cube" }), lodGenerationScale: studio.lodGenerationScale ?? 0.8, lodGenerationOffset: 0 };
  // The capture point sits on the panel's centre line, `captureHeight` in front of the face, so the panel fills the +z
  // face of the cube about evenly. The box's back face is the face plane; its other faces are `reach` away.
  const cx = (panel.minX + panel.maxX) / 2, cy = (panel.minY + panel.maxY) / 2;
  const centre: Vec3 = [cx, cy, -options.captureHeight];
  const box = { minX: cx - reach, maxX: cx + reach, minY: cy - reach, maxY: cy + reach, minZ: -reach };
  const projection = { projectionPosition: [cx, cy, -reach / 2] as Vec3, capturePosition: centre, projectionSize: [2 * reach, 2 * reach, reach] as Vec3 };

  const module = device.createShaderModule({ label: "instrument-capture-probe", code: probeShader });
  const shared = device.createBindGroupLayout({ entries: [
    { binding: 0, visibility: 2, buffer: { type: "uniform" } }, { binding: 1, visibility: 2, buffer: { type: "uniform" } }, { binding: 2, visibility: 2, sampler: {} },
  ] });
  const sources = device.createBindGroupLayout({ entries: [
    { binding: 0, visibility: 2, texture: { sampleType: "float" } }, { binding: 1, visibility: 2, texture: { sampleType: "float", viewDimension: "cube" } },
    { binding: 2, visibility: 2, texture: { sampleType: "float", viewDimension: "cube" } },
  ] });
  const layout = device.createPipelineLayout({ bindGroupLayouts: [shared, sources] });
  const pipeline = (entryPoint: string) => device.createRenderPipeline({ label: `instrument-capture-probe-${entryPoint}`, layout,
    vertex: { module, entryPoint: "vertexMain" }, fragment: { module, entryPoint, targets: [{ format }] }, primitive: { topology: "triangle-list" } });
  const fill = pipeline("fill"), blur = pipeline("blur");
  const sampler = device.createSampler({ magFilter: "linear", minFilter: "linear", mipmapFilter: "nearest", addressModeU: "clamp-to-edge", addressModeV: "clamp-to-edge" });
  const sharedBuffer = device.createBuffer({ size: 64, usage: usage.UNIFORM | usage.COPY_DST_BUFFER });
  const write = (page: boolean) => device.queue.writeBuffer(sharedBuffer, 0, new Float32Array([
    box.minX, box.minY, box.minZ, 0, box.maxX, box.maxY, 0, 0, ...centre, options.rotation, options.offsetX, options.offsetY, options.dpr, page ? 1 : 0,
  ]));
  // One uniform buffer, target view and bind group per face and mip.
  const passes: { mip: number; target: GPUTextureView; group: GPUBindGroup; previous?: GPUTextureView }[] = [];
  for (let mip = 0; mip < mipLevelCount; mip++) {
    const faceSize = size >> mip;
    for (let face = 0; face < 6; face++) {
      const buffer = device.createBuffer({ size: 16, usage: usage.UNIFORM | usage.COPY_DST_BUFFER });
      // `spread`: the tangent-plane step of the blur, about half a texel of this mip (a face spans 2 tangent units).
      const data = new ArrayBuffer(16);
      new Uint32Array(data, 0, 1)[0] = face;
      new Float32Array(data, 4, 3).set([faceSize, (2 / faceSize) * 0.6, 0]);
      device.queue.writeBuffer(buffer, 0, data);
      passes.push({ mip, target: cube.createView({ dimension: "2d", baseMipLevel: mip, mipLevelCount: 1, baseArrayLayer: face, arrayLayerCount: 1 }),
        group: device.createBindGroup({ layout: shared, entries: [{ binding: 0, resource: { buffer: sharedBuffer } }, { binding: 1, resource: { buffer } }, { binding: 2, resource: sampler }] }),
        previous: mip ? cube.createView({ dimension: "cube", baseMipLevel: mip - 1, mipLevelCount: 1 }) : undefined });
    }
  }
  const studioView = studio.specularCube.createView({ dimension: "cube" });
  // A 1 × 1 placeholder capture before the first one is bound, and for the studio-only fill.
  const blank = device.createTexture({ size: [1, 1], format: "rgba8unorm", usage: usage.TEXTURE_BINDING });
  const groups = new WeakMap<GPUTexture, GPUBindGroup[]>();
  const sourcesFor = (capture: GPUTexture) => {
    let list = groups.get(capture);
    if (!list) {
      const view = capture.createView();
      list = passes.map(pass => device.createBindGroup({ layout: sources, entries: [
        { binding: 0, resource: view }, { binding: 1, resource: studioView }, { binding: 2, resource: pass.previous ?? studioView },
      ] }));
      groups.set(capture, list);
    }
    return list;
  };
  let lastPage: boolean | undefined;
  // Timestamp queries around a refresh, when the device has them.
  let timing: { querySet: GPUQuerySet; resolve: GPUBuffer; read: GPUBuffer } | undefined;
  const timer = () => {
    if (!device.features.has("timestamp-query")) return undefined;
    timing ??= { querySet: device.createQuerySet({ type: "timestamp", count: 2 }), resolve: device.createBuffer({ size: 16, usage: 0x0200 | 0x0004 }), read: device.createBuffer({ size: 16, usage: 0x0001 | 0x0008 }) };
    return timing;
  };
  let refreshes = 0;
  return {
    environment, projection, size, mipLevelCount, centre,
    refreshes: () => refreshes,
    /** Re-renders the probe from `capture` (`page` false: the studio only). Encoded and submitted on its own. */
    refresh(capture: GPUTexture | undefined, page = true, timed = false) {
      const usePage = page && !!capture;
      if (usePage !== lastPage) { write(usePage); lastPage = usePage; }
      const list = sourcesFor(capture ?? blank);
      const encoder = device.createCommandEncoder({ label: "instrument-capture-probe" });
      const timing = timed ? timer() : undefined;
      passes.forEach((pass, index) => {
        const timestampWrites = timing && (index === 0 || index === passes.length - 1)
          ? { querySet: timing.querySet, ...(index === 0 ? { beginningOfPassWriteIndex: 0 } : {}), ...(index === passes.length - 1 ? { endOfPassWriteIndex: 1 } : {}) } : undefined;
        const render = encoder.beginRenderPass({ colorAttachments: [{ view: pass.target, loadOp: "clear", storeOp: "store", clearValue: { r: 0, g: 0, b: 0, a: 1 } }], ...(timestampWrites ? { timestampWrites } : {}) });
        render.setPipeline(pass.mip ? blur : fill);
        render.setBindGroup(0, pass.group);
        render.setBindGroup(1, list[index]!);
        render.draw(3);
        render.end();
      });
      if (timing) { encoder.resolveQuerySet(timing.querySet, 0, 2, timing.resolve, 0); encoder.copyBufferToBuffer(timing.resolve, 0, timing.read, 0, 16); }
      device.queue.submit([encoder.finish()]);
      refreshes++;
    },
    /** GPU time of the last `timed` refresh, from timestamp queries (null without the `timestamp-query` feature). */
    async lastGpuMs() {
      if (!timing) return null;
      await timing.read.mapAsync(0x0001);
      const [start, end] = new BigUint64Array(timing.read.getMappedRange().slice(0));
      timing.read.unmap();
      return Number(end! - start!) / 1e6;
    },
    dispose() { cube.destroy(); blank.destroy(); sharedBuffer.destroy(); },
  };
}
export type CaptureProbe = ReturnType<typeof createCaptureProbe>;

/** Reads mip `mip` of a cube texture (rgba16float) back as linear RGB per face; for diagnostics. */
export async function readCube(device: GPUDevice, texture: GPUTexture, mip = 0) {
  const size = Math.max(1, texture.width >> mip), bytesPerRow = Math.ceil((size * 8) / 256) * 256;
  const buffer = device.createBuffer({ size: bytesPerRow * size * 6, usage: 0x0001 | 0x0008 });
  const encoder = device.createCommandEncoder();
  for (let face = 0; face < 6; face++) encoder.copyTextureToBuffer({ texture, mipLevel: mip, origin: [0, 0, face] }, { buffer, offset: face * bytesPerRow * size, bytesPerRow }, [size, size, 1]);
  device.queue.submit([encoder.finish()]);
  await buffer.mapAsync(0x0001);
  const halves = new Uint16Array(buffer.getMappedRange().slice(0));
  buffer.unmap(); buffer.destroy();
  const half = (h: number) => { const s = h & 0x8000 ? -1 : 1, e = (h >> 10) & 31, f = h & 1023; return e === 0 ? s * 2 ** -14 * (f / 1024) : e === 31 ? (f ? NaN : s * Infinity) : s * 2 ** (e - 15) * (1 + f / 1024); };
  /** Radiance in a direction (nearest texel), with WebGPU's cube face selection. */
  return (direction: Vec3): Vec3 => {
    const [x, y, z] = direction, ax = Math.abs(x), ay = Math.abs(y), az = Math.abs(z);
    let face: number, u: number, v: number;
    if (ax >= ay && ax >= az) { face = x > 0 ? 0 : 1; u = (x > 0 ? -z : z) / ax; v = -y / ax; }
    else if (ay >= az) { face = y > 0 ? 2 : 3; u = x / ay; v = (y > 0 ? z : -z) / ay; }
    else { face = z > 0 ? 4 : 5; u = (z > 0 ? x : -x) / az; v = -y / az; }
    const px = Math.min(size - 1, Math.floor(((u + 1) / 2) * size)), py = Math.min(size - 1, Math.floor(((v + 1) / 2) * size));
    const offset = (face * bytesPerRow * size + py * bytesPerRow) / 2 + px * 4;
    return [half(halves[offset]!), half(halves[offset + 1]!), half(halves[offset + 2]!)];
  };
}
