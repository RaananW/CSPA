import { resolve } from "node:path";

export const evidenceRoot = process.env.CANVAS_EVIDENCE_ROOT || "evidence/regression/current";
export function validateEvidenceRoot(value) {
  const root = resolve(value);
  const allowed = ["evidence/regression/current", "evidence/phase9", "evidence/phase9-independent"].map(path => resolve(path));
  if (!allowed.some(path => root === path || root.startsWith(`${path}/`))) {
    throw new Error("Evidence writers require evidence/regression/current, evidence/phase9 or evidence/phase9-independent; accepted archives are read-only");
  }
  return value;
}
validateEvidenceRoot(evidenceRoot);
export function evidenceDirectory(name) {
  if (!/^[a-z0-9/-]+$/.test(name) || name.includes("..")) throw new Error("Invalid evidence subdirectory");
  return `${evidenceRoot}/${name}`;
}
