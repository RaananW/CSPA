import { cp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { randomUUID } from "node:crypto";
import { evidenceRoot } from "../tests/helpers/evidence.mjs";
import { copyDependencies } from "./release-policy.mjs";

const root = resolve(".");
const isPrimary = process.argv.includes("--primary");
const destination = isPrimary ? root : resolve(`fixtures/react18/workspace/run-${randomUUID()}`);
const fixture = JSON.parse(await readFile("fixtures/react18/package.json", "utf8"));
const primary = JSON.parse(await readFile("package.json", "utf8"));
const playground = JSON.parse(await readFile("examples/playground/package.json", "utf8"));
const version = isPrimary ? primary.devDependencies.react : fixture.dependencies.react;
const lockBefore = createHash("sha256").update(await readFile("package-lock.json")).digest("hex");
const sourceHash = createHash("sha256");
async function hashSource(directory) {
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) await hashSource(path);
    else sourceHash.update(path.slice(root.length)).update(await readFile(path));
  }
}
await hashSource(resolve("examples/playground/src"));
await hashSource(resolve("packages/canvas-spa/src"));
const sourceSha256 = sourceHash.digest("hex");
if (!isPrimary) {
  await mkdir(destination, { recursive: true });
  for (const path of ["packages", "examples", "tests", "scripts", "vite.config.ts", "package-lock.json", "docs/distribution.md"]) {
    await cp(resolve(path), resolve(destination, path), {
      recursive: true, filter: path => !["dist", "node_modules", "owned-vite-cache"].includes(path.split("/").at(-1)),
    });
  }
  await cp(resolve("package.json"), resolve(destination, "package.json"));
  await mkdir(resolve(destination, "fixtures/react18"), { recursive: true });
  for (const path of ["package.json", "package-lock.json"]) await cp(resolve("fixtures/react18", path), resolve(destination, "fixtures/react18", path));
  await copyDependencies(resolve("node_modules"), resolve(destination, "node_modules"));
  await copyDependencies(resolve("fixtures/react18/node_modules"), resolve(destination, "node_modules"));
}
const fixtureRequire = createRequire(resolve(destination, "package.json"));
const dialogPackage = JSON.parse(await readFile(resolve(dirname(fixtureRequire.resolve("@radix-ui/react-dialog")), "../package.json"), "utf8"));
if (dialogPackage.version !== playground.dependencies["@radix-ui/react-dialog"]) throw new Error("Resolved Dialog integration dependency does not match its playground exact pin");
await mkdir(resolve(destination, "evidence"), { recursive: true });
const evidence = resolve(`${evidenceRoot}/react${isPrimary ? "19" : "18"}`);
await mkdir(evidence, { recursive: true });
async function run(command, args, name) {
  const child = spawn(command, args, { cwd: destination, env: { ...process.env,
    CANVAS_EXPECT_REACT_VERSION: version, CANVAS_EVIDENCE_ROOT: evidenceRoot,
    ...(!isPrimary ? { CANVAS_TEST_DEV_URL: process.env.CANVAS_TEST_DEV_URL ?? "http://127.0.0.1:5185",
      CANVAS_TEST_PREVIEW_URL: process.env.CANVAS_TEST_PREVIEW_URL ?? "http://127.0.0.1:5186" } : {}) },
    stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  for (const stream of [child.stdout, child.stderr]) stream.on("data", data => { output += data; process.stdout.write(data); });
  const code = await new Promise((done, reject) => { child.once("error", reject); child.once("exit", code => done(code)); });
  await writeFile(resolve(evidence, `${name}.log`), output);
  if (code !== 0) throw new Error(`React${version} ${name} failed (${code})`);
}
try {
  if (isPrimary) await run("npm", ["test"], "full");
  else {
    const units = (await readdir(resolve(destination, "tests/unit"))).filter(path => path.endsWith(".unit.test.mjs")).map(path => `tests/unit/${path}`);
    await run(process.execPath, ["--test", ...units], "units");
    await run(process.execPath, ["node_modules/typescript/bin/tsc", "-p", "examples/playground/tsconfig.json"], "types");
    await run(process.execPath, ["node_modules/vite/bin/vite.js", "build"], "build");
    await run(process.execPath, ["scripts/test-browser.mjs", "runtime.test.mjs", "animation.test.mjs", "todo.test.mjs", "integration.test.mjs", "effects.test.mjs", "hardening.test.mjs", "dynamic.test.mjs", "native-editing.test.mjs", "viewport.test.mjs",
      ...process.argv.slice(2).filter(argument => argument !== "--primary"), "--max-failures=1"], "behavior");
    await cp(resolve(destination, evidenceRoot), resolve(evidence, "reports"), { recursive: true });
  }
  const lockAfter = createHash("sha256").update(await readFile(resolve(root, "package-lock.json"))).digest("hex");
  if (lockBefore !== lockAfter) throw new Error("Primary dependency lockfile changed during compatibility validation");
  await writeFile(resolve(evidence, "matrix.json"), JSON.stringify({
    fixture: isPrimary ? "Primary pinned React19 project; full regression includes the same declared behavior suite" :
      "source copy, no implementation substitutions; independent resolution from declared fixture node_modules",
    versions: isPrimary ? primary : fixture,
    toolVersions: { ...primary.devDependencies, ...(!isPrimary ? fixture.devDependencies : {}) },
    behavior: ["runtime.test.mjs", "animation.test.mjs", "todo.test.mjs", "integration.test.mjs", "effects.test.mjs", "hardening.test.mjs", "dynamic.test.mjs", "native-editing.test.mjs", "viewport.test.mjs"],
    behaviorFilter: process.argv.slice(2).filter(argument => argument !== "--primary"),
    production: "Vite production + react-dom/profiling",
    development: `Actual Vite development React + StrictMode; ports ${process.env.CANVAS_TEST_DEV_URL ?? (isPrimary ? "5173" : "5185")} / ${process.env.CANVAS_TEST_PREVIEW_URL ?? (isPrimary ? "5174" : "5186")}`,
    executedReact: {
      production: JSON.parse(await readFile(resolve(destination, `${evidenceRoot}/runtime/independent-false.json`), "utf8")).initial.reactVersion,
      development: JSON.parse(await readFile(resolve(destination, `${evidenceRoot}/runtime/independent-true.json`), "utf8")).initial.reactVersion,
    },
    resolvedIntegration: { name: dialogPackage.name, version: dialogPackage.version, license: dialogPackage.license, peerDependencies: dialogPackage.peerDependencies },
    sourceRoot: "<workspace>/packages/canvas-spa/src + examples/playground/src", sourceSha256, primaryLockUnchanged: true, primaryLockSha256: lockAfter,
  }, null, 2));
} finally {
  process.chdir(root);
  await import("./sanitize-evidence.mjs");
}
