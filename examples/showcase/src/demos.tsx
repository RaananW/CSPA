import { useEffect, useMemo, useState } from "react";
import { Surface, useGPUHost } from "@canvas-spa/react";
import { TodoApp } from "../../playground/src/apps/todo/TodoApp";
import { taskTransitions } from "../../playground/src/apps/todo/transition";
import type { ExampleId } from "./catalog";
import { Backdrop, type BackdropTheme } from "./shared";
import { ART, SceneProvider, useArt, useSceneArt } from "./scene";
import { PostcardStudio } from "./postcard";
import { CardDeck } from "./deck";
import { ShaderLab } from "./lab";
import { NotificationStack } from "./notices";
import { WebcamPond } from "./pond";
import "../../playground/src/apps/todo/todo.css";

const themes: Record<ExampleId, BackdropTheme> = { layers: "postcard", motion: "deck", effects: "lab", presence: "notices", tasks: "tasks", pond: "pond" };

/**
 * One React root for every example. Switching examples swaps the enrolled
 * <Surface> set inside the same runtime and shared compositor; the decorative
 * art layer persists and only changes its layout and content.
 */
export function Demo({ id, onReady }: { id: ExampleId; onReady(change: (id: ExampleId) => void): void }) {
  const [selected, setSelected] = useState(id);
  useEffect(() => { onReady(setSelected); }, [onReady]);
  return <SceneProvider>
    <Backdrop theme={themes[selected]} />
    <SceneArt />
    {selected === "layers" ? <PostcardStudio key="layers" />
      : selected === "motion" ? <CardDeck key="motion" />
        : selected === "effects" ? <ShaderLab key="effects" />
          : selected === "presence" ? <NotificationStack key="presence" />
            : selected === "pond" ? <WebcamPond key="pond" />
              : <Tasks key="tasks" />}
  </SceneProvider>;
}

/** The persistent decorative layer: inert, aria-hidden and never interactive. */
function SceneArt() {
  const art = useArt();
  return <Surface id={ART} decorative layout={art?.layout ?? { x: 378, y: 330, width: 350, height: 346, overflow: "hidden" }}
    appearance={art?.appearance}>{art?.content}</Surface>;
}

function Tasks() {
  const controller = useGPUHost();
  const transitions = useMemo(() => taskTransitions(controller), [controller]);
  useEffect(() => () => transitions.stop(), [transitions]);
  useSceneArt(() => ({ layout: { x: 770, y: 40, width: 246, height: 620, overflow: "hidden" },
    appearance: { background: "rgb(20,70,48)", radius: 26 },
    content: <div className="tasks-poster"><span>Real inputs.</span><span>Real focus.</span><span>Real dialog.</span></div> }), []);
  // The maintained TodoApp is reused unchanged; only decorative scenery is added around it.
  return <TodoApp onTransition={transitions.pulse} />;
}
