/**
 * Example 04, "Notification stack": four fixed toast slots, each a `Surface` wrapped around a
 * `Presence`. Sending a notice sets `present`, so `Presence` mounts the toast and runs the enter
 * motion; dismissing sets it false, and `Presence` keeps the same React subtree mounted through the
 * exit motion, then removes it and reports the result through `onComplete`. Nothing is cloned to
 * fake an exit, and the Dismiss buttons are ordinary React buttons.
 */
import { useEffect, useRef, useState } from "react";
import { Presence, Surface, type MotionDescriptor, type TransitionResult } from "@underglass/react";
import { Panel, useReducedMotion } from "./shared";
import { usePulse, useSceneArt } from "./scene";
import { toTransform, type Rect } from "./pose";

// Four toast slots stacked down the phone screen. Each slot is its own `Surface` with a stable id.
const SLOT = { width: 278, height: 100 };
const slots: Rect[] = Array.from({ length: 4 }, (_, index) => ({ x: 397, y: 176 + index * 112, ...SLOT }));
// Notification flavours: radio label, toast heading and tint colour.
const kinds = {
  postcard: { label: "Postcard", heading: "Postcard delivered", tint: "rgb(255,122,89)" },
  like: { label: "Like", heading: "Someone liked your card", tint: "rgb(236,72,153)" },
  reminder: { label: "Reminder", heading: "Reminder", tint: "rgb(59,130,246)" },
} as const;
type Kind = keyof typeof kinds;
// A notification in a slot; `serial` makes each one unique.
interface Notice { serial: number; kind: Kind; text: string }
// `present` is what `Presence` is told. `notice` stays set until the exit has finished, so the
// content exists during the exit motion.
interface Slot { notice?: Notice; present: boolean }
// One row of the Presence log.
interface Entry { serial: number; at: string; text: string; status: string }

// Centre-pivoted enter/exit descriptors; every slot shares the same size.
const enter: MotionDescriptor = { keyframes: [
  { offset: 0, ...toTransform({ dx: 0, dy: -36, rotation: 0, scale: .9, opacity: 0 }) },
  { offset: .7, ...toTransform({ dx: 0, dy: 4, rotation: 0, scale: 1.02, opacity: 1 }) },
  { offset: 1 },
], timing: { duration: 520, easing: "ease-out" } };
const exit: MotionDescriptor = { keyframes: [
  { offset: 0 },
  { offset: 1, ...toTransform({ dx: 70, dy: 0, rotation: 0, scale: .92, opacity: 0 }) },
], timing: { duration: 380, easing: "ease-in" } };

