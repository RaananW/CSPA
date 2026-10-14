/**
 * The persistent decorative "art" layer shared by all examples, and the effect chain on it.
 * `SceneProvider` owns the chain (so custom WGSL survives GPU admission and DOM round trips),
 * `useSceneArt` lets an example publish its artwork into the layer, and `usePulse` plays a short
 * GPU-only ripple on it. Effects are only allowed on decorative layers, which is why every
 * example's shader work happens here and never on a layer with native controls.
 */
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type DependencyList, type ReactNode } from "react";
import { defineEffect, useGPUHost, type Appearance, type EffectDescriptor, type EffectHandle, type Layout } from "@underglass/react";

/** Id of the one decorative layer that carries effects in every example. */
export const ART = "showcase-art";

/**
 * Trusted local WGSL colour function: a drifting hue rotation with an aurora
 * curtain and optional scanlines. Every term scales with `strength`, so 0 is an
 * exact identity.
 */
export const aurora = defineEffect({
  name: "showcase-aurora",
  parameters: { strength: { min: 0, max: 1 }, speed: { min: 0, max: 4 }, scanlines: { min: 0, max: 1 }, glow: { min: 0, max: 1 } },
  geometry: "color", bounds: "layer", capabilities: ["webgpu"],
  wgsl: `
    let uv = local / max(extent, vec2f(1.0));
    let clock = seconds * parameters.y;
    let turn = parameters.x * (uv.x * 2.4 + uv.y * 1.3 + clock * 0.9) * 3.14159;
    let axis = vec3f(0.57735);
    let cosine = cos(turn);
    let rotated = color.rgb * cosine + cross(axis, color.rgb) * sin(turn) + axis * dot(axis, color.rgb) * (1.0 - cosine);
    let band = 0.5 + 0.5 * sin(uv.x * 7.0 + clock * 1.7 + sin(uv.y * 5.0 - clock));
    let curtain = vec3f(0.25, 1.0, 0.75) * band * parameters.w * smoothstep(0.15, 0.95, 1.0 - uv.y);
    let scan = 1.0 - parameters.x * parameters.z * 0.4 * (0.5 + 0.5 * sin(local.y * 1.7 - clock * 8.0));
    let lit = (mix(color.rgb, rotated, parameters.x) + curtain * parameters.x * 0.6) * scan;
    return vec4f(lit, color.a);`,
});
/**
 * The four policy fields every effect descriptor must declare (see `docs/effects.md`): the effect
 * stays inside the layer, touches a decorative layer only, leaves media identity alone and falls
 * back to the static original.
 */
export const policy = { bounds: "layer", interaction: "decorative", media: "identity", fallback: "static" } as const;
/** Identity chain that keeps the custom definition attached, so fresh GPU admission compiles it. */
export function residentChain(): EffectDescriptor[] {
  return [{ kind: "custom", definition: aurora, parameters: { strength: 0, speed: 1, scanlines: 0, glow: 0 },
    time: { seconds: 0, playing: false }, ...policy }];
}

/** What an example publishes for the art layer: its box, optional appearance and React content. */
export interface ArtSpec { layout: Layout; appearance?: Appearance; content: ReactNode }
/**
 * Outcome of `setChain`. `ok` is false when the runtime refused the chain (see `error`).
 * `customDropped` means `setEffects` refused the custom operation, so the chain was applied without it. The
 * refusal is recognised by message ("New custom definitions" or "requires WebGPU"); the runtime currently
 * throws the WebGPU one, when `navigator.gpu` is absent.
 */
export interface ChainResult { ok: boolean; customDropped: boolean; error?: string }
/** What `useScene` gives an example: publish artwork, replace the effect chain, read the mode. */
interface Scene {
  publish(spec: ArtSpec): void;
  setChain(chain: EffectDescriptor[]): ChainResult;
  mode(): string;
}
const SceneContext = createContext<Scene | null>(null);
const ArtContext = createContext<ArtSpec | undefined>(undefined);

/**
 * Owns the one decorative art layer that persists across examples. Custom WGSL
 * is compiled per layer during fresh GPU admission, so the art layer always
 * carries the aurora definition (at identity strength unless the shader lab
 * asks for more). Ordinary DOM ends effect handles as "fallback"; the chain is
 * then re-attached so the next explicit admission compiles it again.
 */
