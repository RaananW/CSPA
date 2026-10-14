/**
 * The exact file allowlist of the packed `@underglass/react` archive.
 *
 * Not run directly: imported by `package-consumer.mjs` (`npm run test:package`), `release-validation.mjs`,
 * `worker-validation.mjs` and `tests/unit/package.unit.test.mjs`, which compare `npm pack --json` file
 * lists against it. Takes no flags or environment and writes nothing; a mismatch throws an assertion error.
 */
import assert from "node:assert/strict";

// Base names of the emitted `dist/library/*.d.ts` declaration files. A module that starts or stops
// emitting a declaration must be reflected here, or pack validation fails.
const declarations = [
  "admission", "affine", "animation", "build", "compiled", "compiler", "composition", "css-animation",
  "device-lifecycle", "effects", "enrollment", "hosts", "index", "module", "motion",
  "mount-boundary", "native", "publication", "react", "renderer", "ripple", "runtime", "timeline", "viewport",
  "experimental-worker", "worker-thread", "worker-protocol",
];
/** Sorted package-relative paths that every packed archive must contain, and nothing else. */
export const packageFiles = [
  "package.json", "README.md", "LICENSE", "docs/distribution.md", "dist/library/index.js", "dist/library/build.js",
  "dist/library/experimental-worker.js", "dist/library/worker-thread.js",
  ...declarations.map(name => `dist/library/${name}.d.ts`),
].sort();

/**
 * Asserts that `files` (the `files` array of an `npm pack --json` result, entries with `path` and `size`)
 * lists exactly `packageFiles` and that every member has a positive byte size.
 */
export function validatePackageContents(files) {
  assert.deepEqual(files.map(file => file.path).sort(), packageFiles, "Package contents must match the exact distribution allowlist");
  for (const file of files) assert.ok(Number.isSafeInteger(file.size) && file.size > 0, `Invalid packed size: ${file.path}`);
}
