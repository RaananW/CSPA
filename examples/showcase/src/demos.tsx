import { useEffect, useMemo, useRef, useState } from "react";
import { Box, Surface, useGPUHost, type EffectHandle, type TransitionHandle } from "canvas-spa-phase-one";
import { TodoApp } from "../../playground/src/apps/todo/TodoApp";
import { taskTransitions } from "../../playground/src/apps/todo/transition";
import type { ExampleId } from "./catalog";
import "../../playground/src/apps/todo/todo.css";

export function Demo({ id, onReady }: { id: ExampleId; onReady(change: (id: ExampleId) => void): void }) {
  const [selected, setSelected] = useState(id);
  useEffect(() => { onReady(setSelected); }, [onReady]);
  return selected === "tasks" ? <Tasks /> : <Studio key={selected} kind={selected} />;
}
function Tasks() {
  const controller = useGPUHost();
  const transitions = useMemo(() => taskTransitions(controller), [controller]);
  useEffect(() => () => transitions.stop(), [transitions]);
  return <TodoApp onTransition={transitions.pulse} />;
}

function Studio({ kind }: { kind: Exclude<ExampleId, "tasks"> }) {
  const controller = useGPUHost();
  const [title, setTitle] = useState("Make something original");
  const [saved, setSaved] = useState("Your next good idea");
  const [count, setCount] = useState(0);
  const [feedback, setFeedback] = useState("Ready when you are.");
  const motion = useRef<TransitionHandle | undefined>(undefined);
  const effect = useRef<EffectHandle | undefined>(undefined);
  useEffect(() => () => {
    const pending = motion.current;
    motion.current = undefined;
    pending?.cancel();
    effect.current?.dispose();
  }, []);
  function move() {
    try {
      motion.current?.cancel();
      const handle = controller.transition("showcase-card", {
        keyframes: [{ offset: 0 }, { offset: .5, x: -36, y: 40 }, { offset: 1 }],
        timing: { duration: 1600, easing: "ease-in-out", iterations: 1 },
      });
      motion.current = handle;
      setFeedback("A typed layer journey. Your controls are still the originals.");
      void handle.finished.then(result => {
        if (motion.current === handle) setFeedback(`Layer journey ${result.status}: ${result.reason}`);
      });
    } catch (error) { setFeedback(`Motion unavailable: ${String(error)}`); console.error(error); }
  }
  function color() {
    try {
      const handle = controller.setEffects("showcase-art", [{
        kind: "chromatic", bounds: "layer", interaction: "decorative", media: "identity", fallback: "static",
        parameters: { displacement: 8 }, time: { seconds: 0, playing: true },
      }]);
      effect.current = handle;
      setFeedback(controller.state().mode === "gpu" ? "Decorative GPU effect active." : "Static artwork in DOM. Enable GPU to try the shader.");
    } catch (error) { setFeedback(`Effect unavailable: ${String(error)}`); console.error(error); }
  }
  return <>
    <Surface id="showcase-controls" layout={{ x: 20, y: 24, width: 324, height: 460, padding: 24, direction: "column", gap: 14 }}
      appearance={{ background: "rgb(245,248,252)", color: "rgb(24,36,54)", radius: 20, fontSize: 16 }}>
      <Box appearance={{ fontSize: 24 }}><strong>Your creative desk</strong></Box>
      <form onSubmit={event => { event.preventDefault(); setSaved(title); setFeedback("Saved on the original React tree."); }}>
        <Box layout={{ direction: "column", gap: 8 }}>
          <label htmlFor="studio-title">Postcard title</label>
          <input id="studio-title" maxLength={32} value={title} onChange={event => setTitle(event.target.value)} />
          <button type="submit">Save postcard</button>
        </Box>
      </form>
      <button onClick={() => setCount(value => value + 1)}>Collect an idea: {count}</button>
      {kind === "motion" && <button onClick={move}>Play layer journey</button>}
      {kind === "effects" && <><button onClick={color}>Apply chromatic effect</button>
        <button onClick={() => { effect.current?.cancel(); setFeedback("Static artwork restored."); }}>Clear effect</button></>}
      <output id="studio-feedback" role="status">{feedback}</output>
    </Surface>
    <Surface id="showcase-card" layout={{ x: 378, y: 36, width: 350, height: 270, padding: 28, direction: "column", gap: 14 }}
      appearance={{ background: "rgb(246,188,155)", color: "rgb(43,31,46)", radius: 20, fontSize: 18 }}>
      <Box appearance={{ fontSize: 14 }}>A NOTE FROM YOUR STUDIO</Box>
      <Box appearance={{ fontSize: 28 }}><strong id="saved-title">{saved}</strong></Box>
      <Box>Made with React. Presented by CanvasSPA.</Box>
    </Surface>
    <Surface id="showcase-art" decorative layout={{ x: 378, y: 330, width: 350, height: 150, overflow: "hidden" }}
      appearance={{ background: "rgb(43,72,141)", radius: 20 }}>
      <svg width="350" height="150" viewBox="0 0 350 150" aria-hidden="true">
        <circle cx="80" cy="75" r="60" fill="rgb(247,208,78)" />
        <path d="M135 150L245 0L350 150Z" fill="rgb(235,115,94)" />
        <circle cx="270" cy="70" r="32" fill="rgb(255,244,222)" />
      </svg>
    </Surface>
  </>;
}
