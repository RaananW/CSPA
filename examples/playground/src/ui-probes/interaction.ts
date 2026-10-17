/**
 * Probe I0.7 (docs/ui-library/instrument.md): do a Knob and a Fader pass as sliders with real pointer and keyboard
 * input, with the WCAG 2.5.7 single-pointer alternative, in plain DOM and on the GPU? Both are native
 * `<input type="range">` in the Strata markup conventions (a `<label>`, `data-strata-*` markers). The knob's plain-DOM
 * behaviour is vertical drag (`data-drag-px` per full sweep, `data-fine` times that with Shift), wheel steps, a double
 * click that resets to the default, a click on the scale ring that sets the value and a tap on the cap's upper or lower
 * half that steps it. Everything goes through the input's `value` with `input` and `change` dispatched; the keyboard is
 * the native one. The fader keeps the native thumb, drag and track click, and adds the wheel and the reset. The same
 * panel is presented by `attachStrataGpu` at the Relief level (`?dom` starts in the CSS presentation). The fader has no
 * `data-strata-face`: Relief's `groove` assumes a horizontal slider and draws a vertical one wrongly (see the report).
 * `window.instrumentProbe` is the hook for `tests/browser/ui-probe-instrument-interaction.test.mjs`.
 */
import "@underglass/ui/css";
import { compileStyle, mountApplicationModule, type CanvasController } from "@underglass/core";
import { attachStrataGpu, type StrataGpu } from "@underglass/ui/gpu";

const DEG = 180 / Math.PI;
/** The knob's sweep in degrees, centred on the top; the gap is at the bottom. */
const SWEEP = 270;
/** A press that moves less than this many CSS px is a tap, not a drag. */
const TAP_SLOP = 4;
/** The cap's radius as a fraction of the dial's half width: inside it a tap steps, outside it the ring sets. */
const CAP_RADIUS = 32 / 60;

const format = (value: number) => `${value < 0 ? "−" : ""}${Math.abs(value)} dB`;
const events: { id: string; type: string; value: string }[] = [];

function range(input: HTMLInputElement) {
  const min = Number(input.min), max = Number(input.max);
  return { min, max, span: max - min, step: Number(input.step) > 0 ? Number(input.step) : 1 };
}
/** Sets the value through the input (the browser snaps it to `step`), then dispatches `input` when it changed. */
function commit(input: HTMLInputElement, raw: number): boolean {
  const { min, max } = range(input), before = input.value;
  input.value = String(Math.min(max, Math.max(min, raw)));
  if (input.value === before) return false;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  return true;
}
const finish = (input: HTMLInputElement) => input.dispatchEvent(new Event("change", { bubbles: true }));

/** Keeps `aria-valuetext` (and the knob's cap angle) in step with the value, whoever changed it. */
function follow(input: HTMLInputElement) {
  const update = () => {
    const { min, span } = range(input), value = Number(input.value);
    input.setAttribute("aria-valuetext", format(value));
    input.closest<HTMLElement>(".pk-dial")?.style.setProperty("--pk-angle", `${(value - min) / span * SWEEP - SWEEP / 2}deg`);
  };
  input.addEventListener("input", update);
  update();
  for (const type of ["input", "change"]) input.addEventListener(type, () => events.push({ id: input.id, type, value: input.value }));
}
/**
 * The wheel steps by `step` (notches up raise the value); the page does not scroll while the pointer is over the control.
 * One blocking listener on the document finds the control under the pointer by position: in GPU mode a blocking
 * listener on the input itself does not stop the page scrolling and does not receive the event reliably (probe I0.7).
 */
function wheel(inputs: HTMLInputElement[]) {
  document.addEventListener("wheel", event => {
    const under = document.elementFromPoint(event.clientX, event.clientY);
    const input = inputs.find(candidate => candidate === under);
    if (!input) return;
    event.preventDefault();
    const { step } = range(input);
    if (commit(input, Number(input.value) + (event.deltaY < 0 ? 1 : -1) * step)) finish(input);
  }, { passive: false });
}
function resetOnDoubleClick(input: HTMLInputElement) {
  input.addEventListener("dblclick", () => { if (commit(input, Number(input.dataset.default ?? input.defaultValue))) finish(input); });
}

/** Where a press landed on the dial: the cap (inner circle) or the scale ring (everything outside it, corners included). */
function region(input: HTMLInputElement, x: number, y: number) {
  const box = input.getBoundingClientRect(), dx = x - (box.left + box.width / 2), dy = y - (box.top + box.height / 2);
  return { cap: Math.hypot(dx, dy) < CAP_RADIUS * box.width / 2, upper: dy < 0, theta: Math.atan2(dx, -dy) * DEG };
}
/** The value at the angle `theta` (0 = up, clockwise): the bottom gap goes to the nearer end of the sweep. */
function valueAt(input: HTMLInputElement, theta: number) {
  const { min, span } = range(input), half = SWEEP / 2;
  const fraction = theta > half ? 1 : theta < -half ? 0 : (theta + half) / SWEEP;
  return min + fraction * span;
}

