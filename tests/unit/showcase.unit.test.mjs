/**
 * Unit tests for the public showcase: base path policy, hash routing and catalog search, the GitHub Pages
 * workflow file, and `scripts/check-showcase-assets.mjs`. Reads files relative to the repository root, so
 * run from the root with `npm run test:unit`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdtemp, mkdir, writeFile, rm, realpath } from "node:fs/promises";
import { symlinkOrSkip } from "../helpers/symlink.mjs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { showcaseBase } from "../../examples/showcase/site-policy.mjs";
import { route, searchExamples, examples } from "../../examples/showcase/src/catalog.ts";

test("showcase project base is deterministic and rejects unsafe URL shapes", () => {
  assert.equal(showcaseBase(), "/underglass/");
  for (const base of ["/", "/project-name/", "/nested/project/"]) assert.equal(showcaseBase(base), base);
  for (const base of ["https://host/", "//host/", "/underglass", "/../", "/x?y/", "/x#y/", ""]) {
    assert.throws(() => showcaseBase(base), /CANVAS_SHOWCASE_BASE/);
  }
});
test("showcase hash navigation and catalog filtering remain local and predictable", () => {
  for (const example of examples) assert.equal(route(`#/${example.id}`), example.id);
  assert.equal(route("#/missing"), "layers");
  assert.deepEqual(searchExamples("layer", "Motion").map(example => example.id), ["motion"]);
  assert.equal(searchExamples("unfindable", "All").length, 0);
});
test("Pages workflow deploys only main, uses immutable pins and confines deployment permissions", async () => {
  // Normalise CRLF so the multi-line regular expressions below also match on Windows checkouts.
  const workflow = (await readFile(".github/workflows/showcase-pages.yml", "utf8")).replaceAll(String.fromCharCode(13, 10), String.fromCharCode(10));
  assert.match(workflow, /on:\n  push:\n    branches: \[main\]\n/);
  assert.match(workflow, /\n  workflow_dispatch:/);
  assert.ok(!/\n  (pull_request|pull_request_target|schedule):/.test(workflow));
  for (const action of workflow.matchAll(/uses: (\S+)/g)) assert.match(action[1], /^[\w/-]+@[a-f0-9]{40}$/);
  assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /path: examples\/showcase\/dist/);
  assert.equal((workflow.match(/pages: write/g) ?? []).length, 1);
  assert.ok(workflow.indexOf("pages: write") > workflow.indexOf("  deploy:"));
  assert.match(workflow, /id-token: write/);
  assert.match(workflow, /npm ci --ignore-scripts --no-audit --no-fund/);
});
test("public output guard fails before an unexpected artifact can be uploaded", async t => {
  const root = await mkdtemp(join(await realpath(tmpdir()), "canvas-showcase-assets-unit-"));
  try {
    await mkdir(join(root, "assets"));
    await writeFile(join(root, "index.html"), "<html>Showcase</html>");
    await writeFile(join(root, "assets/index-abc.js"), "export {}");
    await writeFile(join(root, "assets/index-abc.css"), "body{}");
    // Runs the checker as a child process on the fake build output and returns its status and stderr.
    const check = () => spawnSync(process.execPath, ["scripts/check-showcase-assets.mjs", root], { encoding: "utf8" });
    assert.equal(check().status, 0);
    if (await symlinkOrSkip(t, "index-abc.js", join(root, "assets/alias.js"))) {
      assert.match(check().stderr, /Public asset symlink refused/);
      await rm(join(root, "assets/alias.js"));
    }
    await writeFile(join(root, "assets/index-abc.js"), "PRIVATE KEY");
    assert.match(check().stderr, /Private or mapped public asset refused/);
    await writeFile(join(root, "assets/index-abc.js"), "export {}");
    await writeFile(join(root, "assets/preview-abc.jpg"), Buffer.from([0xff, 0xd8, 0xff, 0xe0]));
    assert.equal(check().status, 0);
    await writeFile(join(root, "assets/preview-abc.jpg"), "not an image");
    assert.match(check().stderr, /Public image is not a JPEG/);
    await rm(join(root, "assets/preview-abc.jpg"));
    await writeFile(join(root, "assets/private.map"), "{}");
    const rejected = check();
    assert.equal(rejected.status, 1);
    assert.match(rejected.stderr, /Unexpected public asset/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
