import { useEffect, useState, type ReactNode } from "react";
import { Surface } from "@canvas-spa/react";
import { STAGE } from "./pose";

export type BackdropTheme = "postcard" | "deck" | "lab" | "notices" | "tasks";

/**
 * A stage-sized decorative layer drawn first. The GPU compositor presents an
 * opaque white backdrop by default; this inert, aria-hidden surface gives each
 * example its own scene in DOM and GPU alike.
 */
export function Backdrop({ theme }: { theme: BackdropTheme }) {
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
  postcard: "rgb(255,240,226)", deck: "rgb(14,52,64)", lab: "rgb(11,13,30)", notices: "rgb(43,25,84)", tasks: "rgb(231,244,236)",
};

/** The left-hand native control panel shared by the studio examples. */
export function Panel({ tone = "light", label, title, children }: { tone?: "light" | "dark"; label: string; title: string; children: ReactNode }) {
  return <Surface id="showcase-controls" className={`panel panel-${tone}`} aria-label={`${title} controls`}
    layout={{ x: 20, y: 24, width: 324, height: 652, padding: 22, direction: "column", gap: 14, overflow: "hidden" }}
    appearance={tone === "dark"
      ? { background: "rgb(22,24,46)", color: "rgb(236,238,255)", radius: 24, fontSize: 14, borderColor: "rgb(58,62,104)", borderWidth: 1 }
      : { background: "rgb(255,255,255)", color: "rgb(30,27,46)", radius: 24, fontSize: 14, borderColor: "rgb(232,226,238)", borderWidth: 1 }}>
    <header className="panel-head"><span className="panel-label">{label}</span><h3>{title}</h3></header>
    {children}
  </Surface>;
}

export function useReducedMotion() {
  const [reduced, setReduced] = useState(() => matchMedia("(prefers-reduced-motion: reduce)").matches);
  useEffect(() => {
    const query = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return reduced;
}

export function describe(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
