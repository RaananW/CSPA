import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { validateEvidenceRoot } from "./evidence.mjs";

test("evidence routing admits only named current roots and their descendants", () => {
  for (const root of ["evidence/regression/current", "evidence/phase8", "evidence/phase8-independent"]) {
    assert.equal(validateEvidenceRoot(root), root);
    assert.equal(validateEvidenceRoot(`${root}/react18/reports`), `${root}/react18/reports`);
  }
  for (const root of ["evidence", "evidence/phase6", "evidence/phase7", "evidence/phase8-independent-acceptance.json",
    "evidence/phase8-independent-other", "evidence/phase8-independent/../phase7", "../evidence/phase8-independent"]) {
    assert.throws(() => validateEvidenceRoot(root), /accepted archives are read-only/);
  }
});

test("independent root imports through the shared reporter configuration", () => {
  execFileSync(process.execPath, ["--input-type=module", "-e",
    'const {evidenceDirectory}=await import("./tests/evidence.mjs"); const {default:config}=await import("./playwright.config.mjs"); if(evidenceDirectory("performance")!=="evidence/phase8-independent/performance" || config.reporter[1][1].outputFile!=="evidence/phase8-independent/browser-tests.json") throw Error("Routing mismatch");'],
  { env: { ...process.env, CANVAS_EVIDENCE_ROOT: "evidence/phase8-independent" }, stdio: "pipe" });
});

test("sanitizer selects independent output without touching adjacent archives", async () => {
  const directory = await mkdtemp(join(tmpdir(), "cspa-evidence-routing-"));
  try {
    for (const root of ["phase8", "phase8-independent"]) await mkdir(join(directory, "evidence", root), { recursive: true });
    const original = '{"path":"/Users/test/private-file"}\n';
    const archive = join(directory, "evidence/phase8/report.json");
    const independent = join(directory, "evidence/phase8-independent/report.json");
    await writeFile(archive, original);
    await writeFile(independent, original);
    execFileSync(process.execPath, [fileURLToPath(new URL("../scripts/sanitize-evidence.mjs", import.meta.url))],
      { cwd: directory, env: { ...process.env, CANVAS_EVIDENCE_ROOT: "evidence/phase8-independent" }, stdio: "pipe" });
    assert.equal(await readFile(archive, "utf8"), original);
    assert.equal(JSON.parse(await readFile(independent, "utf8")).path, "<redacted-local-path>");
  } finally {
    await rm(directory, { recursive: true });
  }
});
