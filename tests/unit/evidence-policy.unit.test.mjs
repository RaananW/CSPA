/**
 * Unit test for `validateTrackedEvidence` in `scripts/check-evidence.mjs`: which evidence files may be
 * committed and how large they may be. Run with `npm run test:unit`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { curatedEvidence, validateTrackedEvidence } from "../../scripts/check-evidence.mjs";

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
  for (const path of ["evidence/phase11/report.json", "evidence/phase11-independent/acceptance.json"]) {
    assert.throws(() => validateTrackedEvidence([{ path, bytes: 1 }]), /must not be staged/);
  }
  const phase11 = "evidence/phase11-independent/acceptance-summary.json";
  assert.doesNotThrow(() => validateTrackedEvidence([{ path: phase11, bytes: 8192 }]));
  for (const bytes of [8193, NaN, -1]) {
    assert.throws(() => validateTrackedEvidence([{ path: phase11, bytes }]), /8 KiB/);
  }
  for (const path of ["evidence/phase11-independent/acceptance-summary.json/report.json",
    "evidence/phase11-independent/raw.zip", "evidence/phase11-independent/shot.png"]) {
    assert.throws(() => validateTrackedEvidence([{ path, bytes: 1 }]), /must not be staged/);
  }
  const phase12 = "evidence/phase12-independent/acceptance-summary.json";
  assert.doesNotThrow(() => validateTrackedEvidence([{ path: phase12, bytes: 8192 }]));
  for (const bytes of [8193, NaN, -1]) {
    assert.throws(() => validateTrackedEvidence([{ path: phase12, bytes }]), /8 KiB/);
  }
  for (const path of ["evidence/phase12-independent/acceptance-summary.json/report.json",
    "evidence/phase12-independent/sol61-20261011/report.json",
    "evidence/phase12-independent/raw.zip", "evidence/phase12-independent/shot.png"]) {
    assert.throws(() => validateTrackedEvidence([{ path, bytes: 1 }]), /must not be staged/);
  }
});
