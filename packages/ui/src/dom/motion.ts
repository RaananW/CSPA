/**
 * Panel motion in the CSS presentation (design language section 12): panels enter and leave through depth, from
 * the modal level towards their own, optionally tilted. The panel is inert while it moves, so nothing inside it
 * takes input mid-transition. Under `prefers-reduced-motion` the change is instant. In face mode (GPU on) the CSS
 * motion is off, because an enrolled panel's boundary never carries a CSS transform: `@underglass/ui/gpu` gives each
 * panel it presents a mover (`panelMotion`), and the same calls move the panel through depth on the GPU.
 */

export interface PanelMotionOptions {
  /** Tilt while moving, in degrees around the horizontal axis; clamped to `camera.tiltMax`. 0 by default. */
  tilt?: number;
}

/**
 * The key under which `@underglass/ui/gpu` sets a panel's GPU mover. It is a registered symbol, so this module and the
 * GPU helper agree on it even when they come from separate bundles. A mover starts the GPU motion synchronously and
 * resolves when it ends.
 */
export const panelMotion = Symbol.for("underglass.strata.panelMotion");
export type PanelMover = (motion: "enter" | "leave", options: { tilt: number }) => Promise<void>;

/** Each moving or departed panel's own `inert` value, restored when it has entered again. */
const restingInert = new WeakMap<HTMLElement, boolean>();

const tiltMaxOf = (element: Element) => Number.parseFloat(getComputedStyle(element).getPropertyValue("--strata-camera-tilt-max")) || 25;

/** Runs one motion on `panel` and resolves when it ends, with the panel inert meanwhile. */
async function move(panel: HTMLElement, motion: "enter" | "leave", { tilt = 0 }: PanelMotionOptions): Promise<void> {
  const limit = tiltMaxOf(panel);
  if (!restingInert.has(panel)) restingInert.set(panel, panel.inert);
  panel.inert = true;
  const clamped = Math.max(-limit, Math.min(limit, tilt));
  const mover = (panel as HTMLElement & { [panelMotion]?: PanelMover })[panelMotion];
  if (mover && panel.getAttribute("data-strata-mode") === "face") {
    // On the GPU: the layer's own transform and opacity move it, so the boundary keeps no CSS motion. An entering panel
    // shows its content once the motion has started from its far pose; a leaving one is hidden by CSS once it ends.
    try {
      const moving = mover(motion, { tilt: clamped });
      if (motion === "enter") delete panel.dataset.strataMotion;
      await moving;
    } finally {
      if (motion === "leave") panel.dataset.strataMotion = "leave";
      else { panel.inert = restingInert.get(panel) ?? false; restingInert.delete(panel); }
    }
    return;
  }
  panel.style.setProperty("--strata-panel-tilt", `${clamped}deg`);
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
