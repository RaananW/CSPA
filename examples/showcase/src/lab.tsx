import { useEffect, useRef, useState } from "react";
import { Surface, type EffectDescriptor } from "@underglass/react";
import { Panel, useReducedMotion } from "./shared";
import { aurora, policy, residentChain, useScene, useSceneArt } from "./scene";

interface Lab {
  ripple: boolean; chromatic: boolean; aurora: boolean; dissolve: boolean;
  amplitude: number; displacement: number; strength: number; scanlines: number; glow: number; amount: number; playing: boolean;
}
type Key = "ripple" | "chromatic" | "aurora" | "dissolve";
const clean: Lab = { ripple: false, chromatic: false, aurora: false, dissolve: false,
  amplitude: 6, displacement: 8, strength: .75, scanlines: 0, glow: .6, amount: .35, playing: true };
const presets: Record<string, Partial<Lab>> = {
  Aurora: { aurora: true, strength: .8, scanlines: 0, glow: .8 },
  Hologram: { chromatic: true, displacement: 3, aurora: true, strength: .55, scanlines: 1, glow: .2 },
  Melt: { ripple: true, amplitude: 10, dissolve: true, amount: .3 },
  Glitch: { ripple: true, amplitude: 4, chromatic: true, displacement: 11, aurora: true, strength: .35, scanlines: .6, glow: 0 },
};
const MAX_OPERATIONS = 3;

/** Declared order: sampling (ripple, chromatic) before colour/alpha (custom, dissolve). */
function chain(lab: Lab, seconds: number, reduced: boolean): EffectDescriptor[] {
  const time = { seconds, playing: lab.playing && !reduced };
  const operations: EffectDescriptor[] = [];
  if (lab.ripple) operations.push({ kind: "ripple", parameters: { amplitude: lab.amplitude }, time: { ...time }, ...policy });
  if (lab.chromatic) operations.push({ kind: "chromatic", parameters: { displacement: lab.displacement }, time: { ...time }, ...policy });
  // Keep the custom definition resident (identity strength) whenever the chain has room.
  if (lab.aurora || operations.length + Number(lab.dissolve) < MAX_OPERATIONS) {
    operations.push({ kind: "custom", definition: aurora, time: { ...time }, ...policy, parameters: lab.aurora
      ? { strength: lab.strength, speed: 1, scanlines: lab.scanlines, glow: lab.glow } : { strength: 0, speed: 1, scanlines: 0, glow: 0 } });
  }
  if (lab.dissolve) operations.push({ kind: "dissolve", parameters: { amount: lab.amount, speed: 1 }, time: { ...time }, ...policy });
  return operations;
}
function summary(lab: Lab) {
  const parts = [lab.ripple && `ripple ${lab.amplitude}px`, lab.chromatic && `chromatic ${lab.displacement}px`,
    lab.aurora && `aurora ${Math.round(lab.strength * 100)}%`, lab.dissolve && `dissolve ${Math.round(lab.amount * 100)}%`].filter(Boolean);
  return parts.length ? parts.join("  →  ") : "No effect: original artwork";
}

