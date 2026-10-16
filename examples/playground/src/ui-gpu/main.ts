/**
 * Entry for `ui-gpu.html`: a Strata panel of Tier A controls (plain contract markup and the Strata stylesheet) as a
 * direct child of an Underglass root, presented on the GPU by `attachStrataGpu`. `window.strataGpuProbe` is the hook
 * for `tests/browser/ui-gpu.test.mjs`; `?dom` starts in the CSS presentation, and `?plain` leaves the panel to the page
 * (no `attachStrataGpu`).
 */
import "@underglass/ui/css";
import { compileStyle, mountApplicationModule, type CanvasController } from "@underglass/core";
import { attachStrataGpu, type StrataGpu } from "@underglass/ui/gpu";

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
    <span class="ug-spinner ug-spinner--md" role="status" data-strata-face="ring"><span class="ug-spinner__arc" aria-hidden="true"></span><span class="ug-spinner__label">Saving</span></span>
  </div>
  <p id="gpu-count" style="margin:12px 0 0">Saved 0 times</p>`;

const params = new URLSearchParams(location.search);
const host = (id: string) => document.getElementById(id)!;
let panel!: HTMLElement;
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
  panel.querySelector("#gpu-save")!.addEventListener("click", () => { saves++; panel.querySelector("#gpu-count")!.textContent = `Saved ${saves} times`; });
  return () => container.replaceChildren();
} });
strata = params.has("plain") ? undefined : attachStrataGpu(controller);
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
};
declare global {
  interface Window { strataGpuProbe: {
    controller: CanvasController; panel(): HTMLElement; saves(): number;
    scene(): ReturnType<StrataGpu["scene"]>; refresh(): void; detach(): void;
  } }
}
