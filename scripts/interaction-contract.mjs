import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { PNG } from "pngjs";

export async function taskPixelLatency(page, dpr, gpu, trials) {
  const results = [];
  await page.evaluate(() => {
    window.inputTimes = [];
    window.latencyListener = () => window.inputTimes.push(performance.now());
    document.getElementById("todo-controls").addEventListener("change", window.latencyListener, { capture: true });
  });
  try {
    for (let trial = 0; trial < trials; trial++) {
      await page.evaluate(() => window.todoProbe.controller().settle());
      const row = await page.locator('[data-task-id="1"]').boundingBox(), frame = await page.locator("#frame").boundingBox();
      const baseline = PNG.sync.read(await page.locator("#frame").screenshot());
      const checked = await page.getByLabel("Complete task 1", { exact: true }).isChecked();
      await page.getByLabel("Complete task 1", { exact: true }).click();
      assert.equal(await page.getByLabel("Complete task 1", { exact: true }).isChecked(), !checked);
      const eventAt = await page.evaluate(() => window.inputTimes.at(-1));
      assert.equal(typeof eventAt, "number");
      let lowerMs = 0, detected;
      for (let poll = 0; poll < 20; poll++) {
        const captureStart = await page.evaluate(() => performance.now());
        const current = PNG.sync.read(await page.locator("#frame").screenshot());
        const captureEnd = await page.evaluate(() => performance.now());
        let changed = 0;
        for (let y = Math.ceil((row.y - frame.y) * dpr); y < Math.floor((row.y - frame.y + row.height) * dpr); y++) {
          for (let x = Math.ceil((row.x - frame.x) * dpr); x < Math.floor((row.x - frame.x + row.width) * dpr); x++) {
            const offset = (y * current.width + x) * 4;
            if ([0, 1, 2].some(channel => baseline.data[offset + channel] !== current.data[offset + channel])) changed++;
          }
        }
        if (changed > 100 * dpr * dpr) {
          detected = { dpr, gpu, trial, eventAt, lowerMs, upperMs: captureEnd - eventAt,
            uncertaintyMs: captureEnd - eventAt - lowerMs, captureStart, captureEnd, changedPixels: changed, polls: poll + 1 };
          break;
        }
        lowerMs = Math.max(0, captureStart - eventAt);
      }
      assert(detected, "Native task event must visibly change captured control pixels");
      results.push(detected);
    }
    return results;
  } finally {
    await page.evaluate(() => {
      document.getElementById("todo-controls").removeEventListener("change", window.latencyListener, { capture: true });
      delete window.latencyListener;
    });
  }
}

