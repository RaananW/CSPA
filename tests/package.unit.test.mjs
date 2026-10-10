import { test } from "node:test";
import assert from "node:assert/strict";
import { packageFiles, validatePackageContents } from "../scripts/package-policy.mjs";

test("distribution allowlist rejects demos, evidence, source maps and private artifacts", () => {
  const valid = packageFiles.map(path => ({ path, size: 1 }));
  assert.doesNotThrow(() => validatePackageContents(valid));
  for (const path of ["src/demo.tsx", "dist/library/index.js.map", "dist/library/extra.js",
    "evidence/report.json", "node_modules/react/index.js", "session/files/private.json"]) {
    assert.throws(() => validatePackageContents([...valid, { path, size: 1 }]), /allowlist/);
  }
  assert.throws(() => validatePackageContents(valid.slice(1)), /allowlist/);
  assert.throws(() => validatePackageContents(valid.map(file => ({ ...file, size: NaN }))), /Invalid packed size/);
});
