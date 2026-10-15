/**
 * Vue 3 application on `@underglass/vue`: the shared framework-adapter app written with `Surface`, `Box`
 * and `useSurfaceRef`, mounted by `mountCanvasApp` and updated only through Vue reactivity. Render
 * functions keep it free of a template compiler. It exposes `window.frameworkProbe` for
 * `tests/helpers/framework-contract.mjs`.
 */
import { defineComponent, h, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, version } from "vue";
import {
  mountCanvasApp, Surface, Box, Presence, NativeOverlay, useSurfaceRef,
  type CanvasController, type MotionDescriptor, type TransitionResult,
} from "@underglass/vue";
import type { FrameworkProbe } from "./framework-probe";

const swatches = { blue: "rgb(20, 120, 220)", yellow: "rgb(250, 200, 20)" };
// Reactive app state, shared with the probe so tests can observe and drive the Vue app.
const count = ref(0), name = ref("original"), swatch = ref<"blue" | "yellow">("blue"), extra = ref(false);
let mounts = 0, cleanups = 0;

// Whether the side layer's badge is present, and the results `Presence` emitted for it, in order.
const badge = ref(true);
const completions: TransitionResult[] = [];
const enter: MotionDescriptor = { keyframes: [{ offset: 0, x: 12, opacity: 0 }, { offset: 1 }], timing: { duration: 120 } };
const exit: MotionDescriptor = { keyframes: [{ offset: 0 }, { offset: 1, x: 12, opacity: 0 }], timing: { duration: 120 } };

// The second layer is the app's own `<section>`, enrolled by ref rather than rendered by `Surface`. Its badge
// enters and exits through `Presence` on that layer, and its button opens a native dialog through `NativeOverlay`.
const Side = defineComponent({
  setup() {
    const side = useSurfaceRef({ id: "side" });
    const dialog = shallowRef<HTMLDialogElement | null>(null);
    return () => [
      h("section", {
        ref: side, id: "side",
        style: { position: "absolute", left: "340px", top: "20px", width: "160px", height: "100px", padding: "8px", boxSizing: "border-box", background: "rgb(20,200,90)" },
      }, [
        h("button", { id: "side-button", type: "button", onClick: () => count.value++ }, "Side"),
        h("button", { id: "dialog-open", type: "button", onClick: () => dialog.value!.showModal() }, "Dialog"),
        h(Presence, { id: "side", present: badge.value, enter, exit, onComplete: (result: TransitionResult) => completions.push(result) },
          () => h("span", { id: "badge" }, "New")),
      ]),
      h(NativeOverlay, () => h("dialog", { ref: dialog, id: "dialog", "aria-label": "Original native dialog" }, [
        h("input", { id: "dialog-input", "aria-label": "Overlay value", value: name.value, onInput: (event: Event) => { name.value = (event.target as HTMLInputElement).value; } }),
        h("button", { id: "dialog-close", type: "button", onClick: () => dialog.value!.close() }, "Close"),
      ])),
    ];
  },
});

const App = defineComponent({
  setup() {
    onMounted(() => { mounts++; });
    onBeforeUnmount(() => { cleanups++; });
    return () => [
      h(Surface, { id: "panel", layout: { x: 20, y: 20, width: 280, height: 220, padding: 12 }, appearance: { background: "rgb(240,30,60)", color: "black" } }, () => [
        h(Box, { layout: { direction: "column", gap: 8 } }, () => [
          h("strong", { id: "text" }, "Original native controls"),
          h("button", { id: "count", type: "button", onClick: () => count.value++ }, `Count ${count.value}`),
          h("input", { id: "name", "aria-label": "Name", value: name.value, onInput: (event: Event) => { name.value = (event.target as HTMLInputElement).value; } }),
          h("button", { id: "toggle", type: "button", onClick: () => { swatch.value = swatch.value === "blue" ? "yellow" : "blue"; } }, "Swap color"),
        ]),
        h("div", { id: "swatch", style: { position: "absolute", right: "12px", bottom: "12px", width: "60px", height: "40px", background: swatches[swatch.value] } }),
      ]),
      h(Side),
      extra.value ? h(Surface, { id: "extra", layout: { x: 520, y: 20, width: 80, height: 40 }, appearance: { background: "rgb(38,104,215)" } }, () => "Extra") : null,
    ];
  },
});

const host = (id: string) => document.getElementById(id)!;
const controller: CanvasController = mountCanvasApp({
  outputCanvas: host("output") as HTMLCanvasElement, ordinaryHost: host("ordinary"), overlayHost: host("overlay"),
  onStatus: message => { host("status").textContent = message; },
}, App);

const originalRoot = controller.container, originalInput = document.getElementById("name");
// The Vue page's probe adds the Vue version, the `Presence` results and a badge switch to the shared contract.
interface VueProbe extends FrameworkProbe {
  state(): ReturnType<FrameworkProbe["state"]> & { vue: string; badge: boolean; completions: TransitionResult[] };
  /** Shows or hides the side layer's badge; resolves once the DOM is patched, before `Presence` completes. */
  setBadge(present: boolean): Promise<void>;
}
const probe: VueProbe = {
  controller,
  state: () => ({
    ...controller.state(), framework: "vue", vue: version, count: count.value, name: name.value, swatch: swatch.value, mounts, cleanups,
    sameRoot: controller.container === originalRoot, sameInput: document.getElementById("name") === originalInput,
    badge: badge.value, completions: [...completions],
  }),
  // Structural updates through Vue: the `extra` Surface mounts or unmounts in the next flush.
  async addLayer() { extra.value = true; await nextTick(); },
  async removeLayer() { extra.value = false; await nextTick(); },
  async setBadge(present) { badge.value = present; await nextTick(); },
  async dispose() { await controller.dispose(); return probe.state(); },
};
window.frameworkProbe = probe;
for (const [id, operation] of [["enable", () => controller.enable()], ["disable", () => controller.disable()], ["dispose", probe.dispose]] as const) {
  host(id).addEventListener("click", () => { void operation().catch(error => { host("status").textContent = String(error); }); });
}