export function SceneProvider({ children }: { children: ReactNode }) {
  const controller = useGPUHost();
  const [art, setArt] = useState<ArtSpec>();
  // The chain the caller last asked for, kept so it can be re-attached after a fallback.
  const desired = useRef<EffectDescriptor[]>(residentChain());
  const handle = useRef<EffectHandle | undefined>(undefined);
  const alive = useRef(true);
  // Applies `chain` to the art layer and remembers the handle. Never throws: failures come back as
  // a `ChainResult`.
  const attach = useCallback((chain: EffectDescriptor[], attempt = 0): ChainResult => {
    // An empty chain means "no effects", which is expressed by not calling `setEffects` at all.
    const run = (operations: EffectDescriptor[]) => operations.length ? controller.setEffects(ART, operations) : undefined;
    let customDropped = false;
    try {
      let created: EffectHandle | undefined;
      try { created = run(chain); }
      catch (error) {
        // Fresh admission is required for new definitions; browsers without WebGPU cannot use them at all.
        if (!/New custom definitions|requires WebGPU/.test(String(error))) throw error;
        customDropped = true;
        created = run(chain.filter(operation => operation.kind !== "custom"));
      }
      // With no new handle, stop the previous chain; otherwise `setEffects` already replaced it.
      if (!created) handle.current?.cancel();
      handle.current = created;
      // Ordinary DOM ends effect handles with status "fallback" (explicit disable, device loss).
      // Re-attach the desired chain so the next explicit GPU admission compiles it again, unless a newer
      // handle has taken over meanwhile.
      void created?.finished.then(result => {
        if (result.status !== "fallback") return;
        setTimeout(() => { if (alive.current && handle.current === created) attach(desired.current); }, 0);
      });
      return { ok: true, customDropped };
    } catch (error) {
      // The runtime is not ready for effects yet (mount unfinished, or lifecycle work pending). Retry
      // every 100 ms, up to 50 attempts, and report success in the meantime.
      if (attempt < 50 && /idle DOM or admitted GPU|mount has not completed/.test(String(error))) {
        setTimeout(() => { if (alive.current) attach(desired.current, attempt + 1); }, 100);
        return { ok: true, customDropped };
      }
      console.error(error);
      return { ok: false, customDropped, error: error instanceof Error ? error.message : String(error) };
    }
  }, [controller]);
  // Attach the resident chain on mount and end the handle on unmount.
  useEffect(() => {
    alive.current = true;
    attach(desired.current);
    return () => { alive.current = false; handle.current?.dispose(); handle.current = undefined; };
  }, [attach]);
  const scene = useMemo<Scene>(() => ({
    publish: setArt, mode: () => controller.state().mode,
    setChain: chain => { desired.current = chain; return attach(chain); },
  }), [attach, controller]);
  return <SceneContext.Provider value={scene}><ArtContext.Provider value={art}>{children}</ArtContext.Provider></SceneContext.Provider>;
}

/** The scene controls for the current example; throws outside `SceneProvider`. */
export function useScene() {
  const scene = useContext(SceneContext);
  if (!scene) throw new Error("Scene context missing");
  return scene;
}
/** The artwork currently published for the art layer, or `undefined` before the first publish. */
export function useArt() { return useContext(ArtContext); }
/** Publishes this example's artwork into the persistent decorative art layer. */
export function useSceneArt(spec: () => ArtSpec, dependencies: DependencyList) {
  const { publish } = useScene();
  useLayoutEffect(() => { publish(spec()); }, dependencies);
}

/**
 * Briefly ripples the decorative art layer, a GPU-only displacement of its rendered
 * pixels, then restores the resident chain. A no-op in ordinary DOM or with
 * reduced motion; a newer pulse replaces an older one.
 */
export function usePulse() {
  const scene = useScene();
  const controller = useGPUHost();
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // On unmount, drop a pending restore and restore now so the next example starts clean.
  useEffect(() => () => { if (timer.current !== undefined) { clearTimeout(timer.current); scene.setChain(residentChain()); } }, [scene]);
  return useCallback((amplitude: number, milliseconds = 1100) => {
    const state = controller.state();
    // Pulses are GPU-only decoration: skip them in ordinary DOM and under reduced motion. The
    // return value says whether one started.
    if (state.mode !== "gpu" || matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
    if (timer.current !== undefined) clearTimeout(timer.current);
    // Sampling operations (ripple) come before the colour operations in the resident chain.
    scene.setChain([{ kind: "ripple", parameters: { amplitude }, time: { seconds: 0, playing: true }, ...policy }, ...residentChain()]);
    // When the pulse is over, go back to the identity chain.
    timer.current = setTimeout(() => { timer.current = undefined; scene.setChain(residentChain()); }, milliseconds);
    return true;
  }, [controller, scene]);
}
