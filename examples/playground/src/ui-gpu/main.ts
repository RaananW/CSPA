/**
 * Entry for `ui-gpu.html`: a Strata panel of Tier A controls (plain contract markup and the Strata stylesheet) as a
 * direct child of an Underglass root, presented on the GPU by `attachStrataGpu`. `window.strataGpuProbe` is the hook
 * for `tests/browser/ui-gpu.test.mjs`; `?dom` starts in the CSS presentation, `?plain` leaves the panel to the page
 * (no `attachStrataGpu`), `?level=objects` presents the components as objects, and `?adjust=budget,down,up,window` turns
 * the adjust policy on (frame budget in ms, then frame counts); `strataGpuProbe.load(ms)` makes each frame that slow.
 * `?level=scene` adds the Scene level (`strataGpuProbe.burst()` bursts confetti from Save), and `?environment=url` lights
 * objects with an `.hdr` environment. `strataGpuProbe.openDrawer()` opens a Drawer on the end edge that closes on a click
 * outside it (`closeOnScrim`); the Dialog does not. `strataGpuProbe.addTabs()` adds plain-markup Tabs to the panel, wired by
 * `attachStrata`, `strataGpuProbe.addAccordion()` a native `<details>` Accordion, and `strataGpuProbe.addList()` a List.
 */
import "@underglass/ui/css";
import { compileStyle, mountApplicationModule, type CanvasController } from "@underglass/core";
import { attachStrataGpu, type BurstOptions, type StrataAdjustEvent, type StrataGpu } from "@underglass/ui/gpu";
import { attachStrata, showStrataDialog, strataEnter, strataLeave, type DialogHandle, type PanelMotionOptions } from "@underglass/ui/dom";

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
 * Opens a Strata Dialog (or a Drawer on the end edge) as a top-level panel of the Underglass root, as the React and Vue
 * bindings do with `container`: its scrim and panel are added as root children, so `attachStrataGpu` presents it as its
 * own GPU panel. The Drawer closes on a click outside it (`closeOnScrim`).
 */
