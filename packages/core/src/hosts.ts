/**
 * Convenience scaffolding for the explicit mount boundary. Mount functions (`mountCanvasApp`,
 * `mountApplicationModule`) require empty, connected, same-document sibling hosts outside every
 * framework root; `createCanvasHosts` builds them inside an application-owned frame so callers do
 * not hand-write the host styles.
 */

/** The adapter-owned hosts returned by `createCanvasHosts`, ready to pass to a mount function. */
export interface CanvasHosts {
  /** Owning WebGPU output canvas; in GPU mode the original application root is moved inside it. */
  outputCanvas: HTMLCanvasElement;
  /** Holds the original application root before GPU admission and after recovery or `disable()`. */
  ordinaryHost: HTMLDivElement;
  /** Empty host for `NativeOverlay` portals; native dialogs and popovers stay outside capture. */
  overlayHost: HTMLDivElement;
  /** Removes the hosts; call only after the controller is disposed. */
  remove(): void;
}

/**
 * Creates the adapter-owned sibling hosts `mountCanvasApp` requires inside a
 * sized frame: the GPU output canvas, the ordinary DOM host and the native
 * overlay host. The output canvas is not `aria-hidden`: in GPU mode the
 * original controls live inside it and must stay in the accessibility tree.
 */
export function createCanvasHosts(frame: HTMLElement): CanvasHosts {
  const document = frame.ownerDocument;
  if (!frame.isConnected) throw new Error("Canvas hosts require a connected frame");
  const outputCanvas = document.createElement("canvas");
  const ordinaryHost = document.createElement("div");
  const overlayHost = document.createElement("div");
  // Both presentations fill the frame at the same origin, so DOM and GPU layouts coincide.
  for (const node of [outputCanvas, ordinaryHost]) {
    Object.assign(node.style, { position: "absolute", left: "0", top: "0", width: "100%", height: "100%" });
  }
  // The renderer enables pointer events while GPU output is presented.
  outputCanvas.style.pointerEvents = "none";
  // Ordinary DOM is the initial presentation; admission reveals the canvas.
  outputCanvas.hidden = true;
  // The absolutely positioned hosts need a containing block; only a static frame is changed.
  if (getComputedStyle(frame).position === "static") frame.style.position = "relative";
  frame.append(outputCanvas, ordinaryHost, overlayHost);
  return { outputCanvas, ordinaryHost, overlayHost, remove() { outputCanvas.remove(); ordinaryHost.remove(); overlayHost.remove(); } };
}
