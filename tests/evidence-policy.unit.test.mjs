import { test } from "node:test";
import assert from "node:assert/strict";
import { curatedEvidence, validateTrackedEvidence } from "../scripts/check-evidence.mjs";

test("tracked evidence admits only compact curated verdicts, not raw output", () => {
  assert.doesNotThrow(() => validateTrackedEvidence(curatedEvidence.map(path => ({ path, bytes: 1024 }))));
  for (const path of ["evidence/phase9/run/report.json", "evidence/phase9-independent/shot.png", "evidence/raw.zip"]) {
    assert.throws(() => validateTrackedEvidence([{ path, bytes: 10 }]), /must not be staged/);
  }
  assert.throws(() => validateTrackedEvidence([{ path: curatedEvidence[0], bytes: 65537 }]), /64 KiB/);
  assert.throws(() => validateTrackedEvidence([{ path: curatedEvidence[0], bytes: NaN }]), /64 KiB/);
});
