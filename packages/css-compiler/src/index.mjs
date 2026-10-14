/**
 * Core of the build-time CSS compiler. Parses a stylesheet with PostCSS, checks that each selected rule
 * and its `@keyframes` fall in the supported subset (see the package README), and produces `ParsedAnimation`
 * records (timing, per-frame affine matrices, opacity, easing). `generate.mjs` turns those into the
 * `virtual:underglass/compiled` module. The Vite (`vite.mjs`) and webpack (`webpack-loader.mjs`) adapters
 * feed it the stylesheets that the application's own pipeline has already processed.
 */
import postcss from "postcss";
import valueParser from "postcss-value-parser";
import { affine, compileTimeline, parseTransform } from "@underglass/react/build";
import { validateConfig, readConfig } from "./config.mjs";
import { generateModule } from "./generate.mjs";

export { validateConfig, readConfig };
// The animation longhands a selected rule may set. The `animation` shorthand is expanded into these.
const animationProperties = ["animation-name", "animation-duration", "animation-delay", "animation-iteration-count",
  "animation-direction", "animation-fill-mode", "animation-timing-function", "animation-play-state"];
/**
 * Throws a PostCSS `CssSyntaxError` anchored at `node`, so the build reports the source location of the
 * unsupported CSS. Every refusal in this module goes through here.
 */
function fail(node, message) { throw node.error(`Underglass: ${message}`, { plugin: "underglass-compiler" }); }
/**
 * Parses a static CSS time (`1s`, `250ms`) into milliseconds. Anything else (negative, `calc`, `var`) fails.
 */
function time(node, text) {
  if (!/^\d+(?:\.\d+)?(?:ms|s)$/.test(text)) fail(node, `Unsupported static time: ${text}`);
  return Number(text.slice(0, text.endsWith("ms") ? -2 : -1)) * (text.endsWith("ms") ? 1 : 1000);
}
/**
 * Validates an easing and returns its canonical text: a named easing, or `cubic-bezier(...)` with all four
 * control points as plain numbers in [0,1] (no overshoot). `steps()` and `linear()` are refused.
 */
