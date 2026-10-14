import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { Surface, useGPUHost, useNativeOverlayHost, type SurfaceProps } from "@underglass/react";
import {
  Avatar, AvatarGroup, AvatarGroupItem, Badge, Button, Caption1, Card, Dialog, DialogActions, DialogBody, DialogContent,
  DialogSurface, DialogTitle, DialogTrigger, Divider, Dropdown, Field, FluentProvider, Input, Link, Menu, MenuDivider, MenuItem,
  MenuList, MenuPopover, MenuTrigger, Option, PortalMountNodeProvider, ProgressBar, Radio, RadioGroup, Slider, Switch, Text,
  Textarea, Title3, Tooltip, webDarkTheme, webLightTheme, type Theme,
} from "@fluentui/react-components";
import { Add20Regular, ArrowSortDown20Regular, Dismiss20Regular, MoreHorizontal20Regular, ReOrderDotsVertical20Regular, Rocket20Regular } from "@fluentui/react-icons";
import { at, toTransform, type Pose, type Rect } from "./pose";
import { usePulse, useSceneArt } from "./scene";
import { useReducedMotion } from "./shared";
import { Springs, type SpringFeel } from "./spring";
import { ease, transition } from "./transition";

const LANES = [{ id: "backlog", label: "Backlog" }, { id: "doing", label: "In progress" }, { id: "shipped", label: "Shipped" }] as const;
type Lane = typeof LANES[number]["id"];
type Priority = 1 | 2 | 3;
interface Item {
  id: string; title: string; notes: string; lane: Lane; priority: Priority; owner: string; progress: number; z: number;
  fresh?: boolean; leaving?: boolean;
}

const CAPACITY = 5;
const POSTER = { x: 336, y: 24, width: 684, height: 150 };
const BOARD = { x: 336, y: 186, width: 684, height: 490 };
/** Every card is laid out once at the first slot; springs place it anywhere else with its transform. */
const CARD: Rect = { x: 344, y: 236, width: 212, height: 80 };
const EDITOR: Rect = { x: 470, y: 196, width: 430, height: 470 };
const LANE_PITCH = 228, ROW_PITCH = 86;
const slot = (lane: number, row: number): Pose => ({ dx: lane * LANE_PITCH, dy: row * ROW_PITCH, rotation: 0, scale: 1, opacity: 1 });
const laneIndex = (lane: Lane) => LANES.findIndex(entry => entry.id === lane);
/** New cards spring out of the panel's Add button. */
const ENTRY = at(CARD, 172, 300, 0, .55, 0);
/** Released cards fly into the poster. */
const RELEASE = at(CARD, POSTER.x + POSTER.width / 2, POSTER.y + POSTER.height / 2, 0, .5, 0);
const priorities = { 1: { label: "P1", color: "danger" }, 2: { label: "P2", color: "warning" }, 3: { label: "P3", color: "informative" } } as const;
const people = ["Ada Lovelace", "Grace Hopper", "Alan Turing", "Katherine Johnson", "Margaret Hamilton"];
const seed: Omit<Item, "z">[] = [
  { id: "fluent-item-1", title: "Spring physics for cards", lane: "doing", priority: 1, owner: people[0]!, progress: 60, notes: "Velocity carries into the next slot." },
  { id: "fluent-item-2", title: "Fluent portals in the overlay", lane: "shipped", priority: 2, owner: people[1]!, progress: 100, notes: "PortalMountNodeProvider points at the overlay host." },
  { id: "fluent-item-3", title: "Burn transition shader", lane: "doing", priority: 2, owner: people[2]!, progress: 35, notes: "Value noise with an ember rim." },
  { id: "fluent-item-4", title: "Keyboard moves between lanes", lane: "backlog", priority: 1, owner: people[3]!, progress: 0, notes: "" },
  { id: "fluent-item-5", title: "Reduced-motion audit", lane: "backlog", priority: 3, owner: people[4]!, progress: 10, notes: "" },
  { id: "fluent-item-6", title: "Release notes", lane: "backlog", priority: 2, owner: people[1]!, progress: 0, notes: "" },
];