export function ShaderLab() {
  const scene = useScene();
  const reduced = useReducedMotion();
  const [lab, setLab] = useState<Lab>(clean);
  const [caption, setCaption] = useState("Aurora over a quiet city");
  const [saved, setSaved] = useState("Aurora over a quiet city");
  const [seed, setSeed] = useState(7);
  const [feedback, setFeedback] = useState("Choose a preset or build a chain of up to three operations.");
  const latest = useRef(lab);
  const epoch = useRef(performance.now());
  latest.current = lab;
  useSceneArt(() => ({ layout: { x: 378, y: 24, width: 642, height: 500, overflow: "hidden" },
    appearance: { background: "rgb(16,18,48)", radius: 24 }, content: <Artwork seed={seed} /> }), [seed]);
  // Leaving the lab returns the shared art layer to its resident identity chain.
  useEffect(() => () => { scene.setChain(residentChain()); }, [scene]);

  function update(change: Partial<Lab>, message?: string) {
    const next = { ...latest.current, ...change };
    const seconds = ((performance.now() - epoch.current) / 1000) % 1000;
    const result = scene.setChain(chain(next, seconds, reduced));
    if (!result.ok) { setFeedback(`Effect unavailable: ${result.error}`); return; }
    setLab(next);
    const text = message ?? summary(next);
    setFeedback(scene.mode() !== "gpu" ? `${text} Ordinary DOM shows the static original artwork; enable experimental GPU to see the shader.`
      : result.customDropped && next.aurora ? `${text} Aurora needs a fresh GPU admission: use ordinary DOM, then enable GPU again.` : text);
  }
  const active = [lab.ripple, lab.chromatic, lab.aurora, lab.dissolve].filter(Boolean).length;
  const toggle = (key: Key) => ({
    checked: lab[key], disabled: !lab[key] && active >= MAX_OPERATIONS,
    onChange: () => update({ [key]: !lab[key] }),
  });
  // Dragging a slider switches its operation on, unless the chain is already full.
  const enable = (key: Key) => ({ [key]: lab[key] || active < MAX_OPERATIONS });
  return <>
    <Panel tone="dark" label="STUDIO 03" title="Shader lab">
      <form className="inline-form" onSubmit={event => { event.preventDefault(); setSaved(caption); setFeedback("Caption saved on the original React tree."); }}>
        <label htmlFor="studio-title">Artwork caption</label>
        <span className="inline-row">
          <input id="studio-title" maxLength={32} value={caption} onChange={event => setCaption(event.target.value)} autoComplete="off" />
          <button type="submit">Save caption</button>
        </span>
      </form>
      <div className="preset-grid" role="group" aria-label="Effect presets">
        <button type="button" className="wide" onClick={() => update({ ...clean, chromatic: true, displacement: 8 }, "Chromatic effect applied to the decorative artwork.")}>Apply chromatic effect</button>
        {Object.entries(presets).map(([name, preset]) => <button key={name} type="button" onClick={() => update({ ...clean, ...preset }, `${name} preset: ${summary({ ...clean, ...preset })}.`)}>{name}</button>)}
      </div>
      <fieldset className="chain">
        <legend>Chain <span className="count">{active}/{MAX_OPERATIONS} operations</span></legend>
        <EffectRow label="Ripple" unit="px" toggle={toggle("ripple")} value={lab.amplitude} min={0} max={12} step={1}
          onValue={value => update({ amplitude: value, ...enable("ripple") })} />
        <EffectRow label="Chromatic" unit="px" toggle={toggle("chromatic")} value={lab.displacement} min={0} max={12} step={1}
          onValue={value => update({ displacement: value, ...enable("chromatic") })} />
        <EffectRow label="Aurora" unit="%" toggle={toggle("aurora")} value={lab.strength} min={0} max={1} step={.05} percent
          onValue={value => update({ strength: value, ...enable("aurora") })} />
        <EffectRow label="Dissolve" unit="%" toggle={toggle("dissolve")} value={lab.amount} min={0} max={.9} step={.05} percent
          onValue={value => update({ amount: value, ...enable("dissolve") })} />
        <label className="check clock"><input type="checkbox" checked={lab.playing && !reduced} disabled={reduced}
          onChange={() => update({ playing: !lab.playing }, lab.playing ? "Shader clock paused." : "Shader clock running.")} />Animate shader time</label>
      </fieldset>
      <div className="button-grid two">
        <button type="button" onClick={() => { setSeed(value => value + 1); setFeedback("New artwork rendered by React; the chain keeps running on the fresh capture."); }}>New artwork</button>
        <button type="button" onClick={() => update({ ...clean }, "Effects cleared. Aurora stays attached at zero strength, an exact identity.")}>Clear effect</button>
      </div>
      <output id="studio-feedback" role="status">{feedback}</output>
      <p className="panel-note">{reduced ? "Reduced motion is on: effects render as still frames and the clock stays paused."
        : "Aurora is a custom WGSL colour function made with defineEffect."}</p>
    </Panel>
    <Surface id="showcase-card" className="placard" aria-label="Artwork placard"
      layout={{ x: 378, y: 540, width: 642, height: 136, padding: 22, direction: "column", gap: 6, overflow: "hidden" }}
      appearance={{ background: "rgb(245,243,255)", color: "rgb(24,22,48)", radius: 24, fontSize: 14 }}>
      <span className="placard-kicker">NOW SHOWING · No. {String(seed).padStart(2, "0")}</span>
      <strong id="saved-title" className="placard-title">{saved}</strong>
      <span className="placard-chain">{summary(lab)}</span>
    </Surface>
  </>;
}

