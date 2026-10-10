import { readdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { evidenceRoot } from "../tests/evidence.mjs";

const workspace = resolve(".");
function sanitize(value) {
  if (typeof value === "string") {
    return value.replaceAll(workspace, "<workspace>")
      .replace(/(?:https?:)?\/\/pkgs\.dev\.azure\.com\/[^\s"'<>)]*/g, "<redacted-private-registry>")
      .replace(/\/(?:Users|private|var|tmp)\/[^\s"'<>]+/g, "<redacted-local-path>");
  }
  if (Array.isArray(value)) return value.map(sanitize);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, sanitize(entry)]));
  return value;
}
async function visit(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = `${directory}/${entry.name}`;
    if (entry.name.startsWith("phase6-parent-") || path === "evidence/phase6"
      || entry.name.startsWith("phase7-independent")) continue;
    if (entry.isDirectory()) await visit(path);
    else if (entry.name.endsWith(".json")) {
      const content = JSON.parse(await readFile(path, "utf8"));
      await writeFile(path, `${JSON.stringify(sanitize(content), null, 2)}\n`);
    } else if (entry.name.endsWith(".log")) {
      await writeFile(path, sanitize(await readFile(path, "utf8")));
    }
  }
}
await visit(evidenceRoot);
