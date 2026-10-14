# Evidence archive catalog

## Coverage and access

The user explicitly authorized removal of bulk raw evidence from the current
tree and private main history, including a force-push. No raw archive was
uploaded to another service or replaced by a large compressed file in Git.
The genuine local external archive preserves **4531 files /
217682128 bytes**, including every current PNG, JSON, raw log,
failed attempt and original immutable verdict at its exact repository-relative
path. A full pre-rewrite Git archive and verified all-ref bundle were also saved
locally outside the checkout.

Raw files are **not available in this checkout or as a public download**.
The maintainer's local session archive includes `raw-manifest.json` and an
uncompressed `bytes/evidence/` tree (from the verified prior byte backup);
ask the maintainer for access, subject to privacy review. Availability depends
on retention of that local archive. The private pre-rewrite bundle provides
additional recovery of committed bytes, not the five lost Phase6 originals.

Documentation links labelled **archived raw** resolve here, not to a raw file.
Historical relative paths inside the retained immutable verdicts identify
archived files; old commit IDs are pre-rewrite provenance, not assertions of
current-main ancestry. Retained original verdict content is unchanged, including initial failures
and the scope of each historical acceptance.

## Integrity

### Later integrity exceptions

The archive totals and digests below describe the historical pre-rewrite
snapshot, not all later engineering artifacts. The dated
[current register](../open-issues.md#permanent-evidence-integrity-exceptions)
separately records five lost Phase6 originals and exactly one Phase13 generated
optimizer metadata corruption. Original expected Phase13 bytes are unavailable;
the damaged file/ledger archive remain as-is and the old adoption-v1 seal is
**not wholly intact**. Fresh isolated diagnostic acceptance retained that
exception explicitly and verified other protected bytes separately. No later
pass, Git checkpoint or this catalog restores either provenance gap.

- Exact per-file path/size/SHA256 manifest:
  `c5917a61d15495e86c0427b2a23f5e1603eecb8c8d64e6edfcea6ac86b10d383`.
- Full pre-rewrite Git tar SHA256:
  `2bd3bf7cd7019e0b78d21fb35671467cc301b295bd1f3dc79599dd1a171df434`.
- Verified all-ref Git bundle SHA256:
  `5c4f10ef2b18cf8738ef8fc1aa5378c7646834c0016f8971da4d8ee86e08b6a1`.
- Full Git per-file manifest SHA256:
  `d9a01e132df997c9945cfdc1655dafc56d40a72df7ed0c5419074969c5f295d4`.

The bundle freezes160 refs; host-managed checkpoint refs
can change during capture. Every tar member was checked against its captured
byte manifest and immutable object bytes were rechecked. The bundle was
verified and includes the frozen refs. No backup refs are pushed.

Group digests below are SHA256 of sorted manifest entries encoded as
`path + NUL + decimal bytes + NUL + sha256 + LF`; the external manifest holds
each file hash. These are archive coverage digests, not new correctness results.

| Original group | Files | Bytes | Manifest group SHA256 |
| --- | ---: | ---: | --- |
| `animation` | 183 | 5647751 | `c0d14faaca276733c217a7f99d2b45cacaf625716b200c3b4a0560ce99df65c0` |
| `canary` | 7 | 68408 | `b72e93e51211c506fcad8d849d3e74494ae278e2215beb98752418eb8dbd97b9` |
| `chrome` | 20 | 263843 | `3e2a780203179fa7c7a2408637d5bbcb3fb8836229417352d742e6e0212c965a` |
| `chrome-no-flags` | 9 | 93784 | `74bb525a175caacb143931e0f92c326a178ef98da8a1eae5c26978e1b3e518dd` |
| `early-root-reports` | 38 | 359696 | `cad7c3302e1ca9f46943c2135fd5f340979bb48050ed11ff5532edc25987d799` |
| `phase6` | 251 | 20174053 | `1d66c6b61eda383fd25264b7dee2b9c5cbdd3866a41c8d74f5a3bfa3687eb0f0` |
| `phase7` | 302 | 9573390 | `35c6e7c012fe475ac185ddc010d32e40a359b95f6432b3b80ee04d4e361a51e7` |
| `phase7-independent` | 1 | 19719 | `72e8bdd68e4db6e4eeeba8838926561b36f6e461bbadbe4aea8b74c2877d74c3` |
| `phase7-independent-corrected` | 20 | 1108848 | `4a4694918cca76f2d2461b9f25667345c920763460f904cc10e5ed9a936c8655` |
| `phase8` | 720 | 26947609 | `6311766e04b4c82bfbe272073e265a8d4be7561422130de27ad1ce47cbe514d7` |
| `phase8-independent` | 793 | 31404427 | `b302465d9075697045acf3fff4254380d6a44ee7820681a267a89f0e18b70462` |
| `phase9` | 1193 | 85851568 | `cceeb2b5b224b1b02e9c18e85659c88e10dbae061ae24160788fd012aa38517b` |
| `phase9-independent` | 869 | 32282726 | `b9ea567fd77ffa0b4a25b1ef52317b02f436e8af3dc0cc34765d2c2f8ae3a5f2` |
| `recovery` | 18 | 558963 | `080aff7fe5c474df9b718da5222cbe57b78c0a833dac41c97f14ed4ba70ef87a` |
| `regression` | 6 | 632432 | `da223df9b2ac7bdb96514037793b2509a728a1b8b6b4b6df2ba84caf7d421618` |
| `runtime` | 44 | 1323355 | `06f15ff8f4656e0fad3b2bfbc8930610f263d05b69477d0638b9a66fdb00bef0` |
| `surface` | 46 | 1071342 | `944962d92493781b34ab2baa30492419a92106d246e64031a93a8d9b9989f65d` |
| `todo` | 11 | 300214 | `b69f0622cfe28ef7eb526a12f0cadd523b05a2b13543fe92c3dd18d5d2c51e65` |

## Curated current-tree verdicts

Five original compact JSON verdicts and one derived Phase8 summary remain tracked; no test reads historical raw
reports or PNGs as regression fixtures. Browser fixtures generate their own
output from source. The initial and corrected verdicts are retained separately.

| Verdict | Bytes | Original SHA256 |
| --- | ---: | --- |
| [phase6-parent-acceptance.json](../../evidence/phase6-parent-acceptance.json) | 6330 | `e0bd0ff413f9e328016ff523e43191d54884cca7c7046e9ae6da029908ef55ce` |
| [phase7-independent-acceptance.json](../../evidence/phase7-independent-acceptance.json) | 4937 | `782c89dad6cd37a2d4a298f854c1388b64fad0f954fb41c633d9d5263cb7de06` |
| [phase7-independent-corrected-acceptance.json](../../evidence/phase7-independent-corrected-acceptance.json) | 6944 | `92dbee887aae3830bc6735d0322cdc97bdcedf2837e512d6e8eeacf99f26cf6a` |
| [phase8-independent-acceptance.json](../../evidence/phase8-independent-acceptance.json) | 3269 | `ad2e299cd35bf4aae882698f047743c601d2e55b4076fff74619e94659fbc7da` |
| [phase9-independent/acceptance-v1.json](../../evidence/phase9-independent/acceptance-v1.json) | 12650 | `bed3b96fdbc466ab0daa0b64b0fc46ff64890c519d6596dad73b4631bb57cf1a` |
| [Derived Phase8 acceptance summary](../../evidence/phase8-acceptance-summary.json) | 2105 | `915a0d505fb38989105e251b0f5df085d77bddb652c17db9f18a6659aa8a5c30` |

The larger Phase8 v2/v3 verdicts (mostly per-file hash bookkeeping) remain
immutable in the external archive. The compact derived summary cites their
original hashes and does not replace or rewrite their original findings.

## Reproduction and limits

Run focused source tests or the documented serial matching-major/measurement
runners with a fresh selected evidence root. Outputs are ignored. New results
are reproductions, never reconstructed historical originals. Historical
`scripts/archive/phase8-report.mjs` refuses its archived destination;
`scripts/archive/phase9-report.mjs` requires the exact archived baseline/final input
paths and protected bytes and is not runnable from the lean checkout alone.
It is a historical report assembler, not part of routine tests; do not regenerate
accepted reports. Restoring archival inputs temporarily for an approved audit
must not stage raw files or replace curated verdicts.

Phase9 is bounded accepted-with-limits on actual Chrome155.0.8059.40,
revision `@cfaadc5a132d78e1828635aa8405a499f3e14864`; the exact154.0.8037.98
gate remains UNVERIFIED. Autonomous coordinator155 continuation after user
unavailability was not explicit user155 approval or a154 waiver. The transition
cause/date is unknown. Conservative root-wide capture/readback remains;
no safe selective optimization or speedup was established. Final-source DPR2
text mismatch23249pixels/68851bytes is baseline-identical, not text equivalence.
CPU submission is not GPU execution; screenshot polling is not physical latency.
OS IME, actual screen reader/everyday profile/true background/physical display
and device-reset gates remain manual UNVERIFIED. Five original Phase6 reports
remain lost:248/253 genuine originals, no explicit supersession approval.
Neither archival integrity nor Git rewriting repairs that exception or implies
release readiness/arbitrary compatibility.

## Rewritten history

The isolated filter preserved the three meaningful phase commits and their
source trees, removing raw evidence from every main ancestor:

| Commit | Archived old SHA | Rewritten SHA |
| --- | --- | --- |
| Phases1-6 baseline and Phase7 | `7415d5cbf8550dc374ab2c15d8a454457832012d` | `3c508a848b9673fd1d691e76fa26b651dccf2ab9` |
| Phase8 | `84ac72ca6a5f86d34104f899d1662914aae7903e` | `8f0ba6b9b1dcb167e1e22c3720b0c50319459d02` |
| Phase9 | `7f57b7ce5604b0d764c7e527ec1179abeb94b156` | `6c973c3e4e4a929996740f7c0725e0a415ac9159` |
| Lean-tree maintenance | `bbf841fd533d00fbb56e15b12848b4ed64592f2a` | `76e948788991e2d958235c3ee9c8de8fc3b3daeb` |

The final mapping documentation is a subsequent maintenance commit. Original
verdicts/report-assembler baseline IDs intentionally remain archived provenance.
Remote replacement uses an exact expected-old-main force-with-lease. This
removes bulk evidence from reachable main/clone history, not a guarantee of
immediate GitHub physical purging of unreachable objects or cached old URLs.
Other remote refs are not deleted or rewritten.
