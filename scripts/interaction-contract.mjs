import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

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
