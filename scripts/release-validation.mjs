import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { randomUUID, createHash } from "node:crypto";
import { mkdir, cp, readFile, readdir, writeFile, access } from "node:fs/promises";
import { resolve, join, basename } from "node:path";
import { createServer } from "node:net";
import { arch, platform, release, cpus, totalmem } from "node:os";
import { copyDependencies, assertPhysicalTree, prepareReleaseRoot, dependencyVersion } from "./release-policy.mjs";
import { validatePackageContents, packageFiles } from "./package-policy.mjs";
import { withPlatform, devNull } from "../tests/helpers/process.mjs";

const root = resolve(".");
const lane = process.argv[2];
assert.ok(["build-only", "dom", "native"].includes(lane), "Usage: node scripts/release-validation.mjs build-only|dom|native");
const executable = process.env.CANVAS_BROWSER_EXECUTABLE;
if (lane !== "build-only" && executable) await access(executable);
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const manifest = JSON.parse(await readFile("packages/canvas-spa/package.json", "utf8"));
assert.equal(manifest.private, true); assert.equal(manifest.version, "0.0.0");
const parent = join(root, "evidence/phase14");
assert.equal(process.env.CANVAS_RELEASE_ROOT, undefined, "Release root overrides are refused; prior archives are read-only");
execFileSync("git", ["check-ignore", parent], { stdio: "pipe" });
await prepareReleaseRoot(root);
const directory = join(parent, `run-${randomUUID()}`);
await mkdir(directory);
await assertPhysicalTree(directory);
const env = { ...process.env, npm_config_userconfig: devNull, PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: "1" };
let commandSequence = 0;
const result = { schema: 1, lane, status: "running", directory, head: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  startedAt: new Date().toISOString(), host: { arch: arch(), platform: platform(), release: release(), cpu: cpus()[0]?.model, totalmem: totalmem() },
  nodeExecutable: process.execPath,
  node: process.version, npm: execFileSync(...withPlatform("npm", ["--version"], { encoding: "utf8" })).trim(),
  lockSha256: sha(await readFile("package-lock.json")), peers: [], commands: [],
  hosted: "NOT EXECUTED; workflow definition build-only, no hosted GPU qualification",
  gpu: lane === "native" ? "REQUESTED; admission failure is failure" : "NOT EXECUTED; not a passed GPU gate" };
