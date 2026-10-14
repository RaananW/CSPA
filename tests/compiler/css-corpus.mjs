/**
 * Stylesheet corpus for the CSS compiler: `acceptedCSS` (must compile), `refusedCSS` (must be refused) and
 * `referenceTimes` (animation times at which samplers are compared). Used by `conformance.test.mjs` and by
 * `scripts/compiler-validation.mjs`, which feeds the accepted cases to the browser comparisons in
 * `native-css-reference.mjs` and `gpu-parity.mjs`.
 */
const identity = "translate(0px, 0px) rotate(0deg) scale(1)";
const finish = "translate(80px, -20px) rotate(140deg) scale(1.4, 0.6)";
const frames = `from { transform: ${identity}; opacity: 0.2; }
  to { transform: ${finish}; opacity: 0.85; }`;

/**
 * Builds one corpus case: a single `.fixture` (or `selector`) rule animating `motion`, plus its
 * `@keyframes`. `options` overrides the selector, animation shorthand (`rule`), keyframe body (`frames`) or
 * individual shorthand parts. Returns `{ label, entry, css }`.
 */
function fixture(label, options = {}) {
  const selector = options.selector ?? ".fixture";
  const rule = options.rule ?? `animation: motion ${options.duration ?? "1s"} ${options.delay ?? "0s"}
    ${options.easing ?? "linear"} ${options.iterations ?? "3"} ${options.direction ?? "normal"} both;`;
  return {
    label,
    entry: { id: "fixture", stylesheet: "./corpus.css", selector, animations: ["motion"] },
    css: `${selector} { width: 100px; height: 40px; ${rule} }
      @keyframes motion { ${options.frames ?? frames} }`,
  };
}

// Stylesheets the compiler must accept.
export const acceptedCSS = [
  fixture("default timing values", { rule: "animation: motion 1s both;" }),
  fixture("ID selector", { selector: "#fixture" }),
  fixture("reordered shorthand", { rule: "animation: both alternate 3 ease-in-out 1s 100ms motion paused;" }),
  fixture("all animation longhands", { rule: `animation-name: motion; animation-duration: 1000ms;
    animation-delay: 100ms; animation-iteration-count: 3; animation-direction: alternate;
    animation-fill-mode: both; animation-timing-function: ease-out; animation-play-state: paused;` }),
  fixture("longhand after shorthand", { rule: "animation: motion 1s linear 3 both; animation-duration: 2s;" }),
  fixture("shorthand after longhand", { rule: "animation-duration: 3s; animation: motion 1s linear 2 both;" }),
  fixture("comments", { rule: "/* target */ animation: motion /* duration */ 1s linear 3 both;",
    frames: `/* start */ ${frames} /* end */` }),
  fixture("percentage offsets", { frames: frames.replace("from", "0%").replace("to", "100%") }),
  fixture("identity none", { frames: frames.replace(identity, "none") }),
  fixture("single axis translation and uniform scale", { frames: frames.replace(finish, "translate(40px) rotate(45deg) scale(0.8)") }),
  fixture("negative translation and rotation", { frames: frames.replace(finish, "translate(-60px, -30px) rotate(-270deg) scale(0.8, 1.2)") }),
  fixture("multiple rotation turns", { frames: frames.replace(finish, "translate(10px, 4px) rotate(720deg) scale(1)") }),
  fixture("decimal and exponent numbers", { frames: frames.replace(finish, "translate(.5px, -2e1px) rotate(.25deg) scale(9e-1, 1.1)")
    .replace("0.85", "8.5e-1") }),
  fixture("zero and full opacity", { frames: frames.replace("0.2", "0").replace("0.85", "1") }),
  fixture("signed opacity", { frames: frames.replace("0.85", "+0.85") }),
  fixture("maximum frame count", { frames: Array.from({ length: 32 }, (_, index) =>
    `${index === 31 ? 100 : Number((index * 100 / 31).toFixed(6))}% {
      transform: translate(${index}px, ${-index}px) rotate(${index * 3}deg) scale(1);
      opacity: ${index / 31}; }`).join("\n") }),
  fixture("different segment easing", { frames: `from { transform: ${identity}; opacity: 0.2; animation-timing-function: ease-in; }
    37.5% { transform: translate(20px, 4px) rotate(30deg) scale(0.9, 1.1); opacity: 0.6; animation-timing-function: ease-out; }
    to { transform: ${finish}; opacity: 0.85; animation-timing-function: linear; }` }),
  fixture("short duration with large delay", { duration: "5ms", delay: "3600000ms" }),
  fixture("fractional milliseconds", { duration: "12.5ms", delay: "0.125ms" }),
  fixture("maximum duration delay and iterations", { duration: "3600000ms", delay: "3600000ms", iterations: "10000", direction: "alternate" }),
  fixture("many finite iterations", { duration: "1234.5ms", iterations: "10000" }),
];

