import { useEffect, useRef, useState } from "react";
import { Surface, useGPUHost, type TransitionHandle } from "canvas-spa-phase-one";
import { Panel, describe, useReducedMotion } from "./shared";
import { useSceneArt } from "./scene";
import { at, fromTransform, keepInside, path, type Pose, type Rect } from "./pose";

const SIZE = { width: 320, height: 280 };
/** DOM order is paint order: "your" card (showcase-card) is last, so it rides on top. */
const cards = [
  { id: "deck-sky", title: "Morning sky", note: "Layer 1 of 4", art: "sky", rect: { x: 712, y: 36, ...SIZE } },
  { id: "deck-sea", title: "Open water", note: "Layer 2 of 4", art: "sea", rect: { x: 378, y: 340, ...SIZE } },
  { id: "deck-fern", title: "Fern hollow", note: "Layer 3 of 4", art: "fern", rect: { x: 712, y: 340, ...SIZE } },
  { id: "showcase-card", title: "", note: "Your card", art: "ember", rect: { x: 378, y: 36, ...SIZE } },
] as const;
type CardId = typeof cards[number]["id"];
const slots = cards.map(card => card.rect);
const centre = (rect: Rect) => ({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 });
const deckCentre = { x: 705, y: 350 };

type Arrangement = "deal" | "stack" | "fan" | "shuffle" | "spin";

