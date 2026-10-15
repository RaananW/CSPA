/**
 * Example 08, "GPU or CSS?": six side-by-side comparisons. The left pane (`compare-css`) does the
 * job with the best CSS technique available; the right pane is the decorative art layer, where
 * Underglass does the same job as a shader over one capture. A frame meter in the panel and a
 * "work per frame" strip under the panes make the cost visible, and the last comparison is one
 * where CSS wins. In ordinary DOM the right pane shows Underglass's raw capture, without its shader.
 */
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Surface, defineEffect, useGPUHost, type EffectDescriptor } from "@underglass/react";
import { Panel, useReducedMotion } from "./shared";
import { policy, residentChain, useScene, useSceneArt } from "./scene";

/** The two panes share one size and sit side by side right of the panel. */
const PANE = { width: 320, height: 488, y: 96 } as const;
const CSS_X = 364;
const GPU_X = 700;
/** Glowing tiles: 8 columns on a 36 px pitch (24 px tile, 12 px gap), from (22, 16) in the pane. */
const TILES = { columns: 8, pitch: 36, size: 24, x: 22, y: 16, max: 104 } as const;
/** Heat map: 36 x 57 cells on an 8 px pitch (7 px cell), from (16, 16) in the pane. */
const CELLS = { columns: 36, rows: 57, pitch: 8 } as const;
const CELL_COUNT = CELLS.columns * CELLS.rows;

type Id = "glow" | "ripple" | "split" | "burn" | "cells" | "glass";
type Run = "both" | "css" | "gpu" | "none";
/** What one side does and what that costs per animated frame. */
interface Side { technique: string; work: readonly string[] }
interface Comparison {
  id: Id; label: string; css: Side; gpu: Side; verdict: string;
  /** Nothing animates per frame: the cost is in the copies, so the Animate choice is disabled. */
  still?: boolean;
  /** The one slider this comparison offers; both panes follow it. */
  amount?: { label: string; min: number; max: number; step: number; initial: number; unit: string };
}

const comparisons: readonly Comparison[] = [
  { id: "glow", label: "Glowing tiles",
    css: { technique: "box-shadow + border-radius keyframes", work: ["Style", "Paint every tile", "Composite"] },
    gpu: { technique: "Custom WGSL over one capture", work: ["Capture once", "1 shader pass"] },
    verdict: "Same picture. box-shadow and border-radius aren't compositor properties, so CSS repaints every tile on every frame. Underglass captures the grid once and the shader draws corners and glow from its clock. At this size a fast machine barely notices; the gap grows with the number and size of the tiles.",
    amount: { label: "Tiles", min: 16, max: TILES.max, step: 8, initial: 64, unit: "" } },
  { id: "ripple", label: "Ripple",
    css: { technique: "SVG turbulence displacement filter", work: ["Noise", "Displace", "Paint", "Composite"] },
    gpu: { technique: "Built-in ripple effect", work: ["Capture on change", "1 shader pass"] },
    verdict: "CSS's closest tool is an SVG displacement filter driven by turbulence: it wobbles rather than ripples, and the browser re-filters the whole card every frame. Underglass moves the captured pixels in a radial wave; the card only re-captures when the clock changes.",
    amount: { label: "Amplitude", min: 0, max: 12, step: 1, initial: 7, unit: " px" } },
  { id: "split", label: "Channel split",
    css: { technique: "3 copies + channel filters + screen blend", work: ["Layout ×3", "Paint ×3", "Filter ×3", "Blend"] },
    gpu: { technique: "Built-in chromatic effect", work: ["Capture once", "1 shader pass"] },
    verdict: "CSS can't separate the colour channels of HTML. The workaround renders the card three times, filters each copy down to one channel and blends them: three trees to lay out, paint and keep in sync, and the copies can't be interactive. Underglass shifts the channels of the one original.",
    still: true,
    amount: { label: "Split", min: 0, max: 12, step: 1, initial: 6, unit: " px" } },
  { id: "burn", label: "Burn away",
    css: { technique: "SVG noise threshold as an alpha mask", work: ["Noise", "Threshold", "Mask", "Paint"] },
    gpu: { technique: "Custom WGSL burn", work: ["Capture once", "1 shader pass"] },
    verdict: "An SVG filter can threshold noise into a mask, so CSS can dissolve a card, but it filters the card again every frame and has no glowing edge without stacking more filters. Underglass burns along noise with an ember rim, and materialises the card back in cyan.",
  },
  { id: "cells", label: `Recolour ${CELL_COUNT.toLocaleString("en-US")} cells`,
    css: { technique: "One custom property, color-mix() per cell", work: [`Style ×${CELL_COUNT.toLocaleString("en-US")}`, "Paint", "Composite"] },
    gpu: { technique: "Custom WGSL colour map", work: ["Capture once", "1 shader pass"] },
    verdict: "Moving the threshold is a single custom property on the grid, yet every cell re-resolves its colour and repaints, every frame. Underglass captures the grid once in greyscale and maps value to colour in the shader. In ordinary DOM you see that greyscale capture.",
  },
  { id: "glass", label: "Frosted glass",
    css: { technique: "backdrop-filter + transform keyframes", work: ["Composite", "Blur"] },
    gpu: { technique: "Nothing to add: the same CSS", work: ["Capture every frame", "Composite"] },
    verdict: "CSS wins. backdrop-filter already blurs on the GPU and the blobs move as compositor transforms. Underglass shaders are per-pixel colour functions that can't read neighbouring pixels, so they can't blur; Underglass only presents the CSS result, re-capturing it every frame. Use CSS.",
    amount: { label: "Blur", min: 0, max: 24, step: 2, initial: 14, unit: " px" } },
];

