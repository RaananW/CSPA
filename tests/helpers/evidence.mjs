import { relative, resolve, isAbsolute } from "node:path";

export const evidenceRoot = process.env.CANVAS_EVIDENCE_ROOT || "evidence/regression/current";
function isInside(parent, child) {
  const rel = relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}
export function validateEvidenceRoot(value) {
  const root = resolve(value);
  const allowed = ["evidence/regression/current", "evidence/phase9", "evidence/phase9-independent", "evidence/phase10", "evidence/phase10-independent", "evidence/phase11", "evidence/phase11-independent", "evidence/phase12", "evidence/phase12-independent", "evidence/phase13", "evidence/phase13-independent"].map(path => resolve(path));
  if (!allowed.some(path => isInside(path, root))) {
    throw new Error("Evidence writers require a named current regression/phase9/phase10/phase11/phase12/phase13 root; accepted archives are read-only");
  }
  return value;
}
validateEvidenceRoot(evidenceRoot);
export function evidenceDirectory(name) {
  if (!/^[a-z0-9/-]+$/.test(name) || name.includes("..")) throw new Error("Invalid evidence subdirectory");
  return `${evidenceRoot}/${name}`;
}
