/**
 * Redacts local paths from generated evidence in place: the workspace root becomes `<workspace>`, home and
 * temporary profile paths become `<redacted-local-path>`, and private Azure DevOps registry URLs become
 * `<redacted-private-registry>`. It is a path redactor, not a general secret detector.
 *
 * Runs on import, against the selected evidence root (`CANVAS_EVIDENCE_ROOT`, default
 * `evidence/regression/current`). Imported at the end of `test-browser.mjs`, `measure.mjs` and
 * `react-matrix.mjs`, spawned by `package-consumer.mjs` for its run directory, and runnable by hand as
 * `node scripts/sanitize-evidence.mjs`. Rewrites `.json` files (pretty-printed) and `.log` files; skips
 * curated evidence. Throws, failing its caller, on unreadable or invalid JSON.
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { homedir } from "node:os";
import { evidenceRoot } from "../tests/helpers/evidence.mjs";
import { curatedEvidence } from "./check-evidence.mjs";

// Paths are resolved against the working directory, so callers run this from the repository root.
const workspace = resolve(".");
// Both slash styles of the home directory; very short values (such as `/` or a bare drive) are skipped so
// they cannot match inside unrelated text.
const homePaths = [...new Set([homedir(), homedir().replaceAll("\\", "/")])].filter(path => path.length > 3);
const curatedPaths = new Set(curatedEvidence.map(path => resolve(path)));
/** Returns a copy of a JSON value (or a log string) with every string redacted. */
function sanitize(value) {
  if (typeof value === "string") {
    // Workspace first, so paths inside the checkout keep their repository-relative tail; then home paths,
    // private registry URLs and remaining POSIX user/temporary paths.
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
/** Walks `directory` and rewrites its `.json` and `.log` files; other file types are left untouched. */
async function visit(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = `${directory}/${entry.name}`;
    if (curatedPaths.has(resolve(path))) continue;
    // Archived evidence names are never rewritten, even if they appear below the selected root.
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