/** Trusted WGSL: rounded corners and a pulsing glow for every tile of the grid, from one clock. */
const glowTiles = defineEffect({
  name: "showcase-glow-tiles",
  parameters: { count: { min: 0, max: TILES.max }, strength: { min: 0, max: 1 } },
  geometry: "color", bounds: "layer", capabilities: ["webgpu"],
  wgsl: `
    let rel = local - vec2f(${TILES.x}.0, ${TILES.y}.0);
    let own = floor(rel / ${TILES.pitch}.0);
    var cover = 0.0;
    var square = 0.0;
    var glow = 0.0;
    for (var j = -1; j <= 1; j++) {
      for (var i = -1; i <= 1; i++) {
        let cell = own + vec2f(f32(i), f32(j));
        if (cell.x < 0.0 || cell.x > ${TILES.columns - 1}.0 || cell.y < 0.0 || cell.y * ${TILES.columns}.0 + cell.x >= parameters.x) { continue; }
        let phase = 0.5 - 0.5 * cos((seconds / 2.4 + (cell.x + cell.y) * 0.06) * 6.2831853);
        let radius = mix(3.0, 12.0, phase);
        let q = abs(rel - cell * ${TILES.pitch}.0 - vec2f(12.0)) - vec2f(12.0 - radius);
        let d = length(max(q, vec2f(0.0))) + min(max(q.x, q.y), 0.0) - radius;
        let edge = abs(rel - cell * ${TILES.pitch}.0 - vec2f(12.0));
        square = max(square, select(0.0, 1.0, max(edge.x, edge.y) < 12.0));
        cover = max(cover, 1.0 - smoothstep(-0.5, 0.5, d));
        glow += phase * exp(-max(d, 0.0) / 5.0);
      }
    }
    let background = vec3f(0.043, 0.051, 0.106);
    let base = mix(color.rgb, mix(background, color.rgb, cover), square);
    let lit = base + vec3f(0.369, 0.882, 0.816) * min(glow, 1.0) * 0.85 * parameters.y * (1.0 - cover);
    return vec4f(min(lit, vec3f(1.0)), color.a);`,
});