export function CardDeck() {
  const controller = useGPUHost();
  const reduced = useReducedMotion();
  const [title, setTitle] = useState("Your card, in motion");
  const [saved, setSaved] = useState("Your card, in motion");
  const [likes, setLikes] = useState<Record<CardId, number>>({ "deck-sky": 2, "deck-sea": 5, "deck-fern": 1, "showcase-card": 0 });
  const [stagger, setStagger] = useState(90);
  const [runs, setRuns] = useState(0);
  const [feedback, setFeedback] = useState("Pick an arrangement. Try liking a card while it flies.");
  const handles = useRef<TransitionHandle[]>([]);
  const slot = useRef<Record<CardId, number>>({ "deck-sky": 0, "deck-sea": 1, "deck-fern": 2, "showcase-card": 3 });
  const generation = useRef(0);
  useEffect(() => () => { generation.current++; for (const handle of handles.current) handle.cancel(); handles.current = []; }, []);

  useSceneArt(() => ({ layout: { x: 362, y: 20, width: 664, height: 660, overflow: "hidden" },
    appearance: { background: "rgb(22,84,88)", radius: 40 },
    content: <div className="mat"><div className="felt-rings" /><span className="mat-label">THE TABLE</span></div> }), []);
  function current(id: CardId): Pose {
    const layer = controller.state().layers.find(entry => entry.id === id);
    return fromTransform(layer?.transform);
  }
  function slotPose(id: CardId, rect: Rect): Pose {
    const target = centre(slots[slot.current[id]]!);
    return at(rect, target.x, target.y);
  }
  function arrange(kind: Arrangement) {
    const version = ++generation.current;
    try {
      if (kind === "shuffle") {
        const order = [0, 1, 2, 3];
        do order.sort(() => Math.random() - .5); while (order.every((value, index) => value === index));
        cards.forEach((card, index) => { slot.current[card.id] = order[index]!; });
      }
      const items = cards.map((card, index) => {
        const from = current(card.id);
        const home = slotPose(card.id, card.rect);
        let waypoints: { at: number; pose: Pose }[];
        if (kind === "deal") waypoints = [{ at: 0, pose: from }, { at: 1, pose: home }];
        else if (kind === "stack") {
          const jitter = [[-14, 10, -7], [10, -6, 5], [-4, -12, -2], [6, 4, 3]][index]!;
          waypoints = [{ at: 0, pose: from }, { at: 1, pose: at(card.rect, deckCentre.x + jitter[0]!, deckCentre.y + jitter[1]!, jitter[2]!, .92) }];
        } else if (kind === "fan") {
          const angle = [-24, -8, 8, 24][index]!, radius = 440, pivot = { x: 694, y: 820 };
          const x = pivot.x + radius * Math.sin(angle * Math.PI / 180), y = pivot.y - radius * Math.cos(angle * Math.PI / 180);
          waypoints = [{ at: 0, pose: from }, { at: 1, pose: at(card.rect, x, y, angle, .72) }];
        } else if (kind === "shuffle") {
          const turn = index % 2 ? -180 : 180;
          waypoints = [{ at: 0, pose: from }, { at: .2, pose: { ...from, scale: from.scale * 1.05, dy: from.dy - 12 } },
            { at: .55, pose: at(card.rect, deckCentre.x + (index - 1.5) * 26, deckCentre.y, from.rotation + turn, .58) },
            { at: 1, pose: { ...home, rotation: Math.round((from.rotation + turn * 2) / 360) * 360 } }];
        } else {
          waypoints = [{ at: 0, pose: from }, { at: .5, pose: { ...from, rotation: from.rotation + 180, scale: from.scale * .78 } },
            { at: 1, pose: { ...from, rotation: from.rotation + 360 } }];
        }
        return { id: card.id, motion: path(card.rect, waypoints, kind === "shuffle" ? 1500 : kind === "spin" ? 1300 : 900, kind === "deal" || kind === "stack" || kind === "fan" ? 12 : 31) };
      });
      const started = controller.transitionGroup(items, stagger);
      handles.current = started;
      setRuns(value => value + started.length);
      const label = { deal: "Dealt to the grid", stack: "Stacked", fan: "Fanned", shuffle: "Shuffled", spin: "Spun" }[kind];
      setFeedback(reduced ? `${label}. Reduced motion is on, so the cards went straight to their places.`
        : `${label}: one transition group, ${stagger} ms stagger, pivoted around each card's centre.`);
      void Promise.all(started.map(handle => handle.finished)).then(results => {
        if (version !== generation.current) return;
        const completed = results.filter(result => result.status === "completed").length;
        setFeedback(`${label}. ${completed} of ${results.length} transitions completed; every like button is still the original.`);
      });
    } catch (error) { setFeedback(`Motion unavailable: ${describe(error)}`); console.error(error); }
  }
  function journey() {
    const version = ++generation.current;
    const card = cards[3];
    const mode = controller.state().mode === "gpu" ? "on the GPU" : "in ordinary DOM";
    try {
      const from = current(card.id);
      const lifted = keepInside(card.rect, { ...from, scale: from.scale * 1.06, dy: from.dy - 14 });
      const motion = path(card.rect, [
        { at: 0, pose: from }, { at: .18, pose: lifted },
        { at: .5, pose: at(card.rect, deckCentre.x, deckCentre.y, from.rotation + 180, .62) },
        { at: .82, pose: { ...from, rotation: from.rotation + 330, scale: from.scale * .94 } },
        { at: 1, pose: { ...from, rotation: from.rotation + 360 } },
      ], 2600, 31);
      const handle = controller.transition(card.id, motion);
      handles.current = [...handles.current, handle];
      setRuns(value => value + 1);
      setFeedback(reduced ? "Reduced motion is on: the journey completes instantly at its end point."
        : `A typed layer journey ${mode}. Your controls are still the originals.`);
      void handle.finished.then(result => {
        if (version === generation.current) setFeedback(`Layer journey ${result.status}: ${result.reason}.`);
      });
    } catch (error) { setFeedback(`Motion unavailable: ${describe(error)}`); console.error(error); }
  }
  return <>
    <Panel label="STUDIO 02" title="Card deck">
      <form className="inline-form" onSubmit={event => { event.preventDefault(); setSaved(title); setFeedback("Saved on the original React tree; your card updated in place."); }}>
        <label htmlFor="studio-title">Your card title</label>
        <span className="inline-row">
          <input id="studio-title" maxLength={32} value={title} onChange={event => setTitle(event.target.value)} autoComplete="off" />
          <button type="submit">Save postcard</button>
        </span>
      </form>
      <div className="button-grid" role="group" aria-label="Arrange the deck">
        <button type="button" onClick={() => arrange("deal")}>Deal</button>
        <button type="button" onClick={() => arrange("stack")}>Stack</button>
        <button type="button" onClick={() => arrange("fan")}>Fan</button>
        <button type="button" onClick={() => arrange("shuffle")}>Shuffle</button>
        <button type="button" onClick={() => arrange("spin")}>Spin</button>
        <button type="button" className="primary" onClick={journey}>Play layer journey</button>
      </div>
      <label className="range">
        <span className="field-row"><span>Stagger</span><span className="count">{stagger} ms</span></span>
        <input type="range" min={0} max={240} step={10} value={stagger} onChange={event => setStagger(Number(event.target.value))} />
      </label>
      <output id="studio-feedback" role="status">{feedback}</output>
      <dl className="stats">
        <div><dt>Transitions started</dt><dd>{runs}</dd></div>
        <div><dt>Likes, all native</dt><dd>{Object.values(likes).reduce((sum, value) => sum + value, 0)}</dd></div>
      </dl>
      <p className="panel-note">{reduced ? "Your system asks for reduced motion, so arrangements apply instantly."
        : "React only re-renders when you type, like or save. The same typed motion runs in ordinary DOM and on the GPU."}</p>
    </Panel>
    {cards.map(card => <Surface key={card.id} id={card.id} origin="center" className={`deck-card deck-${card.art}`} aria-label={card.id === "showcase-card" ? "Your card" : card.title}
      layout={{ x: card.rect.x, y: card.rect.y, width: card.rect.width, height: card.rect.height, direction: "column" }}
      appearance={{ background: "rgb(255,253,248)", color: "rgb(28,30,44)", radius: 22, fontSize: 14 }}>
      <div className="deck-art-frame"><CardArt kind={card.art} /></div>
      <div className="deck-body">
        <span className="deck-note">{card.note}</span>
        {card.id === "showcase-card" ? <strong id="saved-title" className="deck-title">{saved}</strong> : <strong className="deck-title">{card.title}</strong>}
        <span className="deck-actions">
          <button type="button" className={likes[card.id] ? "like liked" : "like"} aria-pressed={likes[card.id] > 0}
            onClick={() => setLikes(value => ({ ...value, [card.id]: value[card.id] + 1 }))}>
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.8 4.5c2.2 0 3.6 1.2 5.2 3 1.6-1.8 3-3 5.2-3 3.8 0 5.9 3.9 4.4 7.3C19.5 16.4 12 21 12 21Z" fill="currentColor" /></svg>
            Like · {likes[card.id]}
          </button>
        </span>
      </div>
    </Surface>)}
  </>;
}

