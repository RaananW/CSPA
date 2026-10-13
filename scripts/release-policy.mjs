import assert from "node:assert/strict";
import { cp, lstat, readdir, readFile, mkdir, realpath } from "node:fs/promises";
import { join, basename, resolve, dirname } from "node:path";

export const excludedDependencies = new Set([".vite", ".vite-temp", ".bin", ".package-lock.json"]);
export const qualifiedBrowser = Object.freeze({
  product: "Chrome/157.0.8100.0",
  revision: "@799dbe91dfe8604f0327d070ecd6d2792a7d3d63",
});

// The exact historical pin is enforced only when CANVAS_REQUIRE_BROWSER_PIN=1; otherwise the actual
// identity is returned so callers record it in their evidence (daily Canary updates must not fail the harness).
export function assertBrowserIdentity(actual) {
  if (process.env.CANVAS_REQUIRE_BROWSER_PIN !== "1") {
    return { pinEnforced: false, actual: { product: actual.product, revision: actual.revision }, qualifiedBrowser };
  }
  assert.deepEqual({ product: actual.product, revision: actual.revision }, qualifiedBrowser,
    `Browser identity mismatch: actual=${JSON.stringify(actual)} expected=${JSON.stringify(qualifiedBrowser)}`);
  return { pinEnforced: true, actual: { product: actual.product, revision: actual.revision }, qualifiedBrowser };
}

export async function prepareReleaseRoot(workspace, requestedRoot = join(workspace, "evidence/phase14")) {
  const directory = join(resolve(workspace), "evidence/phase14");
  assert.equal(resolve(requestedRoot), directory, "Only the owned Phase14 root is allowed; escaping/old archive targets refused");
  await assertPhysicalPath(workspace);
  for (let path = directory;; path = dirname(path)) {
    try {
      assert.equal((await lstat(path)).isSymbolicLink(), false, `Path ancestor symlink refused: ${path}`);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    if (dirname(path) === path) break;
  }
  await mkdir(directory, { recursive: true });
  await assertPhysicalPath(directory);
  return directory;
}

export async function assertPhysicalPath(directory) {
  let path = resolve(directory);
  for (;;) {
    assert.equal((await lstat(path)).isSymbolicLink(), false, `Path ancestor symlink refused: ${path}`);
    const parent = dirname(path);
    if (parent === path) break;
    path = parent;
  }
}

export async function copyDependencies(source, destination) {
  await assertPhysicalPath(source);
  await assertPhysicalPath(dirname(destination));
  await cp(source, destination, {
    recursive: true, force: true,
    filter: async path => {
      if (excludedDependencies.has(basename(path))) return false;
      const workspace = { "canvas-spa-phase-one": "packages/canvas-spa", "@canvas-spa/playground": "examples/playground",
        "@canvas-spa/showcase": "examples/showcase", "@canvas-spa/css-compiler": "packages/css-compiler" };
      for (const [name, target] of Object.entries(workspace)) {
        if (path === join(source, name) && (await lstat(path)).isSymbolicLink()) {
          assert.equal(await realpath(path), join(dirname(source), target), `Unexpected workspace alias: ${path}`);
          return false;
        }
      }
      assert.equal((await lstat(path)).isSymbolicLink(), false, `Dependency symlink refused: ${path}`);
      return true;
    },
  });
}

export async function assertPhysicalTree(directory) {
  assert.equal((await lstat(directory)).isSymbolicLink(), false, `Writable tree symlink refused: ${directory}`);
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    assert.equal(entry.isSymbolicLink(), false, `Writable tree symlink refused: ${path}`);
    if (entry.isDirectory()) await assertPhysicalTree(path);
  }
}

export function assertRuntimePeer(actual, expected) {
  assert.equal(actual.react, expected, "Actual browser React peer mismatch");
  const dom = expected === "18.3.1" ? ["18.3.1", "18.3.1-next-f1338f8080-20240426"] : [expected];
  assert.ok(dom.includes(actual.reactDOM), `Actual browser ReactDOM peer mismatch: ${actual.reactDOM}`);
}

export function assertRequestedLane(lane, state) {
  assert.equal(state.mode, lane === "native" ? "gpu" : "dom", `${lane} pilot mode failed: ${state.reason}`);
}

export async function dependencyVersion(root, name) {
  return JSON.parse(await readFile(join(root, "node_modules", name, "package.json"), "utf8")).version;
}
