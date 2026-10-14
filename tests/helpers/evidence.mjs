/**
 * Resolves and validates where test runs may write evidence. The root comes from `CANVAS_EVIDENCE_ROOT`
 * (default `evidence/regression/current`) and is checked on import, so a mistyped root fails immediately.
 */
import { relative, resolve, sep } from "node:path";

// Directory under which all regenerable test output is written.
export const evidenceRoot = process.env.CANVAS_EVIDENCE_ROOT || "evidence/regression/current";
// Writable evidence roots: the rolling regression root and the current numbered phase roots (phase9 onward).
const allowedRoot = /^evidence\/(regression\/current|phase(9|1[0-3])(-independent)?)(\/|$)/;
/**
 * Returns `value` unchanged if it resolves inside a writable evidence root, otherwise throws. The pattern
 * is matched against the repository-relative path after normalising separators and `..`.
 */
export function validateEvidenceRoot(value) {
  const rel = relative(resolve("."), resolve(value)).split(sep).join("/");
  if (!allowedRoot.test(rel)) {
    throw new Error("Evidence writers require a named current regression/phase9-phase13 root; accepted archives are read-only");
  }
  return value;
}
validateEvidenceRoot(evidenceRoot);
/** Returns `<evidenceRoot>/<name>`; `name` must be lowercase path segments with no `..`. */
export function evidenceDirectory(name) {
  if (!/^[a-z0-9/-]+$/.test(name) || name.includes("..")) throw new Error("Invalid evidence subdirectory");
  return `${evidenceRoot}/${name}`;
}
