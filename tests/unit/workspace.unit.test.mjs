import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

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
  assert.deepEqual(root.workspaces, ["packages/canvas-spa", "packages/css-compiler", "examples/playground", "examples/showcase"]);
  assert.equal(library.name, "@canvas-spa/react");
  assert.equal(library.version, "0.1.0");
  assert.equal(library.private, true);
  assert.deepEqual(Object.keys(library.exports), [".", "./build", "./experimental-worker", "./experimental-worker/thread"]);
  assert.equal(playground.private, true);
  assert.equal(playground.dependencies[library.name], library.version);
});


test("both committed lock lanes retain distinct actual React peer ownership", async () => {
  const root = JSON.parse(await readFile("package-lock.json", "utf8")).packages;
  const react18 = JSON.parse(await readFile("fixtures/react18/package-lock.json", "utf8")).packages;
  assert.equal(root["node_modules/react"].version, "19.3.0");
  assert.equal(root["node_modules/react-dom"].version, "19.3.0");
  assert.equal(react18["node_modules/react"].version, "18.3.1");
  assert.equal(react18["node_modules/react-dom"].version, "18.3.1");
  assert.deepEqual(root["node_modules/@canvas-spa/react"], { resolved: "packages/canvas-spa", link: true });
  assert.deepEqual(root["node_modules/@canvas-spa/playground"], { resolved: "examples/playground", link: true });
  const library = JSON.parse(await readFile("packages/canvas-spa/package.json", "utf8"));
  assert.equal(root["packages/canvas-spa"].version, library.version);
  assert.deepEqual(root["packages/canvas-spa"].dependencies, library.dependencies);
  assert.deepEqual(root["packages/canvas-spa"].peerDependencies, library.peerDependencies);
});