function attachKnob(input: HTMLInputElement) {
  follow(input);
  resetOnDoubleClick(input);
  const dragPx = Number(input.dataset.dragPx ?? 200), fine = Number(input.dataset.fine ?? 0.1);
  let gesture: { id: number; x: number; y: number; last: number; moved: boolean; raw: number; start: string } | undefined;
  // Our drag replaces the native one on the cap: cancelling pointerdown stops the browser setting the value from the
  // pointer's x, and the keyboard and focus stay native.
  input.addEventListener("pointerdown", event => {
    if (event.button !== 0 || gesture) return;
    event.preventDefault();
    input.focus({ preventScroll: true });
    input.setPointerCapture(event.pointerId);
    gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, last: event.clientY, moved: false, raw: Number(input.value), start: input.value };
  });
  input.addEventListener("pointermove", event => {
    if (!gesture || event.pointerId !== gesture.id) return;
    if (!gesture.moved && Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) < TAP_SLOP) return;
    gesture.moved = true;
    const { min, max, span } = range(input);
    gesture.raw += (gesture.last - event.clientY) / dragPx * span * (event.shiftKey ? fine : 1);
    gesture.last = event.clientY;
    gesture.raw = Math.min(max, Math.max(min, gesture.raw));
    commit(input, gesture.raw);
  });
  const end = (event: PointerEvent, cancelled: boolean) => {
    if (!gesture || event.pointerId !== gesture.id) return;
    const { moved, start } = gesture;
    gesture = undefined;
    if (cancelled) return;
    if (moved) { if (input.value !== start) finish(input); return; }
    // No drag: the single-pointer alternative. The ring sets the value at the pressed angle, the cap steps it.
    const where = region(input, event.clientX, event.clientY);
    const changed = where.cap
      ? commit(input, Number(input.value) + (where.upper ? 1 : -1) * range(input).step)
      : commit(input, valueAt(input, where.theta));
    if (changed) finish(input);
  };
  input.addEventListener("pointerup", event => end(event, false));
  input.addEventListener("pointercancel", event => end(event, true));
  if (input.hasAttribute("data-detents")) input.closest(".pk-dial")!.querySelector(".pk-pointer")!.setAttribute("data-detented", "");
}
/** The fader keeps the native thumb, drag, track click and keys; it adds the wheel and the reset. */
function attachFader(input: HTMLInputElement) {
  follow(input);
  resetOnDoubleClick(input);
}

const markup = `
  <h2 id="pk-title" style="margin:0 0 12px;font-size:18px">Channel</h2>
  <div class="pk-row">
    <label class="pk-knob" id="pk-knob-label"><span class="pk-name">Gain</span>
      <span class="pk-dial" data-strata-instrument="knob"><span class="pk-ring" aria-hidden="true"></span>
        <span class="pk-cap" data-strata-face="knob" aria-hidden="true"><span class="pk-pointer"></span></span>
        <input type="range" class="pk-knob__input" id="pk-knob" min="-24" max="12" step="1" value="0" data-default="0"
          data-detents data-drag-px="200" data-fine="0.1" aria-valuetext="0 dB"></span></label>
    <label class="pk-fader" id="pk-fader-label"><span class="pk-name">Level</span>
      <span class="pk-slot" data-strata-instrument="fader"><input type="range" class="pk-fader__input" id="pk-fader"
        min="-60" max="6" step="1" value="-6" data-default="-6" aria-orientation="vertical" aria-valuetext="−6 dB"></span></label>
  </div>
  <p class="pk-read" id="pk-read">Gain 0 dB, level −6 dB</p>`;

let strata: StrataGpu | undefined;
let panel!: HTMLElement;
const controller: CanvasController = mountApplicationModule({
  outputCanvas: document.getElementById("output") as HTMLCanvasElement, ordinaryHost: document.getElementById("ordinary")!,
  overlayHost: document.getElementById("overlay")!,
  onStatus: message => { document.getElementById("status")!.textContent = message; },
  onStatusChange: () => strata?.refresh(),
}, { mount({ container }) {
  panel = document.createElement("section");
  panel.className = "ug-panel";
  panel.id = "pk-panel";
  panel.setAttribute("data-strata-face", "raised");
  panel.setAttribute("data-strata-elevation", "floating");
  panel.setAttribute("aria-labelledby", "pk-title");
  Object.assign(panel.style, compileStyle({ x: 40, y: 30, width: 400 }, {}, true));
  panel.innerHTML = markup;
  container.append(panel);
  const knob = panel.querySelector<HTMLInputElement>("#pk-knob")!, fader = panel.querySelector<HTMLInputElement>("#pk-fader")!;
  attachKnob(knob);
  attachFader(fader);
  wheel([knob, fader]);
  const read = panel.querySelector("#pk-read")!;
  panel.addEventListener("input", () => { read.textContent = `Gain ${knob.getAttribute("aria-valuetext")}, level ${fader.getAttribute("aria-valuetext")}`; });
  return () => container.replaceChildren();
} });

const params = new URLSearchParams(location.search);
strata = attachStrataGpu(controller);
document.getElementById("enable")!.addEventListener("click", () => void controller.enable());
document.getElementById("disable")!.addEventListener("click", () => void controller.disable());
if (!params.has("dom")) void controller.enable().then(() => strata?.refresh());

declare global { interface Window { instrumentProbe: unknown } }
window.instrumentProbe = {
  controller, panel: () => panel, scene: () => strata?.scene(panel), refresh: () => strata?.refresh(),
  events: () => [...events], clearEvents: () => { events.length = 0; },
};