// Every supported easing keyword, plus cubic-bezier curves including sharp-endpoint ones.
for (const easing of ["linear", "ease", "ease-in", "ease-out", "ease-in-out",
  "cubic-bezier(0, 0, 1, 1)", "cubic-bezier(.1, .8, .7, 1)",
  "cubic-bezier(0, 1, 0, 1)", "cubic-bezier(1, 0, 1, 0)"]) {
  acceptedCSS.push(fixture(`easing ${easing}`, { easing }));
}
// Every combination of direction, iteration count and delay.
for (const direction of ["normal", "alternate"]) for (const iterations of ["1", "2", "3", "infinite"]) {
  for (const delay of ["0ms", "250ms"]) {
    acceptedCSS.push(fixture(`${direction} ${iterations} iterations delay ${delay}`, { direction, iterations, delay }));
  }
}
// CSS Modules: the source names are rewritten to hashed names and `modules` supplies the mapping.
const mapped = fixture("CSS Modules mapped class and animation");
acceptedCSS.push({ ...mapped, css: mapped.css.replaceAll(".fixture", "._fixture_hash").replaceAll("motion", "_motion_hash"),
  modules: { fixture: "_fixture_hash", motion: "_motion_hash" } });
// Unselected CSS (including a transition on another rule) must not disturb compilation.
const unrelated = fixture("unselected CSS preserved");
acceptedCSS.push({ ...unrelated, css: `${unrelated.css}\n.unrelated:hover { transition: color 1s; color: red; }` });

