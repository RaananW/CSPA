/**
 * Entry for `ui-gpu.html`: a Strata panel of Tier A controls (plain contract markup and the Strata stylesheet) as a
 * direct child of an Underglass root, presented on the GPU by `attachStrataGpu`. `window.strataGpuProbe` is the hook
 * for `tests/browser/ui-gpu.test.mjs`; `?dom` starts in the CSS presentation, `?plain` leaves the panel to the page
 * (no `attachStrataGpu`), `?level=objects` presents the components as objects, and `?adjust=budget,down,up,window` turns
 * the adjust policy on (frame budget in ms, then frame counts); `strataGpuProbe.load(ms)` makes each frame that slow.
 */
import "@underglass/ui/css";
import { compileStyle, mountApplicationModule, type CanvasController } from "@underglass/core";
import { attachStrataGpu, type StrataAdjustEvent, type StrataGpu } from "@underglass/ui/gpu";
import { showStrataDialog, strataEnter, strataLeave, type DialogHandle, type PanelMotionOptions } from "@underglass/ui/dom";

const markup = `
  <h2 id="gpu-title" style="margin:0 0 12px;font-size:18px">Account</h2>
  <div class="ug-field" style="margin-bottom:12px">
    <label class="ug-field__label" for="gpu-name">Name</label>
    <input class="ug-text-field" data-strata-face="well" id="gpu-name" value="Ada Lovelace" />
  </div>
  <div style="display:flex;gap:24px;margin-bottom:12px">
    <label class="ug-checkbox"><input class="ug-checkbox__input" data-strata-face="well" type="checkbox" id="gpu-news" checked />
      <span class="ug-checkbox__mark" data-strata-face="mark" aria-hidden="true"></span><span class="ug-checkbox__label">Newsletter</span></label>
    <label class="ug-switch"><input class="ug-switch__input" data-strata-face="well" type="checkbox" role="switch" id="gpu-wifi" />
      <span class="ug-switch__knob" data-strata-face="knob" aria-hidden="true"></span><span class="ug-switch__label">Wi-Fi</span></label>
  </div>
  <input type="range" class="ug-slider" data-strata-face="groove" id="gpu-volume" min="0" max="100" value="40" aria-label="Volume" style="margin-bottom:12px" />
  <div style="display:flex;gap:12px;align-items:center">
    <button type="button" class="ug-button" data-strata-face="raised" id="gpu-cancel"><span class="ug-button__label">Cancel</span></button>
    <button type="button" class="ug-button ug-button--accent" data-strata-face="raised" id="gpu-save"><span class="ug-button__label">Save</span></button>
    <button type="button" class="ug-button" data-strata-face="raised" id="gpu-disabled" disabled><span class="ug-button__label">Disabled</span></button>
    <button type="button" class="ug-button" data-strata-face="raised" id="gpu-open"><span class="ug-button__label">Delete…</span></button>
    <span class="ug-spinner ug-spinner--md" role="status" data-strata-face="ring"><span class="ug-spinner__arc" aria-hidden="true"></span><span class="ug-spinner__label">Saving</span></span>
  </div>
  <p id="gpu-count" style="margin:12px 0 0">Saved 0 times</p>`;

const params = new URLSearchParams(location.search);
const host = (id: string) => document.getElementById(id)!;
let panel!: HTMLElement;
let root!: HTMLElement;
let dialog: { panel: HTMLElement; handle: DialogHandle } | undefined;
const closes: string[] = [];
/**
 * Opens a Strata Dialog as a top-level panel of the Underglass root, as the React and Vue bindings do with `container`:
 * its scrim and panel are added as root children, so `attachStrataGpu` presents the dialog as its own GPU panel.
 */