/** Fluent needs a provider inside every layer: a provider outside would put its own <div> around the layers. */
function FluentLayer({ theme = webLightTheme, clear, children, ...surface }: SurfaceProps & { theme?: Theme; clear?: boolean; children: ReactNode }) {
  return <Surface {...surface}><FluentProvider theme={theme} className={clear ? "fluent-fill fluent-clear" : "fluent-fill"}>{children}</FluentProvider></Surface>;
}

export function FluentBoard() {
  const controller = useGPUHost();
  const overlay = useNativeOverlayHost();
  const reduced = useReducedMotion();
  const pulse = usePulse();
  const [items, setItems] = useState<Item[]>(() => seed.map((item, index) => ({ ...item, z: index })));
  const [title, setTitle] = useState("Velocity-aware drop zones");
  const [lane, setLane] = useState<Lane>("backlog");
  const [priority, setPriority] = useState<Priority>(2);
  const [bounce, setBounce] = useState(45);
  const [response, setResponse] = useState(550);
  const [tilt, setTilt] = useState(true);
  const [target, setTarget] = useState<number>();
  const [released, setReleased] = useState(0);
  const [confirm, setConfirm] = useState(false);
  const [editing, setEditing] = useState<{ id: string; from: Pose; closing?: boolean }>();
  const [feedback, setFeedback] = useState("Open a card, archive one or throw one hard: the effects run on the live Fluent components.");
  const feel = useRef<SpringFeel>({ response: .55, bounce: .45 });
  feel.current = { response: response / 1000, bounce: bounce / 100 };
  const tilting = useRef(tilt);
  tilting.current = tilt;
  const springs = useMemo(() => new Springs(controller, () => feel.current, () => tilting.current), [controller]);
  useEffect(() => () => springs.dispose(), [springs]);
  const serial = useRef(seed.length);
  const placed = useRef(new Map<string, string>());
  const stagger = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const effects = useRef(new Set<() => void>());
  const later = (milliseconds: number, run: () => void) => { timers.current.push(setTimeout(run, milliseconds)); };
  /** A transition effect on a live layer; its content is inert only while it runs. */
  const effect = (id: string, duration: number, step: Parameters<typeof transition>[3], done?: () => void) => {
    const stop = transition(controller, id, duration, step, () => { effects.current.delete(stop); done?.(); });
    effects.current.add(stop);
  };
  /** Whether transition effects will draw; otherwise motion alone (a fade) carries the transition. */
  const visible = () => controller.state().mode === "gpu" && !reduced && !!navigator.gpu;
  useEffect(() => () => {
    for (const timer of timers.current) clearTimeout(timer);
    for (const stop of [...effects.current]) stop();
  }, []);

  const live = items.filter(item => !item.leaving);
  const rows = (id: Lane) => live.filter(item => item.lane === id);
  const shipped = rows("shipped").length;
  useSceneArt(() => ({ layout: { ...POSTER, overflow: "hidden" }, appearance: { background: "rgb(26,28,58)", radius: 22 },
    content: <Poster released={released} shipped={shipped} total={live.length + released} owners={[...new Set(live.map(item => item.owner))]} /> }),
  [released, shipped, live.length]);

  // Retarget every card whose slot changed. Springs keep their velocity, so a thrown card flows into its new slot.
  useLayoutEffect(() => {
    let order = 0;
    const delay = stagger.current;
    stagger.current = 0;
    for (const entry of LANES) rows(entry.id).forEach((item, row) => {
      const key = `${entry.id}:${row}`;
      if (placed.current.get(item.id) === key) return;
      placed.current.set(item.id, key);
      const move = () => springs.to(item.id, slot(laneIndex(entry.id), row));
      if (delay) later(order++ * delay, move); else move();
    });
  });

  const raise = (id: string) => setItems(current => {
    const top = Math.max(...current.map(item => item.z));
    return current.find(item => item.id === id)?.z === top ? current : current.map(item => item.id === id ? { ...item, z: top + 1 } : item);
  });
  const patch = (id: string, change: Partial<Item>) => setItems(current => current.map(item => item.id === id ? { ...item, ...change } : item));
  function move(id: string, to: Lane, row?: number) {
    const item = items.find(entry => entry.id === id);
    if (!item) return false;
    if (item.lane !== to && rows(to).length >= CAPACITY) {
      setFeedback(`${LANES[laneIndex(to)]!.label} is full (${CAPACITY} cards). “${item.title}” springs back.`);
      placed.current.delete(id);
      setItems(current => [...current]);
      return false;
    }
    setItems(current => {
      const rest = current.filter(entry => entry.id !== id);
      const moved = { ...item, lane: to };
      const siblings = rest.filter(entry => entry.lane === to && !entry.leaving);
      const before = siblings[Math.min(row ?? siblings.length, siblings.length)];
      const index = before ? rest.indexOf(before) : rest.length;
      return [...rest.slice(0, index), moved, ...rest.slice(index)];
    });
    placed.current.delete(id);
    return true;
  }
  function drag(id: string) {
    const pose = springs.pose(id);
    if (!pose) return;
    const next = Math.max(0, Math.min(2, Math.round(pose.dx / LANE_PITCH)));
    setTarget(value => value === next ? value : next);
  }
  function drop(id: string, velocity: { dx: number; dy: number }) {
    setTarget(undefined);
    const pose = springs.pose(id);
    const item = items.find(entry => entry.id === id);
    if (!pose || !item) return;
    // Project where the throw is heading, not just where the pointer let go.
    const ahead = .16;
    const lane = Math.max(0, Math.min(2, Math.round((pose.dx + velocity.dx * ahead) / LANE_PITCH)));
    const row = Math.max(0, Math.round((pose.dy + velocity.dy * ahead) / ROW_PITCH));
    const to = LANES[lane]!;
    const speed = Math.round(Math.hypot(velocity.dx, velocity.dy));
    if (!move(id, to.id, row)) return;
    if (speed > 650) {
      // A hard throw lands with a shockwave through the card itself.
      const strength = Math.min(1, speed / 2200);
      requestAnimationFrame(() => springs.arrived(id, () => effect(id, 560, t => ({ ripple: 10 * strength * (1 - t), chromatic: 6 * strength * (1 - ease(t)) }))));
      setFeedback(`Thrown into ${to.label} at ${speed} px/s; it lands with a shockwave through the real card.`);
    } else setFeedback(to.id === item.lane ? `“${item.title}” settled back in ${to.label}.` : `Moved to ${to.label}; throw harder for an impact.`);
  }
  function nudge(id: string, key: string) {
    const item = items.find(entry => entry.id === id);
    if (!item) return false;
    const index = laneIndex(item.lane), row = rows(item.lane).indexOf(item);
    if (key === "ArrowLeft" && index > 0) return move(id, LANES[index - 1]!.id), true;
    if (key === "ArrowRight" && index < 2) return move(id, LANES[index + 1]!.id), true;
    if (key === "ArrowUp" && row > 0) return move(id, item.lane, row - 1), true;
    if (key === "ArrowDown") return move(id, item.lane, row + 1), true;
    return false;
  }
  function add() {
    const text = title.trim();
    if (!text) { setFeedback("Give the work item a title first."); return; }
    if (rows(lane).length >= CAPACITY) { setFeedback(`${LANES[laneIndex(lane)]!.label} is full. Move or release a card first.`); return; }
    const id = `fluent-item-${++serial.current}`;
    setItems(current => [...current, { id, title: text, notes: "", lane, priority, owner: people[serial.current % people.length]!, progress: 0,
      fresh: true, z: Math.max(0, ...current.map(item => item.z)) + 1 }]);
    // Materialises out of a cyan dissolve while it springs out of the panel; its controls work once it has formed.
    requestAnimationFrame(() => effect(id, 780, t => ({ ripple: 9 * (1 - t), burn: { amount: 1 - ease(t), tint: 1 } })));
    setFeedback(reduced ? `Added “${text}”.` : `Added “${text}”: the real card materialises as it springs into ${LANES[laneIndex(lane)]!.label}.`);
  }
  function archive(id: string) {
    const item = items.find(entry => entry.id === id);
    if (!item) return;
    if (editing?.id === id) close();
    patch(id, { leaving: true });
    springs.to(id, { dy: (springs.pose(id)?.dy ?? 0) - 18, scale: .97, ...(visible() ? {} : { opacity: 0 }) });
    effect(id, 1300, t => ({ ripple: 2 * t, burn: { amount: t * 1.05 } }), () => setItems(current => current.filter(entry => entry.id !== id)));
    setFeedback(`Archived “${item.title}”: the live Fluent card burns away, then unmounts.`);
  }
  function open(id: string) {
    if (editing && !editing.closing) { setFeedback("Close the open editor first."); return; }
    const pose = springs.pose(id);
    if (!pose) return;
    // The editor starts on top of the card (same centre, card-sized) and grows into place.
    const centre = { x: CARD.x + CARD.width / 2 + pose.dx, y: CARD.y + CARD.height / 2 + pose.dy };
    setEditing({ id, from: at(EDITOR, centre.x, centre.y, 0, CARD.width / EDITOR.width, 0) });
    setFeedback("The editor materialises out of the card. Edit it: the card underneath updates live.");
  }
  function close() {
    if (!editing || editing.closing) return;
    const item = items.find(entry => entry.id === editing.id), pose = item && springs.pose(item.id);
    const back = pose ? at(EDITOR, CARD.x + CARD.width / 2 + pose.dx, CARD.y + CARD.height / 2 + pose.dy, 0, CARD.width / EDITOR.width, 0) : editing.from;
    const session = editing;
    setEditing({ ...editing, closing: true });
    springs.to(EDITOR_ID, { ...back, opacity: visible() ? .25 : 0 });
    effect(EDITOR_ID, 520, t => ({ chromatic: 6 * t, burn: { amount: ease(t) * 1.05, tint: 1 } }),
      () => setEditing(current => current?.id === session.id && current.closing ? undefined : current));
  }
  function sort() {
    stagger.current = 60;
    setItems(current => [...current].sort((a, b) => a.priority - b.priority));
    setFeedback("Sorted by priority: every card that changed slot retargets its spring, 60 ms apart.");
  }
  function ship() {
    setConfirm(false);
    const leaving = rows("shipped");
    if (!leaving.length) return;
    if (editing && leaving.some(item => item.id === editing.id)) close();
    setItems(current => current.map(item => leaving.some(entry => entry.id === item.id) ? { ...item, leaving: true } : item));
    leaving.forEach((item, index) => later(index * 120, () => {
      springs.to(item.id, { ...RELEASE, opacity: visible() ? 1 : 0 });
      effect(item.id, 900, t => ({ chromatic: 9 * Math.sin(Math.PI * Math.min(1, t * 1.3)), burn: { amount: Math.max(0, t - .45) / .55 * 1.05, tint: .6 } }), () => {
        pulse(9, 1200);
        setItems(current => current.filter(entry => entry.id !== item.id));
        setReleased(value => value + 1);
      });
    }));
    setFeedback(`Releasing ${leaving.length} card${leaving.length === 1 ? "" : "s"}: each live card warps and burns as it flies into the poster.`);
  }

  const painted = [...items].sort((a, b) => a.z - b.z);
  const edited = editing && items.find(item => item.id === editing.id);
  return <PortalMountNodeProvider value={overlay}>
    <FluentLayer id="fluent-controls" aria-label="Release board controls"
      layout={{ x: 20, y: 24, width: 300, height: 652, overflow: "hidden" }} appearance={{ radius: 22 }}>
      <div className="fl-panel">
        <header><Caption1 className="fl-eyebrow">STUDIO 07 · FLUENT UI v9</Caption1><Title3 as="h3">Release board</Title3></header>
        <form className="fl-form" onSubmit={event => { event.preventDefault(); add(); }}>
          <Field label="Work item"><Input id="fluent-title" maxLength={40} value={title} onChange={(_, data) => setTitle(data.value)} autoComplete="off" /></Field>
          <div className="fl-pair">
            <Field label="Lane">
              <Dropdown aria-label="Lane" value={LANES[laneIndex(lane)]!.label} selectedOptions={[lane]}
                onOptionSelect={(_, data) => data.optionValue && setLane(data.optionValue as Lane)}>
                {LANES.filter(entry => entry.id !== "shipped").map(entry => <Option key={entry.id} value={entry.id}>{entry.label}</Option>)}
              </Dropdown>
            </Field>
            <Field label="Priority">
              <Dropdown aria-label="Priority" value={priorities[priority].label} selectedOptions={[String(priority)]}
                onOptionSelect={(_, data) => data.optionValue && setPriority(Number(data.optionValue) as Priority)}>
                {([1, 2, 3] as const).map(value => <Option key={value} value={String(value)}>{priorities[value].label}</Option>)}
              </Dropdown>
            </Field>
          </div>
          <Button type="submit" appearance="primary" icon={<Add20Regular />}>Add item</Button>
        </form>
        <Divider>Spring</Divider>
        <Field label={`Bounce · ${bounce}%`}><Slider min={0} max={80} step={5} value={bounce} onChange={(_, data) => setBounce(data.value)} /></Field>
        <Field label={`Response · ${response} ms`}><Slider min={250} max={1000} step={50} value={response} onChange={(_, data) => setResponse(data.value)} /></Field>
        <Switch checked={tilt} onChange={(_, data) => setTilt(data.checked)} label="Tilt with velocity" />
        <div className="fl-pair">
          <Button icon={<ArrowSortDown20Regular />} onClick={sort}>Sort</Button>
          <Button appearance="primary" icon={<Rocket20Regular />} disabled={!shipped} onClick={() => setConfirm(true)}>Release…</Button>
        </div>
        <output id="studio-feedback" role="status" className="fl-feedback">{feedback}</output>
      </div>
    </FluentLayer>
    <FluentLayer id="fluent-board" clear aria-label="Release board lanes" layout={{ ...BOARD }}>
      <div className="fl-lanes">{LANES.map((entry, index) => {
        const count = rows(entry.id).length;
        return <section key={entry.id} className={target === index ? "fl-lane is-target" : "fl-lane"} aria-label={`${entry.label}, ${count} of ${CAPACITY}`}>
          <Text weight="semibold">{entry.label}</Text>
          <Badge appearance={count >= CAPACITY ? "filled" : "tint"} color={count >= CAPACITY ? "danger" : "brand"}>{count}/{CAPACITY}</Badge>
        </section>;
      })}</div>
    </FluentLayer>
    {painted.map(item => <BoardCard key={item.id} item={item} springs={springs}
      onLift={() => raise(item.id)} onDrag={() => drag(item.id)} onDrop={velocity => drop(item.id, velocity)} onOpen={() => open(item.id)}
      onKey={key => nudge(item.id, key)} onMove={to => move(item.id, to)} onArchive={() => archive(item.id)} />)}
    {editing && edited && <Editor key={editing.id} item={edited} from={editing.from} springs={springs} closing={!!editing.closing}
      onChange={change => patch(edited.id, change)} onClose={close}
      onOpened={() => effect(EDITOR_ID, 680, t => ({ ripple: 8 * (1 - t), chromatic: 5 * (1 - ease(t)), burn: { amount: 1 - ease(t), tint: 1, grain: 24 } }))} />}
    <Dialog open={confirm} onOpenChange={(_, data) => setConfirm(data.open)}>
      <DialogSurface aria-describedby="fluent-release-detail">
        <DialogBody>
          <DialogTitle>Release {shipped} shipped card{shipped === 1 ? "" : "s"}?</DialogTitle>
          <DialogContent id="fluent-release-detail">They fly into the release poster. This Fluent dialog lives in Underglass's overlay host, outside every GPU layer.</DialogContent>
          <DialogActions>
            <DialogTrigger disableButtonEnhancement><Button>Cancel</Button></DialogTrigger>
            <Button appearance="primary" onClick={ship}>Release</Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  </PortalMountNodeProvider>;
}