export async function dynamicContract(context, url, { directory, name, flags, dpr }) {
  const page = await context.newPage(), observations = [], errors = [], diagnostics = [];
  page.on("pageerror", error => errors.push(String(error)));
  page.on("console", message => { if (message.type() === "error") diagnostics.push(message.text()); });
  const state = () => page.evaluate(() => window.packageConsumer.state());
  async function settled(mode) {
    await page.waitForFunction(mode => {
      const s = window.packageConsumer.state();
      return s.mode === mode && !s.initializing && !s.transitioning
        && (mode !== "dom" || s.resources.engines === 0);
    }, mode);
    await page.evaluate(() => window.packageConsumer.controller.settle());
  }
  async function continuity() {
    const s = await state();
    assert.ok(s.sameInput && s.sameRoot);
    assert.equal(s.value, "retained"); assert.deepEqual(s.selection, [0, 1]); assert.equal(s.focus, "name");
    assert.equal(await page.locator("#native").inputValue(), "native retained");
    assert.equal(await page.locator("#checked").isChecked(), true);
    return s;
  }
  async function select() {
    await page.locator("#name").focus();
    await page.keyboard.press("Home"); await page.keyboard.press("Shift+ArrowRight");
  }
  async function pixels() {
    const png = PNG.sync.read(await page.locator("#frame").screenshot());
    const offset = (Math.floor(245 * dpr) * png.width + Math.floor(55 * dpr)) * 4;
    assert.deepEqual([...png.data.subarray(offset, offset + 4)], [240, 30, 60, 255]);
  }
  try {
    await page.goto(`${url}?auto`); await page.waitForFunction(() => window.packageConsumer);
    assert.equal((await state()).admission.intent, "disabled");
    await page.locator("#name").fill("retained");
    await page.locator("#native").fill("native retained");
    await page.locator("#checked").check(); await select();
    const admitted = await page.evaluate(() => window.packageConsumer.controller.enable());
    assert.equal(admitted.mode, flags ? "gpu" : "dom", admitted.reason);
    observations.push({ operation: "enable", state: admitted });
    if (flags) {
      await settled("gpu"); await continuity();
      for (const operation of ["membership-order-position", "size", "frame"]) {
        const barrier = await page.evaluate(operation => {
          const p = window.packageConsumer;
          window.packageMotion = p.controller.transition("editor", {
            keyframes: [{ offset: 0 }, { offset: 1, x: 5 }], timing: { duration: 60000 },
          });
          if (operation === "membership-order-position") { p.extra(2); p.reorder(); p.layout({ x: 50, width: 280 }); }
          if (operation === "size") p.layout({ x: 50, width: 300 });
          if (operation === "frame") document.querySelector("#frame").style.width = "660px";
          return { state: p.state(), hidden: document.querySelector("#output").hidden };
        }, operation);
        if (operation !== "frame") assert.equal(barrier.hidden, true);
        if (operation === "frame") await page.waitForFunction(dpr => {
          const s = window.packageConsumer.state();
          return s.mode === "gpu" && document.querySelector("#output").width === 660 * dpr;
        }, dpr);
        await settled("gpu"); const retained = await continuity(); await pixels();
        assert.equal((await page.evaluate(() => window.packageMotion.finished)).status, "cancelled");
        await page.locator("#label").click(); assert.equal(await page.locator("#name").evaluate(node => document.activeElement === node), true);
        await page.keyboard.press("Enter"); assert.equal(await page.locator("#saved").textContent(), "retained");
        await select(); observations.push({ operation, barrier, retained });
      }
      await page.evaluate(() => {
        const host = document.querySelector("#capture"), original = host.requestPaint.bind(host);
        const hold = event => event.stopImmediatePropagation();
        host.requestPaint = () => {}; host.addEventListener("paint", hold, true);
        window.restoreDynamicPaint = () => { host.requestPaint = original; host.removeEventListener("paint", hold, true); };
        window.packageConsumer.controller.invalidate();
      });
      await page.waitForFunction(() => window.packageConsumer.state().resources.paintWaits === 1);
      const pending = await state();
      await page.evaluate(() => { window.packageConsumer.extra(1); window.packageConsumer.layout({ x: 50, width: 280 }); });
      assert.equal(await page.locator("#output").evaluate(node => node.hidden), true);
      assert.equal((await state()).metrics.uploads, pending.metrics.uploads);
      await page.evaluate(() => window.restoreDynamicPaint()); await settled("gpu"); await continuity(); await pixels();
      observations.push({ operation: "pending-capture", fixture: "Held public paint delivery", pending, after: await state() });
      const cdp = await context.newCDPSession(page), next = dpr === 1 ? 2 : 1;
      await cdp.send("Emulation.setDeviceMetricsOverride", { width: 900, height: 750, deviceScaleFactor: next, mobile: false });
      await page.evaluate(() => window.packageConsumer.controller.setTransform("editor", { x: 1 }));
      await page.waitForFunction(next => window.packageConsumer.state().mode === "gpu" && document.querySelector("#output").width === 660 * next, next);
      await settled("gpu");
      assert.equal(await page.locator("#output").evaluate(node => node.width), 660 * next);
      await continuity();
      await cdp.send("Emulation.setDeviceMetricsOverride", { width: 900, height: 750, deviceScaleFactor: dpr, mobile: false });
      await page.evaluate(() => window.packageConsumer.controller.setTransform("editor", {}));
      await page.waitForFunction(dpr => window.packageConsumer.state().mode === "gpu" && document.querySelector("#output").width === 660 * dpr, dpr);
      await settled("gpu"); await cdp.detach();
      await page.evaluate(() => window.packageConsumer.scroll(true)); await settled("dom");
      await page.waitForFunction(() => window.packageConsumer.state().admission.intent === "blocked");
      const refusal = await state(); assert.equal(refusal.admission.intent, "blocked");
      await page.evaluate(() => window.packageConsumer.scroll(false));
      await page.waitForTimeout(150); assert.equal((await state()).admission.intent, "blocked");
      observations.push({ operation: "scroll-policy", refusal });
      assert.equal((await page.evaluate(() => window.packageConsumer.controller.enable())).mode, "gpu");
      await page.evaluate(() => { window.packageConsumer.extra(2); window.disabled = window.packageConsumer.controller.disable(); });
      await page.evaluate(() => window.disabled); await settled("dom");
    } else {
      assert.equal(admitted.admission.intent, "blocked");
      await page.evaluate(() => { window.packageConsumer.extra(2); window.packageConsumer.layout({ x: 50, width: 280 }); });
      await page.waitForTimeout(150); assert.equal((await state()).admission.attempts, 0); await continuity(); await pixels();
    }
    await page.evaluate(() => window.packageConsumer.controller.disable());
    const disabled = await state();
    await page.evaluate(() => window.packageConsumer.extra(0)); await page.waitForTimeout(150);
    assert.equal((await state()).metrics.admission.attempts, disabled.metrics.admission.attempts);
    assert.equal((await state()).admission.intent, "disabled");
    await continuity();
    if (flags) {
      await page.evaluate(() => {
        const gpu = navigator.gpu, original = gpu.requestAdapter.bind(gpu);
        gpu.requestAdapter = async options => {
          window.packageAdapterWaiting = true;
          await new Promise(resolve => { window.packageReleaseAdapter = resolve; });
          gpu.requestAdapter = original;
          return original(options);
        };
        window.packagePendingEnable = window.packageConsumer.controller.enable();
      });
      await page.waitForFunction(() => window.packageAdapterWaiting);
      await page.evaluate(() => { window.packageDisposal = window.packageConsumer.dispose(); });
      assert.equal(await page.locator("#output").evaluate(node => node.hidden), true);
      await page.evaluate(() => window.packageReleaseAdapter());
      await page.evaluate(() => window.packagePendingEnable); await page.evaluate(() => window.packageDisposal);
    } else await page.evaluate(() => window.packageConsumer.dispose());
    const retired = await state();
    assert.ok(Object.values(retired.resources).every(n => n === 0));
    assert.ok(Object.values(retired.runtimeResources).every(n => n === 0));
    assert.equal(retired.mounts, retired.cleanups); assert.deepEqual(errors, []);
    const result = { flags, dpr, observations, disabled, retired, errors, diagnostics };
    await writeFile(join(directory, `${name}-dynamic.json`), JSON.stringify(result, null, 2));
    return result;
  } catch (error) {
    await writeFile(join(directory, `${name}-dynamic-failed.json`), JSON.stringify({
      flags, dpr, failure: String(error), observations, state: await state(), errors, diagnostics,
    }, null, 2));
    throw error;
  } finally { await page.close(); }
}