/** Trusted WGSL: maps the captured grey value of each cell to colour, against a moving threshold. */
const colourMap = defineEffect({
  name: "showcase-colour-map",
  parameters: { strength: { min: 0, max: 1 } },
  geometry: "color", bounds: "layer", capabilities: ["webgpu"],
  wgsl: `
    let lum = dot(color.rgb, vec3f(0.2126, 0.7152, 0.0722));
    let v = clamp((lum - 0.1) / 0.9, 0.0, 1.0);
    let threshold = 0.5 + 0.35 * sin(seconds * 0.9);
    let on = clamp((v - threshold) * 40.0, 0.0, 1.0);
    let cold = mix(vec3f(0.071, 0.102, 0.239), vec3f(0.2, 0.549, 1.0), v);
    let hot = mix(vec3f(1.0, 0.451, 0.102), vec3f(1.0, 0.902, 0.349), v);
    let mapped = mix(mix(cold, hot, on), vec3f(0.035, 0.043, 0.09), 1.0 - smoothstep(0.03, 0.09, lum));
    return vec4f(mix(color.rgb, mapped, parameters.x), color.a);`,
});

/** Trusted WGSL: burns the layer away along value noise with an ember rim, then materialises it in cyan, every 5 s. */
const burnLoop = defineEffect({
  name: "showcase-burn-loop",
  parameters: { glow: { min: 0, max: 1 }, grain: { min: 4, max: 64 } },
  geometry: "color", bounds: "layer", capabilities: ["webgpu"],
  wgsl: `
    let turn = seconds * 1.2566371;
    let amount = 0.5 - 0.58 * cos(turn);
    let cell = local / parameters.y;
    let i = floor(cell);
    let f = fract(cell);
    let u = f * f * (3.0 - 2.0 * f);
    let a = fract(sin(dot(i, vec2f(12.9898, 78.233))) * 43758.5453);
    let b = fract(sin(dot(i + vec2f(1.0, 0.0), vec2f(12.9898, 78.233))) * 43758.5453);
    let c = fract(sin(dot(i + vec2f(0.0, 1.0), vec2f(12.9898, 78.233))) * 43758.5453);
    let d = fract(sin(dot(i + vec2f(1.0, 1.0), vec2f(12.9898, 78.233))) * 43758.5453);
    let noise = mix(mix(a, b, u.x), mix(c, d, u.x), u.y) * 0.82 + fract(sin(dot(floor(local / 3.0), vec2f(39.346, 11.135))) * 43758.5453) * 0.18;
    let live = smoothstep(0.0, 0.04, amount);
    let keep = smoothstep(amount - 0.012, amount + 0.012, noise);
    let rim = (1.0 - smoothstep(amount, amount + 0.1, noise)) * keep * live;
    let hot = select(vec3f(1.0, 0.42, 0.08), vec3f(0.25, 0.85, 1.0), sin(turn) < 0.0);
    let lit = mix(color.rgb, hot, rim * parameters.x) + hot * rim * parameters.x * 0.5;
    return vec4f(min(lit, vec3f(1.0)), color.a * mix(1.0, keep, live));`,
});

/** How far the CSS burn is through its 5 s loop, matching `burnLoop`'s `amount` (0 whole, 1 gone). */
const burnAmount = (seconds: number) => Math.min(1, Math.max(0, 0.5 - 0.58 * Math.cos(seconds * 1.2566371)));
/** The heat-map threshold at `seconds`, matching `colourMap`. */
const threshold = (seconds: number) => 0.5 + 0.35 * Math.sin(seconds * 0.9);

/** The effect chain for the Underglass pane: one operation, or none where Underglass has nothing to add. */
function chain(id: Id, amount: number, count: number, seconds: number, playing: boolean): EffectDescriptor[] {
  const time = { seconds, playing };
  switch (id) {
    case "glow": return [{ kind: "custom", definition: glowTiles, parameters: { count, strength: 1 }, time, ...policy }];
    case "ripple": return [{ kind: "ripple", parameters: { amplitude: amount }, time, ...policy }];
    case "split": return [{ kind: "chromatic", parameters: { displacement: amount }, time, ...policy }];
    case "burn": return [{ kind: "custom", definition: burnLoop, parameters: { glow: 1, grain: 18 }, time, ...policy }];
    case "cells": return [{ kind: "custom", definition: colourMap, parameters: { strength: 1 }, time, ...policy }];
    case "glass": return [];
  }
}

