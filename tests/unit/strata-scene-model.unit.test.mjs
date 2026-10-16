/**
 * Unit tests for the Scene part of the Strata rendering model (`docs/ui-library/rendering-model.md`, part 2C,
 * version 3) as `@underglass/ui/tokens` ships it: stage scenes and environment maps validate, the reference
 * implementation gives the values the standard states at key points (computed here by hand), and the committed
 * `scene-3.json` is what the reference implementation produces. Run with `npm run test:unit`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  backdropColour, buildSceneConformance, environmentSample, environmentTerm, parseHex, particleAt, sceneCases, shadeStage, validateEnvironmentMap,
  validateScene, validateStageScene,
} from "../../packages/ui/src/tokens/index.ts";

const committed = JSON.parse(readFileSync(new URL("../../packages/ui/conformance/scene-3.json", import.meta.url), "utf8"));
const cases = Object.fromEntries(sceneCases().map(entry => [entry.name, entry]));
const close = (actual, expected, tolerance = 1e-6) => actual.forEach((value, index) => assert.ok(Math.abs(value - expected[index]) <= tolerance, `${actual} vs ${expected}`));

test("every Scene conformance scene is valid", () => {
  for (const entry of sceneCases()) {
    const issues = entry.scene.format === "strata-stage" ? validateStageScene(entry.scene) : validateScene(entry.scene);
    assert.deepEqual(issues, [], entry.name);
  }
});

test("the stage validator reports broken scenes at their paths", () => {
  const broken = (change, path) => {
    const scene = structuredClone(cases.particles.scene);
    change(scene);
    assert.ok(validateStageScene(scene).map(issue => issue.path).includes(path), path);
  };
  broken(scene => { scene.version = 2; }, "version");
  broken(scene => { delete scene.camera; }, "camera");
  broken(scene => { scene.backdrop = { colour: "grey", pool: 0, vignette: 0 }; }, "backdrop.colour");
  broken(scene => { scene.particles[0].shape = "star"; }, "particles[0].shape");
  broken(scene => { scene.particles[0].position = [0, 0]; }, "particles[0].position");
  broken(scene => { scene.particles[0].opacity = 2; }, "particles[0].opacity");
  broken(scene => { scene.particles[0].spin = 1; }, "particles[0].spin");
  broken(scene => { scene.particles = Array.from({ length: 257 }, () => scene.particles[0]); }, "particles");
  // Environment maps: version 3 only, 32 × 16 values within 0 to 4.
  assert.deepEqual(validateEnvironmentMap({ source: "map", strength: 0.5, grid: Array(512).fill(1) }), []);
  assert.equal(validateEnvironmentMap({ source: "map", strength: 0.5, grid: Array(500).fill(1) })[0].path, "environment.grid");
  const objects = structuredClone(cases["environment-map"].scene);
  objects.version = 2;
  assert.ok(validateScene(objects).some(issue => issue.path === "environment.source"));
});

test("the backdrop is lit as the standard states (2C.2), by hand", () => {
  const scene = cases.backdrop.scene, [r, g, b] = parseHex("#8c95a3").map(channel => channel / 255);
  // The pool's centre sits half a reach from the stage's centre, towards the light.
  const reach = Math.hypot(320, 200) / 2, a = 323 * Math.PI / 180, e = 41 * Math.PI / 180;
  const pool = [160 + Math.sin(a) * Math.cos(e) * reach * 0.5, 100 - Math.cos(a) * Math.cos(e) * reach * 0.5];
  // At the pool's centre: full pool, no vignette.
  close(backdropColour(scene, ...pool), [r * 1.15, g * 1.15, b * 1.15].map(value => Math.min(value, 1)));
  // Far outside the pool and at the corner: the full vignette darkens by 35 %.
  const corner = backdropColour({ ...scene, extent: { width: 320, height: 200 }, backdrop: { ...scene.backdrop, pool: 0 } }, 0, 0);
  close(corner, [r, g, b].map(value => value * (1 - 0.35 * 0.5 * (((t) => t * t * (3 - 2 * t))(Math.min(1, (reach - reach * 0.45) / (reach * 1.1 - reach * 0.45)))))));
  // Opaque.
  assert.equal(shadeStage(scene, 10, 10)[3], 1);
});

test("particles are lit cards in perspective, drawn farthest first (2C.3)", () => {
  const scene = cases.particles.scene, accent = parseHex(scene.particles[0].colour).map(channel => channel / 255);
  const seen = (x, y, z) => [160 + (x - 160) * 1600 / (1600 - z), 100 + (y - 100) * 1600 / (1600 - z)];
  // A flat card facing the viewer: diffuse 0.55 + 0.45 · (n · L) / L.z = 1, so its own colour (and a negligible lobe).
  const flat = particleAt(scene, scene.particles[0], ...seen(60, 60, 20));
  assert.equal(flat.coverage, 1);
  close(flat.colour, accent, 0.001);
  // Tilted towards the light: brighter.
  const tilted = particleAt(scene, scene.particles[1], ...seen(120, 60, 20));
  assert.ok(tilted.colour[2] > accent[2] + 0.02);
  // The higher card is in front where two overlap; the lower one shows only where the higher does not cover.
  const [r, g, b] = shadeStage(scene, ...seen(250, 64, 40));
  close([r, g, b], particleAt(scene, scene.particles[3], ...seen(250, 64, 40)).colour, 1e-9);
  // Half-transparent: alpha 0.5 over nothing.
  assert.equal(shadeStage(scene, ...seen(160, 150, 20))[3], 0.5);
  // Nothing: transparent.
  assert.deepEqual(shadeStage(scene, 20, 180), [0, 0, 0, 0]);
});

test("environment maps are sampled by direction and relative to straight up (2C.4)", () => {
  const grid = Array.from({ length: 512 }, (_, index) => Math.floor(index / 32) / 15);
  const map = { source: "map", strength: 1, grid };
  // Straight up is row 0's centre half a row in: clamped to row 0. Straight down is the last row.
  assert.equal(environmentSample(map, [0, 0, 1]), 0);
  assert.equal(environmentSample(map, [0, 0, -1]), 1);
  // The horizon is between rows 7 and 8.
  assert.ok(Math.abs(environmentSample(map, [1, 0, 0]) - 0.5) < 1e-9);
  // A uniform map adds nothing to any side: the term is relative to straight up.
  const scene = { ...cases["environment-map"].scene, environment: { source: "map", strength: 1, grid: Array(512).fill(0.7) } };
  assert.equal(environmentTerm(scene, [0.6, 0, 0.8], 0.2, 1), 0);
});

test("the committed Scene suite is what the reference implementation produces", () => {
  assert.deepEqual(committed, JSON.parse(JSON.stringify(buildSceneConformance())), "run npm run build:conformance --workspace @underglass/ui");
  assert.equal(committed.model, "strata-scene/3");
});
