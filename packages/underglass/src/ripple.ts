/**
 * Decorative-layer eligibility and the `setRipple` shortcut's value type. Only a decorative layer
 * (inert, aria-hidden, with no interactive descendants) may carry shader effects, so effects can
 * never distort something a user needs to click or read. The runtime and the experimental worker
 * call `decorative` at enrollment, and the runtime checks it again while effects are active.
 */

/**
 * A radial ripple for `setRipple`: `amplitude` is the displacement in CSS pixels (0..12, 0 is
 * identity), `seconds` the wave time and `playing` whether that time advances on its own.
 */
export interface Ripple {
  amplitude: number;
  seconds: number;
  playing?: boolean;
}
// Anything a user could focus, click, edit or open; a decorative layer may contain none of it,
// and a transition effect's layer boundary may not be one.
export const interactive = 'button,input,select,textarea,a[href],dialog,[popover],[tabindex]:not([tabindex="-1"]),[contenteditable]:not([contenteditable="false"]),[role="button"],[role="textbox"]';
/**
 * True when `element` is authored as decoration: `inert`, `aria-hidden="true"`, and neither it
 * nor a descendant is interactive. Only such layers may carry decorative effects; interactive
 * layers get transition effects, which hold their content inert meanwhile.
 */
export function decorative(element: HTMLElement) {
  return element.inert && element.getAttribute("aria-hidden") === "true"
    && !element.matches(interactive) && !element.querySelector(interactive);
}
/** Validates a ripple and returns a copy with `playing` defaulted to false; throws when out of range. */
export function validateRipple(value: Ripple): Ripple {
  if (!Number.isFinite(value.amplitude) || value.amplitude < 0 || value.amplitude > 12
    || !Number.isFinite(value.seconds) || value.seconds < 0 || value.seconds > 1e6
    || value.playing !== undefined && typeof value.playing !== "boolean") throw new Error("Ripple requires amplitude 0..12 CSS pixels, seconds 0..1e6 and boolean playback");
  return { amplitude: value.amplitude, seconds: value.seconds, playing: value.playing ?? false };
}
