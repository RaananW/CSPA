import { compileTimeline, parseTransform, type TimelineFrame } from "./timeline.js";
import { affine, type Transform } from "./affine.js";

const properties = ["transform", "opacity", "transform-origin"] as const;
export function declarations(element: HTMLElement) {
  return properties.map(name => ({ name, value: element.style.getPropertyValue(name), priority: element.style.getPropertyPriority(name) }));
}
export class DeclarationOwnership {
  private readonly saved: ReturnType<typeof declarations>;
  private readonly initial;
  private readonly initialAttribute;
  private readonly written = new Map<typeof properties[number], { value: string; priority: string }>();
  private readonly relinquished = new Set<typeof properties[number]>();
  constructor(private readonly element: HTMLElement, predecessor?: DeclarationOwnership) {
    this.initialAttribute = element.getAttribute("style");
    this.initial = declarations(element);
    this.saved = predecessor?.saved ?? this.initial;
  }
  private inspect() {
    for (const [name, expected] of this.written) {
      if (this.element.style.getPropertyValue(name) !== expected.value
        || this.element.style.getPropertyPriority(name) !== expected.priority) this.relinquished.add(name);
    }
  }
  check() {
    this.inspect();
    if (this.relinquished.size) throw new Error(`Presentation declaration ownership changed: ${[...this.relinquished].join(", ")}`);
  }
  write(name: typeof properties[number], value: string, priority = "") {
    this.inspect();
    if (this.relinquished.has(name)) return;
    this.element.style.setProperty(name, value, priority);
    this.written.set(name, { value: this.element.style.getPropertyValue(name), priority: this.element.style.getPropertyPriority(name) });
  }
  restore() {
    return this.restoreDeclarations(this.saved);
  }
  rollback() {
    const lost = this.restoreDeclarations(this.initial);
    if (this.initialAttribute === null && !this.element.style.length) {
      // Flush lazy CSSOM attribute serialization before restoring attribute absence.
      this.element.getAttribute("style");
      this.element.removeAttribute("style");
    }
    return lost;
  }
  private restoreDeclarations(saved: ReturnType<typeof declarations>) {
    this.inspect();
    for (const { name, value, priority } of saved) {
      if (!this.written.has(name) || this.relinquished.has(name)) continue;
      if (value) this.element.style.setProperty(name, value, priority);
      else this.element.style.removeProperty(name);
    }
    this.written.clear();
    return this.relinquished;
  }
}
interface OwnershipHost {
  apply(transform: Transform): void;
  validate(transform: Transform): void;
  changed(): void;
  release(): Promise<unknown>;
}
export interface AnimationPlayback {
  play(): void;
  pause(): void;
  seek(milliseconds: number): void;
  release(): Promise<void>;
  state(): { milliseconds: number; playing: boolean; released: boolean; sourceTime: CSSNumberish | null; sourceState: AnimationPlayState; detached: boolean };
}

export function rejectImportantPresentation(element: HTMLElement, includeOrigin = false) {
  let visited = 0;
  const inspect = (rules: CSSRuleList, depth: number) => {
    if (depth > 8) throw new Error("Stylesheet nesting exceeds ownership validation budget");
    for (const rule of rules) {
      if (++visited > 4096) throw new Error("Stylesheet rules exceed ownership validation budget");
      if (rule instanceof CSSImportRule) throw new Error("Imported stylesheet dependencies are unsupported by ownership validation");
      if (rule instanceof CSSStyleRule && rule.cssRules.length) {
        throw new Error("Nested selector rules are unsupported by ownership validation");
      }
      if (rule instanceof CSSStyleRule && element.matches(rule.selectorText)
        && (includeOrigin ? properties : ["transform", "opacity"]).some(name => rule.style.getPropertyPriority(name) === "important")) {
        throw new Error("Matching stylesheet important presentation overrides are unsupported");
      }
      if (rule instanceof CSSGroupingRule) {
        if (!(rule instanceof CSSMediaRule || rule instanceof CSSSupportsRule || rule instanceof CSSLayerBlockRule)) {
          throw new Error("Scoped or dependent stylesheet groups are unsupported by ownership validation");
        }
        inspect(rule.cssRules, depth + 1);
      }
    }
  };
  for (const sheet of [...document.styleSheets, ...document.adoptedStyleSheets]) inspect(sheet.cssRules, 0);
}

