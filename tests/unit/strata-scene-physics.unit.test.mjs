/**
 * Unit tests for the Scene level's non-drawing parts in `@underglass/ui/gpu` (`packages/ui/src/gpu/scene.ts`): the
 * seeded confetti physics (reproducible bursts, gravity, drag, the floor, fading out), the settling spring, and
 * Radiance `.hdr` decoding into environment maps. Run with `npm run test:unit`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

const { advance, asParticle, decodeHdr, environmentFrom, launch, physics, seeded, spring } = await import("../../packages/ui/src/gpu/scene.ts");

test("a burst is reproducible from its seed, and stays within its budget and cone", () => {
  const a = launch(100, 200, ["#ff0000", "#00ff00"], { seed: 42, count: 50 });
  const b = launch(100, 200, ["#ff0000", "#00ff00"], { seed: 42, count: 50 });
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, launch(100, 200, ["#ff0000", "#00ff00"], { seed: 43, count: 50 }));
  assert.equal(launch(0, 0, ["#000000"], { seed: 1, count: 1000 }).length, 256);
  // Every particle leaves upwards, within 70° of straight up.
  for (const particle of a) {
    assert.ok(particle.vy < 0);
    assert.ok(Math.abs(Math.atan2(particle.vx, -particle.vy)) <= (70 * Math.PI) / 180 + 1e-9);
  }
  // The random source is uniform in [0, 1).
  const random = seeded(9), values = Array.from({ length: 1000 }, random);
  assert.ok(values.every(value => value >= 0 && value < 1));
  assert.ok(Math.abs(values.reduce((sum, value) => sum + value, 0) / values.length - 0.5) < 0.05);
});

test("particles fall under gravity, slow with drag, bounce on the floor and fade before they go", () => {
  const still = { shape: "card", x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, width: 8, height: 10, rotation: 0, spin: 0, tiltX: 0, tiltY: 0,
    tumbleX: 0, tumbleY: 0, colour: "#ff0000", age: 0, life: 10 };
  // From rest for 0.1 s: v = ∫ g · e^(−k(t−s)) ds, so a little under g · t.
  const [falling] = advance([{ ...still }], 0.1, 1000);
  assert.ok(falling.vy > 0.9 * physics.gravity * 0.1 && falling.vy < physics.gravity * 0.1);
  assert.ok(falling.y > 0);
  // On the floor, moving down, it bounces back up at a fraction of its speed.
  const [bounced] = advance([{ ...still, y: 99.9, vy: 500 }], physics.step, 100);
  assert.equal(bounced.y, 100);
  assert.ok(bounced.vy < 0 && Math.abs(bounced.vy) < 500 * physics.bounce * 1.1);
  // It never sinks below the stage plane.
  const [low] = advance([{ ...still, z: 1, vz: -1000 }], 0.05, 1000);
  assert.equal(low.z, 0);
  // Its age ends it, and it fades over its last moments.
  assert.equal(advance([{ ...still, age: 9.99 }], 0.05, 1000).length, 0);
  assert.ok(Math.abs(asParticle({ ...still, age: 10 - physics.fade / 2 }).opacity - 0.5) < 1e-9);
  assert.equal(asParticle(still).opacity, 1);
  // A step longer than 0.1 s (a stalled frame) is clamped, so nothing tunnels.
  const [clamped] = advance([{ ...still }], 5, 1e6);
  assert.ok(Math.abs(clamped.age - 0.1) < 1e-9);
});

test("the settling spring starts at 0, overshoots once and comes to rest at 1", () => {
  assert.equal(spring(0), 0);
  const samples = Array.from({ length: 200 }, (_, index) => spring(index / 100));
  assert.ok(Math.max(...samples) > 1.05, "it overshoots");
  assert.ok(Math.abs(spring(2) - 1) < 0.01, "it settles");
});

/** A Radiance file of `width × height`, every pixel `[r, g, b, e]`, flat or run-length encoded. */
function hdr(width, height, pixel, rle) {
  const header = new TextEncoder().encode(`#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y ${height} +X ${width}\n`);
  const rows = [];
  for (let y = 0; y < height; y++) {
    if (!rle) { for (let x = 0; x < width; x++) rows.push(...pixel(x, y)); continue; }
    rows.push(2, 2, width >> 8, width & 255);
    // Each channel as one run of 127 values at most, then literals.
    for (let channel = 0; channel < 4; channel++) {
      for (let x = 0; x < width;) {
        const count = Math.min(127, width - x);
        rows.push(128 + count, pixel(x, y)[channel]);
        x += count;
      }
    }
  }
  const bytes = new Uint8Array(header.length + rows.length);
  bytes.set(header); bytes.set(rows, header.length);
  return bytes.buffer;
}

test(".hdr files decode, flat and run-length encoded, and downsample into a normalized environment map", () => {
  const pixel = (x, y) => [128, 64, 32, y < 8 ? 129 : 127];
  for (const rle of [false, true]) {
    const image = decodeHdr(hdr(64, 16, pixel, rle));
    assert.deepEqual([image.width, image.height], [64, 16]);
    // Mantissa 128 with exponent 129 is 1.0; 64 is 0.5 and 32 is 0.25.
    assert.deepEqual([...image.data.slice(0, 3)], [1, 0.5, 0.25]);
    assert.deepEqual([...image.data.slice(-3)], [0.25, 0.125, 0.0625]);
    const map = environmentFrom(image, 0.7);
    assert.equal(map.source, "map");
    assert.equal(map.strength, 0.7);
    assert.equal(map.grid.length, 512);
    // The upper quarter averages 1; the lower half is a quarter as bright.
    assert.ok(Math.abs(map.grid[0] - 1) < 1e-9);
    assert.ok(Math.abs(map.grid[511] - 0.25) < 1e-9);
  }
  assert.throws(() => decodeHdr(new TextEncoder().encode("P6\n").buffer), /Not a Radiance HDR file/);
  assert.throws(() => decodeHdr(new TextEncoder().encode("#?RADIANCE\nFORMAT=32-bit_rle_xyze\n\n-Y 1 +X 1\n").buffer), /Unsupported HDR format/);
});