// Run against an actual installed consumer, not a source alias.
export async function interactionContract(context, url, { directory, name, flags }) {
  const page = await context.newPage();
  const errors = [], diagnostics = [], observations = [];
  page.on("pageerror", error => errors.push(String(error)));
  page.on("console", message => { if (message.type() === "error") diagnostics.push(message.text()); });
  const state = () => page.evaluate(() => window.packageConsumer.state());
  async function settled(mode) {
    await page.waitForFunction(mode => {
      const value = window.packageConsumer.state();
      return value.mode === mode && !value.initializing && !value.transitioning
        && (mode !== "dom" || value.resources.engines === 0);
    }, mode);
    await page.evaluate(() => window.packageConsumer.controller.settle());
  }
  async function load() {
    await page.goto(url);
    await page.waitForFunction(() => !!window.packageConsumer);
    await settled("dom");
  }
  async function admission(mode) {
    const value = await page.evaluate(() => window.packageConsumer.controller.enable());
    assert.equal(value.mode, mode, value.reason);
    await settled(mode);
    return value;
  }
  async function focus(id) {
    assert.equal(await page.evaluate(() => document.activeElement?.id), id);
  }
  async function original() {
    const value = await state();
    assert.ok(value.sameInput && value.sameRoot);
    assert.equal(await page.locator("#output").evaluate(node => node.hidden), value.mode !== "gpu");
    return value;
  }
  async function dispose() {
    await page.evaluate(() => {
      window.releaseAdoptedDialog?.();
      return window.packageConsumer.dispose();
    });
    const value = await state();
    assert.ok(Object.values(value.resources).every(value => value === 0));
    assert.ok(Object.values(value.runtimeResources).every(value => value === 0));
    assert.equal(value.mounts, value.cleanups);
    return value;
  }
  const cdp = await context.newCDPSession(page);
  async function semantics() {
    const tree = await cdp.send("Accessibility.getFullAXTree");
    const controls = tree.nodes.filter(node => !node.ignored
      && ["textbox", "button", "checkbox"].includes(node.role?.value))
      .map(node => ({ role: node.role.value, name: node.name?.value,
        checked: node.properties?.find(property => property.name === "checked")?.value.value }));
    assert.equal(controls.filter(node => node.role === "textbox" && node.name === "Name").length, 1);
    assert.equal(controls.filter(node => node.role === "textbox" && node.name === "Uncontrolled value").length, 1);
    assert.equal(controls.filter(node => node.role === "checkbox" && node.name === "Checked").length, 1);
    return controls;
  }
  try {
    await load();
    const identity = await cdp.send("Browser.getVersion");
    const launch = await cdp.send("Browser.getBrowserCommandLine");
    if (flags) await page.evaluate(() => {
      const configure = GPUCanvasContext.prototype.configure;
      GPUCanvasContext.prototype.configure = function(options) {
        window.interactionDevice = options.device;
        return configure.call(this, options);
      };
    });
    await page.locator("#count").focus();
    const order = ["name", "save", "native", "adopted-button", "checked", "dialog-open", "popover-open"];
    for (const id of order) { await page.keyboard.press("Tab"); await focus(id); }
    await page.keyboard.press("Shift+Tab");
    await focus("dialog-open");
    await page.locator("#name").focus();
    await page.keyboard.press("Meta+a");
    await page.keyboard.type("compat");
    await page.keyboard.press("Enter");
    assert.equal(await page.locator("#saved").textContent(), "compat");
    await page.locator("#native").focus();
    await page.keyboard.press("Meta+a");
    await page.keyboard.type("native edit");
    await page.locator("#checked").focus();
    await page.keyboard.press("Space");
    assert.equal(await page.locator("#checked").isChecked(), true);
    const domAX = await semantics();
    const enabled = await admission(flags ? "gpu" : "dom");
    if (!flags) assert.match(enabled.reason, /captureElementImage/);
    if (flags) await page.evaluate(() => window.packageConsumer.transform({ x: 15, rotation: 3, scaleX: .9 }));
    await page.locator("#name").click();
    await focus("name");
    const hit = await page.locator("#name").evaluate(node => {
      const rect = node.getBoundingClientRect();
      return { rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        originalHit: document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2) === node };
    });
    assert.ok(hit.originalHit);
    await page.keyboard.press("Home");
    await page.keyboard.press("Shift+ArrowRight");
    const selected = await original();
    assert.deepEqual(selected.selection, [0, 1]);
    await page.keyboard.type("C");
    assert.equal(await page.locator("#name").inputValue(), "Compat");
    await page.keyboard.press("Enter");
    assert.equal(await page.locator("#saved").textContent(), "Compat");
    const activeAX = await semantics();
    assert.deepEqual(activeAX, domAX, "GPU presentation must not duplicate or replace native AX controls");
    await page.keyboard.press("Home");
    await page.keyboard.press("Shift+ArrowRight");
    await page.evaluate(() => window.packageConsumer.controller.disable());
    await settled("dom");
    assert.deepEqual((await original()).selection, [0, 1]);
    await focus("name");
    assert.equal(await page.locator("#native").inputValue(), "native edit");
    assert.equal(await page.locator("#checked").isChecked(), true);
    await admission(flags ? "gpu" : "dom");

    await page.locator("#dialog-open").focus();
    await page.keyboard.press("Space");
    await page.locator("#dialog").waitFor({ state: "visible" });
    await focus("dialog-input");
    await page.keyboard.press("Meta+a");
    await page.keyboard.type("overlay edit");
    await page.keyboard.press("Tab");
    await focus("dialog-close");
    await page.keyboard.press("Tab");
    const modalTabGap = await page.evaluate(() => document.activeElement === document.body);
    // Native dialog sequential focus may visit browser UI (body in CDP), unlike Radix's JS trap.
    if (modalTabGap) await page.keyboard.press("Tab");
    await focus("dialog-input");
    await page.keyboard.press("Shift+Tab");
    const modalReverseGap = await page.evaluate(() => document.activeElement === document.body);
    if (modalReverseGap) await page.keyboard.press("Shift+Tab");
    await focus("dialog-close");
    await page.locator("#dialog-input").focus();
    await page.evaluate(() => window.packageConsumer.controller.disable());
    await settled("dom");
    await focus("dialog-input");
    assert.equal(await page.locator("#dialog-input").inputValue(), "overlay edit");
    const overlayAdmission = await admission("dom");
    if (flags) assert.match(overlayAdmission.reason, /native geometry probe failed.*occluded/);
    await focus("dialog-input");
    await page.keyboard.press("Escape");
    await page.locator("#dialog").waitFor({ state: "hidden" });
    await focus("dialog-open");
    await admission(flags ? "gpu" : "dom");
    await page.locator("#popover-open").focus();
    await page.keyboard.press("Space");
    await page.locator("#popover").waitFor({ state: "visible" });
    await page.locator("#popover-input").click();
    await page.keyboard.press("Meta+a");
    await page.keyboard.type("popover edit");
    await page.keyboard.press("Escape");
    await page.locator("#popover").waitFor({ state: "hidden" });
    await focus("popover-open");
    observations.push({ kind: "keyboard-editing-native-overlays", order, domAX, activeAX, hit, selected, modalTabGap, modalReverseGap, overlayAdmission, state: await original() });

    await page.emulateMedia({ reducedMotion: "reduce" });
    assert.equal(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches), true);
    await page.locator("#checked").focus();
    await page.keyboard.press("Space");
    assert.equal(await page.locator("#checked").isChecked(), false);
    await page.emulateMedia({ forcedColors: "active" });
    await page.waitForFunction(() => matchMedia("(forced-colors: active)").matches);
    if (flags) await page.waitForFunction(() => /Forced colors/.test(window.packageConsumer.state().reason));
    else await admission("dom");
    await settled("dom");
    assert.match((await state()).reason, /Forced colors/);
    await page.locator("#name").fill("media edit");
    await page.keyboard.press("Enter");
    assert.equal(await page.locator("#saved").textContent(), "media edit");
    observations.push({ kind: "emulated-media", state: await original() });
    await page.emulateMedia({ reducedMotion: "no-preference", forcedColors: "none" });
    await admission(flags ? "gpu" : "dom");

    if (flags) {
      await page.evaluate(() => {
        window.nativeScrolls = [];
        document.querySelector("#name").addEventListener("scroll", event => {
          window.nativeScrolls.push({ trusted: event.isTrusted, left: event.target.scrollLeft });
        });
      });
      await page.locator("#name").fill("Native horizontal scrolling ".repeat(20));
      await page.keyboard.press("Home");
      await page.waitForFunction(() => window.nativeScrolls.some(event => event.trusted));
      await settled("dom");
      await focus("name");
      await page.keyboard.press("Meta+a");
      await page.keyboard.type("scroll recovered");
      await page.keyboard.press("Enter");
      assert.equal(await page.locator("#saved").textContent(), "scroll recovered");
      observations.push({ kind: "trusted-native-input-scroll", events: await page.evaluate(() => window.nativeScrolls), state: await original() });
      await admission("gpu");
      const loss = await page.evaluate(async () => {
        const device = window.interactionDevice;
        device.destroy();
        const info = await device.lost;
        return { reason: info.reason, message: info.message };
      });
      await settled("dom");
      await focus("name");
      assert.equal(await page.locator("#name").inputValue(), "scroll recovered");
      await page.keyboard.press("End");
      await page.keyboard.type(" loss");
      await page.keyboard.press("Enter");
      assert.equal(await page.locator("#saved").textContent(), "scroll recovered loss");
      observations.push({ kind: "public-device-destroy-loss-not-physical-reset", loss, state: await original() });
      await admission("gpu");
      // A synthetic composition start exercises recovery, not OS IME/candidate UI.
      await page.locator("#name").focus();
      await page.locator("#name").dispatchEvent("compositionstart", { data: "fixture" });
      await settled("dom");
      await focus("name");
      observations.push({ kind: "synthetic-composition-recovery-only", state: await original() });
    }
    observations.push({ kind: "initial-lifetime-disposed", state: await dispose() });

    const readonlyCases = ["readonly-false", "root-FALSE", "root-False", "child-FALSE", "child-False", "inherited-false", "override-FALSE", "override-False"];
    for (const boundary of ["root-plaintext", "root-empty", "root-true", "child-plaintext", "child-empty", "child-true",
      "inherited-true", "inherited-plaintext", "root-popover", "root-dialog", ...readonlyCases]) {
      await load();
      const nativeEditing = await page.evaluate(boundary => {
        const node = document.querySelector("#adopted");
        let inspected = node;
        if (boundary === "root-popover") node.setAttribute("popover", "manual");
        else if (boundary === "root-dialog") {
          const dialog = document.createElement("dialog");
          dialog.id = "boundary-dialog";
          window.releaseAdoptedDialog = window.packageConsumer.controller.enroll(
            window.packageConsumer.controller.container.appendChild(dialog), { id: "boundary-dialog" });
        } else if (boundary.startsWith("child-")) {
          inspected = document.querySelector("#text");
          const value = boundary.slice(6);
          inspected.setAttribute("contenteditable", value === "plaintext" ? "plaintext-only" : value === "empty" ? "" : value);
        } else if (boundary.startsWith("inherited-")) {
          const value = boundary.slice(10);
          window.packageConsumer.controller.container.setAttribute("contenteditable", value === "plaintext" ? "plaintext-only" : value === "false" ? "FaLsE" : value);
        } else if (boundary.startsWith("override-")) {
          window.packageConsumer.controller.container.setAttribute("contenteditable", "TrUe");
          for (const layer of window.packageConsumer.controller.container.children) layer.setAttribute("contenteditable", boundary.slice(9));
        } else node.setAttribute("contenteditable", boundary === "root-empty" ? "" : boundary === "readonly-false" ? "false" : boundary === "root-plaintext" ? "plaintext-only" : boundary.slice(5));
        return { attribute: inspected.getAttribute("contenteditable"), normalized: inspected.contentEditable, editable: inspected.isContentEditable,
          descendantEditable: inspected.querySelector("button")?.isContentEditable };
      }, boundary);
      const readonly = readonlyCases.includes(boundary);
      if (readonly) {
        assert.equal(nativeEditing.editable, false);
        assert.equal(nativeEditing.normalized, boundary === "inherited-false" ? "inherit" : "false");
        if (nativeEditing.descendantEditable !== undefined) assert.equal(nativeEditing.descendantEditable, false);
      } else if (!["root-popover", "root-dialog"].includes(boundary)) assert.equal(nativeEditing.editable, true);
      const expected = readonly && flags ? "gpu" : "dom";
      const value = await admission(expected);
      if (!readonly) assert.match(value.reason, /editable\/top-layer boundaries/);
      if (!readonly && !["root-popover", "root-dialog"].includes(boundary) && !boundary.startsWith("inherited-")) {
        const editor = page.locator(boundary.startsWith("child-") ? "#text" : "#adopted");
        await editor.focus();
        await page.keyboard.press("End");
        await page.keyboard.type(" Original editable DOM");
        assert.match(await editor.textContent(), /Original editable DOM/);
      }
      await page.locator("#name").focus();
      await page.keyboard.press("Meta+a");
      await page.keyboard.type("Boundary native edit");
      await page.keyboard.press("Enter");
      assert.equal(await page.locator("#saved").textContent(), "Boundary native edit");
      observations.push({ kind: boundary, nativeEditing, admission: value, state: await original(), disposed: await dispose() });
    }
    assert.deepEqual(errors, []);
    // Policy/capability refusal diagnostics are explicit expected errors, not ignored failures.
    for (const message of diagnostics) assert.match(message, /^GPU admission failed: Error: (?:.*captureElementImage|Clipped\/scroll\/editable\/top-layer boundaries|Forced colors|Functional native geometry probe failed interior\/exterior hit testing \(possibly occluded\))/);
    return { identity, launch, flags, observations, errors, diagnostics,
      limits: "Headless/CDP native semantics and emulated media; no screen-reader, OS IME, everyday-profile or physical-device certification" };
  } finally {
    await writeFile(join(directory, `${name}-interaction-progress.json`), JSON.stringify({ observations, errors, diagnostics }, null, 2));
    await page.close();
  }
}