export function prepareAnimation(element: HTMLElement, source: Animation, host: OwnershipHost) {
  if (!(source.effect instanceof KeyframeEffect) || source.effect.target !== element || source.effect.pseudoElement
    || source.playbackRate !== 1 || source.effect.composite !== "replace" || source.effect.iterationComposite !== "replace"
    || source.timeline !== document.timeline || source.playState === "idle" || source.currentTime === null || typeof source.currentTime !== "number") {
    throw new Error("Animation requires one live direct-target replace effect, numeric document timing and playbackRate 1");
  }
  if (element.getAnimations({ subtree: true }).some(animation => animation !== source)) throw new Error("Overlapping CSS/WAAPI ownership is unsupported");
  const computed = getComputedStyle(element);
  if (computed.transformOrigin !== "0px 0px" || computed.translate !== "none" || computed.rotate !== "none" || computed.scale !== "none") {
    throw new Error("Animation requires top-left origin and no individual transform dependencies");
  }
  const neutral = element.style.transform === "none" || /^matrix\(1,\s*0,\s*0,\s*1,\s*0,\s*0\)$/.test(element.style.transform);
  if (!neutral || element.style.opacity !== "1" || element.style.getPropertyPriority("transform") || element.style.getPropertyPriority("opacity")) {
    throw new Error("Animation requires explicit neutral inline transform/opacity without important overrides");
  }
  rejectImportantPresentation(element);
  const effect = source.effect;
  const originalFrames = effect.getKeyframes();
  const frames: TimelineFrame[] = originalFrames.map(frame => {
    if (Object.keys(frame).some(key => !["offset", "computedOffset", "easing", "composite", "transform", "opacity"].includes(key))
      || frame.composite !== "auto" && frame.composite !== "replace" || typeof frame.transform !== "string"
      || frame.opacity === undefined || frame.opacity === null) throw new Error("All frames must contain only complete transform/opacity replace values");
    return { offset: frame.computedOffset, transform: frame.transform, opacity: frame.opacity, easing: frame.easing };
  });
  const timing = effect.getTiming();
  if (typeof timing.duration !== "number" || timing.endDelay !== 0 || timing.iterationStart !== 0 || timing.fill !== "both"
    || timing.direction !== "normal" && timing.direction !== "alternate") throw new Error("Unsupported source animation timing/fill");
  const timeline = compileTimeline(frames, { duration: timing.duration, delay: timing.delay, iterations: timing.iterations,
    direction: timing.direction, easing: timing.easing, fill: timing.fill });
  for (const frame of frames) host.validate(timeline.sample(frame.offset * timeline.duration + timeline.delay));
  let milliseconds = source.currentTime;
  host.validate(timeline.sample(milliseconds));
  const expected = affine(timeline.sample(milliseconds));
  const applied = new DOMMatrix(computed.transform === "none" ? undefined : computed.transform);
  if (![applied.a, applied.b, applied.c, applied.d, applied.e, applied.f].every((value, index) =>
    Math.abs(value - expected[index]!) <= 1e-4 * Math.max(1, Math.abs(value)))
    || Math.abs(Number(computed.opacity) - timeline.sample(milliseconds).opacity!) > 1e-4) {
    throw new Error("Source effect is not visibly applied; stylesheet/important precedence or incompatible interpolation");
  }
  let playing = source.playState === "running";
  let released = false;
  const presentation = new DeclarationOwnership(element);
  const signature = (frames: ComputedKeyframe[]) => JSON.stringify(frames.map(frame => ({
    ...frame, transform: typeof frame.transform === "string" ? parseTransform(frame.transform) : frame.transform,
  })));
  const frameSignature = signature(originalFrames), timingSignature = JSON.stringify(timing);
  let expectedSourceTime: CSSNumberish | null = source.currentTime;
  const assertLive = () => { if (released) throw new Error("Animation ownership is released"); };
  const check = () => {
    presentation.check();
    const current = getComputedStyle(element);
    if (current.translate !== "none" || current.rotate !== "none" || current.scale !== "none" || current.transformOrigin !== "0px 0px") {
      throw new Error("Live individual transform/origin dependency requires ordinary DOM");
    }
    if (source.effect !== effect || effect.target !== null || source.playbackRate !== 1 || source.currentTime !== expectedSourceTime
      || effect.composite !== "replace" || effect.iterationComposite !== "replace"
      || signature(effect.getKeyframes()) !== frameSignature || JSON.stringify(effect.getTiming()) !== timingSignature) {
      throw new Error("Source effect/target/timing was modified while GPU-owned");
    }
  };
  const apply = () => {
    check();
    source.currentTime = milliseconds;
    expectedSourceTime = source.currentTime;
    host.apply(timeline.sample(milliseconds));
  };
  return {
    source,
    presentation,
    check,
    acquire() {
      source.pause();
      effect.target = null;
      try { apply(); } catch (error) { presentation.restore(); effect.target = element; source.currentTime = milliseconds; if (playing) source.play(); throw error; }
    },
    restore() {
      if (released) return;
      released = true;
      presentation.restore();
      source.effect = effect;
      effect.target = element;
      source.currentTime = milliseconds;
      if (playing) source.play(); else source.pause();
    },
    tick(delta: number, force = false) {
      assertLive();
      if (playing || force) {
        milliseconds = Math.min(1e12, milliseconds + delta);
        apply();
        if (milliseconds >= timeline.end) playing = false;
      }
    },
    playback: {
      play() { assertLive(); playing = true; host.changed(); },
      pause() { assertLive(); playing = false; host.changed(); },
      seek(time: number) { assertLive(); const transform = timeline.sample(time); host.validate(transform); check(); milliseconds = time; apply(); host.changed(); },
      async release() { if (!released) await host.release(); },
      state() { return { milliseconds, playing, released, sourceTime: source.currentTime, sourceState: source.playState, detached: effect.target === null }; },
    } satisfies AnimationPlayback,
  };
}