function CardArt({ kind }: { kind: typeof cards[number]["art"] }) {
  return <svg className="deck-art" width="320" height="150" viewBox="0 0 320 150" aria-hidden="true">
    {kind === "sky" && <><rect width="320" height="150" fill="#8ec5ff" /><circle cx="236" cy="62" r="30" fill="#fff4c2" />
      <path d="M40 92c10-18 34-20 44-6 14-10 36-2 36 14H34c-6 0-2-8 6-8Z" fill="#fff" opacity=".95" />
      <path d="M150 58c8-12 26-14 34-4 10-6 26 0 26 10h-64c-4 0-2-6 4-6Z" fill="#fff" opacity=".8" />
      <path d="M0 150V120c60-20 120 10 180-4s100-20 140-8v42Z" fill="#5d8fe8" /></>}
    {kind === "sea" && <><rect width="320" height="150" fill="#0f5b8f" /><circle cx="70" cy="48" r="22" fill="#ffd68a" />
      {Array.from({ length: 5 }, (_, index) => <path key={index} d={`M0 ${70 + index * 18}q20-12 40 0t40 0 40 0 40 0 40 0 40 0 40 0 40 0`}
        fill="none" stroke={index % 2 ? "#5fc7e6" : "#a6ecff"} strokeWidth="5" strokeLinecap="round" opacity={1 - index * .12} />)}</>}
    {kind === "fern" && <><rect width="320" height="150" fill="#cfe9b8" />
      {Array.from({ length: 9 }, (_, index) => <ellipse key={index} cx={40 + index * 30} cy={150} rx={22} ry={60 + (index % 3) * 26}
        fill={["#2f7a3f", "#4f9c48", "#86bf5a"][index % 3]} transform={`rotate(${(index - 4) * 7} ${40 + index * 30} 150)`} />)}
      <circle cx="262" cy="40" r="16" fill="#fff7d1" /></>}
    {kind === "ember" && <><defs><linearGradient id="deck-ember" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stopColor="#ff7a59" /><stop offset="1" stopColor="#ffcf6b" /></linearGradient></defs>
      <rect width="320" height="150" fill="url(#deck-ember)" />
      <circle cx="250" cy="150" r="96" fill="#fff1c9" opacity=".55" /><circle cx="250" cy="150" r="62" fill="#fff8e6" />
      <path d="M0 150 70 80l40 34 52-58 66 94Z" fill="#7a2343" opacity=".85" /></>}
  </svg>;
}

