/**
 * Unit tests that read the repository's `package.json` and lock files to check workspace layout, release
 * identity and React peer versions. Reads files relative to the repository root, so run from the root with
 * `npm run test:unit`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("the release identity belongs only to the library workspaces, not the tooling root", async () => {
  const root = JSON.parse(await readFile("package.json", "utf8"));
  const core = JSON.parse(await readFile("packages/core/package.json", "utf8"));
  const library = JSON.parse(await readFile("packages/underglass/package.json", "utf8"));
  const playground = JSON.parse(await readFile("examples/playground/package.json", "utf8"));
  assert.equal(root.private, true);
  assert.equal(root.exports, undefined);
  assert.equal(root.files, undefined);
  assert.equal(root.devDependencies["@radix-ui/react-dialog"], undefined);
  assert.equal(root.devDependencies["@babylonjs/lite-gl"], undefined);
  assert.match(root.scripts.prepack, /Tooling root is not the release package/);
  assert.deepEqual(root.workspaces, ["packages/core", "packages/underglass", "packages/css-compiler", "examples/playground", "examples/showcase"]);
  assert.equal(core.name, "@underglass/core");
  assert.equal(core.version, "0.1.0");
  assert.equal(core.private, true);
  assert.deepEqual(Object.keys(core.exports), [".", "./build", "./experimental-worker", "./experimental-worker/thread"]);
  assert.equal(library.name, "@underglass/react");
  assert.equal(library.version, "0.1.0");
  assert.equal(library.private, true);
  assert.deepEqual(Object.keys(library.exports), [".", "./build", "./experimental-worker", "./experimental-worker/thread"]);
  assert.equal(playground.private, true);
  assert.equal(playground.dependencies[library.name], library.version);
});

// The core runtime must stay framework-neutral, and the React adapter must share it rather than bundle a copy.
test("the core package has no framework dependency and the React package depends on it", async () => {
  const core = JSON.parse(await readFile("packages/core/package.json", "utf8"));
  const library = JSON.parse(await readFile("packages/underglass/package.json", "utf8"));
  assert.equal(core.peerDependencies, undefined);
  for (const name of Object.keys(core.dependencies)) assert.doesNotMatch(name, /^(react|react-dom|vue|svelte|solid-js)$/);
  assert.deepEqual(library.dependencies, { [core.name]: core.version });
});

// The root lock pins React 19.3.0 and the React 18 fixture lock pins 18.3.1; each library's own lock entry must match its package.json.
test("both committed lock lanes retain distinct actual React peer ownership", async () => {
  const root = JSON.parse(await readFile("package-lock.json", "utf8")).packages;
  const react18 = JSON.parse(await readFile("fixtures/react18/package-lock.json", "utf8")).packages;
  assert.equal(root["node_modules/react"].version, "19.3.0");
  assert.equal(root["node_modules/react-dom"].version, "19.3.0");
  assert.equal(react18["node_modules/react"].version, "18.3.1");
  assert.equal(react18["node_modules/react-dom"].version, "18.3.1");
  assert.deepEqual(root["node_modules/@underglass/core"], { resolved: "packages/core", link: true });
  assert.deepEqual(root["node_modules/@underglass/react"], { resolved: "packages/underglass", link: true });
  assert.deepEqual(root["node_modules/@underglass/playground"], { resolved: "examples/playground", link: true });
  for (const directory of ["packages/core", "packages/underglass"]) {
    const library = JSON.parse(await readFile(`${directory}/package.json`, "utf8"));
    assert.equal(root[directory].version, library.version);
    assert.deepEqual(root[directory].dependencies, library.dependencies);
    assert.deepEqual(root[directory].peerDependencies, library.peerDependencies);
  }
});
