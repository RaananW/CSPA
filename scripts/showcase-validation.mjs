import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { cp, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve, basename } from "node:path";
import { createServer } from "node:net";
import { chromium } from "@playwright/test";
import { PNG } from "pngjs";
import { browserLaunchOptions } from "../tests/helpers/browser.mjs";
import { copyDependencies, assertBrowserIdentity, assertRuntimePeer, assertPhysicalPath, assertPhysicalTree, qualifiedBrowser } from "./release-policy.mjs";
import { devNull } from "../tests/helpers/process.mjs";

const root = resolve(".");
const sha = data => createHash("sha256").update(data).digest("hex");
const parent = join(root, "evidence/showcase");
execFileSync("git", ["check-ignore", parent]);
await assertPhysicalPath(root);
await assertPhysicalPath(join(root, "evidence"));
try { await assertPhysicalPath(parent); } catch (error) { if (error.code !== "ENOENT") throw error; }
await mkdir(parent, { recursive: true });
await assertPhysicalPath(parent);
const run = join(parent, `run-${randomUUID()}`);
await mkdir(run);
const tree = join(run, "workspace");
await mkdir(tree);
const result = { status: "running", head: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  qualifiedBrowser, commands: [], browsers: [], hosted: "NOT EXECUTED", directory: run };
const inputs = [];
async function inventory(path) {
  for (const entry of (await readdir(join(root, path), { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    if (["node_modules", "dist"].includes(entry.name)) continue;
    const file = `${path}/${entry.name}`;
    if (entry.isDirectory()) await inventory(file);
    else inputs.push({ path: file, sha256: sha(await readFile(join(root, file))) });
  }
}
for (const path of ["packages", "examples", "scripts", "tests"]) await inventory(path);
for (const path of ["package.json", "package-lock.json", "docs/distribution.md", "docs/showcase.md", ".github/workflows/showcase-pages.yml"]) {
  inputs.push({ path, sha256: sha(await readFile(join(root, path))) });
}
await writeFile(join(run, "inputs.json"), JSON.stringify(inputs, null, 2), { flag: "wx" });
async function command(args, cwd, label) {
  const child = spawn(process.execPath, args, { cwd, env: { ...process.env, npm_config_userconfig: devNull,
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: "1" }, stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  for (const stream of [child.stdout, child.stderr]) stream.on("data", data => { output += data; });
  const code = await new Promise((done, reject) => { child.once("error", reject); child.once("close", done); });
  await writeFile(join(run, `${label}.log`), output, { flag: "wx" });
  result.commands.push({ args, cwd, label, code });
  assert.equal(code, 0, `${label}: ${output.slice(-4000)}`);
}
let server;
let serverClosed;
let serverOutput = "";
try {
  for (const path of ["packages", "examples", "scripts", "tests", "package.json", "package-lock.json", "docs/distribution.md", "docs/showcase.md",
    ".github/workflows/showcase-pages.yml"]) {
    await cp(join(root, path), join(tree, path), { recursive: true,
      filter: path => !["node_modules", "dist", "owned-vite-cache"].includes(basename(path)) });
  }
  await mkdir(join(tree, "fixtures/react18"), { recursive: true });
  for (const path of ["package.json", "package-lock.json"]) await cp(join(root, "fixtures/react18", path), join(tree, "fixtures/react18", path));
  await copyDependencies(join(root, "node_modules"), join(tree, "node_modules"));
  await assertPhysicalTree(tree);
  const vite = join(tree, "node_modules/vite/bin/vite.js");
  const tsc = join(tree, "node_modules/typescript/bin/tsc");
  const library = join(tree, "packages/underglass");
  const site = join(tree, "examples/showcase");
  await command(["--test", "tests/unit/showcase.unit.test.mjs", "tests/unit/workspace.unit.test.mjs", "tests/unit/release.unit.test.mjs"], tree, "focused-units");
  await command([vite, "build"], library, "library-build");
  await command([tsc, "-p", "tsconfig.json"], library, "library-declarations");
  const publicLibrary = join(tree, "node_modules/@underglass/react");
  await mkdir(publicLibrary, { recursive: true });
  await cp(join(library, "package.json"), join(publicLibrary, "package.json"));
  await cp(join(library, "dist"), join(publicLibrary, "dist"), { recursive: true });
  await command([tsc, "--noEmit"], site, "showcase-types");
  await command([vite, "build"], site, "showcase-project-build");
  await command([join(tree, "scripts/check-showcase-assets.mjs")], site, "showcase-output-guard");
  const dist = join(site, "dist");
  const assets = [];
  async function checkAssets(directory, prefix = "") {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name), name = `${prefix}${entry.name}`;
      if (entry.isDirectory()) { assert.equal(name, "assets"); await checkAssets(path, "assets/"); }
      else {
        // Hashed JS/CSS plus the JPEG previews of GPU mode shown to browsers that cannot run it.
        assert.ok(name === "index.html" || /^assets\/[\w-]+\.(js|css|jpg)$/.test(name), `Unexpected public asset: ${name}`);
        const bytes = await readFile(path);
        if (name.endsWith(".jpg")) assert.ok(bytes[0] === 0xff && bytes[1] === 0xd8, `Public image is not a JPEG: ${name}`);
        else assert.ok(!/\/Users\/|session-state|evidence\/phase|PRIVATE KEY|sourceMappingURL/.test(bytes.toString()), `Private asset leak: ${name}`);
        assets.push({ path: name, bytes: bytes.length, sha256: sha(bytes) });
      }
    }
  }
  await checkAssets(dist);
  result.assets = assets;
  const html = await readFile(join(dist, "index.html"), "utf8");
  assert.match(html, /\/underglass\/assets\//);
  const socket = createServer();
  await new Promise(done => socket.listen(0, "127.0.0.1", done));
  const port = socket.address().port;
  await new Promise(done => socket.close(done));
  server = spawn(process.execPath, [vite, "preview", "--host", "127.0.0.1", "--port", String(port), "--strictPort"], { cwd: site, stdio: ["ignore", "pipe", "pipe"] });
  serverClosed = new Promise(done => server.once("close", done));
  for (const stream of [server.stdout, server.stderr]) stream.on("data", data => { serverOutput += data; });
  result.preview = { pid: server.pid, port };
  const url = `http://127.0.0.1:${port}/underglass/`;
  for (let attempt = 0;; attempt++) {
    try { assert.equal((await fetch(url)).status, 200); break; }
    catch (error) { if (attempt === 99 || server.exitCode !== null) throw error; await new Promise(done => setTimeout(done, 100)); }
  }
  for (const asset of html.matchAll(/(?:src|href)="(\/underglass\/assets\/[^"]+)"/g)) {
    assert.equal((await fetch(`http://127.0.0.1:${port}${asset[1]}`)).status, 200);
  }
  for (const lane of ["dom", "native"]) {
    const executablePath = process.env.CANVAS_BROWSER_EXECUTABLE;
    result.executable = executablePath ? { path: executablePath, sha256: sha(await readFile(executablePath)) } : { channel: "chrome-canary" };
    const browser = await chromium.launch(browserLaunchOptions({ native: lane === "native" ? true : "none" }));
    const record = { lane, status: "running" };
    result.browsers.push(record);
    try {
      const context = await browser.newContext({ viewport: { width: 1280, height: 1100 }, deviceScaleFactor: 1 });
      const page = await context.newPage();
      const cdp = await context.newCDPSession(page);
      record.actual = await cdp.send("Browser.getVersion");
      record.argv = await cdp.send("Browser.getBrowserCommandLine");
      await writeFile(join(run, `${lane}-actual.json`), JSON.stringify(record, null, 2), { flag: "wx" });
      assertBrowserIdentity(record.actual);
      const errors = [];
      page.on("pageerror", error => errors.push(String(error)));
      await page.goto(`${url}#/layers`);
      await page.waitForFunction(() => window.showcase);
      record.peer = await page.evaluate(() => ({ react: window.showcase.react, reactDOM: window.showcase.reactDOM }));
      assertRuntimePeer(record.peer, "19.3.0");
      await page.getByLabel("Find an example").fill("no matching term");
      await page.getByText("No matching examples. Try another search or category.").waitFor();
      await page.getByLabel("Find an example").fill("");
      await page.getByLabel("Category", { exact: true }).selectOption("Motion");
      assert.equal(await page.locator(".example-card").count(), 1);
      await page.getByLabel("Category", { exact: true }).selectOption("All");
      const state = () => page.evaluate(() => window.showcase.state());
      const studioButton = name => page.locator(".stage button").filter({ hasText: new RegExp(`^${name}$`) });
      const settle = async () => { await page.evaluate(() => window.showcase.controller.settle()); await page.waitForTimeout(250); };
      if (lane === "native") {
        await page.getByRole("button", { name: "Enable experimental GPU", exact: true }).click();
        await page.waitForFunction(() => !window.showcase.state().initializing);
      }
      record.initial = await state();
      assert.equal(record.initial.mode, lane === "native" ? "gpu" : "dom", record.initial.reason);
      assert.ok(record.initial.reason.length > 0);
      const wideTitle = "W".repeat(32), narrowTitle = "I".repeat(32);
      await page.locator("#studio-title").fill(wideTitle);
      await studioButton("Save postcard").click();
      await settle();
      await page.locator("#saved-title").filter({ hasText: wideTitle }).waitFor();
      record.afterSave = await state();
      assert.equal(record.afterSave.mode, lane === "native" ? "gpu" : "dom", record.afterSave.reason);
      const output = page.locator(".stage .output");
      let first;
      if (lane === "native") first = PNG.sync.read(await output.screenshot({ path: join(run, "native-title-W.png") }));
      await page.locator("#studio-title").fill(narrowTitle);
      await studioButton("Save postcard").click();
      await settle();
      if (lane === "native") {
        const second = PNG.sync.read(await output.screenshot({ path: join(run, "native-title-I.png") }));
        let changed = 0;
        for (let y = 92; y < 160; y++) for (let x = 406; x < 700; x++) {
          const offset = (y * second.width + x) * 4;
          if (first.data.subarray(offset, offset + 4).some((v, i) => v !== second.data[offset + i])) changed++;
        }
        assert.ok(changed > 100, `Owning changed title pixels: ${changed}`);
        record.changedTitlePixels = changed;
      }
      assert.equal(await page.locator("#saved-title").innerText(), narrowTitle);
      assert.equal((await state()).mode, lane === "native" ? "gpu" : "dom");
      const title = page.locator("#studio-title");
      await title.focus();
      await title.evaluate(node => { window.showcaseOriginal = node; node.setSelectionRange(1, 3); });
      await page.evaluate(() => window.showcase.controller.disable());
      assert.deepEqual(await title.evaluate(node => ({ original: node === window.showcaseOriginal, value: node.value,
        focused: document.activeElement === node, selection: [node.selectionStart, node.selectionEnd] })),
      { original: true, value: narrowTitle, focused: true, selection: [1, 3] });
      if (lane === "native") { await page.evaluate(() => window.showcase.controller.enable()); assert.equal((await state()).mode, "gpu"); }
      await page.locator('.example-card[href="#/motion"]').click();
      await studioButton("Play layer journey").waitFor();
      await settle();
      let staticMotion;
      if (lane === "native") staticMotion = PNG.sync.read(await output.screenshot({ path: join(run, "native-motion-start.png") }));
      await studioButton("Play layer journey").click();
      await page.waitForTimeout(300);
      record.motion = await state();
      record.motionFeedback = await page.locator("#studio-feedback").innerText();
      assert.ok(record.motion.runtimeResources.declarativeMotions > 0, `Motion must have a real runtime owner: ${record.motionFeedback}`);
      assert.equal(record.motion.mode, lane === "native" ? "gpu" : "dom");
      const moving = record.motion.layers.find(layer => layer.id === "showcase-card").transform;
      assert.ok(Math.abs(moving.x ?? 0) > 1 || Math.abs(moving.y ?? 0) > 1 || Math.abs(moving.rotation ?? 0) > 1
        || Math.abs((moving.scaleX ?? 1) - 1) > .01, `Journey must move the card: ${JSON.stringify(moving)}`);
      if (lane === "native") {
        const animated = PNG.sync.read(await output.screenshot({ path: join(run, "native-motion-active.png") }));
        let changed = 0;
        for (let y = 36; y < 325; y++) for (let x = 350; x < 735; x++) {
          const offset = (y * animated.width + x) * 4;
          if (staticMotion.data.subarray(offset, offset + 4).some((v, i) => v !== animated.data[offset + i])) changed++;
        }
        assert.ok(changed > 100, `Owned motion changed output pixels: ${changed}`);
        record.changedMotionPixels = changed;
        await page.evaluate(() => window.showcase.controller.settle());
        record.motionWindow = await page.evaluate(async () => {
          const before = window.showcase.state(), started = performance.now();
          await new Promise(resolve => setTimeout(resolve, 250));
          return { before, after: window.showcase.state(), elapsedMs: performance.now() - started };
        });
        const { before, after } = record.motionWindow;
        assert.equal(after.mode, "gpu");
        assert.ok(after.metrics.gpuFrames > before.metrics.gpuFrames, "GPU motion must advance real frames");
        assert.notEqual(after.layers.find(layer => layer.id === "showcase-card").transform.x,
          before.layers.find(layer => layer.id === "showcase-card").transform.x, "Owned motion must advance the layer");
        for (const metric of ["captures", "uploads"]) {
          assert.equal(after.metrics[metric], before.metrics[metric], `Settled GPU-only motion must reuse ${metric}`);
        }
      }
      await page.waitForTimeout(1700);
      await page.locator('.example-card[href="#/effects"]').click();
      await studioButton("Apply chromatic effect").waitFor();
      await settle();
      let staticArt;
      if (lane === "native") staticArt = PNG.sync.read(await output.screenshot({ path: join(run, "native-static-art.png") }));
      await studioButton("Apply chromatic effect").click();
      await settle();
      record.effect = await state();
      assert.equal(record.effect.mode, lane === "native" ? "gpu" : "dom");
      assert.ok(record.effect.runtimeResources.decorativeEffects > 0);
      assert.equal(await page.locator("#showcase-art").evaluate(node => node.inert && node.getAttribute("aria-hidden") === "true"), true);
      const hit = await title.evaluate(node => { const r = node.getBoundingClientRect(); return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.id; });
      assert.equal(hit, "studio-title");
      await title.evaluate(node => {
        node.addEventListener("click", event => { window.showcaseTrustedClick = event.isTrusted; }, { once: true });
      });
      const rect = await title.boundingBox();
      assert.ok(rect);
      await page.mouse.click(rect.x + rect.width / 2, rect.y + rect.height / 2);
      await page.keyboard.press("ControlOrMeta+a");
      await page.keyboard.type("Native edit!");
      assert.equal(await title.inputValue(), "Native edit!");
      assert.equal(await page.evaluate(() => window.showcaseTrustedClick), true);
      if (lane === "native") {
        const changedArt = PNG.sync.read(await output.screenshot({ path: join(run, "native-effect.png") }));
        let changed = 0;
        for (let y = 330; y < 480; y++) for (let x = 378; x < 728; x++) {
          const offset = (y * changedArt.width + x) * 4;
          if (staticArt.data.subarray(offset, offset + 4).some((v, i) => v !== changedArt.data[offset + i])) changed++;
        }
        assert.ok(changed > 50, `Real decorative shader changed pixels: ${changed}`);
        record.changedEffectPixels = changed;
      }
      await page.locator('.example-card[href="#/tasks"]').click();
      await page.getByLabel("New task", { exact: true }).waitFor();
      await settle();
      await page.getByLabel("New task", { exact: true }).fill("Showcase task");
      await studioButton("Add task").click();
      await settle();
      assert.equal((await state()).mode, lane === "native" ? "gpu" : "dom");
      await page.getByLabel("Open task 1", { exact: true }).click();
      await page.getByLabel("Task notes", { exact: true }).fill("Local note");
      await studioButton("Save task").click();
      await settle();
      assert.match(await page.locator("#task-message").innerText(), /Saved/);
      if (lane === "native") await output.screenshot({ path: join(run, "native-tasks.png") });
      // Fluent release board: stock Fluent UI v9 controls, springs and transition effects on live layers.
      await page.locator('.example-card[href="#/fluent"]').click();
      await page.getByRole("button", { name: "Add item", exact: true }).waitFor();
      const springTo = (id, x, y) => page.waitForFunction(([id, x, y]) => {
        const transform = window.showcase.state().layers.find(layer => layer.id === id)?.transform;
        return transform && Math.abs((transform.x ?? 0) - x) < .5 && Math.abs((transform.y ?? 0) - y) < .5 && Math.abs(transform.rotation ?? 0) < .01;
      }, [id, x, y], { timeout: 8000 });
      const fluentMode = async label => {
        const current = await state();
        assert.equal(current.mode, lane === "native" ? "gpu" : "dom", `${label}: ${current.reason}`);
        return current;
      };
      const quiet = () => page.waitForFunction(() => window.showcase.state().runtimeResources.transitionEffects === 0, null, { timeout: 8000 });
      // The opening cascade settles every card in its slot.
      await springTo("fluent-item-6", 0, 172);
      await settle();
      record.fluent = { initial: await fluentMode("opened") };
      // Fluent's own styles win over the showcase's base control styles.
      assert.equal(await page.getByRole("button", { name: "Add item", exact: true }).evaluate(node => getComputedStyle(node).borderTopLeftRadius), "4px");
      // A new card materialises while it springs out of the panel, then is an ordinary interactive card.
      await page.locator("#fluent-title").fill("Validation item");
      await page.getByRole("button", { name: "Add item", exact: true }).click();
      await springTo("fluent-item-7", 0, 258);
      await quiet();
      // Inertness is inherited from the layer's direct child, so test the effective state.
      assert.equal(await page.locator("#fluent-item-7 .fui-Card").evaluate(node => node.matches("[inert], [inert] *")), false);
      let board;
      if (lane === "native") { await settle(); board = PNG.sync.read(await output.screenshot({ path: join(run, "native-fluent-board.png") })); }
      // The editor grows out of its card; its content is inert only while it materialises.
      await page.getByRole("button", { name: "Edit Release notes", exact: true }).click();
      await page.locator("#fluent-editor").waitFor();
      if (lane === "native") {
        await page.waitForFunction(() => document.querySelector("#fluent-editor form")?.matches("[inert] *") && window.showcase.state().runtimeResources.transitionEffects === 1, null, { timeout: 2000 });
        record.fluent.materialising = await fluentMode("editor materialising");
      }
      await page.waitForFunction(() => document.querySelector("#fluent-editor form")?.matches("[inert], [inert] *") === false, null, { timeout: 4000 });
      await quiet();
      await page.locator("#fluent-edit-title").fill("Validated release notes");
      await page.locator("#fluent-item-6").filter({ hasText: "Validated release notes" }).waitFor();
      if (lane === "native") {
        await settle();
        const edited = PNG.sync.read(await output.screenshot({ path: join(run, "native-fluent-editor.png") }));
        let changed = 0;
        for (let y = 196; y < 666; y++) for (let x = 470; x < 900; x++) {
          const offset = (y * edited.width + x) * 4;
          if (board.data.subarray(offset, offset + 4).some((v, i) => v !== edited.data[offset + i])) changed++;
        }
        assert.ok(changed > 20000, `Editor layer changed output pixels: ${changed}`);
        record.changedFluentEditorPixels = changed;
      }
      await page.getByRole("button", { name: "Done", exact: true }).click();
      await page.locator("#fluent-editor").waitFor({ state: "detached", timeout: 4000 });
      // A Fluent menu opens in the adapter's overlay host, outside every layer.
      await page.getByRole("button", { name: "Actions for Validated release notes", exact: true }).click();
      await page.getByRole("menu").waitFor();
      assert.equal(await page.evaluate(() => !!document.querySelector(".stage .overlay [data-portal-node] [role=menu]")), true);
      await page.getByRole("menuitem", { name: "Move to Shipped" }).click();
      await springTo("fluent-item-6", 456, 86);
      // A pointer drag to the end of the next lane; pausing before release means no fling.
      const grip = await page.getByRole("button", { name: "Move Keyboard moves between lanes", exact: true }).boundingBox();
      assert.ok(grip);
      await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
      await page.mouse.down();
      for (let step = 1; step <= 12; step++) {
        await page.mouse.move(grip.x + grip.width / 2 + step * 19, grip.y + grip.height / 2 + step * 172 / 12);
        await page.waitForTimeout(16);
      }
      await page.waitForTimeout(200);
      await page.mouse.up();
      await springTo("fluent-item-4", 228, 172);
      record.fluent.afterMoves = await fluentMode("after moves");
      // Native hits follow the moved card: its original menu button is under its new position.
      const menu = page.getByRole("button", { name: "Actions for Validated release notes", exact: true });
      const menuBox = await menu.boundingBox();
      assert.ok(menuBox);
      assert.equal(await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest("button")?.getAttribute("aria-label"),
        [menuBox.x + menuBox.width / 2, menuBox.y + menuBox.height / 2]), "Actions for Validated release notes");
      await page.mouse.click(menuBox.x + menuBox.width / 2, menuBox.y + menuBox.height / 2);
      await page.getByRole("menu").waitFor();
      await page.keyboard.press("Escape");
      // Archiving burns the live card; meanwhile its content is inert and its own box catches clicks.
      const archived = page.locator("#fluent-item-5");
      await page.getByRole("button", { name: "Actions for Reduced-motion audit", exact: true }).click();
      await page.getByRole("menuitem", { name: "Archive" }).click();
      if (lane === "native") {
        await page.waitForFunction(() => window.showcase.state().runtimeResources.transitionEffects === 1, null, { timeout: 2000 });
        // Measured now, in view: opening the menu may have scrolled the page.
        assert.equal(await archived.evaluate(node => {
          node.scrollIntoView({ block: "center" });
          const box = node.getBoundingClientRect();
          return document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)?.id;
        }), "fluent-item-5");
        record.fluent.burning = await fluentMode("burning");
      }
      await archived.waitFor({ state: "detached", timeout: 6000 });
      // Releasing goes through a Fluent dialog in the overlay host; the shipped cards warp into the poster.
      await page.getByRole("button", { name: "Release…", exact: true }).click();
      await page.getByRole("dialog").waitFor();
      assert.equal(await page.evaluate(() => !!document.querySelector(".stage .overlay [data-portal-node] [role=dialog]")), true);
      await page.getByRole("button", { name: "Release", exact: true }).click();
      await page.locator("#showcase-art").filter({ hasText: "2 released" }).first().waitFor({ timeout: 8000 });
      await page.waitForFunction(() => !document.querySelector("[id='fluent-item-2'], [id='fluent-item-6']"));
      await quiet();
      record.fluent.released = await fluentMode("released");
      record.beforeDispose = await state();
      assert.equal(record.beforeDispose.mode, lane === "native" ? "gpu" : "dom", record.beforeDispose.reason);
      await page.getByRole("button", { name: "Dispose example", exact: true }).click();
      await page.getByText("The example is disposed. Reload this page to start a fresh session.").waitFor();
      record.disposed = await state();
      assert.ok(Object.values(record.disposed.resources).every(value => value === 0));
      assert.ok(Object.values(record.disposed.runtimeResources).every(value => value === 0));
      await page.goto("about:blank");
      await page.goto(`${url}#/effects`);
      await studioButton("Apply chromatic effect").waitFor();
      await page.reload();
      await studioButton("Apply chromatic effect").waitFor();
      assert.equal((await state()).mode, "dom");
      await page.locator('a[href="#about"]').click();
      assert.equal(await page.locator(".example-card[aria-current]").getAttribute("href"), "#/effects");
      await page.locator('a[href="#/motion"].example-card').focus();
      await page.keyboard.press("Enter");
      await studioButton("Play layer journey").waitFor();
      await page.evaluate(() => scrollTo(0, 0));
      await page.screenshot({ path: join(run, `${lane}-desktop.png`) });
      const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const mobile = await mobileContext.newPage();
      await mobile.goto(`${url}#/motion`);
      await mobile.waitForFunction(() => window.showcase);
      await mobile.waitForTimeout(300);
      assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      record.mobile = await mobile.evaluate(() => ({ headers: document.querySelectorAll(".site-header").length,
        viewport: innerWidth, width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight }));
      assert.equal(record.mobile.headers, 1);
      await mobile.screenshot({ path: join(run, `${lane}-mobile-viewport.png`) });
      await mobile.locator("#studio").scrollIntoViewIfNeeded();
      await mobile.waitForTimeout(300);
      await mobile.screenshot({ path: join(run, `${lane}-mobile-studio.png`) });
      await mobileContext.close();
      if (lane === "dom") {
        const unsupported = await browser.newContext({ viewport: { width: 1280, height: 1100 } });
        await unsupported.addInitScript(() => Object.defineProperty(navigator, "gpu", { get: () => undefined }));
        const fallback = await unsupported.newPage();
        await fallback.goto(url);
        await fallback.waitForFunction(() => window.showcase);
        await fallback.locator("#studio-title").fill("Retained fallback");
        await fallback.getByRole("button", { name: "Enable experimental GPU", exact: true }).click();
        await fallback.waitForFunction(() => !window.showcase.state().initializing);
        record.syntheticUnsupported = await fallback.evaluate(() => window.showcase.state());
        assert.equal(record.syntheticUnsupported.mode, "dom");
        assert.match(record.syntheticUnsupported.reason, /WebGPU|GPU/i);
        assert.equal(await fallback.locator("#studio-title").inputValue(), "Retained fallback");
        await unsupported.close();
      }
      assert.deepEqual(errors, []);
      record.status = "passed";
    } finally { await browser.close(); record.closed = true; }
  }
  await command([vite, "build", "--base", "/", "--outDir", "root-dist"], site, "showcase-root-build");
  assert.match(await readFile(join(site, "root-dist/index.html"), "utf8"), /"\/assets\//);
  result.status = "passed";
} catch (error) {
  result.status = "failed"; result.error = String(error); process.exitCode = 1;
  console.error(error);
} finally {
  if (server) { server.kill("SIGTERM"); await serverClosed; result.preview.closed = true; }
  await writeFile(join(run, "preview.log"), serverOutput, { flag: "wx" });
  result.inputsUnchanged = true;
  for (const input of inputs) if (sha(await readFile(join(root, input.path))) !== input.sha256) result.inputsUnchanged = false;
  if (!result.inputsUnchanged) { result.status = "failed"; process.exitCode = 1; }
  await writeFile(join(run, "result.json"), JSON.stringify(result, null, 2), { flag: "wx" });
  console.log(`Showcase: ${result.status}; ${run}`);
}