/** The notification example: a control panel, four toast slots and a log of `onComplete` results. */
export function NotificationStack() {
  const reduced = useReducedMotion();
  const [text, setText] = useState("Your postcard from the GPU arrived!");
  const [kind, setKind] = useState<Kind>("postcard");
  const [stack, setStack] = useState<Slot[]>(() => slots.map(() => ({ present: false })));
  const [log, setLog] = useState<Entry[]>([]);
  const [feedback, setFeedback] = useState("Send a notification. Each one enters and exits with Presence.");
  // One counter for notice ids and log rows.
  const serial = useRef(0);
  const pulse = usePulse();
  // Pending staggered sends and dismissals, cleared on unmount.
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => { for (const timer of timers.current) clearTimeout(timer); }, []);

  useSceneArt(() => ({ layout: { x: 390, y: 28, width: 294, height: 644, overflow: "hidden" },
    appearance: { background: "rgb(59,29,120)", radius: 36 },
    content: <div className="wallpaper"><span className="phone-time">9:41</span><span className="phone-date">Wednesday, GPU day</span></div> }), []);
  // Prepends a log row with the wall-clock time and keeps the newest eight.
  function record(text: string, status: string) {
    const now = new Date();
    const at = `${now.getHours()}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;
    setLog(entries => [{ serial: ++serial.current, at, text, status }, ...entries].slice(0, 8));
  }
  // Puts a notice into the first free slot and queues the wallpaper pulse from the updater. `placed` is set by the
  // updater, which React may run after this function returns, so callers here do not use the result.
  function send(notice: Omit<Notice, "serial">) {
    let placed = false;
    setStack(current => {
      const index = current.findIndex(slot => !slot.notice);
      if (index < 0) return current;
      placed = true;
      queueMicrotask(() => pulse(4, 900));
      return current.map((slot, position) => position === index ? { notice: { ...notice, serial: ++serial.current }, present: true } : slot);
    });
    return placed;
  }
  // Sets `present` to false; `Presence` then runs the exit motion with the subtree still mounted.
  function dismiss(index: number) {
    setStack(current => current.map((slot, position) => position === index && slot.present ? { ...slot, present: false } : slot));
  }
  // `Presence` `onComplete`: logs the enter or exit result. After an exit the slot is emptied so it
  // can take the next notice.
  function completed(index: number, result: TransitionResult) {
    const slot = stack[index];
    if (!slot?.notice) return;
    record(`“${kinds[slot.notice.kind].heading}” ${slot.present ? "entered" : "exited"}`, `${result.status} · ${result.reason}`);
    if (!slot.present) setStack(current => current.map((entry, position) => position === index && !entry.present ? { present: false } : entry));
  }
  function submit() {
    const free = stack.filter(slot => !slot.notice).length;
    if (!free) { setFeedback("All four slots are busy. Dismiss one to make room."); return; }
    send({ kind, text: text.trim() || kinds[kind].heading });
    setFeedback(reduced ? "Sent. Reduced motion is on, so it appears without sliding." : "Sent. Its subtree is ordinary React; Presence moves its surface.");
  }
  // Three sends 140 ms apart, to show several slots entering at once.
  function burst() {
    const samples: Omit<Notice, "serial">[] = [
      { kind: "like", text: "Mina liked “Morning sky”." }, { kind: "reminder", text: "Try the shader lab next." },
      { kind: "postcard", text: "A postcard is waiting in your outbox." },
    ];
    samples.forEach((sample, index) => timers.current.push(setTimeout(() => send(sample), index * 140)));
    setFeedback("Three notifications on the way, 140 ms apart.");
  }
  function dismissAll() {
    stack.forEach((slot, index) => { if (slot.present) timers.current.push(setTimeout(() => dismiss(index), index * 110)); });
    setFeedback("Dismissing everything. Each exit keeps its original subtree until its motion completes.");
  }
  // Each `Presence` drives the layer with the same `id` as the `Surface` around it. The toast's
  // Dismiss button is a real, natively hit-tested control.
  return <>
    <Panel label="STUDIO 04" title="Notification stack">
      <form className="stack" onSubmit={event => { event.preventDefault(); submit(); }}>
        <div className="field">
          <label htmlFor="notice-text">Notification text</label>
          <input id="notice-text" maxLength={60} value={text} onChange={event => setText(event.target.value)} autoComplete="off" />
        </div>
        <fieldset className="kinds">
          <legend>Kind</legend>
          {(Object.keys(kinds) as Kind[]).map(id => <label key={id} className="kind-choice">
            <input type="radio" name="notice-kind" value={id} checked={kind === id} onChange={() => setKind(id)} />
            <span className="kind-dot" style={{ background: kinds[id].tint }} aria-hidden="true" />{kinds[id].label}
          </label>)}
        </fieldset>
        <button type="submit" className="primary">Send notification</button>
      </form>
      <div className="button-grid two">
        <button type="button" onClick={burst}>Send three</button>
        <button type="button" onClick={dismissAll}>Dismiss all</button>
      </div>
      <output id="studio-feedback" role="status">{feedback}</output>
      <p className="panel-note">{reduced ? "Reduced motion is on: Presence completes enter and exit immediately."
        : "Each toast surface is a stable boundary; only its React subtree enters and leaves."}</p>
    </Panel>
    {slots.map((rect, index) => {
      const slot = stack[index]!;
      return <Surface key={index} id={`notice-${index}`} origin="center" aria-label={`Notification slot ${index + 1}`}
        layout={{ x: rect.x, y: rect.y, width: rect.width, height: rect.height }}>
        <Presence id={`notice-${index}`} present={slot.present} enter={enter} exit={exit} onComplete={result => completed(index, result)}>
          {slot.notice && <article className="toast" style={{ ["--tint" as string]: kinds[slot.notice.kind].tint }}>
            <span className="toast-icon" aria-hidden="true">{kinds[slot.notice.kind].label[0]}</span>
            <span className="toast-text"><strong>{kinds[slot.notice.kind].heading}</strong><span>{slot.notice.text}</span></span>
            <button type="button" className="toast-close" onClick={() => dismiss(index)}
              aria-label={`Dismiss ${kinds[slot.notice.kind].heading}`}>Dismiss</button>
          </article>}
        </Presence>
      </Surface>;
    })}
    <Surface id="notice-log" className="log" aria-label="Presence log"
      layout={{ x: 716, y: 24, width: 304, height: 652, padding: 22, direction: "column", gap: 10, overflow: "hidden" }}
      appearance={{ background: "rgb(250,247,255)", color: "rgb(36,26,64)", radius: 24, fontSize: 13 }}>
      <span className="log-head"><strong>Presence log</strong><span>onComplete results</span></span>
      {log.length === 0 && <p className="log-empty">Enter and exit completions appear here, with their status and reason.</p>}
      <ol className="log-list">
        {log.map(entry => <li key={entry.serial}><time>{entry.at}</time><span>{entry.text}</span><small>{entry.status}</small></li>)}
      </ol>
    </Surface>
  </>;
}
