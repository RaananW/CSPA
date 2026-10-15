/**
 * Plain-DOM application on `@underglass/core` alone, with no UI framework: `mountApplicationModule` gives
 * the app the adapter-owned container, the app builds its own original controls there and updates them with
 * ordinary DOM writes, and `controller.enroll` turns its two direct-root sections into GPU layers. Styles
 * come from `compileStyle`, applied with `Object.assign(element.style, ...)`. It renders the shared
 * framework-adapter app and exposes `window.frameworkProbe` for `tests/helpers/framework-contract.mjs`.
 */
import { compileStyle, mountApplicationModule, type CanvasController, type Layout, type Appearance } from "@underglass/core";
import type { FrameworkProbe } from "./framework-probe";

let mounts = 0, cleanups = 0;
let count = 0, swatch: "blue" | "yellow" = "blue";
const swatches = { blue: "rgb(20, 120, 220)", yellow: "rgb(250, 200, 20)" };
// Releases of the enrolled layers, by id.
const enrolled = new Map<string, () => void>();

// Creates an element with attributes, compiled typed styles and children.
function element<K extends keyof HTMLElementTagNameMap>(tag: K, attributes: Record<string, string> = {}, children: (Node | string)[] = []) {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  node.append(...children);
  return node;
}
// A direct-root layer section, positioned and styled from typed layout and appearance.
function layer(id: string, layout: Layout, appearance: Appearance, children: (Node | string)[]) {
  const section = element("section", { id }, children);
  Object.assign(section.style, compileStyle(layout, appearance, true));
  return section;
}

const text = element("strong", { id: "text" }, ["Original native controls"]);
const counter = element("button", { id: "count", type: "button" }, ["Count 0"]);
const name = element("input", { id: "name", "aria-label": "Name", value: "original" });
const toggle = element("button", { id: "toggle", type: "button" }, ["Swap color"]);
const sample = element("div", { id: "swatch" });
sample.style.cssText = `position:absolute;right:12px;bottom:12px;width:60px;height:40px;background:${swatches.blue}`;
const column = element("div", {}, [text, counter, name, toggle]);
Object.assign(column.style, compileStyle({ direction: "column", gap: 8 }));
const panel = layer("panel", { x: 20, y: 20, width: 280, height: 220, padding: 12 }, { background: "rgb(240,30,60)", color: "black" }, [column, sample]);
const sideButton = element("button", { id: "side-button", type: "button" }, ["Side"]);
const side = layer("side", { x: 340, y: 20, width: 160, height: 100, padding: 8 }, { background: "rgb(20,200,90)" }, [sideButton]);
const extra = layer("extra", { x: 520, y: 20, width: 80, height: 40 }, { background: "rgb(38,104,215)" }, ["Extra"]);

// Ordinary DOM updates: the runtime notices them itself, no framework commit is involved.
const increment = () => { count++; counter.textContent = `Count ${count}`; };
counter.addEventListener("click", increment);
sideButton.addEventListener("click", increment);
toggle.addEventListener("click", () => {
  swatch = swatch === "blue" ? "yellow" : "blue";
  sample.style.background = swatches[swatch];
});

const host = (id: string) => document.getElementById(id)!;
const controller: CanvasController = mountApplicationModule({
  outputCanvas: host("output") as HTMLCanvasElement, ordinaryHost: host("ordinary"), overlayHost: host("overlay"),
  onStatus: message => { host("status").textContent = message; },
}, { mount({ container }) {
  container.append(panel, side);
  mounts++;
  // Unmount, called once by disposal: release the layers, then remove the app's elements.
  return () => {
    for (const release of enrolled.values()) release();
    enrolled.clear();
    container.replaceChildren();
    cleanups++;
  };
} });
// Ref enrollment of the original sections, now that they are direct children of the persistent root.
for (const section of [panel, side]) enrolled.set(section.id, controller.enroll(section, { id: section.id }));

const originalRoot = controller.container, originalInput = name;
const probe: FrameworkProbe = {
  controller,
  state: () => ({
    ...controller.state(), framework: "vanilla", count, name: name.value, swatch, mounts, cleanups,
    sameRoot: controller.container === originalRoot, sameInput: document.getElementById("name") === originalInput,
  }),
  // Structural updates: append or remove a direct-root section and enroll or release it.
  async addLayer() {
    controller.container.append(extra);
    enrolled.set("extra", controller.enroll(extra, { id: "extra" }));
  },
  async removeLayer() {
    enrolled.get("extra")?.();
    enrolled.delete("extra");
    extra.remove();
  },
  async dispose() {
    await controller.dispose();
    return probe.state();
  },
};
window.frameworkProbe = probe;
for (const [id, operation] of [["enable", () => controller.enable()], ["disable", () => controller.disable()], ["dispose", probe.dispose]] as const) {
  host(id).addEventListener("click", () => { void operation().catch(error => { host("status").textContent = String(error); }); });
}
