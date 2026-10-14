import { relative, resolve, sep } from "node:path";

export const evidenceRoot = process.env.CANVAS_EVIDENCE_ROOT || "evidence/regression/current";
// Writable evidence roots: the rolling regression root and the current numbered phase roots (phase9 onward).
const allowedRoot = /^evidence\/(regression\/current|phase(9|1[0-3])(-independent)?)(\/|$)/;
export function validateEvidenceRoot(value) {
  const rel = relative(resolve("."), resolve(value)).split(sep).join("/");
  if (!allowedRoot.test(rel)) {
    throw new Error("Evidence writers require a named current regression/phase9-phase13 root; accepted archives are read-only");
  }
  return value;
}
validateEvidenceRoot(evidenceRoot);
export function evidenceDirectory(name) {
  if (!/^[a-z0-9/-]+$/.test(name) || name.includes("..")) throw new Error("Invalid evidence subdirectory");
  return `${evidenceRoot}/${name}`;
}
