/**
 * Panel motion in the CSS presentation (design language section 12): panels enter and leave through depth, from
 * the modal level towards their own, optionally tilted. The panel is inert while it moves, so nothing inside it
 * takes input mid-transition. Under `prefers-reduced-motion` the change is instant. In face mode (GPU on) the CSS
 * motion is off, because an enrolled panel's boundary never carries a CSS transform; the GPU presentation moves it.
 */

export interface PanelMotionOptions {
  /** Tilt while moving, in degrees around the horizontal axis; clamped to `camera.tiltMax`. 0 by default. */
  tilt?: number;
}

/** Each moving or departed panel's own `inert` value, restored when it has entered again. */
const restingInert = new WeakMap<HTMLElement, boolean>();

const tiltMaxOf = (element: Element) => Number.parseFloat(getComputedStyle(element).getPropertyValue("--strata-camera-tilt-max")) || 25;

/** Runs one motion on `panel` and resolves when it ends, with the panel inert meanwhile. */
async function move(panel: HTMLElement, motion: "enter" | "leave", { tilt = 0 }: PanelMotionOptions): Promise<void> {
  const limit = tiltMaxOf(panel);
  if (!restingInert.has(panel)) restingInert.set(panel, panel.inert);
  panel.inert = true;
  panel.style.setProperty("--strata-panel-tilt", `${Math.max(-limit, Math.min(limit, tilt))}deg`);
  panel.dataset.strataMotion = motion;
  try {
    // Reduced motion and face mode set no animation, so this resolves at once.
    await Promise.allSettled(panel.getAnimations().filter(animation => (animation as CSSAnimation).animationName?.startsWith("ug-panel-")).map(animation => animation.finished));
  } finally {
    // A leaving panel keeps its final state until the caller hides or removes it.
    if (motion === "enter") delete panel.dataset.strataMotion;
    panel.style.removeProperty("--strata-panel-tilt");
    if (panel.getAttribute("style") === "") panel.removeAttribute("style");
    if (motion === "enter") { panel.inert = restingInert.get(panel) ?? false; restingInert.delete(panel); }
  }
}

/** Brings `panel` in through depth. Show it (for example remove `hidden`) before calling. */
export function strataEnter(panel: HTMLElement, options: PanelMotionOptions = {}): Promise<void> {
  return move(panel, "enter", options);
}

/**
 * Takes `panel` out through depth. It stays inert and invisible at the end; hide or remove it afterwards, and call
 * `strataEnter` to bring it back.
 */
export function strataLeave(panel: HTMLElement, options: PanelMotionOptions = {}): Promise<void> {
  return move(panel, "leave", options);
}
