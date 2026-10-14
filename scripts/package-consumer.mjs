import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { cp, mkdir, readFile, writeFile, lstat, readdir } from "node:fs/promises";
import { resolve, join, dirname, basename } from "node:path";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { get } from "node:http";
import { chromium } from "@playwright/test";
import { PNG } from "pngjs";
import { evidenceRoot, validateEvidenceRoot } from "../tests/helpers/evidence.mjs";
import { packageFiles, validatePackageContents } from "./package-policy.mjs";
import { curatedEvidence } from "./check-evidence.mjs";
import { interactionContract, dynamicContract } from "./interaction-contract.mjs";
import { todoContract } from "./todo-contract.mjs";
import { copyDependencies } from "./release-policy.mjs";
import { browserLaunchOptions } from "../tests/helpers/browser.mjs";
import { withPlatform, devNull, tarArgs } from "../tests/helpers/process.mjs";

const root = resolve(".");
const reuseDependencies = process.argv.includes("--reuse-dependencies");
const todoCase = process.argv.includes("--todo-case");
const primary = JSON.parse(await readFile("package.json", "utf8"));
const playground = JSON.parse(await readFile("examples/playground/package.json", "utf8"));
const library = resolve("packages/underglass");
const releasePackage = JSON.parse(await readFile(join(library, "package.json"), "utf8"));
const react18 = JSON.parse(await readFile("fixtures/react18/package.json", "utf8"));
const env = { ...process.env, npm_config_userconfig: devNull, npm_config_registry: "https://registry.npmjs.org" };
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
async function fingerprints() {
  const paths = ["package.json", "packages/underglass/package.json", "packages/underglass/README.md", "package-lock.json", "fixtures/react18/package.json", "fixtures/react18/package-lock.json",
    "packages/underglass/tsconfig.json", "packages/underglass/vite.config.ts", ...curatedEvidence];
  async function visit(directory) {
    for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name === "workspaces") continue;
      const path = `${directory}/${entry.name}`;
      if (entry.isDirectory()) await visit(path);
      else paths.push(path);
    }
  }
  await visit("packages/underglass/src"); await visit("examples/playground/src");
  await visit("fixtures/package-consumer");
  return Object.fromEntries(await Promise.all(paths.map(async path => [path, hash(await readFile(path))])));
}
const before = await fingerprints();
await mkdir(resolve(evidenceRoot), { recursive: true });
const runId = randomUUID();
const evidence = join(resolve(evidenceRoot), `package-${runId}`);
await mkdir(evidence);
validateEvidenceRoot(evidence);
await mkdir("fixtures/package-consumer/workspaces", { recursive: true });
const workspace = resolve(`fixtures/package-consumer/workspaces/run-${runId}`);
await mkdir(workspace);
const results = { status: "running", head: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  package: {}, consumers: [], protectedBefore: before };
async function run(command, args, cwd, label) {
  const child = spawn(...withPlatform(command, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"] }));
  let output = "";
  for (const stream of [child.stdout, child.stderr]) stream.on("data", bytes => { output += bytes; });
  const code = await new Promise((done, reject) => { child.once("error", reject); child.once("exit", done); });
  await writeFile(join(evidence, `${label}.log`), output);
  if (code !== 0) throw new Error(`${label} failed (${code}): ${output.slice(-5000)}`);
  return output;
}
function packResult(output) {
  // npm emits prepack script stdout before the JSON archive manifest.
  return JSON.parse(output.slice(output.lastIndexOf("\n[") + 1))[0];
}
async function availablePort() {
  const server = createServer();
  await new Promise((done, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", done); });
  const port = server.address().port;
  await new Promise((done, reject) => server.close(error => error ? reject(error) : done()));
  return port;
}
function responsive(url) {
  return new Promise((done, reject) => {
    const request = get(url, response => { response.resume(); done(response.statusCode === 200); });
    request.once("error", reject);
    request.setTimeout(1000, () => request.destroy(new Error("Consumer readiness request timed out")));
  });
}
async function startPreview(cwd, vite) {
  const port = await availablePort();
  const url = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, [vite, "preview", "--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
    cwd, env, stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "", spawnError;
  child.on("error", error => { spawnError = error; });
  for (const stream of [child.stdout, child.stderr]) stream.on("data", bytes => { output += bytes; });
  const closed = new Promise(done => child.once("close", done));
  const stop = async () => {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
    await closed;
    await writeFile(join(evidence, `preview-${basename(cwd)}.log`), output);
  };
  try {
    for (let attempt = 0; attempt < 100; attempt++) {
      if (spawnError) throw spawnError;
      if (child.exitCode !== null) throw new Error(`Preview exited: ${output}`);
      try {
        if (await responsive(url)) return { url, pid: child.pid, stop };
      } catch (error) {
        if (error.code !== "ECONNREFUSED") throw error;
      }
      await new Promise(done => setTimeout(done, 100));
    }
    throw new Error(`Consumer preview readiness timed out: ${output}`);
  } catch (error) { await stop(); throw error; }
}
async function waitState(page, mode) {
  await page.waitForFunction(mode => {
    const state = window.packageConsumer.state();
    return state.mode === mode && !state.initializing && !state.transitioning;
  }, mode);
  await page.evaluate(() => window.packageConsumer.controller.settle());
}
async function pixel(page, name, x, y) {
  const png = PNG.sync.read(await page.locator("#frame").screenshot({ path: join(evidence, `${name}.png`) }));
  const scale = png.width / 640;
  const offset = (Math.floor(y * scale) * png.width + Math.floor(x * scale)) * 4;
  return [...png.data.subarray(offset, offset + 4)];
}
async function nativeControls(page, value) {
  const mode = (await page.evaluate(() => window.packageConsumer.state())).mode;
  const count = Number((await page.locator("#count").textContent()).replace("Count ", ""));
  await page.locator("#label").click();
  assert.equal(await page.locator("#name").evaluate(node => document.activeElement === node), true);
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type(value);
  assert.equal(await page.locator("#name").inputValue(), value);
  await page.keyboard.press("Enter");
  await page.waitForFunction(value => document.querySelector("#saved").textContent === value, value);
  await page.locator("#count").click();
  await page.locator("#adopted-button").click();
  assert.equal(await page.locator("#count").textContent(), `Count ${count + 2}`);
  await page.locator("#native").fill("retained native");
  await page.locator("#name").focus();
  await page.keyboard.press("Home");
  await page.keyboard.press("Shift+ArrowRight");
  const state = await page.evaluate(() => window.packageConsumer.state());
  assert.equal(state.value, value);
  assert.equal(state.mode, mode, "Native editing must not revoke healthy GPU ownership");
  assert.deepEqual(state.selection, [0, 1]);
  assert.equal(state.focus, "name");
  assert.ok(state.sameInput && state.sameRoot);
  return state;
}
async function browserContract(url, major, expectedVersion, flags, dpr) {
  const browser = await chromium.launch(browserLaunchOptions({ native: !!flags }));
  const errors = [];
  try {
    const context = await browser.newContext({ viewport: { width: 900, height: 750 }, deviceScaleFactor: dpr });
    const page = await context.newPage();
    page.on("pageerror", error => errors.push(String(error)));
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    const cdp = await context.newCDPSession(page);
    const identity = await cdp.send("Browser.getVersion");
    const launch = await cdp.send("Browser.getBrowserCommandLine");
    await page.goto(url);
    await page.waitForFunction(() => !!window.packageConsumer);
    await waitState(page, "dom");
    const startup = await page.evaluate(() => window.packageConsumer.state());
    assert.equal(startup.version, expectedVersion);
    assert.deepEqual(startup.layers.map(layer => layer.id), ["editor", "adopted"]);
    assert.equal(await page.locator("#text").textContent(), "Original native controls");
    assert.equal(await page.locator("#not-enrolled").isVisible(), true);
    const domPixel = await pixel(page, `${major}-${flags}-${dpr}-dom`, 25, 245);
    assert.deepEqual(domPixel, [240, 30, 60, 255]);
    const dom = await nativeControls(page, `React${major} DOM`);
    const capability = await page.evaluate(() => {
      const canvas = document.createElement("canvas"), context = canvas.getContext("2d");
      return {
        capture: typeof Reflect.get(canvas, "captureElementImage") === "function",
        geometry: typeof Reflect.get(canvas, "getElementTransform") === "function",
        draw: !!context && typeof Reflect.get(context, "drawElementImage") === "function",
        move: typeof Element.prototype.moveBefore === "function",
        webgpu: !!navigator.gpu,
      };
    });
    const admission = await page.evaluate(() => window.packageConsumer.controller.enable());
    let gpu, recovery, gpuPixel, externalScroll;
    if (flags) {
      assert.equal(admission.mode, "gpu", admission.reason);
      await waitState(page, "gpu");
      assert.deepEqual(admission.metrics.admission.last.nativePixels, []);
      assert.equal(admission.metrics.admission.last.gpuPixels.length, 2);
      gpuPixel = await pixel(page, `${major}-${flags}-${dpr}-gpu`, 25, 245);
      assert.deepEqual(gpuPixel, domPixel);
      assert.deepEqual(await pixel(page, `${major}-${flags}-${dpr}-adopted`, 490, 110), [20, 200, 90, 255]);
      await page.evaluate(() => window.packageConsumer.transform({ x: 30, y: 10 }));
      await page.evaluate(() => window.packageConsumer.controller.settle());
      assert.deepEqual(await pixel(page, `${major}-${flags}-${dpr}-translated`, 55, 255), domPixel);
      gpu = await nativeControls(page, "fresh independent native");
      const externalBefore = await page.evaluate(() => window.packageConsumer.state());
      await page.evaluate(async () => {
        const frame = document.querySelector("#frame");
        window.packageFrameParent = frame.parentElement;
        const viewport = document.createElement("div");
        viewport.id = "package-external";
        viewport.style.cssText = "position:relative;width:620px;height:390px;overflow:auto;border:6px solid black";
        frame.parentElement.insertBefore(viewport, frame);
        viewport.append(frame);
        frame.style.left = "40px"; frame.style.top = "70px";
        document.body.style.minHeight = "1600px"; document.body.style.minWidth = "1800px";
        viewport.scrollLeft = 30; viewport.scrollTop = 50;
        window.scrollTo(20, 30);
        await window.packageConsumer.controller.settle();
      });
      const externalState = await page.evaluate(() => window.packageConsumer.state());
      assert.equal(externalState.mode, "gpu", externalState.reason);
      assert.ok(externalState.sameRoot && externalState.sameInput);
      assert.equal(externalState.metrics.admission.attempts, externalBefore.metrics.admission.attempts);
      assert.deepEqual(await pixel(page, `${major}-${flags}-${dpr}-external`, 490, 110), [20, 200, 90, 255]);
      await page.locator("#label").click();
      await page.keyboard.press("End"); await page.keyboard.type("-external"); await page.keyboard.press("Enter");
      assert.equal(await page.locator("#saved").textContent(), "fresh independent native-external");
      await page.locator("h1").click();
      assert.equal((await page.evaluate(() => window.packageConsumer.state())).mode, "gpu");
      const externalMotion = await page.evaluate(() => window.packageConsumer.controller.animate("editor", { x: 35, y: 10 }, 30));
      for (const key of ["captures", "uploads", "pixelReadbacks"]) {
        assert.equal(externalMotion.after.metrics[key], externalMotion.before.metrics[key]);
      }
      await page.evaluate(async () => {
        const frame = document.querySelector("#frame");
        window.packageFrameParent.append(frame);
        frame.style.left = ""; frame.style.top = "";
        document.querySelector("#package-external").remove();
        document.body.style.minHeight = ""; document.body.style.minWidth = "";
        window.scrollTo(0, 0);
        window.packageConsumer.transform({ x: 30, y: 10 });
        await window.packageConsumer.controller.settle();
      });
      gpu = await nativeControls(page, "fresh independent native");
      externalScroll = { before: externalBefore, projected: externalState, motion: externalMotion,
        after: await page.evaluate(() => window.packageConsumer.state()) };
      assert.equal(await page.locator("#not-enrolled").isVisible(), true);
      await page.evaluate(() => window.packageConsumer.controller.disable());
      await waitState(page, "dom");
      recovery = await page.evaluate(() => window.packageConsumer.state());
      assert.ok(recovery.sameInput && recovery.sameRoot);
      assert.equal(recovery.value, "fresh independent native");
      assert.deepEqual(recovery.selection, [0, 1]);
      assert.equal(recovery.focus, "name");
      assert.equal(await page.locator("#native").inputValue(), "retained native");
      assert.deepEqual(await pixel(page, `${major}-${flags}-${dpr}-recovered`, 55, 255), domPixel);
      await nativeControls(page, `React${major} recovered`);
      const reentry = await page.evaluate(() => window.packageConsumer.controller.enable());
      assert.equal(reentry.mode, "gpu", reentry.reason);
      await waitState(page, "gpu");
      await page.evaluate(() => window.packageConsumer.controller.disable());
    } else {
      assert.equal(admission.mode, "dom");
      assert.match(admission.reason, /GPU admission failed:.*content/);
      await nativeControls(page, `React${major} refused`);
      assert.deepEqual(await pixel(page, `${major}-${flags}-${dpr}-refused`, 25, 245), domPixel);
    }
    await page.waitForFunction(() => window.packageConsumer.state().resources.engines === 0);
    const priorDisposal = await page.evaluate(() => window.packageConsumer.state());
    assert.equal(priorDisposal.mounts, startup.mounts, "Presentation must not remount React");
    assert.equal(priorDisposal.cleanups, startup.cleanups);
    await page.evaluate(() => window.packageConsumer.dispose());
    const disposed = await page.evaluate(() => window.packageConsumer.state());
    assert.ok(Object.values(disposed.resources).every(value => value === 0));
    assert.ok(Object.values(disposed.runtimeResources).every(value => value === 0));
    assert.equal(disposed.mounts, disposed.cleanups);
    assert.deepEqual(errors, flags ? [] : [admission.reason], "Only the exact unflagged admission diagnostic is expected");
    const interactions = process.env.CANVAS_INTERACTION_AUDIT === "1" && dpr === 1
      ? await interactionContract(context, url, { directory: evidence, name: `react${major}-${flags}`, flags }) : undefined;
    const dynamic = process.env.CANVAS_DYNAMIC_AUDIT === "1"
      ? await dynamicContract(context, url, { directory: evidence, name: `react${major}-${flags}-${dpr}`, flags, dpr }) : undefined;
    return { major, flags, dpr, identity, launch, capability, startup, dom, admission, gpu, recovery, domPixel, gpuPixel, externalScroll, disposed, errors, interactions, dynamic };
  } finally { await browser.close(); }
}

try {
  const dry = packResult(await run("npm", ["pack", "--dry-run", "--json"], library, "pack-dry"));
  const packed = packResult(await run("npm", ["pack", "--json", "--pack-destination", workspace], library, "pack-actual"));
  validatePackageContents(dry.files);
  validatePackageContents(packed.files);
  assert.deepEqual(dry.files, packed.files);
  assert.equal(dry.integrity, packed.integrity, "Repeated clean prepack builds must produce the same archive");
  const tarball = join(workspace, packed.filename);
  const tarPaths = execFileSync("tar", tarArgs(["-tzf", tarball]), { encoding: "utf8" }).trim().split(/\r?\n/).map(path => path.replace(/^package\//, ""));
  assert.deepEqual(tarPaths.sort(), packageFiles);
  results.package = { name: packed.name, version: packed.version, bytes: packed.size, unpackedBytes: packed.unpackedSize,
    sha256: hash(await readFile(tarball)), integrity: packed.integrity, files: packed.files, tarball: tarball.slice(root.length + 1) };
  for (const major of [18, 19]) {
    const cwd = join(workspace, `react${major}`);
    await mkdir(cwd);
    for (const file of ["index.html", "main.tsx", "public-types.ts", "tsconfig.json"]) await cp(`fixtures/package-consumer/${file}`, join(cwd, file));
    if (todoCase) {
      await cp("fixtures/package-consumer/todo-main.tsx", join(cwd, "main.tsx"));
      await writeFile(join(cwd, "index.html"), (await readFile("examples/playground/todo.html", "utf8")).replace("/src/demo/todo-demo.tsx", "/main.tsx"));
      await mkdir(join(cwd, "task"));
      for (const file of ["TodoApp.tsx", "model.ts", "transition.ts", "diagnostics.ts", "todo.css"]) {
        const authored = await readFile(`examples/playground/src/apps/todo/${file}`, "utf8");
        await writeFile(join(cwd, "task", file), authored
          .replaceAll('"./model"', '"./model.js"').replaceAll('"./TodoApp"', '"./TodoApp.js"'));
      }
    }
    const versions = major === 18 ? react18 : { dependencies: primary.devDependencies, devDependencies: primary.devDependencies };
    const manifest = { name: `underglass-installed-react${major}-consumer`, version: "0.0.0", private: true, type: "module",
      dependencies: { [releasePackage.name]: `file:${tarball}`, react: versions.dependencies.react, "react-dom": versions.dependencies["react-dom"],
        ...(todoCase ? { "@radix-ui/react-dialog": playground.dependencies["@radix-ui/react-dialog"] } : {}) },
      devDependencies: { "@types/react": versions.devDependencies["@types/react"], "@types/react-dom": versions.devDependencies["@types/react-dom"],
        typescript: primary.devDependencies.typescript, vite: primary.devDependencies.vite } };
    await writeFile(join(cwd, "package.json"), JSON.stringify(manifest, null, 2));
    if (reuseDependencies) {
      const dependencyRoots = [resolve("node_modules"), ...(major === 18 ? [resolve("fixtures/react18/node_modules")] : [])];
      for (const directory of dependencyRoots) await copyDependencies(directory, join(cwd, "node_modules"));
      const unpacked = join(cwd, "node_modules", releasePackage.name);
      await mkdir(unpacked);
      execFileSync("tar", tarArgs(["-xzf", tarball, "--strip-components=1", "-C", unpacked]));
      await writeFile(join(evidence, `react${major}-dependency-reuse.json`), JSON.stringify({
        mode: "No installation; independent physical dependencies without optimizer caches, physically extracted current child-package archive",
        dependencies: dependencyRoots.map(directory => directory.slice(root.length + 1)),
      }, null, 2));
    } else await run("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund"], cwd, `react${major}-install`);
    const require = createRequire(join(cwd, "package.json"));
    const installed = join(cwd, "node_modules", releasePackage.name);
    assert.equal((await lstat(installed)).isSymbolicLink(), false, "Must install tarball bytes, not a workspace alias");
    for (const path of packageFiles) {
      const bytes = await readFile(join(installed, path));
      assert.equal(hash(bytes), hash(await readFile(join(library, path))), `Installed bytes differ: ${path}`);
      assert.ok(!/\/Users\/|\/private\/|session-state|react-dom\/profiling|integrationProbe|runtimeProbe/.test(bytes.toString()), `Private/demo boundary: ${path}`);
    }
    const actual = {};
    for (const name of ["react", "react-dom", "@types/react", "@types/react-dom", "typescript", "vite", "@babylonjs/lite", "@types/webxr",
      ...(todoCase ? ["@radix-ui/react-dialog"] : [])]) {
      actual[name] = JSON.parse(await readFile(join(cwd, "node_modules", name, "package.json"), "utf8")).version;
    }
    for (const [name, version] of Object.entries({ ...manifest.dependencies, ...manifest.devDependencies, ...releasePackage.dependencies })) {
      if (name !== releasePackage.name) assert.equal(actual[name], version);
    }
    if (!reuseDependencies) await run("npm", ["ls", "--all", "--json"], cwd, `react${major}-dependency-tree`);
    const tsc = join(dirname(require.resolve("typescript/package.json")), "bin/tsc");
    await run(process.execPath, [tsc, "-p", "tsconfig.json"], cwd, `react${major}-types-bundler`);
    await run(process.execPath, [tsc, "-p", "tsconfig.json", "--module", "NodeNext", "--moduleResolution", "NodeNext"], cwd, `react${major}-types-nodenext`);
    await run(process.execPath, ["--input-type=module", "-e",
      `const api = await import(${JSON.stringify(releasePackage.name)}); if (typeof api.mountCanvasApp !== "function" || typeof api.defineEffect !== "function" || "CanvasRuntime" in api) throw Error("Invalid public entry"); console.log(Object.keys(api).sort());`],
    cwd, `react${major}-safe-import`);
    const vite = join(dirname(require.resolve("vite/package.json")), "bin/vite.js");
    await run(process.execPath, [vite, "build"], cwd, `react${major}-build`);
    const server = await startPreview(cwd, vite);
    const consumer = { major, actual, manifest, dependencyMode: reuseDependencies ? "existing-exact-resolutions" : "installed",
      lockSha256: reuseDependencies ? null : hash(await readFile(join(cwd, "package-lock.json"))), server: { port: new URL(server.url).port, pid: server.pid }, browsers: [] };
    results.consumers.push(consumer);
    try {
      for (const flags of [false, true]) for (const dpr of [1, 2]) {
        consumer.browsers.push(await (todoCase ? todoContract(server.url, major, actual.react, flags, dpr, evidence)
          : browserContract(server.url, major, actual.react, flags, dpr)));
        await writeFile(join(evidence, "report.json"), JSON.stringify(results, null, 2));
      }
    } finally { await server.stop(); }
    console.log(`React${major}: installed tarball, strict Bundler/NodeNext types, safe import, build, four actual browser/DPR contracts passed`);
  }
  const after = await fingerprints();
  assert.deepEqual(after, before, "Package validation must not change source, locks or curated history");
  results.protectedAfter = after;
  results.curatedProtected = curatedEvidence;
  results.status = "passed";
  console.log(`Package contents: ${packed.files.length} files, ${packed.size} packed / ${packed.unpackedSize} unpacked bytes. Evidence: ${evidence.slice(root.length + 1)}`);
} catch (error) {
  results.status = "failed";
  results.error = String(error);
  throw error;
} finally {
  await writeFile(join(evidence, "report.json"), JSON.stringify(results, null, 2));
  execFileSync(process.execPath, ["scripts/sanitize-evidence.mjs"], { cwd: root, env: { ...process.env, CANVAS_EVIDENCE_ROOT: evidence } });
}
