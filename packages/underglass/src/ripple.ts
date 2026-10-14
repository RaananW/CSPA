export interface Ripple {
  amplitude: number;
  seconds: number;
  playing?: boolean;
}
export const interactive = 'button,input,select,textarea,a[href],dialog,[popover],[tabindex]:not([tabindex="-1"]),[contenteditable]:not([contenteditable="false"]),[role="button"],[role="textbox"]';
export function decorative(element: HTMLElement) {
  return element.inert && element.getAttribute("aria-hidden") === "true"
    && !element.matches(interactive) && !element.querySelector(interactive);
}
export function validateRipple(value: Ripple): Ripple {
  if (!Number.isFinite(value.amplitude) || value.amplitude < 0 || value.amplitude > 12
    || !Number.isFinite(value.seconds) || value.seconds < 0 || value.seconds > 1e6
    || value.playing !== undefined && typeof value.playing !== "boolean") throw new Error("Ripple requires amplitude 0..12 CSS pixels, seconds 0..1e6 and boolean playback");
  return { amplitude: value.amplitude, seconds: value.seconds, playing: value.playing ?? false };
}
