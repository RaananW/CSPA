import { useState } from "react";
import { Surface } from "canvas-spa-phase-one";
import { Panel } from "./shared";
import { useSceneArt } from "./scene";

export const palettes = {
  sunset: { name: "Sunset", card: "rgb(255,222,201)", ink: "rgb(66,25,40)", accent: "rgb(229,86,72)",
    sky: ["#ff9a7a", "#ffd39b"], sun: "#fff3c4", hills: ["#e5604f", "#b8395a", "#6e2350"] },
  lagoon: { name: "Lagoon", card: "rgb(206,240,240)", ink: "rgb(10,48,66)", accent: "rgb(0,128,150)",
    sky: ["#47c6d6", "#c9f4ee"], sun: "#fffbe0", hills: ["#2aa3b8", "#137a99", "#0b4a6e"] },
  meadow: { name: "Meadow", card: "rgb(233,244,206)", ink: "rgb(30,56,24)", accent: "rgb(86,140,46)",
    sky: ["#a8dcf0", "#f4f9d8"], sun: "#ffe680", hills: ["#9ccc5a", "#5f9f3e", "#2f6b32"] },
  midnight: { name: "Midnight", card: "rgb(40,38,84)", ink: "rgb(242,236,255)", accent: "rgb(255,196,92)",
    sky: ["#1b1846", "#5a3f8f"], sun: "#ffe7a3", hills: ["#3c3378", "#2a2459", "#16133a"] },
} as const;
export type PaletteId = keyof typeof palettes;

const stamps = { sun: "Sun", wave: "Wave", leaf: "Leaf", star: "Star" } as const;
type StampId = keyof typeof stamps;

function stampShapes(kind: StampId, color: string) {
  switch (kind) {
    case "sun": return <><circle cx="20" cy="20" r="8" fill={color} />{Array.from({ length: 8 }, (_, index) =>
      <rect key={index} x="18.8" y="3" width="2.4" height="7" rx="1.2" fill={color} transform={`rotate(${index * 45} 20 20)`} />)}</>;
    case "wave": return <path d="M4 25c5-7 9-7 13 0s9 7 13 0M4 15c5-7 9-7 13 0s9 7 13 0" fill="none" stroke={color} strokeWidth="3.4" strokeLinecap="round" />;
    case "leaf": return <><path d="M7 33C7 15 19 6 34 6c0 16-9 27-27 27Z" fill={color} /><path d="M10 30 26 14" stroke="#fff" strokeWidth="2" strokeLinecap="round" opacity=".6" /></>;
    case "star": return <path d="m20 4 4.7 10.1 11 1.3-8.1 7.6 2.1 10.9L20 28.4l-9.7 5.5 2.1-10.9-8.1-7.6 11-1.3Z" fill={color} />;
  }
}
export function StampIcon({ kind, color }: { kind: StampId; color: string }) {
  return <svg viewBox="0 0 40 40" width="100%" height="100%" aria-hidden="true">{stampShapes(kind, color)}</svg>;
}

interface Sent { serial: number; title: string; message: string; palette: PaletteId; stamp: StampId }