/** The comparison example: controls on the left, CSS in the middle, Underglass on the right. */
export function Compare() {
  const scene = useScene();
  const reduced = useReducedMotion();
  const [id, setId] = useState<Id>("glow");
  const [run, setRun] = useState<Run>("both");
  const comparison = comparisons.find(entry => entry.id === id)!;
  const [amounts, setAmounts] = useState<Partial<Record<Id, number>>>({});
  const amount = amounts[id] ?? comparison.amount?.initial ?? 0;
  const count = id === "glow" ? amount : 64;
  // Reduced motion stops both sides; the visitor can't start them from here.
  const running = reduced ? "none" : run;
  const cssRunning = running === "both" || running === "css";
  const gpuRunning = running === "both" || running === "gpu";
  // One clock for both sides, so the CSS loops and the shader clock start in step.
  const epoch = useRef(performance.now());
  const [note, setNote] = useState<string>();

  useSceneArt(() => ({ layout: { x: GPU_X, y: PANE.y, width: PANE.width, height: PANE.height, overflow: "hidden" },
    appearance: paneAppearance(id), content: <PaneContent id={id} side="gpu" amount={amount} count={count} running={gpuRunning} /> }),
  [id, amount, count, gpuRunning]);
  useEffect(() => {
    const seconds = ((performance.now() - epoch.current) / 1000) % 1000;
    const result = scene.setChain(chain(id, amount, count, seconds, gpuRunning));
    setNote(!result.ok ? `Effect unavailable: ${result.error}` : result.customDropped
      ? "This shader needs a fresh GPU admission: use ordinary DOM, then enable GPU again." : undefined);
  }, [scene, id, amount, count, gpuRunning]);
  // Leaving the example returns the shared art layer to its resident identity chain.
  useEffect(() => () => { scene.setChain(residentChain()); }, [scene]);

  const meter = useFrameMeter();
  const gpu = meter.mode === "gpu";
  return <>
    <Panel tone="dark" label="STUDIO 08" title="GPU or CSS?">
      <fieldset className="compare-picker">
        <legend>Comparison</legend>
        {comparisons.map(entry => <label key={entry.id} className={`chip ${entry.id === id ? "on" : ""}`}>
          <input type="radio" name="compare-scene" value={entry.id} checked={entry.id === id} onChange={() => setId(entry.id)} />{entry.label}</label>)}
      </fieldset>
      <fieldset className="compare-run">
        <legend>Animate</legend>
        {([["both", "Both"], ["css", "CSS"], ["gpu", "Underglass"], ["none", "Paused"]] as const).map(([value, label]) =>
          <label key={value} className={`chip ${running === value ? "on" : ""}`}>
            <input type="radio" name="compare-run" value={value} checked={running === value} disabled={reduced || comparison.still} onChange={() => setRun(value)} />{label}</label>)}
      </fieldset>
      {comparison.amount && <label className="range">
        <span className="range-head">{comparison.amount.label}<span className="count">{amount}{comparison.amount.unit}</span></span>
        <input type="range" min={comparison.amount.min} max={comparison.amount.max} step={comparison.amount.step} value={amount}
          aria-valuetext={`${amount}${comparison.amount.unit}`} onChange={event => setAmounts(values => ({ ...values, [id]: Number(event.target.value) }))} />
      </label>}
      <div className="meter" role="group" aria-label="Rendering work per frame">
        <span><strong>{meter.work.toFixed(1)}</strong> ms render</span><span><strong>{meter.worst}</strong> ms worst</span><span><strong>{meter.fps}</strong> fps</span>
      </div>
      <output id="compare-verdict" role="status">{note ?? comparison.verdict}</output>
      <p className="panel-note">{reduced ? "Reduced motion is on, so both sides stay still."
        : comparison.still ? "Nothing animates here: the CSS cost is three copies of the card, paid whenever it changes."
        : gpu ? "Animate one side at a time and compare render ms/frame. In GPU mode the CSS pane is captured like any layer, so its repaints also cost a capture."
          : "Ordinary DOM: the right pane shows Underglass's raw capture without its shader. Enable experimental GPU to compare."}</p>
    </Panel>
    <Surface id="compare-heads" className="compare-strip compare-heads" aria-label="What each side uses"
      layout={{ x: CSS_X, y: 24, width: GPU_X + PANE.width - CSS_X, height: 60, direction: "row", gap: 16 }}>
      <div><span className="side-label css">CSS</span><strong>{comparison.css.technique}</strong></div>
      <div><span className="side-label gpu">UNDERGLASS</span><strong>{comparison.gpu.technique}</strong></div>
    </Surface>
    <Surface id="compare-css" decorative layout={{ x: CSS_X, y: PANE.y, width: PANE.width, height: PANE.height, overflow: "hidden" }}
      appearance={paneAppearance(id)}>
      <PaneContent id={id} side="css" amount={amount} count={count} running={cssRunning} epoch={epoch.current} />
    </Surface>
    <Surface id="compare-work" className="compare-strip compare-work" aria-label="Work per animated frame"
      layout={{ x: CSS_X, y: 596, width: GPU_X + PANE.width - CSS_X, height: 80, direction: "row", gap: 16 }}>
      <Work side={comparison.css} extra={gpu && id !== "glass" ? "+ capture (GPU mode)" : undefined} />
      <Work side={comparison.gpu} />
    </Surface>
  </>;
}

