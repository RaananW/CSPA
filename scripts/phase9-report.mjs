import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { resolve, sep } from "node:path";
import { evidenceRoot, validateEvidenceRoot } from "../tests/helpers/evidence.mjs";

validateEvidenceRoot(evidenceRoot);
if (!["evidence/phase9", "evidence/phase9-independent"].some(root => resolve(evidenceRoot).startsWith(resolve(root) + sep))) {
  throw new Error("Select a fresh evidence/phase9/<report-run> or evidence/phase9-independent/<report-run> destination");
}
const baselineCommit = "84ac72ca6a5f86d34104f899d1662914aae7903e";
const outputPath = `${evidenceRoot}/implementation-report.json`;
try {
  await readFile(outputPath);
  throw new Error("Completed implementation reports are immutable; select a fresh destination");
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const json = async path => JSON.parse(await readFile(path, "utf8"));
async function sourceHash() {
  const digest = createHash("sha256");
  async function walk(directory) {
    for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) await walk(path);
      else digest.update(path.slice(resolve(".").length)).update(await readFile(path));
    }
  }
  await walk(resolve("examples/playground/src"));
  await walk(resolve("packages/canvas-spa/src"));
  return digest.digest("hex");
}
function distribution(values) {
  if (!values.length) return { count: 0, median: null, p95: null, min: null, max: null };
  const sorted = [...values].sort((a, b) => a - b);
  return { count: sorted.length, median: sorted[Math.ceil(sorted.length * .5) - 1],
    p95: sorted[Math.ceil(sorted.length * .95) - 1], min: sorted[0], max: sorted.at(-1) };
}
const baseline = await json("evidence/phase9/baseline/performance/performance.json");
const current = await json("evidence/phase9/new-final/performance/performance.json");
if (!baseline.completed || !current.completed || baseline.runs.length !== 90 || current.runs.length !== 90) {
  throw new Error("Both genuine complete 90-run comparisons are required");
}
const comparisons = [];
for (const dpr of [1, 2]) for (const layers of [2, 4, 8]) for (const variant of ["dom-static", "gpu-static", "dom-affine", "gpu-affine", "gpu-ripple"]) {
  const select = report => report.runs.filter(run => run.dpr === dpr && run.layers === layers && run.variant === variant);
  const summarize = runs => ({
    captures: runs.map(run => run.inputSummary.work.captures),
    readbacks: runs.map(run => run.inputSummary.work.pixelReadbacks),
    uploads: runs.map(run => run.inputSummary.work.uploads),
    commits: runs.map(run => run.inputSummary.actualReactCommits),
    changedInputBytes: runs.map(run => run.changedInputBytes),
    inputReadbackCPU: distribution(runs.flatMap(run => run.inputMeasurement.samples.filter(sample => sample.kind === "readbackCompareMs").map(sample => sample.durationMs))),
    inputCaptureCPU: distribution(runs.flatMap(run => run.inputMeasurement.samples.filter(sample => sample.kind === "captureMs").map(sample => sample.durationMs))),
    settledFrameCPU: distribution(runs.flatMap(run => run.measurement.samples.filter(sample => sample.kind === "frameWorkMs").map(sample => sample.durationMs))),
    raf: distribution(runs.flatMap(run => run.measurement.intervals)),
    perLayer: runs.map(run => run.inputSummary.perLayer),
    estimates: runs.map(run => run.estimates),
    zeroRetired: runs.every(run => Object.values(run.retired.resources).every(value => value === 0)
      && Object.values(run.retired.runtimeResources).every(value => value === 0)),
  });
  comparisons.push({ dpr, layers, variant, baseline: summarize(select(baseline)), current: summarize(select(current)) });
}
const protectedFiles = {};
const paths = execFileSync("git", ["ls-tree", "-r", "--name-only", baselineCommit, "evidence"], { encoding: "utf8" }).trim().split("\n");
for (const path of paths) {
  const expected = hash(execFileSync("git", ["show", `${baselineCommit}:${path}`], { maxBuffer: 32 * 1024 * 1024 }));
  const actual = hash(await readFile(path));
  if (expected !== actual) throw new Error(`Protected accepted evidence changed: ${path}`);
  protectedFiles[path] = expected;
}
const sourceSha256 = await sourceHash();
const react18 = await json("evidence/phase9/final-react18-v2/react18/matrix.json");
const react19 = await json("evidence/phase9/final-react19-v2/react19/matrix.json");
if (react18.sourceSha256 !== sourceSha256 || react19.sourceSha256 !== sourceSha256) throw new Error("Final shared sources differ");
const final18Environment = (await json("evidence/phase9/final-react18-v2/react18/reports/runtime/independent-false.json")).environment;
const final19Environment = (await json("evidence/phase9/final-react19-v2/runtime/independent-false.json")).environment;
const evidenceHashes = {};
async function evidenceHash(directory) {
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) await evidenceHash(path);
    else if (path !== `${evidenceRoot}/implementation-report.json`) evidenceHashes[path] = hash(await readFile(path));
  }
}
await evidenceHash("evidence/phase9");
const report = {
  state: "Phase9 implementation and observed installed155 gates complete; exact Chrome154 requirement remains unverified. Separate GPT-6.1 Sol independent bounded155 technical acceptance pending under autonomous coordinator continuation, not explicit user155 approval. No commit/push authorized.",
  browserContract: {
    required: "Chrome/154.0.8037.98",
    baselineActual: baseline.environment.browser.product,
    currentActual: current.environment.browser.product,
    satisfied: baseline.environment.browser.product === "Chrome/154.0.8037.98" && current.environment.browser.product === "Chrome/154.0.8037.98",
    baselineCDP: baseline.environment.browser,
    currentCDP: current.environment.browser,
    finalReact18: final18Environment,
    finalReact19: final19Environment,
    disposition: "Final audit detected installed155 at the unchanged executable; transition reason/date unknown. No browser installed/downloaded/switched by this writer. Coordinator permits renewed independent bounded checks on actual installed155 with no environment/profile changes after user unavailable; NOT explicit user155 approval or154 certification. Implementation browser runs stopped at handoff.",
  },
  baselineCommit, sourceSha256, primaryLockSha256: hash(await readFile("package-lock.json")),
  protectedAcceptedEvidence: { count: paths.length, unchanged: true, hashes: protectedFiles },
  historicalProvenance: "Five original Phase6 fixture reports remain permanently missing:248/253 genuine original hashes. Current accepted Git bytes are regenerated samples, not recovered originals; no explicit user supersession approval.",
  decisions: {
    capture: "No safe public selective native attribution was established. Native paint attributes edits to persistent root; unknown/malformed payload remains conservative all-layer capture. No native invalidation suppression or manufactured gain.",
    lifecycle: "Synchronous hidden-output/DOM presentation barrier; membership revision/order/origin/size/DPR signature; post-await admission generation checks; cancelled public screenshot requests drain on bounded hidden public rendered frames, pending capture and healthy public fence/readback retention. Explicit fresh admission remains default; no auto refresh.",
    raster: "Controlled unmodified git-archived Phase8/current pairs: both0 differing pixels DPR1 and23249pixels/68851bytes DPR2. Text raster mismatch baseline-identical; native state/layout/hit gates remain separate and existing correctness assertions unchanged.",
  },
  measurements: { baselineRuns: baseline.runs.length, currentRuns: current.runs.length,
    baselineLatencyTrials: baseline.latency.length, currentLatencyTrials: current.latency.length,
    comparisons, baselineLatency: baseline.latency, currentLatency: current.latency,
    claim: "No performance-improvement claim. Raw matched CPU/RAF samples are noisy; added shader work is not DOM-equivalent. CPU submission is not GPU execution, unavailable timestamps null. Owned capacity estimates exclude driver/browser/internal allocations.",
    harnessDifference: "New blur/settle/static raster comparisons and declared uniform estimates run outside timed windows. Five-edit timing/workload unchanged. Baseline runtime genuinely unchanged before measurement; new-final uses final corrected admission code. Earlier completed new comparison remains immutable and is not represented as final source.",
  },
  matchingMajors: { react18, react19 },
  manual: "Screen reader, OS IME, everyday profile, real background throttling, physical devices/displays/resets unverified; exact steps/results fields in docs/adoption.md.",
  evidenceHashes,
};
await mkdir(evidenceRoot, { recursive: true });
await writeFile(outputPath, JSON.stringify(report, null, 2), { flag: "wx" });
console.log(JSON.stringify({ sourceSha256, protectedEvidence: paths.length, comparisonGroups: comparisons.length, evidenceFiles: Object.keys(evidenceHashes).length }));
