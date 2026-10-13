import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type DependencyList, type ReactNode } from "react";
import { defineEffect, useGPUHost, type Appearance, type EffectDescriptor, type EffectHandle, type Layout } from "canvas-spa-phase-one";

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
export const policy = { bounds: "layer", interaction: "decorative", media: "identity", fallback: "static" } as const;
/** Identity chain that keeps the custom definition attached, so fresh GPU admission compiles it. */
export function residentChain(): EffectDescriptor[] {
  return [{ kind: "custom", definition: aurora, parameters: { strength: 0, speed: 1, scanlines: 0, glow: 0 },
    time: { seconds: 0, playing: false }, ...policy }];
}

export interface ArtSpec { layout: Layout; appearance?: Appearance; content: ReactNode }
export interface ChainResult { ok: boolean; customDropped: boolean; error?: string }
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
  const desired = useRef<EffectDescriptor[]>(residentChain());
  const handle = useRef<EffectHandle | undefined>(undefined);
  const alive = useRef(true);
  const attach = useCallback((chain: EffectDescriptor[], attempt = 0): ChainResult => {
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
      if (!created) handle.current?.cancel();
      handle.current = created;
      void created?.finished.then(result => {
        if (result.status !== "fallback") return;
        setTimeout(() => { if (alive.current && handle.current === created) attach(desired.current); }, 0);
      });
      return { ok: true, customDropped };
    } catch (error) {
      if (attempt < 50 && /idle DOM or admitted GPU|mount has not completed/.test(String(error))) {
        setTimeout(() => { if (alive.current) attach(desired.current, attempt + 1); }, 100);
        return { ok: true, customDropped };
      }
      console.error(error);
      return { ok: false, customDropped, error: error instanceof Error ? error.message : String(error) };
    }
  }, [controller]);
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

export function useScene() {
  const scene = useContext(SceneContext);
  if (!scene) throw new Error("Scene context missing");
  return scene;
}
export function useArt() { return useContext(ArtContext); }
/** Publishes this example's artwork into the persistent decorative art layer. */
export function useSceneArt(spec: () => ArtSpec, dependencies: DependencyList) {
  const { publish } = useScene();
  useLayoutEffect(() => { publish(spec()); }, dependencies);
}
