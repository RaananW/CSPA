/**
 * Knob and fader behaviour for the Phase I1 prototype page (`ui-proto-instrument.html`): probe I0.7's interaction
 * model (`ui-probes/interaction.ts`, docs/ui-library/instrument-phase0.md, I0.7) on the chassis panel's range inputs,
 * in every presentation. A native `<input type="range">` maps a click left to right, so on a round dial a click on the
 * printed "10" set about 4 (the v1 prototype); a knob therefore behaves round:
 * - `pointerdown` is cancelled, so the browser never sets the value from the pointer's x; focus is set by hand and the
 *   keyboard stays native (arrows, Page keys, Home, End);
 * - **ring:** a click outside the skirt sets the value by angle (0 at the top, clockwise, the knob's sweep centred on
 *   the top, the bottom gap going to the nearer end). The scale is printed on the face at h = 0, so the angle a click
 *   makes is the angle the scale shows (I0.2: tall parts drift under perspective, printed ones do not). A click within
 *   `snap` degrees of a printed numeral sets exactly that numeral's value (a numeral's box is on whole pixels, about
 *   0.5° off its true angle);
 * - **cap:** a tap on the skirt or cap steps by a notch (`step`, at least 1% of the range), up on its upper half,
 *   down on its lower half (WCAG 2.5.7);
 * - **drag:** vertical, `dragPx` per full sweep, Shift × `fine`; a press that moves less than `tapSlop` is a tap;
 * - **wheel:** one blocking document-level listener that resolves the control with `elementFromPoint` (a listener on
 *   the input itself is unreliable inside the canvas subtree, I0.7 finding 1); a notch steps as a cap tap does;
 * - **double-click** returns to the default value.
 * The fader keeps its native vertical thumb, drag, track click and keys, and gets the wheel and the reset. Every change
 * goes through the input's `value` with `input` and `change` dispatched, so the page's own listeners see native events.
 */

export interface KnobOptions {
  /** Sweep in degrees, centred on the top. */
  sweep: number;
  /** Radius (CSS px) inside which a press is a cap tap; outside it, the ring sets the value. */
  capRadius: number;
  /** Values of the printed numerals, which a ring click within `snap` degrees sets exactly. */
  numerals: number[];
  /** The value a double-click returns to. */
  value: number;
}
export const behaviourTokens = { dragPx: 200, fine: 0.1, tapSlop: 4, snap: 2 };

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
/** A tap's and a wheel notch's step: the input's `step`, at least 1% of the range (the volume's 0.1 would need 1,000). */
const notch = (input: HTMLInputElement) => { const { span, step } = range(input); return Math.max(step, span / 100); };

/** The value at screen angle `theta` (degrees, 0 = up, clockwise) on a knob's printed scale. */
export function valueAtAngle(input: HTMLInputElement, theta: number, options: KnobOptions) {
  const { min, span } = range(input), half = options.sweep / 2;
  const fraction = theta > half ? 1 : theta < -half ? 0 : (theta + half) / options.sweep;
  // A click on (or right beside) a printed numeral sets exactly its value.
  for (const value of options.numerals) {
    const at = ((value - min) / span) * options.sweep - half;
    if (Math.abs(at - theta) <= behaviourTokens.snap) return value;
  }
  return min + fraction * span;
}

/** Where a press landed on a dial: the cap (a tap steps) or the scale ring (a click sets by angle). */
function region(input: HTMLInputElement, x: number, y: number, options: KnobOptions) {
  const box = input.getBoundingClientRect(), dx = x - (box.left + box.width / 2), dy = y - (box.top + box.height / 2);
  return { cap: Math.hypot(dx, dy) < options.capRadius, upper: dy < 0, theta: (Math.atan2(dx, -dy) * 180) / Math.PI };
}

/** Round behaviour on a knob's range input; returns a detach function. */
export function attachKnob(input: HTMLInputElement, options: () => KnobOptions) {
  let gesture: { id: number; x: number; y: number; last: number; moved: boolean; raw: number; start: string } | undefined;
  const down = (event: PointerEvent) => {
    if (event.button !== 0 || gesture) return;
    // Cancelled: the browser would set the value from the pointer's x. Focus and the keyboard stay native.
    event.preventDefault();
    input.focus({ preventScroll: true });
    input.setPointerCapture?.(event.pointerId);
    gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, last: event.clientY, moved: false, raw: Number(input.value), start: input.value };
  };
  const move = (event: PointerEvent) => {
    if (!gesture || event.pointerId !== gesture.id) return;
    if (!gesture.moved && Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) < behaviourTokens.tapSlop) return;
    gesture.moved = true;
    const { min, max, span } = range(input);
    gesture.raw += ((gesture.last - event.clientY) / behaviourTokens.dragPx) * span * (event.shiftKey ? behaviourTokens.fine : 1);
    gesture.last = event.clientY;
    gesture.raw = Math.min(max, Math.max(min, gesture.raw));
    commit(input, gesture.raw);
  };
  const end = (event: PointerEvent, cancelled: boolean) => {
    if (!gesture || event.pointerId !== gesture.id) return;
    const { moved, start } = gesture;
    gesture = undefined;
    if (cancelled) return;
    if (moved) { if (input.value !== start) finish(input); return; }
    // No drag: the single-pointer alternative. The ring sets the value at the pressed angle, the cap steps it.
    const current = options(), where = region(input, event.clientX, event.clientY, current);
    const changed = where.cap ? commit(input, Number(input.value) + (where.upper ? 1 : -1) * notch(input)) : commit(input, valueAtAngle(input, where.theta, current));
    if (changed) finish(input);
  };
  const up = (event: PointerEvent) => end(event, false), cancel = (event: PointerEvent) => end(event, true);
  const reset = () => { if (commit(input, options().value)) finish(input); };
  input.addEventListener("pointerdown", down);
  input.addEventListener("pointermove", move);
  input.addEventListener("pointerup", up);
  input.addEventListener("pointercancel", cancel);
  input.addEventListener("dblclick", reset);
  return () => {
    input.removeEventListener("pointerdown", down); input.removeEventListener("pointermove", move);
    input.removeEventListener("pointerup", up); input.removeEventListener("pointercancel", cancel); input.removeEventListener("dblclick", reset);
  };
}
/** The fader keeps the native thumb, drag, track click and keys; it adds the reset. */
export function attachFader(input: HTMLInputElement, value: () => number) {
  const reset = () => { if (commit(input, value())) finish(input); };
  input.addEventListener("dblclick", reset);
  return () => input.removeEventListener("dblclick", reset);
}
/**
 * The wheel: one blocking listener on the document finds the control under the pointer by position (I0.7 finding 1).
 * Notches up raise the value by `step`; the page does not scroll while the pointer is over a knob or fader.
 */
export function attachWheel(matches: (element: Element) => HTMLInputElement | undefined) {
  document.addEventListener("wheel", event => {
    const under = document.elementFromPoint(event.clientX, event.clientY), input = under ? matches(under) : undefined;
    if (!input) return;
    event.preventDefault();
    if (commit(input, Number(input.value) + (event.deltaY < 0 ? 1 : -1) * notch(input))) finish(input);
  }, { passive: false });
}