interface CardProps {
  item: Item; springs: Springs;
  onLift(): void; onDrag(): void; onDrop(velocity: { dx: number; dy: number }): void; onOpen(): void;
  onKey(key: string): boolean; onMove(to: Lane): void; onArchive(): void;
}
function BoardCard({ item, springs, onLift, onDrag, onDrop, onOpen, onKey, onMove, onArchive }: CardProps) {
  const lane = laneIndex(item.lane);
  // The pose is fixed at mount (new cards leave the panel, the first ones drop from the top
  // of their lane); afterwards only the springs move the layer.
  const [initial] = useState(() => item.fresh ? ENTRY : slot(lane, 0));
  useLayoutEffect(() => { springs.add(item.id, CARD, initial); return () => springs.remove(item.id); }, [springs, item.id, initial]);
  const handlers = useRef({ onDrag, onDrop });
  handlers.current = { onDrag, onDrop };
  function grab(event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.button !== 0 || item.leaving) return;
    event.preventDefault();
    const from = springs.pose(item.id);
    if (!from) return;
    const pointer = event.pointerId, x = event.clientX, y = event.clientY;
    onLift();
    // Window listeners, not pointer capture: lifting reorders the card in the DOM, which would release a capture.
    const moved = (next: PointerEvent) => {
      if (next.pointerId !== pointer) return;
      springs.hold(item.id, from.dx + next.clientX - x, from.dy + next.clientY - y);
      handlers.current.onDrag();
    };
    const ended = (next: PointerEvent) => {
      if (next.pointerId !== pointer) return;
      removeEventListener("pointermove", moved); removeEventListener("pointerup", ended); removeEventListener("pointercancel", ended);
      handlers.current.onDrop(springs.release(item.id));
    };
    addEventListener("pointermove", moved); addEventListener("pointerup", ended); addEventListener("pointercancel", ended);
  }
  function key(event: KeyboardEvent<HTMLButtonElement>) {
    if (!item.leaving && onKey(event.key)) event.preventDefault();
  }
  return <FluentLayer id={item.id} clear origin="center" transform={toTransform(initial)} className="fl-card-layer"
    aria-label={`${item.title}, ${LANES[lane]!.label}, ${priorities[item.priority].label}`}
    layout={{ x: CARD.x, y: CARD.y, width: CARD.width, height: CARD.height, padding: 5 }}>
    {/* Leaving cards make their content inert, not the layer: the layer keeps catching clicks. */}
    <Card size="small" className="fl-card" inert={item.leaving}>
      <div className="fl-card-row">
        <Tooltip content="Drag to another lane, or use the arrow keys" relationship="description" withArrow>
          <Button className="fl-grip" appearance="subtle" size="small" icon={<ReOrderDotsVertical20Regular />}
            aria-label={`Move ${item.title}`} onPointerDown={grab} onKeyDown={key} />
        </Tooltip>
        <Link as="button" className="fl-card-title" onClick={onOpen} aria-label={`Edit ${item.title}`}>{item.title}</Link>
        <Menu>
          <MenuTrigger disableButtonEnhancement>
            <Button appearance="subtle" size="small" icon={<MoreHorizontal20Regular />} aria-label={`Actions for ${item.title}`} />
          </MenuTrigger>
          <MenuPopover>
            <MenuList>
              <MenuItem onClick={onOpen}>Edit…</MenuItem>
              <MenuDivider />
              {LANES.map(entry => <MenuItem key={entry.id} disabled={entry.id === item.lane} onClick={() => onMove(entry.id)}>Move to {entry.label}</MenuItem>)}
              <MenuDivider />
              <MenuItem onClick={onArchive}>Archive</MenuItem>
            </MenuList>
          </MenuPopover>
        </Menu>
      </div>
      <div className="fl-card-row">
        <Badge appearance="tint" size="small" color={priorities[item.priority].color}>{priorities[item.priority].label}</Badge>
        <ProgressBar className="fl-card-progress" value={item.progress / 100} thickness="medium" aria-label={`${item.progress}% done`} />
        <Avatar name={item.owner} size={20} color="colorful" />
      </div>
    </Card>
  </FluentLayer>;
}

