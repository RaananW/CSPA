/**
 * Unit test for the published-package allowlists in `scripts/package-policy.mjs`. Run with `npm run test:unit`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { packageFiles, corePackageFiles, vuePackageFiles, validatePackageContents } from "../../scripts/package-policy.mjs";

test("distribution allowlist rejects demos, evidence, source maps and private artifacts", () => {
  for (const expected of [packageFiles, corePackageFiles, vuePackageFiles]) {
    const valid = expected.map(path => ({ path, size: 1 }));
    assert.doesNotThrow(() => validatePackageContents(valid, expected));
    for (const path of ["src/demo.tsx", "dist/library/index.js.map", "dist/library/extra.js",
      "evidence/report.json", "node_modules/react/index.js", "session/files/private.json"]) {
      assert.throws(() => validatePackageContents([...valid, { path, size: 1 }], expected), /allowlist/);
    }
    assert.throws(() => validatePackageContents(valid.slice(1), expected), /allowlist/);
    assert.throws(() => validatePackageContents(valid.map(file => ({ ...file, size: NaN })), expected), /Invalid packed size/);
  }
  // The React archive carries only its adapter; the runtime declarations belong to core.
  assert.ok(packageFiles.includes("dist/library/react.d.ts") && !packageFiles.includes("dist/library/runtime.d.ts"));
  assert.ok(corePackageFiles.includes("dist/library/runtime.d.ts") && !corePackageFiles.includes("dist/library/react.d.ts"));
});
