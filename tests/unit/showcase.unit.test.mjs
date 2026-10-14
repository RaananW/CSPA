import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm, realpath } from "node:fs/promises";
import { symlinkOrSkip } from "../helpers/symlink.mjs";
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
test("public output guard fails before an unexpected artifact can be uploaded", async t => {
  const root = await mkdtemp(join(await realpath(tmpdir()), "canvas-showcase-assets-unit-"));
  try {
    await mkdir(join(root, "assets"));
    await writeFile(join(root, "index.html"), "<html>Showcase</html>");
    await writeFile(join(root, "assets/index-abc.js"), "export {}");
    await writeFile(join(root, "assets/index-abc.css"), "body{}");
    const check = () => spawnSync(process.execPath, ["scripts/check-showcase-assets.mjs", root], { encoding: "utf8" });
    assert.equal(check().status, 0);
    if (await symlinkOrSkip(t, "index-abc.js", join(root, "assets/alias.js"))) {
      assert.match(check().stderr, /Public asset symlink refused/);
      await rm(join(root, "assets/alias.js"));
    }
    await writeFile(join(root, "assets/index-abc.js"), "PRIVATE KEY");
    assert.match(check().stderr, /Private or mapped public asset refused/);
    await writeFile(join(root, "assets/index-abc.js"), "export {}");
    await writeFile(join(root, "assets/private.map"), "{}");
    const rejected = check();
    assert.equal(rejected.status, 1);
    assert.match(rejected.stderr, /Unexpected public asset/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
