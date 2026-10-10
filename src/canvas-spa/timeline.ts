import type { Transform } from "./affine.js";

export interface TimelineTiming {
  duration: number;
  delay?: number;
  iterations?: number;
  direction?: "normal" | "alternate";
  easing?: string;
  fill?: "both";
}
export interface TimelineFrame {
  offset: number;
  transform: string;
  opacity: string | number;
  easing?: string;
}

const numeric = "(-?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:e[+-]?\\d+)?)";
const trs = new RegExp(`^translate\\(${numeric}px(?:,\\s*${numeric}px)?\\) rotate\\(${numeric}deg\\) scale\\(${numeric}(?:,\\s*${numeric})?\\)$`, "i");
export function parseTransform(value: string): Transform {
  if (value === "none") return { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 };
  const match = value.match(trs);
  if (!match) throw new Error("Only none or translate(px, px) rotate(deg) scale(number[, number]) is supported");
  const [x, y, rotation, scaleX, scaleY] = match.slice(1).map(Number);
  const result = { x: x!, y: match[2] === undefined ? 0 : y!, rotation: rotation!, scaleX: scaleX!, scaleY: match[5] === undefined ? scaleX! : scaleY! };
  if (!Object.values(result).every(Number.isFinite) || Math.abs(result.x) > 1e6 || Math.abs(result.y) > 1e6
    || Math.abs(result.rotation) > 36000 || result.scaleX < 1e-4 || result.scaleY < 1e-4
    || result.scaleX > 1e6 || result.scaleY > 1e6) throw new Error("Timeline transform exceeds finite positive-scale limits");
  return result;
}

function easing(value: string) {
  const named: Record<string, string> = { ease: "cubic-bezier(0.25,0.1,0.25,1)", "ease-in": "cubic-bezier(0.42,0,1,1)",
    "ease-out": "cubic-bezier(0,0,0.58,1)", "ease-in-out": "cubic-bezier(0.42,0,0.58,1)" };
  if (value === "linear") return { at: (t: number) => t, min: 0, max: 1 };
  const match = (named[value] ?? value).match(/^cubic-bezier\(\s*([^,]+),\s*([^,]+),\s*([^,]+),\s*([^)]+)\)$/);
  const values = match?.slice(1).map(Number);
  if (!values || match!.slice(1).some(n => !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(n.trim()))
    || values.some(n => !Number.isFinite(n) || Math.abs(n) > 1e6) || values[0]! < 0 || values[0]! > 1 || values[2]! < 0 || values[2]! > 1) throw new Error(`Unsupported or numerically unbounded easing: ${value}`);
  const [x1, y1, x2, y2] = values as [number, number, number, number];
  const curve = (t: number, a: number, b: number) => 3 * (1 - t) ** 2 * t * a + 3 * (1 - t) * t * t * b + t ** 3;
  const a = 1 + 3 * y1 - 3 * y2, b = 3 * y2 - 6 * y1, c = 3 * y1;
  const roots = Math.abs(a) < 1e-12 ? [-c / (2 * b)] : [
    (-2 * b + Math.sqrt(4 * b * b - 12 * a * c)) / (6 * a),
    (-2 * b - Math.sqrt(4 * b * b - 12 * a * c)) / (6 * a),
  ];
  const range = [0, 1, ...roots.filter(t => t > 0 && t < 1).map(t => curve(t, y1, y2))];
  if (range.some(n => !Number.isFinite(n))) throw new Error("Nonfinite easing range");
  return { min: Math.min(...range), max: Math.max(...range), at: (t: number) => {
    if (t < 0) return t * (x1 > 0 ? y1 / x1 : x2 > 0 ? y2 / x2 : 0);
    if (t > 1) return 1 + (t - 1) * (x2 < 1 ? (1 - y2) / (1 - x2) : x1 < 1 ? (1 - y1) / (1 - x1) : 0);
    if (t === 0 || t === 1) return t;
    let low = 0, high = 1;
    for (let i = 0; i < 40; i++) { const mid = (low + high) / 2; if (curve(mid, x1, x2) < t) low = mid; else high = mid; }
    return curve((low + high) / 2, y1, y2);
  } };
}

