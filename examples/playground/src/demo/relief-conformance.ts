/**
 * Entry for `relief-conformance.html`: renders one case of the Strata Rendering Model's conformance suite with core's
 * built-in `relief` material (or, for version 2 cases, its `objects` material), so `tests/browser/relief.test.mjs`
 * and `tests/browser/objects.test.mjs` can compare decoded GPU pixels with the suites' expectations. The case's capture (rounded rectangles in order) is painted as plain DOM in a layer at `ORIGIN`;
 * the case's scene becomes the layer's material. Only `@underglass/core` is used: the scene format is the contract.
 * `window.conformanceProbe` is the test hook.
 */
import { compileStyle, mountApplicationModule, type CanvasController, type MaterialHandle, type ReliefScene } from "@underglass/core";

/** Where the layer's top-left corner sits in the frame, in CSS px. */
const ORIGIN = { x: 40, y: 40 };
interface CapturePaint { rect: [number, number, number, number]; radius?: number; colour: string }
interface ConformanceCase { name: string; scene: ReliefScene; capture: CapturePaint[] }

const host = (id: string) => document.getElementById(id)!;
let release: (() => void) | undefined;
let section: HTMLElement | undefined;
let material: MaterialHandle | undefined;
let root!: HTMLElement;
const controller: CanvasController = mountApplicationModule({
  outputCanvas: host("output") as HTMLCanvasElement, ordinaryHost: host("ordinary"), overlayHost: host("overlay"),
  onStatus: message => { host("status").textContent = message; },
}, { mount({ container }) {
  root = container;
  return () => { release?.(); container.replaceChildren(); };
} });

/** Replaces the shown case: paints its capture as a new layer, enrolls it and gives it the case's scene. */
async function show(entry: ConformanceCase) {
  const kind = entry.scene.version === 2 ? "objects" : "relief";
  material?.cancel();
  release?.();
  section?.remove();
  const { width, height } = entry.scene.extent;
  section = document.createElement("section");
  section.id = "case";
  section.dataset.case = entry.name;
  Object.assign(section.style, compileStyle({ x: ORIGIN.x, y: ORIGIN.y, width, height }, {}, true));
  for (const paint of entry.capture) {
    const [x, y, w, h] = paint.rect;
    const div = document.createElement("div");
    div.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;border-radius:${paint.radius ?? 0}px;background:${paint.colour}`;
    section.append(div);
  }
  root.append(section);
  release = controller.enroll(section, { id: "case" });
  await controller.settle();
  if (controller.state().mode !== "gpu") await controller.enable();
  material = controller.setMaterial("case", { kind, scene: entry.scene, bounds: "layer", interaction: "material", media: "identity", fallback: "static" });
  await controller.settle();
  const state = controller.state();
  return { mode: state.mode, reason: state.reason, revision: state.registryRevision };
}

window.conformanceProbe = {
  origin: ORIGIN,
  show,
  update: async (scene: ReliefScene) => { material!.update(scene); await controller.settle(); return controller.state().registryRevision; },
  state: () => controller.state(),
  settle: () => controller.settle(),
  dispose: () => controller.dispose(),
};
// GPU is enabled by the first `show`: admission needs an enrolled layer.

declare global {
  interface Window { conformanceProbe: {
    origin: typeof ORIGIN;
    show(entry: ConformanceCase): Promise<{ mode: string; reason: string; revision: number }>;
    update(scene: ReliefScene): Promise<number>;
    state(): ReturnType<CanvasController["state"]>;
    settle(): Promise<void>;
    dispose(): ReturnType<CanvasController["dispose"]>;
  } }
}
