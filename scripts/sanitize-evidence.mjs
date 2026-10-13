import { readdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { homedir } from "node:os";
import { evidenceRoot } from "../tests/helpers/evidence.mjs";
import { curatedEvidence } from "./check-evidence.mjs";

const workspace = resolve(".");
const homePaths = [...new Set([homedir(), homedir().replaceAll("\\", "/")])].filter(path => path.length > 3);
const curatedPaths = new Set(curatedEvidence.map(path => resolve(path)));
function sanitize(value) {
  if (typeof value === "string") {
    const scrubbed = [workspace, workspace.replaceAll("\\", "/")].reduce((text, root) => text.replaceAll(root, "<workspace>"), value);
    return homePaths.reduce((text, home) => text.replaceAll(home, "<redacted-local-path>"), scrubbed)
      .replace(/(?:https?:)?\/\/pkgs\.dev\.azure\.com\/[^\s"'<>)]*/g, "<redacted-private-registry>")
      .replace(/\/(?:Users|private|var|tmp)\/[^\s"'<>]+/g, "<redacted-local-path>")
      // Windows profile paths in either slash style, including JSON-escaped backslashes (C:\\Users\\name\\...).
      .replace(/[A-Za-z]:[\\/]+(?:Users|Documents and Settings)[\\/]+[^\s"'<>]+/gi, "<redacted-local-path>");
  }
  if (Array.isArray(value)) return value.map(sanitize);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, sanitize(entry)]));
  return value;
}
async function visit(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = `${directory}/${entry.name}`;
    if (curatedPaths.has(resolve(path))) continue;
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