/** One side's "per frame" chips. */
function Work({ side, extra }: { side: Side; extra?: string }) {
  return <div><span className="work-label">PER FRAME</span>
    <span className="work-chips">{side.work.map(step => <span key={step}>{step}</span>)}{extra && <span className="extra">{extra}</span>}</span></div>;
}

/** Pane background: transparent for the burn, so both sides burn through to the same backdrop. */
function paneAppearance(id: Id) {
  return { background: id === "burn" ? "transparent" : id === "cells" ? "rgb(9,11,23)" : id === "split" ? "rgb(0,0,0)" : "rgb(11,13,27)", radius: 18 };
}

/** The demo content of one pane. The CSS side animates itself; the Underglass side is static content for the shader. */
function PaneContent({ id, side, amount, count, running, epoch = 0 }: { id: Id; side: "css" | "gpu"; amount: number; count: number; running: boolean; epoch?: number }) {
  const css = side === "css";
  switch (id) {
    case "glow": return <Tiles count={count} animated={css && running} />;
    case "ripple": return css ? <CssRipple amplitude={amount} running={running} epoch={epoch} /> : <LiveCard />;
    case "split": return css ? <CssSplit displacement={amount} /> : <LiveCard />;
    case "burn": return css ? <CssBurn running={running} epoch={epoch} /> : <LiveCard />;
    case "cells": return <Cells css={css} running={running} epoch={epoch} />;
    case "glass": return <Glass blur={amount} running={running} />;
  }
}

/** The tile grid. The CSS side animates border-radius and box-shadow with keyframes. */
function Tiles({ count, animated }: { count: number; animated: boolean }) {
  return <div className={`cmp-tiles ${animated ? "run" : ""}`}>
    {Array.from({ length: count }, (_, index) => {
      const column = index % TILES.columns, row = Math.floor(index / TILES.columns);
      return <i key={index} style={{ "--d": column + row, background: `hsl(${200 + index * 2.4} 72% ${46 + (index % 3) * 6}%)` } as CSSProperties} />;
    })}
  </div>;
}

