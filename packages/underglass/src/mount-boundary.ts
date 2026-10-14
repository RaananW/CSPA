export interface MountBoundaryOptions {
  /** @deprecated Unused: native capture happens on `outputCanvas`. Accepted for compatibility and removed on dispose. */
  captureHost?: HTMLCanvasElement;
  outputCanvas: HTMLCanvasElement;
  ordinaryHost: HTMLElement;
  mount(container: HTMLDivElement): () => void;
}

export function createMountBoundary(options: MountBoundaryOptions) {
  const { captureHost, outputCanvas, ordinaryHost } = options;
  const document = ordinaryHost.ownerDocument;
  function validateDestinations() {
    if (captureHost === outputCanvas || ordinaryHost === captureHost || ordinaryHost === outputCanvas
      || [captureHost ?? outputCanvas, outputCanvas, ordinaryHost].some(node => node.ownerDocument !== document || !node.isConnected)
      || !ordinaryHost.parentElement || captureHost && captureHost.parentElement !== ordinaryHost.parentElement
      || outputCanvas.parentElement !== ordinaryHost.parentElement) {
      throw new Error("Mount boundary requires distinct connected same-document sibling hosts");
    }
  }
  validateDestinations();
  if (ordinaryHost.childNodes.length || captureHost?.childNodes.length || outputCanvas.childNodes.length) {
    throw new Error("Mount boundary requires empty adapter-owned hosts");
  }
  const container = document.createElement("div");
  container.className = "app-container";
  ordinaryHost.append(container); // Adapter-owned, before the persistent React root is created.
  let unmount: () => void;
  try { unmount = options.mount(container); }
  catch (error) { container.remove(); throw error; }
  let disposed = false;
  function assertMovable() {
    if (disposed) throw new Error("Mount boundary is disposed");
    validateDestinations();
    if (container.parentElement !== ordinaryHost && container.parentElement !== outputCanvas) {
      throw new Error("Root container left the adapter-owned destinations");
    }
    if (typeof ordinaryHost.moveBefore !== "function" || typeof outputCanvas.moveBefore !== "function") {
      throw new Error("State-preserving Element.moveBefore unavailable");
    }
  }
  function moveTo(destination: HTMLElement) {
    if (disposed) throw new Error("Mount boundary is disposed");
    if (container.parentElement === destination) return false;
    assertMovable();
    destination.moveBefore(container, null);
    return true;
  }
  return {
    container,
    assertMovable,
    moveToCapture: () => moveTo(outputCanvas),
    moveToDOM: () => moveTo(ordinaryHost),
    dispose() {
      if (disposed) return;
      if (container.parentElement !== ordinaryHost) throw new Error("Recover to ordinary DOM before unmounting");
      unmount();
      container.remove();
      disposed = true;
    },
  };
}
