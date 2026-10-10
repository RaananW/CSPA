export interface EffectTime { seconds: number; playing?: boolean }
interface EffectPolicy {
  bounds: "layer";
  interaction: "decorative";
  media: "identity";
  fallback: "static";
  time: EffectTime;
}
export interface ParameterRange { min: number; max: number }
export interface ApplicationEffect<P extends string = string> {
  readonly name: string;
  readonly parameters: Readonly<Record<P, ParameterRange>>;
  readonly geometry: "color";
  readonly bounds: "layer";
  readonly capabilities: readonly ["webgpu"];
  readonly wgsl: string;
}
export type EffectDescriptor =
  | (EffectPolicy & { kind: "ripple"; parameters: { amplitude: number } })
  | (EffectPolicy & { kind: "chromatic"; parameters: { displacement: number } })
  | (EffectPolicy & { kind: "dissolve"; parameters: { amount: number; speed: number } })
  | (EffectPolicy & { kind: "custom"; definition: ApplicationEffect; parameters: Record<string, number> });
export interface EffectResult { status: "cancelled" | "replaced" | "disposed" | "fallback"; reason: string }
export interface EffectHandle {
  readonly finished: Promise<EffectResult>;
  state(): { active: boolean; effects: EffectDescriptor[] };
  seek(seconds: number): void;
  play(): void;
  pause(): void;
  cancel(): void;
  dispose(): void;
}
const definitions = new WeakSet<ApplicationEffect>();
export function effectNumber(value: number, min: number, max: number, name: string) {
  if (!Number.isFinite(value) || value < min || value > max) throw new Error(`${name} requires ${min}..${max}`);
  return value;
}
export function defineEffect<P extends string>(definition: ApplicationEffect<P>): ApplicationEffect<P> {
  if (!definition || !/^[a-z][a-z0-9-]{0,47}$/.test(definition.name)
    || definition.geometry !== "color" || definition.bounds !== "layer"
    || definition.capabilities.length !== 1 || definition.capabilities[0] !== "webgpu"
    || typeof definition.wgsl !== "string" || !definition.wgsl.trim() || definition.wgsl.length > 4096) {
    throw new Error("Application effect requires a named bounded trusted WGSL color function and WebGPU");
  }
  const entries = Object.entries<ParameterRange>(definition.parameters);
  if (!entries.length || entries.length > 4) throw new Error("Application effect requires 1..4 numeric parameters");
  for (const [name, range] of entries) {
    if (!/^[a-z][a-zA-Z0-9]{0,31}$/.test(name) || !Number.isFinite(range.min) || !Number.isFinite(range.max)
      || range.min > range.max || Math.max(Math.abs(range.min), Math.abs(range.max)) > 1e6) throw new Error("Invalid application effect parameter range");
  }
  const parameters = Object.fromEntries(entries.map(([name, range]) => [name, Object.freeze({ ...range })])) as Record<P, ParameterRange>;
  const result = Object.freeze({ ...definition, parameters: Object.freeze(parameters), capabilities: Object.freeze(["webgpu"] as const) });
  definitions.add(result);
  return result;
}
export function validateEffects(values: readonly EffectDescriptor[]): EffectDescriptor[] {
  if (!Array.isArray(values) || values.length < 1 || values.length > 3) throw new Error("Effect chain requires 1..3 operations in declared order");
  const kinds = new Set<string>();
  let colorOnly = false;
  return values.map(value => {
    if (!value || value.bounds !== "layer" || value.interaction !== "decorative" || value.media !== "identity"
      || value.fallback !== "static" || !value.time || !value.parameters) throw new Error("Effects require layer bounds, decorative interaction, identity media and static DOM fallback");
    if (kinds.has(value.kind)) throw new Error("Effect kinds may occur only once per chain");
    kinds.add(value.kind);
    if (value.kind === "custom" || value.kind === "dissolve") colorOnly = true;
    else if (colorOnly) throw new Error("Sampling effects must precede color/alpha effects");
    const seconds = effectNumber(value.time.seconds, 0, 1e6, "Effect seconds");
    if (value.time.playing !== undefined && typeof value.time.playing !== "boolean") throw new Error("Effect playback must be boolean");
    let parameters: Record<string, number>;
    let names: string[];
    switch (value.kind) {
      case "ripple": names = ["amplitude"]; parameters = { amplitude: effectNumber(value.parameters.amplitude, 0, 12, "Ripple amplitude") }; break;
      case "chromatic": names = ["displacement"]; parameters = { displacement: effectNumber(value.parameters.displacement, 0, 12, "Chromatic displacement") }; break;
      case "dissolve": names = ["amount", "speed"]; parameters = { amount: effectNumber(value.parameters.amount, 0, 1, "Dissolve amount"), speed: effectNumber(value.parameters.speed, 0, 4, "Dissolve speed") }; break;
      case "custom":
        if (!definitions.has(value.definition)) throw new Error("Custom effects must come from defineEffect");
        names = Object.keys(value.definition.parameters);
        parameters = Object.fromEntries(names.map(name => [name, effectNumber(value.parameters[name]!, value.definition.parameters[name]!.min, value.definition.parameters[name]!.max, name)]));
        break;
      default: throw new Error("Unsupported effect kind");
    }
    if (Object.keys(value.parameters).length !== names.length || Object.keys(value.parameters).some(name => !names.includes(name))) throw new Error("Effect parameter keys must match the declared schema exactly");
    return { ...value, parameters, time: { seconds, playing: value.time.playing ?? false } } as EffectDescriptor;
  });
}
export function effectUniforms(values: readonly EffectDescriptor[] = []) {
  const result = new Float32Array(24);
  values.forEach((value, index) => {
    const parameters = value.kind === "custom" ? Object.keys(value.definition.parameters).map(name => value.parameters[name]!) : Object.values(value.parameters);
    result.set([{ ripple: 1, chromatic: 2, dissolve: 3, custom: 4 }[value.kind], value.time.seconds % 1000, 0, 0,
      ...parameters, ...Array(4 - parameters.length).fill(0)], index * 8);
  });
  return result;
}
