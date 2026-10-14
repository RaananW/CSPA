import { readFile, readdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { validateEvidenceRoot } from "../../tests/helpers/evidence.mjs";

const root = "evidence/phase8";
validateEvidenceRoot(root);
const baseline = "7415d5cbf8550dc374ab2c15d8a454457832012d";
const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const json = async path => JSON.parse(await readFile(path, "utf8"));
const source = createHash("sha256");
async function hashSource(directory) {
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) await hashSource(path);
    else source.update(path.slice(resolve(".").length)).update(await readFile(path));
  }
}
await hashSource(resolve("examples/playground/src"));
await hashSource(resolve("packages/canvas-spa/src"));
const sourceSha256 = source.digest("hex");
const lockSha256 = digest(await readFile("package-lock.json"));
const paths = execFileSync("git", ["ls-tree", "-r", "--name-only", baseline, "evidence"], { encoding: "utf8" }).trim().split("\n");
const protectedFiles = {};
for (const path of paths) {
  const expected = digest(execFileSync("git", ["show", `${baseline}:${path}`], { maxBuffer: 32 * 1024 * 1024 }));
  const current = digest(await readFile(path));
  protectedFiles[path] = { expected, current, unchanged: expected === current };
}
if (Object.values(protectedFiles).some(value => !value.unchanged)) throw new Error("Versioned evidence changed; preservation gate failed");
function statistics(samples) {
  const sorted = samples.toSorted((a, b) => a - b);
  if (sorted.length !== 300) throw new Error(`Expected300 frame-work samples, got${sorted.length}`);
  return { count: sorted.length, medianMs: sorted[Math.floor(sorted.length / 2)], p95Ms: sorted[Math.ceil(sorted.length * .95) - 1], maxMs: sorted.at(-1) };
}
const matrices = [];
const costs = [];
for (const major of [18, 19]) {
  const matrixPath = `${root}/react${major}/matrix.json`;
  const matrix = await json(matrixPath);
  if (matrix.sourceSha256 !== sourceSha256 || matrix.primaryLockSha256 !== lockSha256) throw new Error("Matrix source/lock does not match final workspace");
  matrices.push({ path: matrixPath, sha256: digest(await readFile(matrixPath)), executedReact: matrix.executedReact, resolvedIntegration: matrix.resolvedIntegration });
  for (const strict of [false, true]) {
    const path = `${major === 18 ? `${root}/react18/reports` : root}/effects/independence-${strict}.json`;
    const report = await json(path);
    const pixels = await json(`${major === 18 ? `${root}/react18/reports` : root}/effects/pixels-${strict}.json`);
    const windows = report.intervals.map(interval => ({
      kind: interval.kind,
      frameWork: statistics(interval.samples.filter(sample => sample.kind === "frameWorkMs").map(sample => sample.durationMs)),
      gpuFrames: interval.after.metrics.gpuFrames - interval.before.metrics.gpuFrames,
      commits: interval.commitsAfter - interval.commitsBefore,
      contentOperations: Object.fromEntries(["captures", "pixelCopies", "pixelReadbacks", "uploads"].map(key => [key, interval.after.metrics[key] - interval.before.metrics[key]])),
      compilationDelta: interval.after.metrics.effectShaderCompilations - interval.before.metrics.effectShaderCompilations,
      resources: interval.after.resources,
    }));
    if (windows.some(window => window.gpuFrames !== 300 || window.commits || window.compilationDelta || Object.values(window.contentOperations).some(Boolean))) throw new Error("Effect independence interval failed");
    const neutral = windows.find(window => window.kind === "neutral").frameWork;
    costs.push({ major, strict, path, initialCompileSamples: pixels.compileSamples, windows: windows.map(window => ({ ...window,
      differenceFromNeutral: { medianMs: window.frameWork.medianMs - neutral.medianMs, p95Ms: window.frameWork.p95Ms - neutral.p95Ms },
    })), motionFrames: report.motion.after.metrics.gpuFrames - report.motion.before.metrics.gpuFrames, contentChangedBytes: report.contentChangedBytes });
  }
}
await writeFile(`${root}/implementation-report.json`, `${JSON.stringify({
  phase: 8, disposition: "Implementation complete for independent technical acceptance; not accepted, committed or pushed",
  baselineCommit: baseline, sourceSha256, lockSha256, matrices,
  preservation: { total: paths.length, unchanged: paths.length, protectedFiles,
    provenance: "These are accepted Git bytes, not restored original Phase6 history. Permanent five-fixture gap remains:248/253 original hashes preserved; no explicit user supersession approval.",
    originalCurrentHashes: "evidence/phase7/harness/p7-2-evidence-isolation.json" },
  measurement: { claim: "Added non-equivalent GPU effects, not a DOM speedup. Single300-frame windows per variant/build/major; noisy CPU submission samples, not GPU execution or total browser paint.",
    gpuTimestampMs: null, passes: 1, maximumOperationsPerLayer: 3, extraTextures: 0, uniformBytesPerLayer: 160,
    previousUniformBytesPerLayer: 64, twoLayerUniformBytes: 336, previousTwoLayerUniformBytes: 144, channelSamplesPerLayer: 3, costs },
  manualUnverified: ["OS IME", "real screen readers", "physical devices/displays/reset", "everyday profiles", "real background throttling"],
}, null, 2)}\n`);
console.log(`Phase8 report: ${paths.length}/${paths.length} protected Git evidence files unchanged; source${sourceSha256}, lock${lockSha256}`);
