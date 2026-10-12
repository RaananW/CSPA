import assert from "node:assert/strict";
import { readdir, readFile, lstat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { assertPhysicalPath } from "./release-policy.mjs";

const directory = resolve(process.argv[2] ?? "dist");
await assertPhysicalPath(directory);
let count = 0;
async function check(path, prefix = "") {
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const name = `${prefix}${entry.name}`, file = join(path, entry.name);
    assert.equal((await lstat(file)).isSymbolicLink(), false, `Public asset symlink refused: ${name}`);
    if (entry.isDirectory()) {
      assert.equal(name, "assets", `Unexpected public directory: ${name}`);
      await check(file, "assets/");
    } else {
      assert.ok(name === "index.html" || /^assets\/[\w-]+\.(js|css)$/.test(name), `Unexpected public asset: ${name}`);
      assert.ok(!/\/Users\/|session-state|evidence\/phase|PRIVATE KEY|sourceMappingURL/.test(await readFile(file, "utf8")),
        `Private or mapped public asset refused: ${name}`);
      count++;
    }
  }
}
await check(directory);
assert.ok(count >= 3, "Showcase requires its HTML, CSS and JavaScript");
console.log(`Sanitized showcase output: ${count} public assets`);
