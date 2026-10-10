import { cp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";

const root = resolve(".");
const isPrimary = process.argv.includes("--primary");
const destination = isPrimary ? root : resolve("fixtures/react18/workspace");
const fixture = JSON.parse(await readFile("fixtures/react18/package.json", "utf8"));
const primary = JSON.parse(await readFile("package.json", "utf8"));
const version = isPrimary ? primary.dependencies.react : fixture.dependencies.react;
const lockBefore = createHash("sha256").update(await readFile("package-lock.json")).digest("hex");
const sourceHash = createHash("sha256");
async function hashSource(directory) {
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) await hashSource(path);
    else sourceHash.update(path.slice(root.length)).update(await readFile(path));
  }
}
await hashSource(resolve("src"));
const sourceSha256 = sourceHash.digest("hex");
if (!isPrimary) {
  await mkdir(destination, { recursive: true });
  for (const path of ["src", "tests", "scripts", "tsconfig.json", "vite.config.ts", "playwright.config.mjs",
    "index.html", "probe.html", "recovery.html", "surface.html", "runtime.html", "paired.html", "todo.html", "performance.html", "integration.html"]) {
    await cp(resolve(path), resolve(destination, path), { recursive: true });
  }
  await writeFile(resolve(destination, "package.json"), JSON.stringify({
    ...primary, name: fixture.name,
    dependencies: { ...primary.dependencies, ...fixture.dependencies },
    devDependencies: { ...primary.devDependencies, ...fixture.devDependencies },
  }, null, 2));
}
const fixtureRequire = createRequire(resolve(destination, "package.json"));
const dialogPackage = JSON.parse(await readFile(resolve(dirname(fixtureRequire.resolve("@radix-ui/react-dialog")), "../package.json"), "utf8"));
if (dialogPackage.version !== primary.dependencies["@radix-ui/react-dialog"]) throw new Error("Resolved Dialog integration dependency does not match its primary exact pin");
await mkdir(resolve(destination, "evidence"), { recursive: true });
const evidence = resolve(`evidence/phase7/react${isPrimary ? "19" : "18"}`);
await mkdir(evidence, { recursive: true });
async function run(command, args, name) {
  const child = spawn(command, args, { cwd: destination, env: { ...process.env,
    CANVAS_EXPECT_REACT_VERSION: version,
    ...(!isPrimary ? { CANVAS_TEST_DEV_URL: "http://127.0.0.1:5185", CANVAS_TEST_PREVIEW_URL: "http://127.0.0.1:5186" } : {}) },
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
    await run("npm", ["run", "build"], "build");
    await run("npm", ["run", "test:browser", "--", "runtime.test.mjs", "animation.test.mjs", "todo.test.mjs", "integration.test.mjs", "--max-failures=1"], "behavior");
    await cp(resolve(destination, "evidence"), resolve(evidence, "reports"), { recursive: true });
  }
  const lockAfter = createHash("sha256").update(await readFile(resolve(root, "package-lock.json"))).digest("hex");
  if (lockBefore !== lockAfter) throw new Error("Primary dependency lockfile changed during compatibility validation");
  await writeFile(resolve(evidence, "matrix.json"), JSON.stringify({
    fixture: isPrimary ? "Primary pinned React19 project; full regression includes the same declared behavior suite" :
      "source copy, no implementation substitutions; independent resolution from declared fixture node_modules",
    versions: isPrimary ? primary : fixture,
    toolVersions: { ...primary.devDependencies, ...(!isPrimary ? fixture.devDependencies : {}) },
    behavior: ["runtime.test.mjs", "animation.test.mjs", "todo.test.mjs", "integration.test.mjs"],
    production: "Vite production + react-dom/profiling",
    development: `Actual Vite development React + StrictMode; ports ${isPrimary ? "5173/5174" : "5185/5186"}`,
    executedReact: {
      production: JSON.parse(await readFile(resolve(destination, "evidence/runtime/independent-false.json"), "utf8")).initial.reactVersion,
      development: JSON.parse(await readFile(resolve(destination, "evidence/runtime/independent-true.json"), "utf8")).initial.reactVersion,
    },
    resolvedIntegration: { name: dialogPackage.name, version: dialogPackage.version, license: dialogPackage.license, peerDependencies: dialogPackage.peerDependencies },
    sourceRoot: "<workspace>/src", sourceSha256, primaryLockUnchanged: true, primaryLockSha256: lockAfter,
  }, null, 2));
} finally {
  process.chdir(root);
  await import("./sanitize-evidence.mjs");
}
