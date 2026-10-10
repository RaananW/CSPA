import { useEffect, useRef, useState, version } from "react";
import {
  mountCanvasApp, Box, Surface, NativeOverlay, useSurfaceRef,
  type CanvasController, type Transform,
} from "canvas-spa-phase-one";

let mounts = 0, cleanups = 0;
function App() {
  const [name, setName] = useState("original");
  const [saved, setSaved] = useState("");
  const [count, setCount] = useState(0);
  const [checked, setChecked] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const popover = useRef<HTMLDivElement>(null);
  const ref = useSurfaceRef<HTMLElement>({ id: "adopted" });
  useEffect(() => { mounts++; return () => { cleanups++; }; }, []);
  return <>
    <Surface id="editor" layout={{ x: 20, y: 20, width: 280, height: 240, padding: 12 }}
      appearance={{ background: "rgb(240,30,60)", color: "black" }}>
      <Box layout={{ direction: "column", gap: 8 }}>
        <strong id="text">Original native controls</strong>
        <button id="count" onClick={() => setCount(value => value + 1)}>Count {count}</button>
        <form onSubmit={event => { event.preventDefault(); setSaved(name); }}>
          <label id="label" htmlFor="name">Name</label>
          <input id="name" value={name} onChange={event => setName(event.target.value)} />
          <button id="save">Save</button>
        </form>
        <input id="native" aria-label="Uncontrolled value" defaultValue="native" />
        <output id="saved">{saved || "Not saved"}</output>
      </Box>
    </Surface>
    <section ref={ref} id="adopted" style={{ position: "absolute", left: 340, top: 20, width: 160, height: 100, background: "rgb(20,200,90)" }}>
      <button id="adopted-button" onClick={() => setCount(value => value + 1)}>Adopted control</button>
      <label><input id="checked" type="checkbox" checked={checked} onChange={event => setChecked(event.target.checked)} />Checked</label>
    </section>
    <NativeOverlay>
      <div style={{ position: "absolute", left: 20, top: 320 }}>
        <p id="not-enrolled">Ordinary unenrolled text</p>
        <button id="dialog-open" onClick={() => dialog.current!.showModal()}>Dialog</button>
        <button id="popover-open" onClick={() => popover.current!.showPopover()}>Popover</button>
      </div>
      <dialog ref={dialog} id="dialog" aria-labelledby="dialog-title">
        <h2 id="dialog-title">Original native dialog</h2>
        <form method="dialog">
          <label htmlFor="dialog-input">Overlay value</label><input id="dialog-input" defaultValue="overlay" autoFocus />
          <button id="dialog-close">Close dialog</button>
        </form>
      </dialog>
      <div ref={popover} id="popover" {...{ popover: "auto" }} aria-label="Original native popover">
        <label htmlFor="popover-input">Popover value</label><input id="popover-input" defaultValue="popover" />
        <button onClick={() => popover.current!.hidePopover()}>Close popover</button>
      </div>
    </NativeOverlay>
  </>;
}

function host<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing consumer host ${id}`);
  return element as T;
}
const controller = mountCanvasApp({
  captureHost: host<HTMLCanvasElement>("capture"), outputCanvas: host<HTMLCanvasElement>("output"),
  ordinaryHost: host("ordinary"), overlayHost: host("overlay"), strict: true,
  onStatus: message => { host("status").textContent = message; },
}, <App />);
const originalInput = host<HTMLInputElement>("name");
const originalRoot = controller.container;
const actions: (() => void)[] = [];
async function dispose() {
  await controller.dispose();
  for (const remove of actions.splice(0)) remove();
}
const contract = {
  controller, dispose,
  state: () => ({
    ...controller.state(), version, mounts, cleanups,
    sameInput: document.getElementById("name") === originalInput,
    sameRoot: controller.container === originalRoot,
    selection: [originalInput.selectionStart, originalInput.selectionEnd],
    focus: document.activeElement?.id,
    value: originalInput.value,
  }),
  transform: (value: Transform) => controller.setTransform("editor", value),
};
declare global {
  interface Window {
    packageConsumer: {
      controller: CanvasController;
      dispose: typeof dispose;
      state: typeof contract.state;
      transform: typeof contract.transform;
    };
  }
}
window.packageConsumer = contract;
for (const [id, operation] of [
  ["enable", () => controller.enable()], ["disable", () => controller.disable()], ["dispose", dispose],
] as const) {
  const element = host(id);
  const listener = () => { void operation().catch(error => {
    host("status").textContent = String(error);
    console.error(error);
  }); };
  element.addEventListener("click", listener);
  actions.push(() => element.removeEventListener("click", listener));
}
