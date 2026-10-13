import assert from "node:assert/strict";

const declarations = [
  "admission", "affine", "animation", "build", "compiled", "compiler", "composition", "css-animation",
  "device-lifecycle", "effects", "enrollment", "hosts", "index", "module", "motion",
  "mount-boundary", "native", "publication", "react", "renderer", "ripple", "runtime", "timeline", "viewport",
  "experimental-worker", "worker-thread", "worker-protocol",
];
export const packageFiles = [
  "package.json", "README.md", "LICENSE", "docs/distribution.md", "dist/library/index.js", "dist/library/build.js",
  "dist/library/experimental-worker.js", "dist/library/worker-thread.js",
  ...declarations.map(name => `dist/library/${name}.d.ts`),
].sort();

export function validatePackageContents(files) {
  assert.deepEqual(files.map(file => file.path).sort(), packageFiles, "Package contents must match the exact distribution allowlist");
  for (const file of files) assert.ok(Number.isSafeInteger(file.size) && file.size > 0, `Invalid packed size: ${file.path}`);
}