export function compileTimeline(frames: TimelineFrame[], timing: TimelineTiming) {
  const { duration, delay = 0, iterations = 1, direction = "normal", fill = "both" } = timing;
  if (!Number.isFinite(duration) || duration <= 0 || duration > 3_600_000 || !Number.isFinite(delay) || delay < 0 || delay > 3_600_000
    || iterations !== Infinity && (!Number.isInteger(iterations) || iterations < 1 || iterations > 10000)
    || !["normal", "alternate"].includes(direction) || fill !== "both") throw new Error("Unsupported timeline timing");
  if (frames.length < 2 || frames.length > 32 || frames[0]?.offset !== 0 || frames.at(-1)?.offset !== 1) throw new Error("Timeline requires 2..32 complete frames spanning offsets 0..1");
  const globalEase = easing(timing.easing ?? "linear");
  const compiled = frames.map((frame, index) => {
    if (!Number.isFinite(frame.offset) || frame.offset < 0 || frame.offset > 1 || index && frame.offset <= frames[index - 1]!.offset) throw new Error("Offsets must strictly increase");
    const opacity = Number(frame.opacity);
    if (typeof frame.opacity === "string" && !frame.opacity.trim() || !Number.isFinite(opacity) || opacity < 0 || opacity > 1) throw new Error("Timeline opacity must be in [0,1]");
    return { offset: frame.offset, transform: { ...parseTransform(frame.transform), opacity }, ease: easing(frame.easing ?? "linear") };
  });
  for (let index = 1; index < compiled.length; index++) {
    const start = compiled[index - 1]!, finish = compiled[index]!;
    const span = finish.offset - start.offset;
    const inputs = [index === 1 ? Math.min(0, globalEase.min / span) : 0,
      index === compiled.length - 1 ? Math.max(1, (globalEase.max - start.offset) / span) : 1];
    const range = [start.ease.min, start.ease.max, ...inputs.map(start.ease.at)];
    for (const progress of range) for (const key of ["x", "y", "rotation", "scaleX", "scaleY"] as const) {
      const value = start.transform[key]! * (1 - progress) + finish.transform[key]! * progress;
      if (!Number.isFinite(value) || Math.abs(value) > 1e6 || (key === "scaleX" || key === "scaleY") && value < 1e-4) {
        throw new Error("Easing path crosses singular scale or exceeds finite timeline limits");
      }
    }
  }
  const end = delay + duration * iterations;
  return {
    duration, delay, iterations, direction, end,
    sample(milliseconds: number): Transform {
      if (!Number.isFinite(milliseconds) || milliseconds < 0 || milliseconds > 1e12) throw new Error("Seek requires finite milliseconds in [0,1e12]");
      const active = Math.max(0, Math.min(milliseconds - delay, duration * iterations));
      let iteration = Math.floor(active / duration);
      let fraction = (active % duration) / duration;
      if (active === duration * iterations) { iteration = iterations - 1; fraction = 1; }
      if (direction === "alternate" && iteration % 2) fraction = 1 - fraction;
      fraction = globalEase.at(fraction);
      let index = compiled.findIndex(frame => frame.offset >= fraction);
      index = index === -1 ? compiled.length - 1 : Math.max(1, index);
      const start = compiled[index - 1]!, finish = compiled[index]!;
      const t = start.ease.at((fraction - start.offset) / (finish.offset - start.offset));
      const result: Transform = {};
      for (const key of ["x", "y", "rotation", "scaleX", "scaleY", "opacity"] as const) {
        result[key] = start.transform[key]! * (1 - t) + finish.transform[key]! * t;
      }
      result.opacity = Math.max(0, Math.min(1, result.opacity!));
      return result;
    },
  };
}
