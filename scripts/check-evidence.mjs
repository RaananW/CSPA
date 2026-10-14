/**
 * Guards what may be committed under `evidence/`: only an explicit allowlist of curated JSON records, each
 * within a byte budget. Generated reports, screenshots and logs must stay untracked.
 *
 * Run by hand before committing, as `node scripts/check-evidence.mjs` (see CONTRIBUTING.md); no npm script
 * or workflow invokes it. It reads the git index, so it checks staged content, including force-added files.
 * Takes no flags or environment. Prints a summary and exits 0, or throws (non-zero exit) on an unlisted
 * path, an over-budget file or invalid JSON. Also imported for `curatedEvidence` by `sanitize-evidence.mjs`
 * and `package-consumer.mjs`, and by `tests/unit/evidence-policy.unit.test.mjs`.
 */
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

/** Repository-relative paths of the only evidence files allowed in Git; tooling treats them as read-only. */
export const curatedEvidence = [
  "evidence/phase6-parent-acceptance.json",
  "evidence/phase7-independent-acceptance.json",
  "evidence/phase7-independent-corrected-acceptance.json",
  "evidence/phase8-independent-acceptance.json",
  "evidence/phase8-acceptance-summary.json",
  "evidence/phase9-independent/acceptance-v1.json",
  "evidence/phase10-independent/acceptance-summary.json",
  "evidence/phase11-independent/acceptance-summary.json",
  "evidence/phase12-independent/acceptance-summary.json",
];

/**
 * Throws unless every `{ path, bytes }` entry is an allowlisted curated file within its budget: 8 KiB for
 * the compact `evidence/phase1N-independent/acceptance-summary.json` summaries, 64 KiB for the others.
 */
export function validateTrackedEvidence(files) {
  for (const { path, bytes } of files) {
    if (!curatedEvidence.includes(path)) throw new Error(`Raw evidence must not be staged: ${path}`);
    const boundedSummary = /^evidence\/phase1\d-independent\/acceptance-summary\.json$/.test(path);
    const limit = boundedSummary ? 8 * 1024 : 64 * 1024;
    if (!Number.isSafeInteger(bytes) || bytes < 0 || bytes > limit) {
      if (limit === 8 * 1024) throw new Error(`Bounded curated summary exceeds its 8 KiB budget: ${path}`);
      throw new Error(`Curated evidence exceeds its 64 KiB budget: ${path}`);
    }
  }
}

// Only when run as a script, not when imported. `git show :<path>` reads the staged blob, so sizes and JSON
// validity are those of what would be committed, not of the working-tree file.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const paths = execFileSync("git", ["ls-files", "-z", "--", "evidence"], { encoding: "utf8" }).split("\0").filter(Boolean);
  const files = paths.map(path => ({ path, bytes: execFileSync("git", ["show", `:${path}`]).length }));
  validateTrackedEvidence(files);
  for (const { path } of files) JSON.parse(execFileSync("git", ["show", `:${path}`], { encoding: "utf8" }));
  console.log(`Curated evidence guard passed: ${files.length} files, ${files.reduce((sum, file) => sum + file.bytes, 0)} bytes`);
}