function easing(node, text) {
  const normalized = text.replace(/\s+/g, "");
  if (["linear", "ease", "ease-in", "ease-out", "ease-in-out"].includes(normalized)) return normalized;
  const match = normalized.match(/^cubic-bezier\(([^,]+),([^,]+),([^,]+),([^,]+)\)$/);
  if (!match || match.slice(1).some(value => !/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(value) || Number(value) > 1)) {
    fail(node, `Unsupported easing (non-overshooting cubic-bezier or named easing required): ${text}`);
  }
  return `cubic-bezier(${match.slice(1).map(Number).join(",")})`;
}
// Values that depend on the cascade or on custom properties cannot be evaluated at build time. The
// lookarounds make the CSS-wide keywords match whole identifiers only (`initial-fade` is a valid name).
const dependent = /(?<![\w-])(?:inherit|revert|revert-layer|unset|initial)(?![\w-])|(?<![\w-])(?:var|calc|env)\(/i;
/**
 * True when the selector list `part` mentions `selector` as a whole token, so `.card` matches
 * `.wrap .card.hot` and `.card:hover` but not `.card-header` or `.card2`.
 */
function overlaps(part, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\#]/g, "\\$&");
  return new RegExp(`${escaped}(?![\\w-])`).test(part);
}
/**
 * Collects the animation longhands of a selected rule into `{ property: value }`, applying shorthand and
 * longhand declarations in source order. Refuses nested rules, transitions, vendor-prefixed animation
 * properties and dependent or `!important` values.
 */
function declarations(rule) {
  const result = {};
  for (const node of rule.nodes ?? []) {
    if (node.type === "comment") continue;
    if (node.type !== "decl") fail(node, "Nested rules are unsupported in a selected target");
    if (/^transition(?:-|$)/.test(node.prop)) fail(node, "Selected CSS transitions require an explicit adapter");
    if (/^-[a-z]+-(?:animation|transition)/i.test(node.prop)) fail(node, `Vendor-prefixed ${node.prop} is unsupported in a selected target; use the unprefixed property`);
    if (!node.prop.startsWith("animation")) continue;
    if (node.important || dependent.test(node.value)) fail(node, "Dependent/important selected animation");
    if (node.prop === "animation") {
      const tokens = valueParser(node.value).nodes.filter(token => token.type !== "space" && token.type !== "comment")
        .map(token => valueParser.stringify(token));
      // CSS initial values for every longhand the shorthand resets. `animation-name` has no default and
      // is set only when a name token is found.
      const data = { "animation-duration": "0s", "animation-delay": "0s", "animation-iteration-count": "1", "animation-direction": "normal",
        "animation-fill-mode": "none", "animation-timing-function": "ease", "animation-play-state": "running" };
      const seen = new Set();
      const set = (property, token) => {
        if (seen.has(property)) fail(node, `Duplicate shorthand value: ${property}`);
        seen.add(property);
        data[property] = token;
      };
      let times = 0;
      // Shorthand tokens may appear in any order. The first time value is the duration and the second is
      // the delay, as in CSS; the other tokens are identified by their keyword or shape.
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
      // The shorthand resets every longhand it covers, including earlier declarations.
      delete result["animation-name"];
      Object.assign(result, data);
    } else {
      if (!animationProperties.includes(node.prop)) fail(node, `Unsupported animation property: ${node.prop}`);
      result[node.prop] = node.value;
    }
  }
  return result;
}
/**
 * Compiles the selected animations of one stylesheet. For each entry finds the single top-level rule for
 * its selector and the single unprefixed top-level `@keyframes`, and returns one `ParsedAnimation` per entry.
 * `css` is parsed unless `root` (an already-parsed PostCSS root) is supplied. `modules` maps source class and
 * animation names to the CSS Modules hashed names. Throws a `CssSyntaxError` (via `fail`) for anything outside
 * the supported subset.
 */
export function compileStylesheet(css, entries, { filename = "input.css", modules = {}, root: suppliedRoot } = {}) {
  const root = suppliedRoot ?? postcss.parse(css, { from: filename });
  return entries.map(entry => {
    const token = entry.selector.slice(1);
    const mapped = modules[token];
    if (mapped && !/^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(mapped)) fail(root, "CSS Modules composition/multiple tokens is unsupported");
    const selector = mapped ? entry.selector[0] + mapped : entry.selector;
    const name = modules[entry.animations[0]] ?? entry.animations[0];
    const rules = [];
    // Only top-level rules count: a rule nested in a conditional at-rule is not an unconditional target.
    root.walkRules(rule => { if (rule.selector === selector && rule.parent.type === "root") rules.push(rule); });
    if (rules.length !== 1) fail(root, `Expected one top-level rule for ${entry.selector} (${selector}), found ${rules.length}`);
    const rule = rules[0], props = declarations(rule);
    if (props["animation-name"] !== name) fail(rule, `Selected animation ${name} does not match the target's single animation`);
    // The analyzer is not a cascade engine, so any other rule that sets animation, transform or opacity properties
    // on the same selector (including `:hover` or a compound selector) is refused rather than ordered.
    root.walkRules(other => {
      if (other !== rule && !/keyframes$/i.test(other.parent.name ?? "") && other.nodes?.some(node => node.type === "decl" && /^(animation|transform|opacity|translate|rotate|scale)/.test(node.prop))) {
        if (other.selector.split(",").some(part => overlaps(part, selector))) fail(other, "Overlapping selector animation rules are unsupported");
      }
    });
    if (!["running", "paused"].includes(props["animation-play-state"] ?? "running")) fail(rule, "Unsupported animation-play-state");
    const keyframes = [];
    // Keyframes are matched by name and must be one unprefixed, unconditional definition.
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
    // The animation-level easing is `linear`; each keyframe carries its own easing, which applies to the
    // segment that starts at that keyframe.
    const timing = { duration: time(rule, props["animation-duration"] ?? "0s"), delay: time(rule, props["animation-delay"] ?? "0s"),
      iterations: props["animation-iteration-count"] === "infinite" ? Infinity : Number(props["animation-iteration-count"] ?? 1),
      direction: props["animation-direction"] ?? "normal", easing: "linear", fill: props["animation-fill-mode"] ?? "none" };
    try { compileTimeline(values, timing); } catch (error) { fail(rule, error.message); }
    // Offsets are uploaded to the GPU as f32, so two distinct CSS offsets that collapse to the same f32
    // value would produce an empty segment.
    if (values.some((value, index) => index && Math.fround(value.offset) <= Math.fround(values[index - 1].offset))) {
      fail(rule, "Selected offsets must remain distinct at GPU f32 precision");
    }
    // `frames` is the public descriptor the runtime verifies against the browser animation. `values`
    // keeps the per-frame numbers that `generate.mjs` needs and is not emitted.
    return { id: `${entry.id}/${entry.animations[0]}`, selector, name, values, timing,
      frames: values.map(value => ({ offset: value.offset, matrix: [...affine(value)], opacity: value.opacity, easing: value.easing })) };
  });
}
/**
 * Creates a compiler for one configured build. Stylesheets are fed in with `consume` or through the
 * `postcss` plugin as the pipeline processes them, and `generate` returns the module source once every
 * configured entry has been seen. One instance serves one build.
 */
export function createCompiler(config) {
  const validated = validateConfig(config);
  const outputs = new Map();
  return {
    // Records the animations of a stylesheet that was already processed into a PostCSS `root` (webpack path).
    consume(filename, root, entries, modules = {}) {
      const animations = compileStylesheet("", entries, { filename, root, modules });
      outputs.set(filename, animations);
    },
    // Fails the build if any configured entry was never processed. Output follows configuration order, which
    // fixes each animation's index in the generated program.
    generate() {
      const animations = [...outputs.values()].flat();
      const expected = validated.entries.map(entry => `${entry.id}/${entry.animations[0]}`);
      if (animations.length !== expected.length || expected.some(id => !animations.some(animation => animation.id === id))) {
        throw new Error("Underglass: selected styles were not processed by the configured CSS pipeline");
      }
      return generateModule(animations.sort((a, b) => expected.indexOf(a.id) - expected.indexOf(b.id)));
    },
    // PostCSS plugin for the Vite path. It runs in `OnceExit`, after the application's other plugins, so the
    // compiler sees the final CSS. `select` returns the entries for the file being processed (undefined to
    // skip it). CSS Modules class names come from the `postcss-modules` export message.
    postcss(select) {
      return { postcssPlugin: "underglass-compiler", OnceExit(root, { result }) {
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