// `replace` derives a refused case from the base fixture by editing its CSS.
const base = fixture("base");
const replace = (label, from, to) => ({ ...base, label, css: base.css.replace(from, to) });
// Stylesheets the compiler must refuse with a source-located error.
export const refusedCSS = [
  replace("missing transform", `transform: ${finish};`, ""),
  replace("missing opacity", "opacity: 0.85;", ""),
  replace("duplicate opacity", "opacity: 0.85;", "opacity: 0.85; opacity: 0.5;"),
  replace("duplicate transform", `transform: ${finish};`, `transform: ${finish}; transform: none;`),
  ...["filter: blur(2px)", "color: red", "width: 20px", "translate: 2px", "--motion: 2"].map(value =>
    replace(`unsupported keyframe ${value}`, "opacity: 0.85;", `opacity: 0.85; ${value};`)),
  ...["var(--opacity)", "calc(1 - .2)", "80%", "NaN", "Infinity", "0x1", "", "1.", "-0.1", "1.1"].map(value =>
    replace(`invalid or dependent opacity ${value || "(empty)"}`, "opacity: 0.85;", `opacity: ${value};`)),
  ...["translate(80%, -20px) rotate(0deg) scale(1)", "translateX(10px)", "matrix(1,0,0,1,0,0)",
    "translate3d(0px,0px,0px)", "translate(1.px, 0px) rotate(0deg) scale(1)",
    "translate(0px, 0px) rotate(0deg) scale(1.)", "translate(0px, 0px) rotate(1rad) scale(1)",
    "translate(1000001px, 0px) rotate(0deg) scale(1)", "translate(0px, 0px) rotate(36001deg) scale(1)",
    "translate(0px, 0px) rotate(0deg) scale(0)", "translate(0px, 0px) rotate(0deg) scale(-1)",
    "translate(0px, 0px) rotate(0deg) scale(0.00001)", "translate(0px, 0px) rotate(0deg) scale(1000001)"].map(value =>
    replace(`unsupported transform ${value}`, finish, value)),
  ...["steps(2)", "linear(0, 1)", "cubic-bezier(-.1, 0, 1, 1)", "cubic-bezier(0, 0, 1.1, 1)",
    "cubic-bezier(0, -.1, 1, 1)", "cubic-bezier(0, 0, 1, 1.1)"].map(value =>
    replace(`unsupported easing ${value}`, "linear", value)),
  ...["0ms", "-1s", "3600001ms", "var(--duration)"].map(value => replace(`unsupported duration ${value}`, "1s", value)),
  ...["-1s", "3600001ms"].map(value => replace(`unsupported delay ${value}`, "0s", value)),
  ...["0", "1.5", "10001"].map(value => replace(`unsupported iterations ${value}`, "3 normal", `${value} normal`)),
  ...["reverse", "alternate-reverse"].map(value => replace(`unsupported direction ${value}`, "normal", value)),
  ...["none", "forwards", "backwards"].map(value => replace(`unsupported fill ${value}`, "both", value)),
  replace("multiple animations", "both;", "both, other 1s both;"),
  replace("important animation", "both;", "both !important;"),
  replace("important frame", "opacity: 0.85;", "opacity: 0.85 !important;"),
  replace("selected transition", "both;", "both; transition: opacity 1s;"),
  replace("animation composition", "both;", "both; animation-composition: add;"),
  replace("scroll timeline", "both;", "both; animation-timeline: scroll();"),
  replace("negative end offset", "to {", "-1% {"),
  replace("out of range offset", "to {", "101% {"),
  replace("missing first endpoint", "from {", "10% {"),
  replace("missing last endpoint", "to {", "90% {"),
  replace("duplicate offsets", "to {", "from {"),
  replace("combined offsets", "from {", "0%, 10% {"),
  replace("prefixed keyframes", "@keyframes", "@-webkit-keyframes"),
  { ...base, label: "conditional target", css: `@media (min-width: 1px) { ${base.css} }` },
  { ...base, label: "duplicate target", css: `${base.css}\n.fixture { animation: motion 1s both; }` },
  { ...base, label: "duplicate keyframes", css: `${base.css}\n@keyframes motion { ${frames} }` },
  { ...base, label: "conditional overlapping opacity", css: `${base.css}\n@media (min-width: 1px) { .fixture { opacity: .4; } }` },
  { ...base, label: "hover overlap", css: `${base.css}\n.fixture:hover { transform: none; }` },
  { ...base, label: "CSS Modules composition", modules: { fixture: "_one _two" } },
  replace("offsets indistinct at f32 precision", "to {", `50% { transform: ${identity}; opacity: 1; }
    50.0000001% { transform: ${identity}; opacity: 1; } to {`),
];

/**
 * Times (in ms, ascending) at which to compare samplers for a parsed animation: the start, the largest
 * accepted time, neighborhoods of the delay, each keyframe offset and the end of the animation, and 15
 * interior points per cycle. The first three cycles and the last finite cycle are covered.
 */
export function referenceTimes(animation) {
  const { duration, delay, iterations } = animation.timing;
  // 1e12 is the largest time the generated `normalizeTime` accepts.
  const times = new Set([0, 1e12]);
  // Keep CSS reference seeks above Chromium's observed one-microsecond timing snap.
  const delta = Math.min(0.01, duration / 100);
  const add = time => { for (const offset of [-delta, 0, delta]) if (time + offset >= 0 && time + offset <= 1e12) times.add(time + offset); };
  add(delay);
  const cycles = new Set([0, 1, 2]);
  if (Number.isFinite(iterations)) cycles.add(iterations - 1);
  for (const cycle of cycles) {
    for (const frame of animation.values) add(delay + duration * (cycle + frame.offset));
    for (let step = 1; step < 16; step++) times.add(delay + duration * (cycle + step / 16));
  }
  if (Number.isFinite(iterations)) add(delay + duration * iterations);
  return [...times].sort((a, b) => a - b);
}
