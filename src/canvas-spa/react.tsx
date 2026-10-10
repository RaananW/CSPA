import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, StrictMode, type HTMLAttributes, type ReactNode, type RefCallback } from "react";
import { createPortal, flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { CanvasRuntime, type RuntimeOptions } from "./runtime.js";
import { affine, type Transform } from "./affine.js";
import { compileStyle, type Layout, type Appearance } from "./compiler.js";
import type { EnrollmentOptions } from "./enrollment.js";
import type { MotionDescriptor, TransitionResult } from "./motion.js";

const Context = createContext<CanvasRuntime | null>(null);

export function GPUHost({ runtime, children }: { runtime: CanvasRuntime; children: ReactNode }) {
  return <Context.Provider value={runtime}>{children}</Context.Provider>;
}
function useRuntime() {
  const runtime = useContext(Context);
  if (!runtime) throw new Error("CanvasSPA components require GPUHost and the explicit mount adapter");
  return runtime;
}
export type CanvasController = Pick<CanvasRuntime, "container" | "enroll" | "transition" | "transitionGroup" | "setTransform" | "animate" | "enable" | "disable" | "dispose" | "invalidate" | "settle" | "state" | "ownAnimation" | "ownCSSAnimation" | "createMotion" | "advance" | "setRipple" | "setEffects">;
export function useGPUHost(): CanvasController { return useRuntime(); }
export function useNativeOverlayHost(): HTMLElement {
  const host = useRuntime().overlayHost;
  if (!host) throw new Error("Native overlay requires the adapter-owned overlayHost");
  return host;
}
export function useSurfaceRef<T extends HTMLElement = HTMLElement>({ id, decorative }: EnrollmentOptions): RefCallback<T> {
  const runtime = useRuntime();
  const attached = useRef<T | null>(null);
  const release = useRef<(() => void) | undefined>(undefined);
  const ref = useCallback((element: T | null) => {
    if (attached.current === element) return;
    release.current?.();
    release.current = undefined;
    attached.current = null;
    if (element) {
      release.current = runtime.enroll(element, { id, decorative });
      attached.current = element;
    }
  }, [runtime, id, decorative]);
  // React18 StrictMode replays effects but not callback refs.
  useLayoutEffect(() => {
    if (attached.current && !release.current) release.current = runtime.enroll(attached.current, { id, decorative });
    return () => { release.current?.(); release.current = undefined; };
  }, [runtime, id, decorative]);
  return ref;
}
export interface PresenceProps {
  id: string;
  present: boolean;
  enter: MotionDescriptor;
  exit: MotionDescriptor;
  children: ReactNode;
  onComplete?: (result: TransitionResult) => void;
}
export function Presence({ id, present, enter, exit, children, onComplete }: PresenceProps) {
  const runtime = useRuntime();
  const [retained, setRetained] = useState(present);
  const previous = useRef(present);
  const pending = useRef(false);
  const generation = useRef(0);
  const motion = useRef<ReturnType<CanvasRuntime["transition"]> | undefined>(undefined);
  const completion = useRef(onComplete);
  completion.current = onComplete;
  const enterKey = JSON.stringify(enter), exitKey = JSON.stringify(exit);
  useEffect(() => {
    if (previous.current !== present) pending.current = true;
    if (!pending.current) return;
    previous.current = present;
    if (present && !retained) { setRetained(true); return; }
    pending.current = false;
    if (!retained) return;
    const version = ++generation.current;
    const handle = runtime.transition(id, present ? enter : exit);
    motion.current = handle;
    void handle.finished.then(result => {
      if (version !== generation.current) return;
      if (!present) setRetained(false);
      completion.current?.(result);
    });
  }, [runtime, id, present, retained, enterKey, exitKey]);
  useEffect(() => () => { generation.current++; motion.current?.cancel(); }, []);
  return retained ? <>{children}</> : null;
}
export interface SurfaceProps extends Omit<HTMLAttributes<HTMLElement>, "style" | "id"> {
  id: string;
  layout?: Layout;
  appearance?: Appearance;
  transform?: Transform;
  decorative?: boolean;
  inert?: boolean;
}
export function Surface({ id, layout = {}, appearance = {}, transform = {}, decorative = false, inert = false, children, ...attributes }: SurfaceProps) {
  const runtime = useRuntime();
  const element = useRef<HTMLElement>(null);
  const layoutKey = JSON.stringify(layout);
  const transformKey = JSON.stringify(transform);
  affine(transform);
  useLayoutEffect(() => { element.current!.inert = decorative || inert; }, [decorative, inert]);
  useLayoutEffect(() => runtime.register({ id, element: element.current!, layout, transform: { ...transform }, decorative }), [runtime, id, decorative]);
  useLayoutEffect(() => runtime.update(id, layout, transform), [runtime, id, layoutKey, transformKey]);
  return <section {...attributes} aria-hidden={decorative ? true : attributes["aria-hidden"]}
    ref={element} id={id} {...{ drawable: "" }} style={{
    ...compileStyle(layout, appearance, true), transformOrigin: "0 0",
    ...(decorative ? { pointerEvents: "none" } : {}),
  }}>{children}</section>;
}
export interface BoxProps extends Omit<HTMLAttributes<HTMLDivElement>, "style"> {
  layout?: Layout;
  appearance?: Appearance;
}
export function Box({ layout, appearance, ...attributes }: BoxProps) {
  return <div {...attributes} data-canvas-spa-clipped={layout?.overflow && layout.overflow !== "visible" ? "" : undefined}
    style={compileStyle(layout, appearance)} />;
}
export function NativeScroll({ layout, ...attributes }: BoxProps) {
  return <Box {...attributes} layout={{ ...layout, overflow: "scroll" }} data-canvas-spa-scroll="" />;
}
export function NativeOverlay({ children }: { children: ReactNode }) {
  const runtime = useRuntime();
  if (!runtime.overlayHost) throw new Error("NativeOverlay requires the adapter-owned overlayHost");
  return createPortal(children, runtime.overlayHost);
}
export type MountCanvasOptions = Omit<RuntimeOptions, "mount"> & {
  createRoot?: typeof createRoot;
  flushSync?: typeof flushSync;
  strict?: boolean;
};
export function mountCanvasApp(options: MountCanvasOptions, children: ReactNode): CanvasController {
  return new CanvasRuntime({
    ...options,
    mount(container, runtime) {
      const root = (options.createRoot ?? createRoot)(container);
      const tree = <GPUHost runtime={runtime}>{children}</GPUHost>;
      try { (options.flushSync ?? flushSync)(() => root.render(options.strict ? <StrictMode>{tree}</StrictMode> : tree)); }
      catch (error) { root.unmount(); throw error; }
      return () => root.unmount();
    },
  });
}