/** A small "live" card whose clock ticks every second, so both sides have changing content. */
function LiveCard() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const timer = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(timer); }, []);
  return <article className="cmp-card">
    <div className="cmp-photo"><i className="sun" /><i className="hill one" /><i className="hill two" /></div>
    <div className="cmp-card-body">
      <span className="cmp-kicker">LIVE · LOCAL TIME</span>
      <strong className="cmp-clock">{now.toLocaleTimeString("en-GB")}</strong>
      <p>Real HTML: text, gradients and a clock React re-renders every second.</p>
      <span className="cmp-tags"><span>HTML</span><span>CSS</span><span>React</span></span>
    </div>
  </article>;
}

/** Calls `step(seconds)` every animation frame while `running`, with seconds since `epoch`. */
function useFrame(running: boolean, epoch: number, step: (seconds: number) => void) {
  const latest = useRef(step);
  latest.current = step;
  useEffect(() => {
    if (!running) return;
    let frame = requestAnimationFrame(function tick(now) { latest.current((now - epoch) / 1000); frame = requestAnimationFrame(tick); });
    return () => cancelAnimationFrame(frame);
  }, [running, epoch]);
}

/** CSS ripple: an SVG turbulence field, moved every frame, displaces the card. */
function CssRipple({ amplitude, running, epoch }: { amplitude: number; running: boolean; epoch: number }) {
  const offset = useRef<SVGFEOffsetElement>(null);
  useFrame(running, epoch, seconds => {
    offset.current?.setAttribute("dx", (Math.sin(seconds * 1.3) * 30).toFixed(2));
    offset.current?.setAttribute("dy", (Math.cos(seconds * 1.1) * 30).toFixed(2));
  });
  return <>
    <svg className="cmp-defs" aria-hidden="true"><filter id="cmp-ripple" x="-5%" y="-5%" width="110%" height="110%">
      <feTurbulence type="turbulence" baseFrequency="0.012 0.03" numOctaves={2} seed={3} result="noise" />
      <feOffset ref={offset} in="noise" dx="0" dy="0" result="moved" />
      <feDisplacementMap in="SourceGraphic" in2="moved" scale={amplitude * 2} xChannelSelector="R" yChannelSelector="G" />
    </filter></svg>
    <div className="cmp-filtered" style={{ filter: "url(#cmp-ripple)" }}><LiveCard /></div>
  </>;
}

/** feColorMatrix values that keep one colour channel (and alpha). */
const channels = {
  red: "1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0",
  green: "0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0",
  blue: "0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0",
} as const;

/**
 * CSS channel split: three copies of the card, each filtered down to one channel and screen-blended
 * over black, with red and blue shifted apart. The copies are aria-hidden pictures, not controls.
 */
function CssSplit({ displacement }: { displacement: number }) {
  return <>
    <svg className="cmp-defs" aria-hidden="true">
      {Object.entries(channels).map(([channel, matrix]) => <filter key={channel} id={`cmp-${channel}`}><feColorMatrix type="matrix" values={matrix} /></filter>)}
    </svg>
    <div className="cmp-split">
      {Object.keys(channels).map((channel, index) => <div key={channel} className="cmp-copy"
        style={{ filter: `url(#cmp-${channel})`, transform: `translateX(${(1 - index) * displacement}px)` }}><LiveCard /></div>)}
    </div>
  </>;
}

/** CSS burn: fractal noise thresholded into an alpha mask; the threshold moves every frame. */
function CssBurn({ running, epoch }: { running: boolean; epoch: number }) {
  const alpha = useRef<SVGFEFuncAElement>(null);
  useFrame(running, epoch, seconds => {
    const threshold = 0.2 + 0.6 * burnAmount(seconds);
    alpha.current?.setAttribute("intercept", (-14 * threshold).toFixed(3));
  });
  return <>
    <svg className="cmp-defs" aria-hidden="true"><filter id="cmp-burn" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves={3} seed={7} result="noise" />
      <feColorMatrix in="noise" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  1 0 0 0 0" result="field" />
      <feComponentTransfer in="field" result="mask"><feFuncA ref={alpha} type="linear" slope="14" intercept="-2.8" /></feComponentTransfer>
      <feComposite in="SourceGraphic" in2="mask" operator="in" />
    </filter></svg>
    <div className="cmp-filtered" style={{ filter: "url(#cmp-burn)" }}><LiveCard /></div>
  </>;
}

