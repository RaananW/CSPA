import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";

test("the release identity belongs only to the library workspace, not the tooling root", async () => {
  const root = JSON.parse(await readFile("package.json", "utf8"));
  const library = JSON.parse(await readFile("packages/canvas-spa/package.json", "utf8"));
  const playground = JSON.parse(await readFile("examples/playground/package.json", "utf8"));
  assert.equal(root.private, true);
  assert.equal(root.exports, undefined);
  assert.equal(root.files, undefined);
  assert.equal(root.devDependencies["@radix-ui/react-dialog"], undefined);
  assert.equal(root.devDependencies["@babylonjs/lite-gl"], undefined);
  assert.match(root.scripts.prepack, /Tooling root is not the release package/);
  assert.deepEqual(root.workspaces, ["packages/canvas-spa", "examples/playground", "examples/showcase"]);
  assert.equal(library.name, "canvas-spa-phase-one");
  assert.equal(library.version, "0.0.0");
  assert.equal(library.private, true);
  assert.deepEqual(Object.keys(library.exports), ["."]);
  assert.equal(playground.private, true);
  assert.equal(playground.dependencies[library.name], library.version);
  assert.equal((await readdir(".")).some(path => path.endsWith(".html")), false);
  assert.equal((await readdir("examples/playground")).filter(path => path.endsWith(".html")).length, 10);
});

test("all authored pages and browser suites remain selected by their owning builds and runners", async () => {
  const pages = (await readdir("examples/playground")).filter(path => path.endsWith(".html")).sort();
  assert.deepEqual(pages, ["effects.html", "index.html", "integration.html", "paired.html", "performance.html",
    "probe.html", "recovery.html", "runtime.html", "surface.html", "todo.html"]);
  const build = await readFile("examples/playground/vite.config.ts", "utf8");
  for (const page of pages) assert.ok(build.includes(`"${page}"`), `Missing build entry: ${page}`);
  const suites = (await readdir("tests/browser")).filter(path => path.endsWith(".test.mjs"));
  assert.equal(suites.length, 14);
  const runner = await readFile("tests/browser/playwright.config.mjs", "utf8");
  for (const suite of suites) assert.ok(runner.includes(`"${suite}"`), `Missing browser suite: ${suite}`);
  assert.ok(runner.includes('cwd: resolve(".")'), "Grouped config must start tools from the workspace root");
});

test("both committed lock lanes retain distinct actual React peer ownership", async () => {
  const root = JSON.parse(await readFile("package-lock.json", "utf8")).packages;
  const react18 = JSON.parse(await readFile("fixtures/react18/package-lock.json", "utf8")).packages;
  assert.equal(root["node_modules/react"].version, "19.3.0");
  assert.equal(root["node_modules/react-dom"].version, "19.3.0");
  assert.equal(react18["node_modules/react"].version, "18.3.1");
  assert.equal(react18["node_modules/react-dom"].version, "18.3.1");
  assert.deepEqual(root["node_modules/canvas-spa-phase-one"], { resolved: "packages/canvas-spa", link: true });
  assert.deepEqual(root["node_modules/@canvas-spa/playground"], { resolved: "examples/playground", link: true });
  const library = JSON.parse(await readFile("packages/canvas-spa/package.json", "utf8"));
  assert.equal(root["packages/canvas-spa"].version, library.version);
  assert.deepEqual(root["packages/canvas-spa"].dependencies, library.dependencies);
  assert.deepEqual(root["packages/canvas-spa"].peerDependencies, library.peerDependencies);
});

test("isolated qualification runners inventory and copy the showcase guide required by units", async () => {
  for (const path of ["scripts/showcase-validation.mjs", "scripts/release-validation.mjs"]) {
    const runner = await readFile(path, "utf8");
    assert.equal((runner.match(/"docs\/showcase\.md"/g) ?? []).length, 2,
      `${path} must include the guide in both input inventory and physical copy`);
  }
});
