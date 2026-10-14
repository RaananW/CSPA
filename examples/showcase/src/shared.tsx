/**
 * Building blocks every studio example shares: the full-stage decorative backdrop, the left-hand
 * native control panel and two small hooks/helpers. Both components are plain `Surface` layers, so
 * they show the basic authoring pattern: typed `layout` and `appearance` that compile to browser
 * CSS, with ordinary React children inside.
 */
import { useEffect, useState, type ReactNode } from "react";
import { Surface } from "@underglass/react";
import { STAGE } from "./pose";

/** Which example's scenery the backdrop draws. */
export type BackdropTheme = "postcard" | "deck" | "lab" | "notices" | "tasks" | "pond" | "fluent" | "compare";

/**
 * A stage-sized decorative layer drawn first. The GPU compositor presents an
 * opaque white backdrop by default; this inert, aria-hidden surface gives each
 * example its own scene in DOM and GPU alike.
 */
export function Backdrop({ theme }: { theme: BackdropTheme }) {
  // One stable id across examples: switching examples changes this layer's content and colour, not
  // its membership. Rendered first by `Demo`, so it paints underneath every other layer.
  return <Surface id="showcase-backdrop" decorative className={`backdrop backdrop-${theme}`}
    layout={{ x: 0, y: 0, width: STAGE.width, height: STAGE.height, overflow: "hidden" }}
    appearance={{ background: backgroundFor[theme] }}>
    <div className="backdrop-glow" />
    <div className="backdrop-grain" />
    {theme === "postcard" && <div className="airmail" />}
    {theme === "lab" && <div className="lab-grid" />}
    {theme === "notices" && <div className="phone" />}
  </Surface>;
}
const backgroundFor: Record<BackdropTheme, string> = {
  postcard: "rgb(255,240,226)", deck: "rgb(14,52,64)", lab: "rgb(11,13,30)", notices: "rgb(43,25,84)", tasks: "rgb(231,244,236)", pond: "rgb(14,30,26)", fluent: "rgb(235,239,248)", compare: "rgb(14,13,26)",
};

/** The left-hand native control panel shared by the studio examples. */
export function Panel({ tone = "light", label, title, children }: { tone?: "light" | "dark"; label: string; title: string; children: ReactNode }) {
  // An interactive (non-decorative) layer: its inputs and buttons are the original React controls,
  // hit-tested natively in both modes. It never carries effects.
  return <Surface id="showcase-controls" className={`panel panel-${tone}`} aria-label={`${title} controls`}
    layout={{ x: 20, y: 24, width: 324, height: 652, padding: 22, direction: "column", gap: 14, overflow: "hidden" }}
    appearance={tone === "dark"
      ? { background: "rgb(22,24,46)", color: "rgb(236,238,255)", radius: 24, fontSize: 14, borderColor: "rgb(58,62,104)", borderWidth: 1 }
      : { background: "rgb(255,255,255)", color: "rgb(30,27,46)", radius: 24, fontSize: 14, borderColor: "rgb(232,226,238)", borderWidth: 1 }}>
    <header className="panel-head"><span className="panel-label">{label}</span><h3>{title}</h3></header>
    {children}
  </Surface>;
}

/**
 * Tracks the `prefers-reduced-motion: reduce` media query so panel copy can say what is happening.
 * It only changes wording here; the runtime applies reduced motion itself.
 */
export function useReducedMotion() {
  // Read once for the first render; the effect below keeps it current if the OS setting changes.
  const [reduced, setReduced] = useState(() => matchMedia("(prefers-reduced-motion: reduce)").matches);
  useEffect(() => {
    const query = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return reduced;
}

/** Message text of a thrown value, for status lines (non-`Error` values are stringified). */
export function describe(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