if (lane !== "build-only") result.browserExecutable = executable ? { path: executable, sha256: sha(await readFile(executable)) } : { channel: "chrome-canary" };
async function records(directory) {
  const entries = [];
  async function walk(path) {
    for (const entry of (await readdir(path, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = join(path, entry.name);
      if (entry.isDirectory()) await walk(file);
      else entries.push({ path: file.slice(root.length + 1), bytes: (await readFile(file)).length, sha256: sha(await readFile(file)) });
    }
  }
  await walk(directory);
  return entries;
}
async function sourceRecords() {
  return [...await records(join(root, "packages/canvas-spa/src")), ...await records(join(root, "examples/playground/src"))];
}
const sourceBefore = await sourceRecords();
const inputs = [...sourceBefore, ...await Promise.all(["package.json", "package-lock.json", "fixtures/react18/package.json",
  "fixtures/react18/package-lock.json", "packages/canvas-spa/package.json", "packages/canvas-spa/README.md",
  "examples/playground/package.json", "README.md", "docs/distribution.md", "docs/showcase.md", "examples/playground/todo.html",
  "examples/playground/tsconfig.json", "packages/canvas-spa/tsconfig.json", "packages/canvas-spa/vite.config.ts",
  "examples/playground/vite.config.ts", "vite.config.ts", "tests/browser/playwright.config.mjs",
  "fixtures/package-consumer/todo-main.tsx", "fixtures/package-consumer/tsconfig.json", "fixtures/package-consumer/public-types.ts",
  "scripts/release-validation.mjs", "scripts/release-policy.mjs", "scripts/release-pilot.mjs",
  "packages/canvas-spa/scripts/prepare-package.mjs", "tests/unit/release.unit.test.mjs", ".github/workflows/private-release.yml",
  ".github/workflows/showcase-pages.yml"].map(async path => ({ path, sha256: sha(await readFile(path)) })))];
inputs.push(...await records(join(root, "examples/showcase/src")));
for (const path of ["package.json", "tsconfig.json", "vite.config.ts", "site-policy.mjs", "index.html"]) {
  inputs.push({ path: `examples/showcase/${path}`, sha256: sha(await readFile(join(root, "examples/showcase", path))) });
}
for (const directory of ["tests", "scripts"]) inputs.push(...await records(join(root, directory)));
for (const path of (await readdir(join(root, "examples/playground"))).filter(path => path.endsWith(".html"))) {
  inputs.push({ path: `examples/playground/${path}`, sha256: sha(await readFile(join(root, "examples/playground", path))) });
}
await writeFile(join(directory, "inputs.json"), JSON.stringify(inputs, null, 2), { flag: "wx" });
await writeFile(join(directory, "inventory.json"), JSON.stringify({
  manifest, lock: JSON.parse(await readFile("package-lock.json", "utf8")),
  disposition: "Local workspace dependency inventory only; prior security assessments belong to their dated source. No registry audit/update/install in this runner.",
}, null, 2), { flag: "wx" });
async function command(args, cwd, label, executable = process.execPath) {
  const record = { executable, args, cwd, label };
  const name = `${commandSequence++}-${label}`;
  await writeFile(join(directory, `${name}-argv.json`), JSON.stringify(record, null, 2), { flag: "wx" });
  const child = spawn(...withPlatform(executable, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"] }));
  let output = "";
  for (const stream of [child.stdout, child.stderr]) stream.on("data", bytes => { output += bytes; });
  const code = await new Promise(done => {
    child.once("error", error => { record.error = String(error); done(null); });
    child.once("close", done);
  });
  record.code = code;
  result.commands.push(record);
  await writeFile(join(directory, `${name}.log`), output, { flag: "wx" });
  await writeFile(join(directory, `${name}.json`), JSON.stringify(record, null, 2), { flag: "wx" });
  assert.equal(code, 0, `${label} failed: ${output.slice(-5000)}`);
  return output;
}
async function preview(cwd, vite, label, readinessPath = "/") {
  const socket = createServer();
  await new Promise((done, reject) => { socket.once("error", reject); socket.listen(0, "127.0.0.1", done); });
  const port = socket.address().port;
  await new Promise(done => socket.close(done));
  const args = [vite, "preview", "--host", "127.0.0.1", "--port", String(port), "--strictPort"];
  const child = spawn(process.execPath, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
  let output = "", failure;
  child.on("error", error => { failure = error; });
  for (const stream of [child.stdout, child.stderr]) stream.on("data", data => { output += data; });
  const closed = new Promise(done => child.once("close", done));
  const stop = async () => {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
    await closed;
    await writeFile(join(directory, `${label}-preview.log`), output, { flag: "wx" });
  };
  const url = `http://127.0.0.1:${port}`;
  try {
    for (let i = 0; i < 100; i++) {
      if (failure) throw failure;
      assert.equal(child.exitCode, null, output);
      try { if ((await fetch(`${url}${readinessPath}`)).status === 200) return { url, stop, pid: child.pid, args }; }
      catch (error) { if (error.cause?.code !== "ECONNREFUSED") throw error; }
      await new Promise(done => setTimeout(done, 100));
    }
    throw new Error("Owned preview readiness failed");
  } catch (error) { await stop(); throw error; }
}
try {
  for (const major of [18, 19]) {
    const peer = join(directory, `react${major}`);
    await mkdir(peer);
    const copied = ["packages", "examples", "tests", "scripts", "vite.config.ts", "package-lock.json",
      "README.md", "docs/distribution.md", "docs/showcase.md", ".github/workflows/showcase-pages.yml"];
    for (const path of copied) await cp(join(root, path), join(peer, path), {
      recursive: true, filter: path => !["node_modules", "dist", "owned-vite-cache"].includes(basename(path)),
    });
    await mkdir(join(peer, "fixtures/react18"), { recursive: true });
    for (const path of ["package.json", "package-lock.json"]) {
      await cp(join(root, "fixtures/react18", path), join(peer, "fixtures/react18", path));
    }
    await mkdir(join(peer, "fixtures/package-consumer"), { recursive: true });
    for (const path of ["todo-main.tsx", "tsconfig.json", "public-types.ts"]) {
      await cp(join(root, "fixtures/package-consumer", path), join(peer, "fixtures/package-consumer", path));
    }
    const version = major === 18 ? "18.3.1" : "19.3.0";
    await cp(join(root, "package.json"), join(peer, "package.json"));
    await copyDependencies(join(root, "node_modules"), join(peer, "node_modules"));
    if (major === 18) await copyDependencies(join(root, "fixtures/react18/node_modules"), join(peer, "node_modules"));
    await assertPhysicalTree(join(peer, "node_modules"));
    assert.equal(await dependencyVersion(peer, "react"), version);
    assert.equal(await dependencyVersion(peer, "react-dom"), version);
    await writeFile(join(peer, "resolved-tools.json"), JSON.stringify(await Promise.all(
      ["react", "react-dom", "@types/react", "@types/react-dom", "typescript", "vite", "playwright"].map(async name => ({
        name, version: await dependencyVersion(peer, name), path: join(peer, "node_modules", name),
      }))), null, 2), { flag: "wx" });
    const tsc = join(peer, "node_modules/typescript/bin/tsc");
    const vite = join(peer, "node_modules/vite/bin/vite.js");
    const playground = join(peer, "examples/playground");
    const library = join(peer, "packages/canvas-spa");
    const unitPaths = (await readdir(join(peer, "tests/unit"))).filter(path => path.endsWith(".unit.test.mjs")).map(path => `tests/unit/${path}`);
    await command(["--test", ...unitPaths], peer, `react${major}-units`);
    await writeFile(join(playground, "source-pilot.tsx"), (await readFile(join(peer, "fixtures/package-consumer/todo-main.tsx"), "utf8"))
      .replace('"canvas-spa-phase-one"', '"../../packages/canvas-spa/src"').replaceAll('"./task/', '"./src/apps/todo/'));
    await writeFile(join(playground, "source-pilot.html"), (await readFile(join(playground, "todo.html"), "utf8")).replace("/src/demo/todo-demo.tsx", "/source-pilot.tsx"));
    await writeFile(join(peer, "source-pilot.config.mjs"), 'import config from "./examples/playground/vite.config.ts"; import {resolve} from "node:path"; export default {...config,cacheDir:resolve("owned-vite-cache"),build:{...config.build,target:"esnext",rollupOptions:{input:[...config.build.rollupOptions.input,resolve("examples/playground/source-pilot.html")]}}};');
    await command([tsc, "-p", "examples/playground/tsconfig.json"], peer, `react${major}-source-types`);
    await command([vite, "build", "--config", "source-pilot.config.mjs"], peer, `react${major}-production`);
    await command([vite, "build"], library, `react${major}-library`);
    await command([tsc, "-p", "tsconfig.json"], library, `react${major}-declarations`);
    await command([join(library, "scripts/prepare-package.mjs")], library, `react${major}-package-docs`);
    const output = await command(["pack", "--ignore-scripts", "--json", "--pack-destination", peer], library, `react${major}-pack`, "npm");
    const packed = JSON.parse(output)[0];
    validatePackageContents(packed.files);
    const archive = join(peer, packed.filename);
    const members = execFileSync("tar", ["-tzf", archive], { encoding: "utf8" }).trim().split(/\r?\n/);
    assert.deepEqual(members.map(path => path.replace(/^package\//, "")).sort(), packageFiles);
    const consumer = join(peer, "consumer");
    await mkdir(consumer);
    await copyDependencies(join(peer, "node_modules"), join(consumer, "node_modules"));
    const installed = join(consumer, "node_modules", manifest.name);
    await mkdir(installed);
    execFileSync("tar", ["-xzf", archive, "--strip-components=1", "-C", installed]);
    assert.equal(sha(await readFile(join(installed, "package.json"))), sha(await readFile(join(root, "packages/canvas-spa/package.json"))),
      "Fresh public package must retain the exact current manifest, independent of the physical test peer");
    const installedRecords = [];
    for (const path of packageFiles) {
      const bytes = await readFile(join(installed, path));
      assert.equal(sha(bytes), sha(await readFile(join(library, path))), `Exact archive member differs: ${path}`);
      assert.ok(!/\/Users\/|session-state|integrationProbe|runtimeProbe/.test(bytes.toString()), `Package privacy violation: ${path}`);
      installedRecords.push({ path, bytes: bytes.length, sha256: sha(bytes) });
    }
    await writeFile(join(consumer, "package.json"), JSON.stringify({ name: `private-release-react${major}`, version: "0.0.0", private: true, type: "module",
      dependencies: { [manifest.name]: `file:${archive}`, react: version, "react-dom": version } }, null, 2));
    for (const path of ["tsconfig.json", "public-types.ts"]) await cp(join(peer, "fixtures/package-consumer", path), join(consumer, path));
    await cp(join(peer, "fixtures/package-consumer/todo-main.tsx"), join(consumer, "main.tsx"));
    await writeFile(join(consumer, "index.html"), (await readFile(join(playground, "todo.html"), "utf8")).replace("/src/demo/todo-demo.tsx", "/main.tsx"));
    await mkdir(join(consumer, "task"));
    for (const path of ["TodoApp.tsx", "model.ts", "transition.ts", "diagnostics.ts", "todo.css"]) {
      const text = await readFile(join(playground, "src/apps/todo", path), "utf8");
      await writeFile(join(consumer, "task", path), text.replaceAll('"./model"', '"./model.js"').replaceAll('"./TodoApp"', '"./TodoApp.js"'));
    }
    await writeFile(join(consumer, "vite.config.ts"), 'import {defineConfig} from "vite"; import {resolve} from "node:path"; export default defineConfig({cacheDir:resolve("owned-vite-cache"),resolve:{dedupe:["react","react-dom"]},build:{target:"esnext"}});');
    await command([tsc, "-p", "tsconfig.json"], consumer, `react${major}-consumer-bundler`);
    await command([tsc, "-p", "tsconfig.json", "--module", "NodeNext", "--moduleResolution", "NodeNext"], consumer, `react${major}-consumer-nodenext`);
    await command(["--input-type=module", "-e",
      `const api = await import(${JSON.stringify(manifest.name)}); const expected = ["GPUHost","Surface","Box","NativeScroll","NativeOverlay","Presence","useSurfaceRef","useNativeOverlayHost","useGPUHost","mountCanvasApp","EnrollmentError","mountApplicationModule","defineEffect"].sort(); if (JSON.stringify(Object.keys(api).sort()) !== JSON.stringify(expected)) throw Error("Public runtime export contract changed"); console.log(Object.keys(api).sort());`],
      consumer, `react${major}-consumer-safe-import`);
    await command([vite, "build"], consumer, `react${major}-consumer-production`);
    const peerResult = { major, version, sourceMode: "physical workspace library/playground copy; all ten production pages and task pilot", dependencyMode: "physical independent writable copy; optimizer caches excluded",
      archive: { sha256: sha(await readFile(archive)), bytes: (await readFile(archive)).length, members: installedRecords }, browsers: [] };
    result.peers.push(peerResult);
    if (lane !== "build-only") {
      peerResult.previews = [];
      for (const [mode, cwd, path] of [["source", peer, "/source-pilot.html"], ["package", consumer, "/"]]) {
        const server = await preview(cwd, vite, `react${major}-${mode}`, path);
        const serverRecord = { mode, pid: server.pid, url: server.url, args: server.args };
        peerResult.previews.push(serverRecord);
        try {
          for (const dpr of [1, 2]) {
            const evidence = join(directory, `react${major}-${mode}-${lane}-dpr${dpr}`);
            await mkdir(evidence);
            const output = await command([join(peer, "scripts/release-pilot.mjs"), `${server.url}${path}`, version, lane,
              String(dpr), executable ?? "-", evidence], peer, `react${major}-${mode}-${lane}-dpr${dpr}`);
            peerResult.browsers.push({ mode, ...JSON.parse(output) });
          }
        } finally { await server.stop(); serverRecord.closed = true; }
      }
    }
  }
  result.status = "passed";
} catch (error) {
  result.status = "failed"; result.error = String(error); process.exitCode = 1;
  console.error(error);
} finally {
  result.inputsUnchanged = true;
  for (const input of inputs) {
    if (sha(await readFile(join(root, input.path))) !== input.sha256) {
      result.inputsUnchanged = false; result.status = "failed"; result.error = `Input changed: ${input.path}`; process.exitCode = 1;
    }
  }
  result.sourceUnchanged = JSON.stringify(await sourceRecords()) === JSON.stringify(sourceBefore);
  if (!result.sourceUnchanged) { result.status = "failed"; result.error = "Source changed during release validation"; process.exitCode = 1; }
  result.finishedAt = new Date().toISOString();
  await writeFile(join(directory, "result.json"), JSON.stringify(result, null, 2), { flag: "wx" });
  console.log(`Release ${lane}: ${result.status}; ${directory}`);
}
