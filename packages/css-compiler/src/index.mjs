import postcss from "postcss";
import valueParser from "postcss-value-parser";
import { affine, compileTimeline, parseTransform } from "canvas-spa-phase-one/build";
import { validateConfig, readConfig } from "./config.mjs";
import { generateModule } from "./generate.mjs";

export { validateConfig, readConfig };
const animationProperties = ["animation-name", "animation-duration", "animation-delay", "animation-iteration-count",
  "animation-direction", "animation-fill-mode", "animation-timing-function", "animation-play-state"];
function fail(node, message) { throw node.error(`CanvasSPA: ${message}`, { plugin: "canvas-spa-compiler" }); }
function time(node, text) {
  if (!/^\d+(?:\.\d+)?(?:ms|s)$/.test(text)) fail(node, `Unsupported static time: ${text}`);
  return Number(text.slice(0, text.endsWith("ms") ? -2 : -1)) * (text.endsWith("ms") ? 1 : 1000);
}
function easing(node, text) {
  const normalized = text.replace(/\s+/g, "");
  if (["linear", "ease", "ease-in", "ease-out", "ease-in-out"].includes(normalized)) return normalized;
  const match = normalized.match(/^cubic-bezier\(([^,]+),([^,]+),([^,]+),([^,]+)\)$/);
  if (!match || match.slice(1).some(value => !/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(value) || Number(value) > 1)) {
    fail(node, `Unsupported easing (non-overshooting cubic-bezier or named easing required): ${text}`);
  }
  return normalized;
}
function declarations(rule) {
  const result = {};
  for (const node of rule.nodes ?? []) {
    if (node.type === "comment") continue;
    if (node.type !== "decl") fail(node, "Nested rules are unsupported in a selected target");
    if (/^transition(?:-|$)/.test(node.prop)) fail(node, "Selected CSS transitions require an explicit adapter");
    if (!node.prop.startsWith("animation")) continue;
    if (node.important || /var\(|calc\(|env\(|\b(?:inherit|revert|unset|initial)\b/i.test(node.value)) fail(node, "Dependent/important selected animation");
    if (node.prop === "animation") {
      const tokens = valueParser(node.value).nodes.filter(token => token.type !== "space" && token.type !== "comment")
        .map(token => valueParser.stringify(token));
      const data = { "animation-delay": "0s", "animation-iteration-count": "1", "animation-direction": "normal",
        "animation-fill-mode": "none", "animation-timing-function": "ease", "animation-play-state": "running" };
      const seen = new Set();
      const set = (property, token) => {
        if (seen.has(property)) fail(node, `Duplicate shorthand value: ${property}`);
        seen.add(property);
        data[property] = token;
      };
      let times = 0;
      for (const token of tokens) {
        if (/^\d+(?:\.\d+)?(?:ms|s)$/.test(token)) {
          if (times >= 2) fail(node, "Too many animation time values");
          set(times++ ? "animation-delay" : "animation-duration", token);
        } else if (["linear", "ease", "ease-in", "ease-out", "ease-in-out"].includes(token) || token.startsWith("cubic-bezier(")) set("animation-timing-function", token);
        else if (token === "infinite" || /^\d+$/.test(token)) set("animation-iteration-count", token);
        else if (["normal", "alternate"].includes(token)) set("animation-direction", token);
        else if (["none", "forwards", "backwards", "both"].includes(token)) set("animation-fill-mode", token);
        else if (["running", "paused"].includes(token)) set("animation-play-state", token);
        else if (/^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(token) && !data["animation-name"]) set("animation-name", token);
        else fail(node, `Unsupported animation shorthand token: ${token}`);
      }
      Object.assign(result, data);
    } else {
      if (!animationProperties.includes(node.prop)) fail(node, `Unsupported animation property: ${node.prop}`);
      result[node.prop] = node.value;
    }
  }
  return result;
}
export function compileStylesheet(css, entries, { filename = "input.css", modules = {}, root: suppliedRoot } = {}) {
  const root = suppliedRoot ?? postcss.parse(css, { from: filename });
  return entries.map(entry => {
    const token = entry.selector.slice(1);
    const mapped = modules[token];
    if (mapped && !/^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(mapped)) fail(root, "CSS Modules composition/multiple tokens is unsupported");
    const selector = mapped ? entry.selector[0] + mapped : entry.selector;
    const name = modules[entry.animations[0]] ?? entry.animations[0];
    const rules = [];
    root.walkRules(rule => { if (rule.selector === selector && rule.parent.type === "root") rules.push(rule); });
    if (rules.length !== 1) fail(root, `Expected one top-level rule for ${entry.selector} (${selector}), found ${rules.length}`);
    const rule = rules[0], props = declarations(rule);
    if (props["animation-name"] !== name) fail(rule, `Selected animation ${name} does not match the target's single animation`);
    root.walkRules(other => {
      if (other !== rule && !/keyframes$/i.test(other.parent.name ?? "") && other.nodes?.some(node => node.type === "decl" && /^(animation|transform|opacity|translate|rotate|scale)/.test(node.prop))) {
        if (other.selector.split(",").some(part => part.trim().includes(selector))) fail(other, "Overlapping selector animation rules are unsupported");
      }
    });
    if (!["running", "paused"].includes(props["animation-play-state"] ?? "running")) fail(rule, "Unsupported animation-play-state");
    const keyframes = [];
    root.walkAtRules(at => { if (/keyframes$/i.test(at.name) && at.params === name) keyframes.push(at); });
    if (keyframes.length !== 1 || keyframes[0].name !== "keyframes" || keyframes[0].parent.type !== "root") fail(rule, "Expected one unconditional, unprefixed keyframes definition");
    const frameNodes = keyframes[0].nodes.filter(node => node.type !== "comment");
    const values = frameNodes.map(frame => {
      if (frame.type !== "rule") fail(frame, "Invalid keyframe node");
      const offset = frame.selector === "from" ? 0 : frame.selector === "to" ? 1
        : /^\d+(?:\.\d+)?%$/.test(frame.selector) ? Number(frame.selector.slice(0, -1)) / 100 : NaN;
      const data = {};
      for (const decl of frame.nodes) {
        if (decl.type === "comment") continue;
        if (decl.type !== "decl" || decl.important || !["transform", "opacity", "animation-timing-function"].includes(decl.prop)) fail(decl, "Only complete transform/opacity keyframes and supported easing are compiled");
        if (data[decl.prop] !== undefined) fail(decl, "Duplicate selected keyframe properties are unsupported");
        data[decl.prop] = decl.value;
      }
      if (data.transform === undefined || data.opacity === undefined) fail(frame, "Every keyframe must explicitly define transform and opacity");
      if (!/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:e[+-]?\d+)?$/i.test(data.opacity.trim())) {
        fail(frame, "Opacity must be a static CSS number in [0,1]");
      }
      try {
        return { offset, ...parseTransform(data.transform), opacity: Number(data.opacity),
          easing: easing(frame, data["animation-timing-function"] ?? props["animation-timing-function"] ?? "ease"),
          transform: data.transform };
      } catch (error) { fail(frame, error.message); }
    });
    const timing = { duration: time(rule, props["animation-duration"] ?? "0s"), delay: time(rule, props["animation-delay"] ?? "0s"),
      iterations: props["animation-iteration-count"] === "infinite" ? Infinity : Number(props["animation-iteration-count"] ?? 1),
      direction: props["animation-direction"] ?? "normal", easing: "linear", fill: props["animation-fill-mode"] ?? "none" };
    try { compileTimeline(values, timing); } catch (error) { fail(rule, error.message); }
    if (values.some((value, index) => index && Math.fround(value.offset) <= Math.fround(values[index - 1].offset))) {
      fail(rule, "Selected offsets must remain distinct at GPU f32 precision");
    }
    return { id: `${entry.id}/${entry.animations[0]}`, selector, name, values, timing,
      frames: values.map(value => ({ offset: value.offset, matrix: [...affine(value)], opacity: value.opacity, easing: value.easing })) };
  });
}
export function createCompiler(config) {
  const validated = validateConfig(config);
  const outputs = new Map();
  return {
    consume(filename, root, entries, modules = {}) {
      const animations = compileStylesheet("", entries, { filename, root, modules });
      outputs.set(filename, animations);
    },
    generate() {
      const animations = [...outputs.values()].flat();
      const expected = validated.entries.map(entry => `${entry.id}/${entry.animations[0]}`);
      if (animations.length !== expected.length || expected.some(id => !animations.some(animation => animation.id === id))) {
        throw new Error("CanvasSPA: selected styles were not processed by the configured CSS pipeline");
      }
      return generateModule(animations.sort((a, b) => expected.indexOf(a.id) - expected.indexOf(b.id)), validated.maxLayers);
    },
    postcss(select) {
      return { postcssPlugin: "canvas-spa-compiler", OnceExit(root, { result }) {
        const filename = result.opts.from;
        const entries = select(filename);
        if (!entries?.length) return;
        const modules = result.messages.find(message => message.type === "export" && message.plugin === "postcss-modules")?.exportTokens ?? {};
        const animations = compileStylesheet("", entries, { filename, root, modules });
        outputs.set(filename, animations);
      } };
    },
  };
}
