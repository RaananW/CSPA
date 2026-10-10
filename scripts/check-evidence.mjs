import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

export const curatedEvidence = [
  "evidence/phase6-parent-acceptance.json",
  "evidence/phase7-independent-acceptance.json",
  "evidence/phase7-independent-corrected-acceptance.json",
  "evidence/phase8-independent-acceptance.json",
  "evidence/phase8-acceptance-summary.json",
  "evidence/phase9-independent/acceptance-v1.json",
];

export function validateTrackedEvidence(files) {
  for (const { path, bytes } of files) {
    if (!curatedEvidence.includes(path)) throw new Error(`Raw evidence must not be staged: ${path}`);
    if (!Number.isSafeInteger(bytes) || bytes < 0 || bytes > 64 * 1024) {
      throw new Error(`Curated evidence exceeds its 64 KiB budget: ${path}`);
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const paths = execFileSync("git", ["ls-files", "-z", "--", "evidence"], { encoding: "utf8" }).split("\0").filter(Boolean);
  const files = paths.map(path => ({ path, bytes: execFileSync("git", ["show", `:${path}`]).length }));
  validateTrackedEvidence(files);
  for (const { path } of files) JSON.parse(execFileSync("git", ["show", `:${path}`], { encoding: "utf8" }));
  console.log(`Curated evidence guard passed: ${files.length} files, ${files.reduce((sum, file) => sum + file.bytes, 0)} bytes`);
}
