import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { cp, mkdir, readFile, writeFile, readdir } from "node:fs/promises";
import { join, resolve, basename, sep, relative } from "node:path";
import { pathToFileURL } from "node:url";
import { createServer } from "node:http";
import { createServer as createPortServer } from "node:net";
import { chromium } from "@playwright/test";
import { PNG } from "pngjs";
import { copyDependencies, assertPhysicalPath, assertPhysicalTree, assertBrowserIdentity } from "./release-policy.mjs";
import { verifyGPUSamplers } from "../tests/compiler/gpu-parity.mjs";
import { verifyNativeCSS } from "../tests/compiler/native-css-reference.mjs";
import { acceptedCSS, refusedCSS, referenceTimes } from "../tests/compiler/css-corpus.mjs";
import { browserLaunchOptions } from "../tests/helpers/browser.mjs";
import { withPlatform, devNull } from "../tests/helpers/process.mjs";

const root = resolve("."), parent = join(root, "evidence/compiler");
await assertPhysicalPath(root);
await mkdir(parent, { recursive: true });
await assertPhysicalPath(parent);
const run = join(parent, `run-${randomUUID()}`);
await mkdir(run);
console.log(run);
const tree = join(run, "workspace");
await mkdir(tree);
const report = { status: "running", run, commands: [], builds: [], native: [], limits: ["No performance claim", "No dev/HMR certification", "No publication"] };
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
let browser;
async function command(executable, args, cwd, label, expectedFailure = false, extraEnv = {}) {
  let output;
  let failed = false;
  try {
    output = execFileSync(...withPlatform(executable, args, { cwd, env: { ...process.env, ...extraEnv, npm_config_userconfig: devNull, PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: "1" }, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
    report.commands.push({ label, status: "passed" });
  } catch (error) {
    failed = true;
    output = `${error.stdout ?? ""}\n${error.stderr ?? ""}`;
    report.commands.push({ label, status: expectedFailure ? "expected-rejection" : "failed" });
    if (!expectedFailure) throw new Error(`${label}: ${output}`, { cause: error });
  } finally {
    await writeFile(join(run, `${label}.log`), output, { flag: "wx" });
  }
  if (expectedFailure) assert.equal(failed, true, `${label} unexpectedly accepted unsupported input`);
  return output;
}
async function installArchive(directory, archive, name) {
  const target = join(directory, "node_modules", name);
  await mkdir(target, { recursive: true });
  // Relative paths: GNU tar (Git Bash) reads a Windows drive letter as a remote host.
  await command("tar", ["-xzf", relative(directory, archive).split(sep).join("/"), "-C", relative(directory, target).split(sep).join("/"), "--strip-components=1"], directory, `extract-${name.replaceAll("/", "-")}-${basename(directory)}`);
}
async function serve(directory) {
  const server = createServer(async (request, response) => {
    try {
      const name = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
      const path = resolve(directory, `.${name === "/" ? "/index.html" : name}`);
      if (!path.startsWith(directory + sep)) { response.writeHead(403).end(); return; }
      const bytes = await readFile(path);
      response.setHeader("Content-Type", path.endsWith(".js") ? "text/javascript" : path.endsWith(".css") ? "text/css" : "text/html");
      response.end(bytes);
    } catch (error) {
      response.writeHead(error.code === "ENOENT" ? 404 : 500).end(String(error));
    }
  });
  await new Promise(done => server.listen(0, "127.0.0.1", done));
  const url = `http://127.0.0.1:${server.address().port}/`;
  assert.equal((await fetch(url)).status, 200);
  return { url, close: () => new Promise(done => server.close(done)) };
}
try {
  for (const path of ["packages", "fixtures/css-compiler", "tests/compiler", "package.json", "package-lock.json"]) {
    await cp(join(root, path), join(tree, path), { recursive: true, filter: path => !["node_modules", "dist"].includes(basename(path)) });
  }
  await copyDependencies(join(root, "node_modules"), join(tree, "node_modules"));
  await assertPhysicalTree(tree);
  const node = process.execPath, vite = join(tree, "node_modules/vite/bin/vite.js"), tsc = join(tree, "node_modules/typescript/bin/tsc");
  const library = join(tree, "packages/underglass");
  await command(node, [vite, "build"], library, "library-build");
  await command(node, [tsc, "-p", "tsconfig.json"], library, "library-types");
  const archives = join(run, "archives");
  await mkdir(archives);
  for (const [name, source] of [
    ["library", library], ["compiler", join(tree, "packages/css-compiler")],
    ["component", join(tree, "fixtures/css-compiler/component-package")],
  ]) {
    await command("npm", ["pack", "--ignore-scripts", "--pack-destination", archives, "--json"], source, `pack-${name}`);
  }
  const archiveNames = await readdir(archives);
  const archive = prefix => join(archives, archiveNames.find(name => name.startsWith(prefix)));
  await installArchive(tree, archive("underglass-react"), "@underglass/react");
  await installArchive(tree, archive("underglass-css-compiler"), "@underglass/css-compiler");
  await command(node, ["--test", "tests/compiler/compiler.test.mjs", "tests/compiler/conformance.test.mjs"], tree, "compiler-units");
  const { compileStylesheet } = await import(pathToFileURL(join(tree, "packages/css-compiler/src/index.mjs")).href);
  const { generateModule } = await import(pathToFileURL(join(tree, "packages/css-compiler/src/generate.mjs")).href);
  const corpus = acceptedCSS.map(fixture => {
    const animations = compileStylesheet(fixture.css, [fixture.entry], { modules: fixture.modules });
    return { ...fixture, animation: animations[0], source: generateModule(animations, 1), times: referenceTimes(animations[0]) };
  });
  const parityBatches = [];
  for (let offset = 0; offset < corpus.length; offset += 16) {
    const batch = corpus.slice(offset, offset + 16);
    parityBatches.push({ source: generateModule(batch.map((fixture, index) => ({
      ...fixture.animation, id: `sample${index}/motion`,
    })), 1), times: batch.map(fixture => fixture.times) });
  }
  report.corpus = { accepted: acceptedCSS.map(fixture => fixture.label), refused: refusedCSS.map(fixture => fixture.label),
    nativeBoundaryOffsetMilliseconds: 0.01, matrixOpacityTolerance: 0.0005, translationTolerancePixels: 0.02,
    clockLimit: "One-microsecond native CSS seeks are retained as clock diagnostics, not interpolation-equivalence assertions." };
  await writeFile(join(tree, "compiler-types.ts"), `import {createCompiler,compileStylesheet,type CompilerConfig} from "@underglass/css-compiler";
    import {underglass} from "@underglass/css-compiler/vite";import {UnderglassPlugin} from "@underglass/css-compiler/webpack";
    import type {CompiledProgramSet} from "@underglass/react";import "@underglass/css-compiler/client";
    import compiled from "virtual:underglass/compiled";const valid:CompiledProgramSet=compiled;
    const config:CompilerConfig={version:1,target:"webgpu",unsupported:"error",entries:[]};
    createCompiler(config);compileStylesheet("",config.entries);underglass();new UnderglassPlugin();void valid;`);
  await command(node, [tsc, "--noEmit", "--strict", "--skipLibCheck", "--module", "NodeNext", "--moduleResolution", "NodeNext", "--target", "ES2022", "compiler-types.ts"], tree, "compiler-public-types");
  const applications = [];
  for (const bundler of ["vite", "webpack"]) {
    const app = join(tree, bundler);
    await cp(join(tree, "fixtures/css-compiler/app"), app, { recursive: true });
    await writeFile(join(app, "package.json"), '{"private":true,"type":"module"}\n');
    await installArchive(app, archive("underglass-fixture-card"), "@underglass/fixture-card");
    const packageBefore = hash(await readFile(join(app, "node_modules/@underglass/fixture-card/card.module.scss")));
    if (bundler === "vite") {
      await command(node, [vite, "build"], app, "vite-package-scss");
      const maps = (await readdir(join(app, "dist/assets"))).filter(name => name.endsWith(".js.map"));
      assert.ok(maps.length);
      const sources = [];
      for (const name of maps) {
        const map = JSON.parse(await readFile(join(app, "dist/assets", name), "utf8"));
        assert.ok(map.mappings.length);
        sources.push(...map.sources);
      }
      assert.ok(sources.some(source => source.endsWith("main.mjs")));
    } else {
      await writeFile(join(app, "webpack.config.mjs"), `import {UnderglassPlugin} from "@underglass/css-compiler/webpack";
        export default {mode:"production",context:import.meta.dirname,entry:"./main.mjs",
          output:{path:import.meta.dirname+"/dist",filename:"main.js"},
          plugins:[new UnderglassPlugin()],module:{rules:[{test:/\\.scss$/,use:[
            {loader:"css-loader",options:{sourceMap:true,modules:{namedExport:false}}},
            {loader:"postcss-loader",options:{sourceMap:true,postcssOptions:{config:import.meta.dirname+"/postcss.config.mjs"}}},
            {loader:"sass-loader",options:{sourceMap:true}}
          ]}]}};`);
      const webpack = await import(pathToFileURL(join(tree, "node_modules/webpack/lib/index.js")).href);
      const configuration = (await import(pathToFileURL(join(app, "webpack.config.mjs")).href)).default;
      const compiler = webpack.default(configuration);
      try {
        await new Promise((done, reject) => compiler.run((error, stats) => {
          if (error || stats.hasErrors()) reject(error ?? new Error(stats.toString({ all: false, errors: true }))); else done();
        }));
      } finally { await new Promise((done, reject) => compiler.close(error => error ? reject(error) : done())); }
      await writeFile(join(app, "dist/index.html"), (await readFile(join(app, "index.html"), "utf8")).replace('type="module" src="./main.mjs"', 'src="./main.js"'));
    }
    assert.equal(hash(await readFile(join(app, "node_modules/@underglass/fixture-card/card.module.scss"))), packageBefore);
    applications.push({ bundler, app, dist: join(app, "dist") });
    report.builds.push({ bundler, packageScssUnchanged: true });
  }
  const negative = join(tree, "negative");
  await cp(applications[0].app, negative, { recursive: true });
  await writeFile(join(negative, "local.scss"), (await readFile(join(negative, "local.scss"), "utf8")).replace("opacity: 0.8;", "opacity: 0.8; filter: blur(3px);"));
  const diagnostic = await command(node, [vite, "build"], negative, "unsupported-source-location", true);
  assert.match(diagnostic, /local\.scss/);
  assert.match(diagnostic, /Only complete transform\/opacity/);
  const badConfig = JSON.parse(await readFile(join(negative, "underglass.config.json"), "utf8"));
  badConfig.entries[0].stylesheet = "@underglass/fixture-card/not-exported.scss";
  await writeFile(join(negative, "underglass.config.json"), JSON.stringify(badConfig));
  const unavailable = await command(node, [vite, "build"], negative, "unavailable-package-export", true);
  assert.match(unavailable, /not-exported|unavailable/);
  await cp(join(applications[1].app, "webpack.config.mjs"), join(negative, "webpack.config.mjs"));
  await cp(join(applications[1].app, "underglass.config.json"), join(negative, "underglass.config.json"));
  const unsupportedLoader = await command(node, ["--input-type=module", "-e", `import webpack from "webpack";import config from "./webpack.config.mjs";
    config.module={rules:[{test:/\\.scss$/,type:"asset/source"}]};
    const compiler=webpack(config);compiler.run((error,stats)=>compiler.close(()=>{if(error)throw error;if(stats.hasErrors())throw new Error(stats.toString({all:false,errors:true}));}));`],
    negative, "unsupported-webpack-loader", true);
  assert.match(unsupportedLoader, /processed CSS through css-loader/);
  browser = await chromium.launch(browserLaunchOptions());
  for (const application of applications) {
    const server = await serve(application.dist);
    const context = await browser.newContext({ viewport: { width: 900, height: 700 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const errors = [], observations = { bundler: application.bundler };
    const consoleErrors = [];
    observations.console = consoleErrors;
    page.on("console", message => { if (message.type() === "error") consoleErrors.push(message.text()); });
    page.on("pageerror", error => errors.push(String(error)));
    report.native.push(observations);
    try {
      const cdp = await context.newCDPSession(page);
      observations.actual = await cdp.send("Browser.getVersion");
      observations.argv = await cdp.send("Browser.getBrowserCommandLine");
      await writeFile(join(run, `${application.bundler}-browser.json`), JSON.stringify(observations, null, 2), { flag: "wx" });
      assertBrowserIdentity(observations.actual);
      await page.goto(server.url);
      await page.waitForFunction(() => window.compilerDemo);
      observations.generatedTargets = await page.evaluate(() => window.compilerDemo.compiled.animations.map(animation => animation.id));
      assert.deepEqual(observations.generatedTargets, ["card/float", "local/pulse"]);
      observations.nativeCSS = await verifyNativeCSS(page, corpus.map(({ label, css, source, times }) => ({ label, css, source, times })));
      observations.parity = { count: 0, maximumError: 0, stylesheetCases: corpus.length };
      for (const batch of parityBatches) {
        const result = await verifyGPUSamplers(page, batch.source, batch.times);
        observations.parity.count += result.count;
        observations.parity.maximumError = Math.max(observations.parity.maximumError, result.maximumError);
      }
      assert.ok(observations.parity.count > corpus.length * 5000);
      const state = () => page.evaluate(() => window.compilerDemo.state());
      observations.initial = await state();
      assert.equal(observations.initial.mode, "dom");
      await page.evaluate(() => {
        window.trustedEvents = [];
        for (const event of ["click", "input", "keydown", "submit"]) document.addEventListener(event, value => window.trustedEvents.push({ type: event, trusted: value.isTrusted, id: value.target.id }));
      });
      await page.evaluate(() => window.compilerDemo.enable());
      observations.enable = await state();
      observations.prepared = await page.evaluate(() => window.compilerDemo.prepared);
      observations.messages = await page.evaluate(() => window.compilerMessages);
      assert.equal(observations.enable.mode, "gpu", observations.enable.reason);
      await page.waitForFunction(() => window.compilerDemo.state().mode === "gpu" && !window.compilerDemo.state().initializing);
      observations.admitted = await state();
      assert.equal(observations.admitted.metrics.shaderSourceGenerations, 0);
      assert.ok(observations.admitted.metrics.precompiledShaderSelections > 0);
      assert.equal(observations.admitted.animationOwnership[0].detached, true);
      const image = async name => {
        const bytes = await page.locator("#gpu").screenshot();
        await writeFile(join(run, `${application.bundler}-${name}.png`), bytes, { flag: "wx" });
        return PNG.sync.read(bytes);
      };
      const first = await image("start");
      await page.evaluate(() => window.compilerDemo.playback().seek(600));
      await page.waitForTimeout(100);
      const second = await image("seek");
      let changed = 0;
      for (let i = 0; i < first.data.length; i += 4) if (first.data.subarray(i, i + 3).some((value, offset) => Math.abs(value - second.data[i + offset]) > 16)) changed++;
      assert.ok(changed > 1000, `Actual generated shader output did not move: ${changed}`);
      observations.motionPixels = changed;
      const trustedClick = async selector => {
        const point = await page.locator(selector).evaluate(element => {
          const rectangle = element.getBoundingClientRect();
          const x = rectangle.x + rectangle.width / 2, y = rectangle.y + rectangle.height / 2;
          if (document.elementFromPoint(x, y) !== element) throw new Error(`Native hit mismatch: ${element.id}`);
          return { x, y };
        });
        await page.mouse.click(point.x, point.y);
      };
      await trustedClick("#glyph");
      await page.waitForFunction(() => document.querySelector("#title").textContent === "IIIIIIII");
      await page.waitForTimeout(100);
      const glyph = await image("glyph");
      let glyphPixels = 0;
      for (let i = 0; i < second.data.length; i += 4) if (second.data.subarray(i, i + 3).some((value, offset) => Math.abs(value - glyph.data[i + offset]) > 16)) glyphPixels++;
      assert.ok(glyphPixels > 100, "Actual owning texture glyph did not update");
      observations.glyphPixels = glyphPixels;
      await trustedClick("#input");
      await page.keyboard.press("ControlOrMeta+a");
      await page.keyboard.type("Package edited through native GPU");
      await trustedClick("#save");
      await page.waitForFunction(() => document.querySelector("#saved").textContent === "Package edited through native GPU");
      await page.evaluate(() => window.compilerDemo.controller.settle());
      await page.waitForTimeout(400);
      const before = await state();
      await page.evaluate(() => window.compilerDemo.playback().play());
      await page.waitForTimeout(250);
      const after = await state();
      await page.evaluate(() => window.compilerDemo.playback().pause());
      assert.equal(after.commits, before.commits);
      assert.ok(after.metrics.gpuFrames > before.metrics.gpuFrames);
      assert.equal(after.metrics.captures, before.metrics.captures);
      assert.equal(after.metrics.uploads, before.metrics.uploads);
      observations.reuse = { before, after };
      await page.evaluate(() => window.compilerDemo.playback().play());
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.waitForFunction(() => window.compilerDemo.state().environment.reducedMotion && !window.compilerDemo.playback().state().playing);
      observations.reducedMotion = await state();
      assert.equal(observations.reducedMotion.mode, "gpu");
      await page.emulateMedia({ reducedMotion: "no-preference" });
      await trustedClick("#input");
      await page.keyboard.press("Home");
      await page.keyboard.press("Shift+ArrowRight");
      const focused = await state();
      await page.evaluate(() => window.compilerDemo.controller.disable());
      const rolled = await state();
      assert.equal(rolled.mode, "dom");
      assert.equal(rolled.sameInput, true); assert.equal(rolled.sameRoot, true);
      assert.equal(rolled.focus, focused.focus); assert.deepEqual(rolled.selection, focused.selection);
      assert.equal(rolled.value, focused.value);
      observations.restoredCSS = await page.locator("#card").evaluate(element => element.getAnimations().map(animation => ({
        name: animation.animationName, state: animation.playState, time: animation.currentTime,
      })));
      assert.equal(observations.restoredCSS.length, 1);
      assert.equal(observations.restoredCSS[0].state, "paused");
      await page.evaluate(() => window.compilerDemo.enable());
      assert.equal((await state()).mode, "gpu");
      await page.evaluate(() => window.compilerDemo.controller.dispose());
      observations.disposed = await state();
      assert.ok(Object.values(observations.disposed.resources).every(value => value === 0));
      assert.ok(Object.values(observations.disposed.runtimeResources).every(value => value === 0));
      observations.events = await page.evaluate(() => window.trustedEvents);
      assert.ok(observations.events.some(value => value.type === "click" && value.id === "save" && value.trusted));
      assert.ok(observations.events.some(value => value.type === "input" && value.trusted));
      await page.reload();
      await page.waitForFunction(() => window.compilerDemo);
      await page.evaluate(() => window.compilerDemo.enable());
      assert.equal((await state()).mode, "gpu");
      await page.evaluate(async () => {
        const style = document.querySelector("#card").style;
        style.animationName = "app-replacement";
        style.transform = "translate(14px, 9px)";
        style.opacity = "0.4";
        await window.compilerDemo.controller.disable();
      });
      observations.laterAuthored = await page.locator("#card").evaluate(element => ({
        name: element.style.animationName, transform: element.style.transform, opacity: element.style.opacity,
      }));
      assert.deepEqual(observations.laterAuthored, { name: "app-replacement", transform: "translate(14px, 9px)", opacity: "0.4" });
      assert.equal((await state()).runtimeResources.animationOwners, 0);
      await page.evaluate(() => window.compilerDemo.controller.dispose());
      assert.ok(Object.values((await state()).resources).every(value => value === 0));
      assert.ok(Object.values((await state()).runtimeResources).every(value => value === 0));
      assert.deepEqual(errors, []);
      assert.deepEqual(observations.console, []);
      observations.console = consoleErrors.slice();
      consoleErrors.length = 0;
      await page.reload();
      await page.waitForFunction(() => window.compilerDemo);
      await page.evaluate(() => { window.compilerDemo.compiled.programs[0].fragmentWGSL = "invalid WGSL"; });
      await page.evaluate(() => window.compilerDemo.enable());
      const invalidProgram = await state();
      assert.equal(invalidProgram.mode, "dom");
      assert.match(invalidProgram.reason, /compilation failed/);
      assert.equal(invalidProgram.runtimeResources.animationOwners, 0);
      assert.equal(invalidProgram.resources.engines, 0);
      assert.equal(invalidProgram.sameInput, true);
      await page.locator("#input").fill("Usable after shader refusal");
      await page.locator("#save").click();
      await page.waitForFunction(() => document.querySelector("#saved").textContent === "Usable after shader refusal");
      await page.evaluate(() => window.compilerDemo.controller.dispose());
      observations.invalidProgram = { refusal: invalidProgram, disposed: await state() };
      assert.ok(Object.values(observations.invalidProgram.disposed.resources).every(value => value === 0));
      assert.ok(Object.values(observations.invalidProgram.disposed.runtimeResources).every(value => value === 0));
      await context.addInitScript(() => Object.defineProperty(navigator, "gpu", { value: undefined }));
      await page.reload();
      await page.waitForFunction(() => window.compilerDemo);
      await page.evaluate(() => window.compilerDemo.enable());
      observations.syntheticAbsentGPU = await state();
      assert.equal(observations.syntheticAbsentGPU.mode, "dom");
      assert.equal(observations.syntheticAbsentGPU.runtimeResources.animationOwners, 0);
      assert.match(observations.syntheticAbsentGPU.reason, /WebGPU|GPU|capability|support/i);
      await page.locator("#input").fill("Usable without WebGPU");
      await page.locator("#save").click();
      await page.waitForFunction(() => document.querySelector("#saved").textContent === "Usable without WebGPU");
      await page.evaluate(() => window.compilerDemo.controller.dispose());
      observations.syntheticDisposed = await state();
      assert.ok(Object.values(observations.syntheticDisposed.resources).every(value => value === 0));
      assert.ok(Object.values(observations.syntheticDisposed.runtimeResources).every(value => value === 0));
      observations.expectedFailureConsole = consoleErrors.slice();
      assert.equal(consoleErrors.length, 2);
      assert.match(consoleErrors[0], /Application effect compilation failed/);
      assert.match(consoleErrors[1], /WebGPU unavailable/);
      assert.deepEqual(errors, []);
    } finally { await context.close(); await server.close(); }
  }
  await browser.close();
  browser = undefined;
  if (process.argv.includes("--runtime-regression")) {
    for (const path of ["examples", "tests", "scripts", "fixtures/react18", "vite.config.ts", "README.md", "docs", ".github/workflows"]) {
      await cp(join(root, path), join(tree, path), { recursive: true,
        filter: path => !["node_modules", "dist", "owned-vite-cache"].includes(basename(path)) });
    }
    const helper = join(tree, "tests/helpers/current-browser.mjs");
    const original = await readFile(helper, "utf8");
    assert.match(original, /await use\(identity\);/);
    await writeFile(helper, `import {assertBrowserIdentity} from "../../scripts/release-policy.mjs";\n${original.replace("await use(identity);", "assertBrowserIdentity(identity); await use(identity);")}`);
    const units = (await readdir(join(tree, "tests/unit"))).filter(path => path.endsWith(".unit.test.mjs")).map(path => `tests/unit/${path}`);
    await command(node, ["--test", ...units], tree, "runtime-units");
    await command(node, [tsc, "-p", "examples/playground/tsconfig.json", "--noEmit"], tree, "playground-types");
    await command(node, [vite, "build"], tree, "playground-build");
    const port = async () => {
      const server = createPortServer();
      await new Promise((done, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", done); });
      const value = server.address().port;
      await new Promise(done => server.close(done));
      return value;
    };
    const preview = await port(), development = await port();
    const output = await command(node, ["scripts/test-browser.mjs", "animation.test.mjs", "recovery.test.mjs", "runtime.test.mjs"],
      tree, "runtime-browser-regression", false, {
        CANVAS_TEST_PREVIEW_URL: `http://127.0.0.1:${preview}`,
        CANVAS_TEST_DEV_URL: `http://127.0.0.1:${development}`,
        CANVAS_EVIDENCE_ROOT: `evidence/regression/current/compiler-${randomUUID()}`,
      });
    assert.match(output, /passed/);
    report.runtimeRegression = "Passed existing animation/recovery/runtime suites in a new physical execution tree; copied identity helper additionally enforces the exact Canary pin";
  }
  report.status = "passed";
} catch (error) {
  report.status = "failed"; report.error = String(error);
  throw error;
} finally {
  if (browser) await browser.close();
  await writeFile(join(run, "report.json"), JSON.stringify(report, null, 2), { flag: "wx" });
}