const EDITOR_ID = "fluent-editor";
/** A full Fluent form that materialises out of a card; every edit updates that card live. */
function Editor({ item, from, springs, closing, onChange, onClose, onOpened }: {
  item: Item; from: Pose; springs: Springs; closing: boolean; onChange(change: Partial<Item>): void; onClose(): void; onOpened(): void;
}) {
  const opened = useRef({ onOpened, springs });
  useLayoutEffect(() => {
    const { springs, onOpened } = opened.current;
    springs.add(EDITOR_ID, EDITOR, from);
    springs.to(EDITOR_ID, { dx: 0, dy: 0, scale: 1, opacity: 1 });
    const frame = requestAnimationFrame(onOpened);
    return () => { cancelAnimationFrame(frame); springs.remove(EDITOR_ID); };
  }, [from]);
  return <FluentLayer id={EDITOR_ID} origin="center" transform={toTransform(from)} aria-label={`Edit ${item.title}`}
    layout={{ ...EDITOR, overflow: "hidden" }} appearance={{ radius: 18 }}>
    <form className="fl-editor" inert={closing} onSubmit={event => { event.preventDefault(); onClose(); }}
      onKeyDown={event => { if (event.key === "Escape") onClose(); }}>
      <header>
        <div className="fl-editor-title"><Caption1 className="fl-eyebrow">{LANES[laneIndex(item.lane)]!.label.toUpperCase()}</Caption1><Title3 as="h3">Edit work item</Title3></div>
        <Button appearance="subtle" icon={<Dismiss20Regular />} aria-label="Close editor" onClick={onClose} />
      </header>
      <Field label="Title"><Input id="fluent-edit-title" maxLength={40} value={item.title} onChange={(_, data) => onChange({ title: data.value })} /></Field>
      <Field label="Notes"><Textarea id="fluent-edit-notes" resize="none" rows={3} value={item.notes} onChange={(_, data) => onChange({ notes: data.value })} /></Field>
      <div className="fl-pair">
        <Field label="Owner">
          <Dropdown aria-label="Owner" value={item.owner} selectedOptions={[item.owner]} onOptionSelect={(_, data) => data.optionValue && onChange({ owner: data.optionValue })}>
            {people.map(person => <Option key={person} value={person}>{person}</Option>)}
          </Dropdown>
        </Field>
        <Field label="Priority">
          <RadioGroup layout="horizontal" value={String(item.priority)} onChange={(_, data) => onChange({ priority: Number(data.value) as Priority })}>
            {([1, 2, 3] as const).map(value => <Radio key={value} value={String(value)} label={priorities[value].label} />)}
          </RadioGroup>
        </Field>
      </div>
      <Field label={`Progress · ${item.progress}%`}><Slider min={0} max={100} step={5} value={item.progress} onChange={(_, data) => onChange({ progress: data.value })} /></Field>
      <div className="fl-editor-actions"><Button type="submit" appearance="primary">Done</Button></div>
    </form>
  </FluentLayer>;
}

/** The decorative poster: Fluent components in a dark theme, inert and aria-hidden. It pulses when releases land. */
function Poster({ released, shipped, total, owners }: { released: number; shipped: number; total: number; owners: string[] }) {
  return <FluentProvider theme={webDarkTheme} className="fluent-fill fl-poster">
    <div className="fl-poster-text">
      <Caption1 className="fl-poster-kicker">RELEASE TRAIN · FLUENT UI v9 ON UNDERGLASS</Caption1>
      <span className="fl-poster-title">Glasswing 0.1</span>
      <ProgressBar value={total ? (released + shipped) / total : 0} thickness="large" className="fl-poster-progress" />
      <Text size={200}>{released} released · {shipped} shipped · {total} total</Text>
    </div>
    <div className="fl-poster-side">
      <AvatarGroup layout="stack" size={40}>{owners.map(name => <AvatarGroupItem key={name} name={name} />)}</AvatarGroup>
      <Badge appearance="filled" color="brand" size="large">{released} released</Badge>
    </div>
  </FluentProvider>;
}