function openDialog(kind: "dialog" | "drawer" = "dialog") {
  const scrim = document.createElement("div");
  scrim.className = "ug-scrim";
  scrim.setAttribute("aria-hidden", "true");
  const section = document.createElement("section");
  section.className = kind === "dialog" ? "ug-panel ug-dialog" : "ug-panel ug-drawer ug-drawer--end";
  section.id = `gpu-${kind}`;
  Object.assign(section, { tabIndex: -1 });
  for (const [name, value] of [["role", "dialog"], ["aria-modal", "true"], ["aria-labelledby", `gpu-${kind}-title`], ["data-strata-face", "raised"], ["data-strata-elevation", "modal"]]) section.setAttribute(name, value);
  section.innerHTML = kind === "dialog" ? `<h2 class="ug-dialog__title" id="gpu-dialog-title">Delete the account?</h2>
    <div class="ug-dialog__body"><p style="margin:0">This cannot be undone.</p></div>
    <div class="ug-dialog__actions">
      <button type="button" class="ug-button" data-strata-face="raised" id="gpu-dialog-cancel"><span class="ug-button__label">Cancel</span></button>
      <button type="button" class="ug-button ug-button--accent" data-strata-face="raised" id="gpu-dialog-delete"><span class="ug-button__label">Delete</span></button>
    </div>` : `<h2 class="ug-drawer__title" id="gpu-drawer-title">Filters</h2>
    <div class="ug-drawer__body"><p style="margin:0">A click outside the drawer closes it.</p></div>
    <div class="ug-drawer__actions">
      <button type="button" class="ug-button" data-strata-face="raised" id="gpu-drawer-done"><span class="ug-button__label">Done</span></button>
    </div>`;
  root.append(scrim, section);
  const close = async (reason: string) => {
    closes.push(reason);
    await dialog?.handle.close();
    scrim.remove(); section.remove();
    dialog = undefined;
  };
  const handle = showStrataDialog(section, { onClose: reason => void close(reason), closeOnScrim: kind === "drawer" });
  for (const button of section.querySelectorAll("button")) button.addEventListener("click", () => void close(button.id.replace(`gpu-${kind}-`, "")));
  dialog = { panel: section, handle };
}
/** Tabs in plain markup (`tabs.md`), added to the panel by `strataGpuProbe.addTabs()`. */
const tabsMarkup = `<div class="ug-tabs" id="gpu-tabs" style="margin-top:12px">
  <div class="ug-tabs__list" role="tablist" aria-label="Views">
    <span class="ug-tabs__rail" data-strata-face="groove" aria-hidden="true"></span>
    ${["overview", "activity", "settings"].map((value, index) => `<button class="ug-tab" type="button" role="tab" id="gpu-tabs-tab-${value}" aria-selected="${index === 0}" aria-controls="gpu-tabs-panel-${value}"${index ? ' tabindex="-1"' : ""}><span class="ug-tab__label">${value[0]!.toUpperCase() + value.slice(1)}</span><span class="ug-tab__indicator" data-strata-face="mark" aria-hidden="true"></span></button>`).join("")}
  </div>
  ${["overview", "activity", "settings"].map((value, index) => `<div class="ug-tabs__panel" role="tabpanel" id="gpu-tabs-panel-${value}" aria-labelledby="gpu-tabs-tab-${value}" tabindex="0"${index ? " hidden" : ""}>The ${value} view.</div>`).join("")}
</div>`;
/** An exclusive Accordion in plain markup (`accordion.md`), added to the panel by `strataGpuProbe.addAccordion()`. */
const accordionMarkup = `<div class="ug-accordion" id="gpu-accordion" style="margin-top:12px">
  <details class="ug-accordion__item" data-strata-face="raised" name="gpu-faq" id="gpu-shipping"><summary class="ug-accordion__header"><span class="ug-accordion__title">Shipping</span><span class="ug-accordion__chevron" aria-hidden="true"></span></summary><div class="ug-accordion__body"><p>Orders ship within two days.</p></div></details>
  <details class="ug-accordion__item" data-strata-face="raised" name="gpu-faq" id="gpu-returns"><summary class="ug-accordion__header"><span class="ug-accordion__title">Returns</span><span class="ug-accordion__chevron" aria-hidden="true"></span></summary><div class="ug-accordion__body"><p>Return any item within 30 days.</p></div></details>
</div>`;
/** A List in plain markup (`list.md`), added to the panel by `strataGpuProbe.addList()`; its button row counts presses. */
const listMarkup = `<ul class="ug-list" role="list" data-strata-face="raised" aria-label="Folders" id="gpu-list" style="margin-top:12px">
  <li class="ug-list__item"><button class="ug-list__action" type="button" id="gpu-list-archive"><span class="ug-list__text"><span class="ug-list__primary">Archive</span><span class="ug-list__secondary">Older than a year</span></span></button></li>
  <li class="ug-list__item"><span class="ug-list__text"><span class="ug-list__primary">Storage</span></span><span class="ug-list__end">4.2 GB</span></li>
</ul>`;
let archived = 0;
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
  panel.querySelector("#gpu-open")!.addEventListener("click", () => openDialog());
  panel.querySelector("#gpu-save")!.addEventListener("click", () => { saves++; panel.querySelector("#gpu-count")!.textContent = `Saved ${saves} times`; });
  return () => container.replaceChildren();
} });
const level = params.get("level") === "objects" || params.get("level") === "scene" ? params.get("level") as "objects" | "scene" : undefined;
const adjusting = params.get("adjust")?.split(",").map(Number);
const adjustments: StrataAdjustEvent[] = [];
const adjust = adjusting ? { enabled: true, frameBudgetMs: adjusting[0], stepDownAfterFrames: adjusting[1], stepUpAfterFrames: adjusting[2], window: adjusting[3] } : undefined;
strata = params.has("plain") ? undefined : attachStrataGpu(controller, { level, adjust, onAdjust: event => adjustments.push(event), environment: params.get("environment") ?? undefined });
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
  burst: options => strata?.burst(panel.querySelector("#gpu-save")!, options) ?? Promise.resolve(),
  root: () => root,
  load: ms => { const start = !load && ms > 0; load = ms; if (start) requestAnimationFrame(busy); },
  enter: options => strataEnter(panel, options),
  dialog: () => dialog?.panel, closes: () => [...closes], openDrawer: () => openDialog("drawer"),
  addList: () => { panel.insertAdjacentHTML("beforeend", listMarkup); panel.querySelector("#gpu-list-archive")!.addEventListener("click", () => { archived++; }); strata?.refresh(); },
  archived: () => archived,
  addAccordion: () => { panel.insertAdjacentHTML("beforeend", accordionMarkup); strata?.refresh(); },
  addTabs: () => { panel.insertAdjacentHTML("beforeend", tabsMarkup); attachStrata(panel); strata?.refresh(); },
  leave: options => strataLeave(panel, options),
};
declare global {
  interface Window { strataGpuProbe: {
    controller: CanvasController; panel(): HTMLElement; saves(): number;
    scene(): ReturnType<StrataGpu["scene"]>; refresh(): void; detach(): void;
    cap(): string | undefined; adjustments(): StrataAdjustEvent[]; load(ms: number): void;
    burst(options?: BurstOptions): Promise<void>; root(): HTMLElement;
    enter(options?: PanelMotionOptions): Promise<void>; leave(options?: PanelMotionOptions): Promise<void>;
    dialog(): HTMLElement | undefined; closes(): string[]; openDrawer(): void; addTabs(): void; addAccordion(): void; addList(): void; archived(): number;
  } }
}
