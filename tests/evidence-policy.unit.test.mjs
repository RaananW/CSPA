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
  const phase10 = "evidence/phase10-independent/acceptance-summary.json";
  assert.doesNotThrow(() => validateTrackedEvidence([{ path: phase10, bytes: 8192 }]));
  assert.throws(() => validateTrackedEvidence([{ path: phase10, bytes: 8193 }]), /8 KiB/);
  assert.throws(() => validateTrackedEvidence([{ path: phase10, bytes: NaN }]), /8 KiB/);
  assert.throws(() => validateTrackedEvidence([{ path: "evidence/phase10-independent/report.json", bytes: 1 }]), /must not be staged/);
});
