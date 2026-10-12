import test from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdtemp, mkdir, writeFile, rm, realpath, symlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { showcaseBase } from "../../examples/showcase/site-policy.mjs";
import { route, searchExamples, examples } from "../../examples/showcase/src/catalog.ts";

test("showcase project base is deterministic and rejects unsafe URL shapes", () => {
  assert.equal(showcaseBase(), "/CSPA/");
  for (const base of ["/", "/project-name/", "/nested/project/"]) assert.equal(showcaseBase(base), base);
  for (const base of ["https://host/", "//host/", "/CSPA", "/../", "/x?y/", "/x#y/", ""]) {
    assert.throws(() => showcaseBase(base), /CANVAS_SHOWCASE_BASE/);
  }
});
test("showcase hash navigation and catalog filtering remain local and predictable", () => {
  for (const example of examples) assert.equal(route(`#/${example.id}`), example.id);
  assert.equal(route("#/missing"), "layers");
  assert.deepEqual(searchExamples("layer", "Motion").map(example => example.id), ["motion"]);
  assert.equal(searchExamples("unfindable", "All").length, 0);
});
test("showcase consumes the public library and excludes debug evidence from its page", async () => {
  const config = await readFile("examples/showcase/vite.config.ts", "utf8");
  assert.ok(!config.includes("alias"));
  assert.match(config, /sourcemap: false/);
  const demo = await readFile("examples/showcase/src/demos.tsx", "utf8");
  assert.match(demo, /from "canvas-spa-phase-one"/);
  assert.match(demo, /playground\/src\/apps\/todo\/TodoApp/);
  assert.match(demo, /<Surface/);
  assert.ok(!/iframe|packages\/canvas-spa\/src/.test(demo));
});
test("manual Pages workflow uses immutable pins and confines deployment permissions", async () => {
  const workflow = await readFile(".github/workflows/showcase-pages.yml", "utf8");
  assert.match(workflow, /on:\n  workflow_dispatch:/);
  assert.ok(!/\n  (push|pull_request|schedule):/.test(workflow));
  for (const action of workflow.matchAll(/uses: (\S+)/g)) assert.match(action[1], /^[\w/-]+@[a-f0-9]{40}$/);
  assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /path: examples\/showcase\/dist/);
  assert.equal((workflow.match(/pages: write/g) ?? []).length, 1);
  assert.ok(workflow.indexOf("pages: write") > workflow.indexOf("  deploy:"));
  assert.match(workflow, /id-token: write/);
  assert.match(workflow, /npm ci --ignore-scripts --no-audit --no-fund/);
});
test("showcase exposes the experimental Canary requirement beside GPU activation", async () => {
  const page = await readFile("examples/showcase/src/main.tsx", "utf8");
  assert.match(page, /id="gpu-requirement"><strong>GPU demos require Chrome Canary with HTML-in-Canvas enabled\.<\/strong> Ordinary DOM mode works without experimental flags\./);
  assert.match(page, /<button aria-describedby="gpu-requirement" disabled=\{busy \|\| disposed\}/);
  const guide = await readFile("docs/showcase.md", "utf8");
  assert.match(guide, /--enable-blink-features=CanvasDrawElement,ElementCanvasTransform/);
  assert.match(guide, /--enable-experimental-web-platform-features/);
});
test("public output guard fails before an unexpected artifact can be uploaded", async () => {
  const root = await mkdtemp(join(await realpath(tmpdir()), "canvas-showcase-assets-unit-"));
  try {
    await mkdir(join(root, "assets"));
    await writeFile(join(root, "index.html"), "<html>Showcase</html>");
    await writeFile(join(root, "assets/index-abc.js"), "export {}");
    await writeFile(join(root, "assets/index-abc.css"), "body{}");
    const check = () => spawnSync(process.execPath, ["scripts/check-showcase-assets.mjs", root], { encoding: "utf8" });
    assert.equal(check().status, 0);
    await symlink("index-abc.js", join(root, "assets/alias.js"));
    assert.match(check().stderr, /Public asset symlink refused/);
    await rm(join(root, "assets/alias.js"));
    await writeFile(join(root, "assets/index-abc.js"), "PRIVATE KEY");
    assert.match(check().stderr, /Private or mapped public asset refused/);
    await writeFile(join(root, "assets/index-abc.js"), "export {}");
    await writeFile(join(root, "assets/private.map"), "{}");
    const rejected = check();
    assert.equal(rejected.status, 1);
    assert.match(rejected.stderr, /Unexpected public asset/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