export function PostcardStudio() {
  const [title, setTitle] = useState("Greetings from the GPU");
  const [message, setMessage] = useState("The inputs on the left are real. So is this text.");
  const [palette, setPalette] = useState<PaletteId>("sunset");
  const [stamp, setStamp] = useState<StampId>("sun");
  const [sent, setSent] = useState<Sent[]>([]);
  const [feedback, setFeedback] = useState("Type, choose a palette and a stamp. The card follows every keystroke.");
  const colors = palettes[palette];
  const serial = sent.length + 1;
  useSceneArt(() => ({ layout: { x: 378, y: 330, width: 350, height: 346, overflow: "hidden" },
    appearance: { background: palettes[palette].sky[0], radius: 22 }, content: <Landscape palette={palette} stamp={stamp} /> }), [palette, stamp]);
  function post() {
    setSent(list => [{ serial, title, message, palette, stamp }, ...list].slice(0, 4));
    setFeedback(`Postcard No. ${String(serial).padStart(3, "0")} saved on the original React tree.`);
  }
  function reuse(card: Sent) {
    setTitle(card.title); setMessage(card.message); setPalette(card.palette); setStamp(card.stamp);
    setFeedback(`Loaded postcard No. ${String(card.serial).padStart(3, "0")} back into the native form.`);
  }
  return <>
    <Panel label="STUDIO 01" title="Postcard studio">
      <form className="stack" onSubmit={event => { event.preventDefault(); post(); }}>
        <div className="field">
          <span className="field-row"><label htmlFor="studio-title">Postcard title</label>
            <span className="count" aria-hidden="true">{title.length}/32</span></span>
          <input id="studio-title" maxLength={32} value={title} onChange={event => setTitle(event.target.value)} autoComplete="off" />
        </div>
        <div className="field">
          <span className="field-row"><label htmlFor="studio-message">Message</label>
            <span className="count" aria-hidden="true">{message.length}/90</span></span>
          <textarea id="studio-message" rows={3} maxLength={90} value={message} onChange={event => setMessage(event.target.value)} />
        </div>
        <fieldset className="swatches">
          <legend>Palette</legend>
          {(Object.keys(palettes) as PaletteId[]).map(id => <label key={id} className="swatch">
            <input type="radio" name="palette" value={id} checked={palette === id} onChange={() => setPalette(id)} />
            {palettes[id].name}
          </label>)}
        </fieldset>
        <fieldset className="stamps">
          <legend>Stamp</legend>
          {(Object.keys(stamps) as StampId[]).map(id => <label key={id} className="stamp-choice">
            <input type="radio" name="stamp" value={id} checked={stamp === id} onChange={() => setStamp(id)} />
            <span className="stamp-icon"><StampIcon kind={id} color="currentColor" /></span>{stamps[id]}
          </label>)}
        </fieldset>
        <button type="submit" className="primary">Save postcard</button>
      </form>
      <output id="studio-feedback" role="status">{feedback}</output>
    </Panel>
    <Surface id="showcase-card" className="postcard" aria-label="Postcard preview"
      layout={{ x: 378, y: 36, width: 350, height: 270, padding: 26, direction: "column", gap: 10, overflow: "hidden" }}
      appearance={{ background: colors.card, color: colors.ink, radius: 22, fontSize: 15 }}>
      <span className="postcard-kicker" style={{ color: colors.accent }}>A NOTE FROM YOUR STUDIO</span>
      <span className="postcard-stamp" style={{ borderColor: colors.accent }}><StampIcon kind={stamp} color={colors.accent} /></span>
      <span className="postmark" style={{ borderColor: colors.ink, color: colors.ink }} aria-hidden="true">CANVAS<br />SPA</span>
      <strong id="saved-title" className={`postcard-title ${title.length > 20 ? "long" : ""}`}>{title || "Untitled"}</strong>
      <p className="postcard-message">{message}</p>
      <span className="postcard-foot"><span>No. {String(serial).padStart(3, "0")}</span><span>React · CanvasSPA</span></span>
    </Surface>
    <Surface id="showcase-outbox" className="outbox" aria-label="Outbox"
      layout={{ x: 750, y: 36, width: 270, height: 640, padding: 20, direction: "column", gap: 12, overflow: "hidden" }}
      appearance={{ background: "rgb(255,250,244)", color: "rgb(52,32,40)", radius: 22, fontSize: 14, borderColor: "rgb(240,214,196)", borderWidth: 1 }}>
      <span className="outbox-head"><strong>Outbox</strong><span>{sent.length} saved</span></span>
      {sent.length === 0 && <p className="outbox-empty">Saved postcards land here. Reuse one to load it back into the form.</p>}
      <ul className="outbox-list">
        {sent.map(card => <li key={card.serial} className="outbox-item">
          <span className="outbox-thumb" style={{ background: palettes[card.palette].card, color: palettes[card.palette].accent }}>
            <StampIcon kind={card.stamp} color="currentColor" /></span>
          <span className="outbox-text"><strong>{card.title || "Untitled"}</strong><small>No. {String(card.serial).padStart(3, "0")} · {palettes[card.palette].name}</small></span>
          <button type="button" onClick={() => reuse(card)} aria-label={`Reuse postcard ${card.serial}`}>Reuse</button>
        </li>)}
      </ul>
      <dl className="layer-map">
        <dt>Layers in this scene</dt>
        <dd><b className="tone-deco" />showcase-backdrop<small>decorative</small></dd>
        <dd><b className="tone-native" />showcase-controls<small>native form</small></dd>
        <dd><b className="tone-native" />showcase-card<small>native text</small></dd>
        <dd><b className="tone-deco" />showcase-art<small>decorative</small></dd>
        <dd><b className="tone-native" />showcase-outbox<small>native list</small></dd>
      </dl>
    </Surface>
  </>;
}

function Landscape({ palette, stamp }: { palette: PaletteId; stamp: StampId }) {
  const colors = palettes[palette];
  return <svg width="350" height="346" viewBox="0 0 350 346" aria-hidden="true">
    <defs>
      <linearGradient id="postcard-sky" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0" stopColor={colors.sky[0]} /><stop offset="1" stopColor={colors.sky[1]} />
      </linearGradient>
    </defs>
    <rect width="350" height="346" fill="url(#postcard-sky)" />
    {palette === "midnight" && Array.from({ length: 26 }, (_, index) =>
      <circle key={index} cx={(index * 97) % 350} cy={(index * 53) % 170} r={index % 3 ? 1.2 : 2} fill="#fff" opacity=".8" />)}
    <circle cx="246" cy="112" r="58" fill={colors.sun} opacity=".35" />
    <circle cx="246" cy="112" r="40" fill={colors.sun} />
    <path d="M0 218C60 170 112 176 170 206s120 10 180-40V346H0Z" fill={colors.hills[0]} />
    <path d="M0 262c70-46 120-30 176-2s118 22 174-18V346H0Z" fill={colors.hills[1]} />
    <path d="M0 300c80-30 150-20 210 0s100 10 140-6V346H0Z" fill={colors.hills[2]} />
    <g fill="none" stroke={colors.hills[2]} strokeWidth="3" strokeLinecap="round" opacity=".7">
      <path d="M62 92q8-8 16 0q8-8 16 0" /><path d="M110 70q6-6 12 0q6-6 12 0" />
    </g>
    <g fill="#fff" opacity=".9">
      <path d="M40 150c4-14 22-18 32-8 8-12 30-10 34 6 10-2 18 4 18 12H34c-6 0-4-10 6-10Z" />
      <path d="M150 70c3-9 15-11 21-5 6-8 20-6 22 4 7-1 12 3 12 8h-60c-4 0-2-7 5-7Z" opacity=".7" />
    </g>
    <text x="24" y="44" fill="#fff" style={{ font: "italic 700 25px var(--serif)" }} opacity=".95">Wish you were here</text>
    <svg x="300" y="20" width="28" height="28" viewBox="0 0 40 40" opacity=".9">{stampShapes(stamp, "#fff")}</svg>
  </svg>;
}
