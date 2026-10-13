export interface CanvasHosts {
  outputCanvas: HTMLCanvasElement;
  ordinaryHost: HTMLDivElement;
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
  for (const node of [outputCanvas, ordinaryHost]) {
    Object.assign(node.style, { position: "absolute", left: "0", top: "0", width: "100%", height: "100%" });
  }
  // The renderer enables pointer events while GPU output is presented.
  outputCanvas.style.pointerEvents = "none";
  outputCanvas.hidden = true;
  if (getComputedStyle(frame).position === "static") frame.style.position = "relative";
  frame.append(outputCanvas, ordinaryHost, overlayHost);
  return { outputCanvas, ordinaryHost, overlayHost, remove() { outputCanvas.remove(); ordinaryHost.remove(); overlayHost.remove(); } };
}
