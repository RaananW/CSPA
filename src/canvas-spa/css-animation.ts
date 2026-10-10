import { compileTimeline, parseTransform } from "./timeline";

export interface CSSAnimationSource {
  rule: CSSStyleRule;
  keyframes: CSSKeyframesRule;
}
export function validateCSSSource(element: HTMLElement, provenance: CSSAnimationSource) {
  const { rule, keyframes } = provenance;
  if (!(rule instanceof CSSStyleRule) || !(keyframes instanceof CSSKeyframesRule)
    || rule.parentRule || keyframes.parentRule || rule.parentStyleSheet !== keyframes.parentStyleSheet
    || rule.parentStyleSheet?.ownerNode?.ownerDocument !== element.ownerDocument
    || rule.selectorText !== `#${CSS.escape(element.id)}` || !element.id
    || rule.style.animationName !== keyframes.name || element.style.animation) {
    throw new Error("CSS adapter requires explicit same-sheet top-level rules and one exact ID selector/name");
  }
  const signature = rule.cssText + keyframes.cssText;
  if (/var\(|calc\(|env\(|inherit|revert|unset/i.test(signature)) throw new Error("CSS animation rule dependencies are unsupported");
  const computed = getComputedStyle(element);
  const time = (value: string) => /^-?(?:\d+(?:\.\d*)?|\.\d+)(?:ms|s)$/.test(value)
    ? Number(value.slice(0, value.endsWith("ms") ? -2 : -1)) * (value.endsWith("ms") ? 1 : 1000) : NaN;
  for (const property of ["animation-name", "animation-duration", "animation-delay", "animation-iteration-count", "animation-direction",
    "animation-fill-mode", "animation-timing-function"]) {
    const applied = computed.getPropertyValue(property), authored = rule.style.getPropertyValue(property);
    const equal = property === "animation-duration" || property === "animation-delay" ? time(applied) === time(authored) : applied === authored;
    if (element.style.getPropertyValue(property) || !equal) {
      throw new Error(`CSS animation precedence/provenance mismatch: ${property}`);
    }
  }
  const source = element.getAnimations().find(animation => animation instanceof CSSAnimation && animation.animationName === keyframes.name);
  if (!source) throw new Error("The enrolled CSS source animation is not active on this element");
  const rawFrames = Array.from(keyframes.cssRules).map(frame => {
    if (!(frame instanceof CSSKeyframeRule)) throw new Error("Invalid CSS keyframe rule");
    const offset = frame.keyText === "from" ? 0 : frame.keyText === "to" ? 1 : /^\d+(?:\.\d+)?%$/.test(frame.keyText) ? Number(frame.keyText.slice(0, -1)) / 100 : NaN;
    if (Array.from(frame.style).some(name => !["transform", "opacity", "animation-timing-function"].includes(name))) throw new Error("Unsupported CSS keyframe property");
    return { offset, transform: frame.style.transform, opacity: frame.style.opacity, easing: frame.style.animationTimingFunction || rule.style.animationTimingFunction || "ease" };
  });
  compileTimeline(rawFrames, { duration: 1, fill: "both" });
  if (!(source.effect instanceof KeyframeEffect)) throw new Error("CSS source effect unavailable");
  const resolved = source.effect.getKeyframes();
  if (resolved.length !== rawFrames.length || resolved.some((frame, index) =>
    frame.computedOffset !== rawFrames[index]!.offset || Number(frame.opacity) !== Number(rawFrames[index]!.opacity)
    || frame.easing !== rawFrames[index]!.easing
    || typeof frame.transform !== "string" || JSON.stringify(parseTransform(frame.transform)) !== JSON.stringify(parseTransform(rawFrames[index]!.transform)))) throw new Error("CSS keyframes are overridden/resolved differently from enrolled provenance");
  const sourceTiming = JSON.stringify(source.effect.getTiming());
  let replacement: CSSAnimation | undefined;
  let lastTime = source.currentTime;
  function replacements() {
    return element.getAnimations().filter((animation): animation is CSSAnimation => animation instanceof CSSAnimation
      && animation !== source && animation.animationName === keyframes.name);
  }
  function matches(animation: Animation) {
    if (!(animation.effect instanceof KeyframeEffect) || animation.timeline !== document.timeline
      || JSON.stringify(animation.effect.getTiming()) !== sourceTiming) return false;
    const frames = animation.effect.getKeyframes();
    return frames.length === resolved.length && frames.every((frame, index) => frame.transform === resolved[index]!.transform
      && frame.opacity === resolved[index]!.opacity && frame.computedOffset === resolved[index]!.computedOffset
      && frame.easing === resolved[index]!.easing && frame.composite === resolved[index]!.composite);
  }
  return { source, check() {
    if (rule.cssText + keyframes.cssText !== signature) throw new Error("Owned CSS provenance changed; release to ordinary DOM required");
    const candidates = replacements();
    if (candidates.length) {
      if (replacement || candidates.length !== 1 || !matches(candidates[0]!)) throw new Error("Conflicting/repeated CSS source regeneration; ordinary DOM required");
      replacement = candidates[0]!;
      if (!(replacement.effect instanceof KeyframeEffect)) throw new Error("CSS replacement effect unavailable");
      replacement.pause();
      replacement.effect.target = null;
      replacement.currentTime = lastTime;
      // Migration can cancel the detached original CSS association as well.
      if (source.currentTime === null && source.playState === "idle") {
        source.currentTime = lastTime;
        source.pause();
      }
    }
    lastTime = source.currentTime;
  }, restore() {
    // Drawable ancestry can regenerate the browser's CSS association once.
    for (const animation of replacements()) if (matches(animation)) animation.cancel();
    replacement?.cancel();
    replacement = undefined;
  }, resources: () => replacement ? 1 : 0 };
}