function openDialog() {
  const scrim = document.createElement("div");
  scrim.className = "ug-scrim";
  scrim.setAttribute("aria-hidden", "true");
  const section = document.createElement("section");
  section.className = "ug-panel ug-dialog";
  section.id = "gpu-dialog";
  Object.assign(section, { tabIndex: -1 });
  for (const [name, value] of [["role", "dialog"], ["aria-modal", "true"], ["aria-labelledby", "gpu-dialog-title"], ["data-strata-face", "raised"], ["data-strata-elevation", "modal"]]) section.setAttribute(name, value);
  section.innerHTML = `<h2 class="ug-dialog__title" id="gpu-dialog-title">Delete the account?</h2>
    <div class="ug-dialog__body"><p style="margin:0">This cannot be undone.</p></div>
    <div class="ug-dialog__actions">
      <button type="button" class="ug-button" data-strata-face="raised" id="gpu-dialog-cancel"><span class="ug-button__label">Cancel</span></button>
      <button type="button" class="ug-button ug-button--accent" data-strata-face="raised" id="gpu-dialog-delete"><span class="ug-button__label">Delete</span></button>
    </div>`;
  root.append(scrim, section);
  const close = async (reason: string) => {
    closes.push(reason);
    await dialog?.handle.close();
    scrim.remove(); section.remove();
    dialog = undefined;
  };
  const handle = showStrataDialog(section, { onClose: reason => void close(reason) });
  section.querySelector("#gpu-dialog-cancel")!.addEventListener("click", () => void close("cancel"));
  section.querySelector("#gpu-dialog-delete")!.addEventListener("click", () => void close("delete"));
  dialog = { panel: section, handle };
}
let saves = 0;
// Declared before mounting: the runtime may report status while it mounts.
let strata: StrataGpu | undefined;
const controller: CanvasController = mountApplicationModule({
  outputCanvas: host("output") as HTMLCanvasElement, ordinaryHost: host("ordinary"), overlayHost: host("overlay"),
  onStatus: message => { host("status").textContent = message; },
  onStatusChange: () => strata?.refresh(),
}, { mount({ container }) {
  panel = document.createElement("section");
  panel.className = "ug-panel";
  panel.id = "gpu-panel";
  panel.setAttribute("data-strata-face", "raised");
  panel.setAttribute("data-strata-elevation", "floating");
  panel.setAttribute("aria-labelledby", "gpu-title");
  Object.assign(panel.style, compileStyle({ x: 60, y: 50, width: 520 }, {}, true));
  panel.innerHTML = markup;
  container.append(panel);
  root = container;
  panel.querySelector("#gpu-open")!.addEventListener("click", openDialog);
  panel.querySelector("#gpu-save")!.addEventListener("click", () => { saves++; panel.querySelector("#gpu-count")!.textContent = `Saved ${saves} times`; });
  return () => container.replaceChildren();
} });
const level = params.get("level") === "objects" ? "objects" : undefined;
const adjusting = params.get("adjust")?.split(",").map(Number);
const adjustments: StrataAdjustEvent[] = [];
const adjust = adjusting ? { enabled: true, frameBudgetMs: adjusting[0], stepDownAfterFrames: adjusting[1], stepUpAfterFrames: adjusting[2], window: adjusting[3] } : undefined;
strata = params.has("plain") ? undefined : attachStrataGpu(controller, { level, adjust, onAdjust: event => adjustments.push(event) });
// An artificial cost per frame, so tests can drive the adjust policy.
let load = 0;
const busy = () => { const until = performance.now() + load; while (performance.now() < until) { /* spin */ } if (load) requestAnimationFrame(busy); };
host("enable").addEventListener("click", () => void controller.enable());
host("disable").addEventListener("click", () => void controller.disable());
host("theme").addEventListener("change", event => {
  document.documentElement.setAttribute("data-strata-theme", (event.target as HTMLInputElement).checked ? "dark" : "light");
});
if (!params.has("dom")) void controller.enable().then(() => strata?.refresh());

window.strataGpuProbe = {
  controller, panel: () => panel, saves: () => saves,
  scene: () => strata?.scene(panel),
  refresh: () => strata?.refresh(),
  detach: () => { strata?.detach(); strata = undefined; },
  cap: () => strata?.cap(), adjustments: () => [...adjustments],
  load: ms => { const start = !load && ms > 0; load = ms; if (start) requestAnimationFrame(busy); },
  enter: options => strataEnter(panel, options),
  dialog: () => dialog?.panel, closes: () => [...closes],
  leave: options => strataLeave(panel, options),
};
declare global {
  interface Window { strataGpuProbe: {
    controller: CanvasController; panel(): HTMLElement; saves(): number;
    scene(): ReturnType<StrataGpu["scene"]>; refresh(): void; detach(): void;
    cap(): string | undefined; adjustments(): StrataAdjustEvent[]; load(ms: number): void;
    enter(options?: PanelMotionOptions): Promise<void>; leave(options?: PanelMotionOptions): Promise<void>;
    dialog(): HTMLElement | undefined; closes(): string[];
  } }
}