/** Deterministic heat-map values in 0..1: smooth hills plus a little grain. */
const values = Array.from({ length: CELL_COUNT }, (_, index) => {
  const x = index % CELLS.columns / CELLS.columns, y = Math.floor(index / CELLS.columns) / CELLS.rows;
  const hills = Math.sin(x * 5.1 + 0.4) * Math.cos(y * 3.7 - 0.8) * 0.5 + Math.sin((x + y) * 8.3) * 0.18;
  const grain = (Math.sin(index * 12.9898) * 43758.5453) % 1;
  return Math.min(1, Math.max(0, 0.5 + hills * 0.75 + grain * 0.08));
});

/**
 * The heat map. CSS cells compute their colour from `--v` and the grid's `--t` with color-mix(); the
 * Underglass cells are plain grey levels that the colour-map shader turns into the same colours.
 */
function Cells({ css, running, epoch }: { css: boolean; running: boolean; epoch: number }) {
  const grid = useRef<HTMLDivElement>(null);
  useFrame(css && running, epoch, seconds => grid.current?.style.setProperty("--t", threshold(seconds).toFixed(4)));
  return <div ref={grid} className={`cmp-cells ${css ? "css" : "grey"}`} style={{ "--t": threshold(0) } as CSSProperties}>
    {values.map((value, index) => css
      ? <i key={index} style={{ "--v": value.toFixed(3) } as CSSProperties} />
      : <i key={index} style={{ background: `rgb(${Array(3).fill(Math.round((0.1 + 0.9 * value) * 255)).join(",")})` }} />)}
  </div>;
}

/** Frosted glass over moving blobs: CSS on both sides, because Underglass has no blur to offer. */
function Glass({ blur, running }: { blur: number; running: boolean }) {
  return <div className={`cmp-glass ${running ? "run" : ""}`} style={{ "--blur": `${blur}px` } as CSSProperties}>
    <i className="blob one" /><i className="blob two" /><i className="blob three" />
    <div className="pane-glass"><span className="cmp-kicker">BACKDROP-FILTER</span><strong>Frosted glass</strong>
      <p>The blobs behind this card move with transform keyframes. The blur is backdrop-filter.</p></div>
  </div>;
}

/**
 * Main-thread rendering work per frame (average and worst over the last second) and the frame rate,
 * refreshed twice a second, plus the runtime's mode. A message posted from requestAnimationFrame is
 * delivered after that frame's style, layout, paint (and, in GPU mode, capture), so the gap measures
 * that work; a fast machine holds the frame rate either way. Both panes share the main thread, so
 * run one side at a time to see its own cost.
 */
function useFrameMeter() {
  const controller = useGPUHost();
  const [reading, setReading] = useState({ fps: 0, work: 0, worst: 0, mode: "dom" });
  useEffect(() => {
    const frames: number[] = [];
    let work: number[] = [];
    let started = 0, shown = performance.now();
    const channel = new MessageChannel();
    channel.port1.onmessage = () => { work.push(performance.now() - started); };
    let frame = requestAnimationFrame(function tick(now) {
      started = performance.now();
      channel.port2.postMessage(0);
      frames.push(now);
      while (frames.length && frames[0]! < now - 1000) frames.shift();
      if (now - shown >= 500 && work.length) {
        shown = now;
        const average = work.reduce((sum, value) => sum + value, 0) / work.length;
        setReading({ fps: frames.length, work: Math.round(average * 10) / 10, worst: Math.round(Math.max(...work)), mode: controller.state().mode });
        work = [];
      }
      frame = requestAnimationFrame(tick);
    });
    return () => { cancelAnimationFrame(frame); channel.port1.close(); };
  }, [controller]);
  return reading;
}