function EffectRow({ label, unit, toggle, value, min, max, step, percent, onValue }: {
  label: string; unit: string; value: number; min: number; max: number; step: number; percent?: boolean;
  toggle: { checked: boolean; disabled: boolean; onChange(): void }; onValue(value: number): void;
}) {
  const shown = percent ? Math.round(value * 100) : value;
  return <div className={`effect-row ${toggle.checked ? "on" : ""}`}>
    <label className="check"><input type="checkbox" {...toggle} />{label}</label>
    <input type="range" aria-label={`${label} amount`} aria-valuetext={`${shown}${unit}`} min={min} max={max} step={step} value={value}
      onChange={event => onValue(Number(event.target.value))} />
    <span className="count" aria-hidden="true">{shown}{unit}</span>
  </div>;
}

/** Deterministic generative artwork: a city skyline under rings, stars and a large moon. */
function Artwork({ seed }: { seed: number }) {
  const random = mulberry(seed);
  const hue = [252, 284, 214, 318, 196, 236, 268][seed % 7]! + Math.floor(random() * 12);
  const stars = Array.from({ length: 70 }, () => ({ x: random() * 642, y: random() * 300, r: random() * 1.8 + .4, o: random() * .6 + .3 }));
  const towers = Array.from({ length: 16 }, (_, index) => ({ x: index * 41 - 6 + random() * 10, w: 30 + random() * 18, h: 70 + random() * 170 }));
  const moon = { x: 120 + random() * 400, y: 110 + random() * 60 };
  return <svg width="642" height="500" viewBox="0 0 642 500" aria-hidden="true">
    <defs>
      <linearGradient id="lab-sky" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0" stopColor={`hsl(${hue} 70% 14%)`} /><stop offset=".55" stopColor={`hsl(${(hue + 40) % 360} 65% 32%)`} />
        <stop offset="1" stopColor={`hsl(${(hue + 80) % 360} 80% 62%)`} />
      </linearGradient>
      <radialGradient id="lab-moon"><stop offset="0" stopColor="#fffbe8" /><stop offset=".7" stopColor="#ffe1a8" /><stop offset="1" stopColor="#ffb98a" /></radialGradient>
    </defs>
    <rect width="642" height="500" fill="url(#lab-sky)" />
    {stars.map((star, index) => <circle key={index} cx={star.x} cy={star.y} r={star.r} fill="#fff" opacity={star.o} />)}
    {[150, 116, 84].map((radius, index) => <circle key={radius} cx={moon.x} cy={moon.y} r={radius} fill="none"
      stroke={`hsl(${(hue + 160 + index * 30) % 360} 90% 70%)`} strokeWidth={index === 1 ? 2 : 1} opacity={.35 - index * .06} />)}
    <circle cx={moon.x} cy={moon.y} r="62" fill="url(#lab-moon)" />
    <circle cx={moon.x - 18} cy={moon.y - 10} r="9" fill="#f3cf96" opacity=".6" /><circle cx={moon.x + 20} cy={moon.y + 16} r="6" fill="#f3cf96" opacity=".5" />
    <path d={`M0 330 Q160 ${270 + random() * 30} 320 320 T642 300 V500 H0Z`} fill={`hsl(${(hue + 200) % 360} 45% 22%)`} opacity=".8" />
    {towers.map((tower, index) => <g key={index}>
      <rect x={tower.x} y={500 - tower.h} width={tower.w} height={tower.h} fill={`hsl(${(hue + 230) % 360} 40% ${10 + (index % 3) * 4}%)`} />
      {Array.from({ length: Math.floor(tower.h / 22) }, (_, row) => Array.from({ length: Math.floor(tower.w / 12) }, (_, column) =>
        (row * 7 + column * 3 + index) % 4 === 0 && <rect key={`${row}-${column}`} x={tower.x + 5 + column * 12} y={500 - tower.h + 10 + row * 22}
          width="5" height="8" fill={`hsl(${(hue + 40) % 360} 100% 75%)`} opacity=".85" />))}
    </g>)}
    <rect y="470" width="642" height="30" fill={`hsl(${(hue + 230) % 360} 45% 7%)`} />
  </svg>;
}
function mulberry(seed: number) {
  let state = seed * 0x9e3779b1;
  return () => {
    state |= 0; state = state + 0x6d2b79f5 | 0;
    let t = Math.imul(state ^ state >>> 15, 1 | state);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
