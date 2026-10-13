import { useCallback, useEffect, useRef, useState, version } from "react";
import { createRoot } from "react-dom/client";
import { version as reactDOMVersion } from "react-dom";
import { createCanvasHosts, mountCanvasApp, type CanvasController } from "canvas-spa-phase-one";
import { Demo } from "./demos";
import { examples, route, searchExamples, type ExampleId } from "./catalog";
import "./style.css";

function App() {
  const [selected, setSelected] = useState<ExampleId>(route(location.hash));
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [mode, setMode] = useState("dom");
  const [diagnostic, setDiagnostic] = useState("Ordinary DOM is ready. GPU is experimental and explicitly opt-in.");
  const [busy, setBusy] = useState(false);
  const [disposed, setDisposed] = useState(false);
  const retired = useRef(false);
  const frame = useRef<HTMLDivElement>(null);
  const controller = useRef<CanvasController>(undefined);
  const change = useRef<(id: ExampleId) => void>(undefined);
  const ready = useCallback((update: (id: ExampleId) => void) => { change.current = update; }, []);
  const current = examples.find(example => example.id === selected)!;
  useEffect(() => {
    const host = frame.current!;
    // The output canvas must not be aria-hidden: GPU mode moves the original controls inside it.
    const { outputCanvas, ordinaryHost, overlayHost } = createCanvasHosts(host);
    outputCanvas.className = "output"; ordinaryHost.className = "ordinary"; overlayHost.className = "overlay";
    const app = mountCanvasApp({ outputCanvas, ordinaryHost, overlayHost,
      onStatusChange(status) { setDiagnostic(status.reason); setMode(status.mode); } }, <Demo id={route(location.hash)} onReady={ready} />);
    controller.current = app;
    const navigate = () => {
      if (retired.current) return;
      if (location.hash && !location.hash.startsWith("#/")) return;
      const id = route(location.hash); setSelected(id); change.current?.(id);
    };
    const close = () => {
      retired.current = true;
      void app.dispose().catch(error => console.error("Showcase disposal failed", error));
    };
    const restore = (event: PageTransitionEvent) => {
      if (event.persisted) { setDisposed(true); setMode("disposed"); setBusy(false); setDiagnostic("Restored a retired page. Reload to start a fresh session."); }
    };
    window.addEventListener("hashchange", navigate);
    window.addEventListener("pagehide", close);
    window.addEventListener("pageshow", restore);
    window.showcase = { state: () => app.state(), controller: app, react: version, reactDOM: reactDOMVersion };
    return () => { window.removeEventListener("hashchange", navigate); window.removeEventListener("pagehide", close);
      window.removeEventListener("pageshow", restore); close(); };
  }, [ready]);
  async function action(operation: "enable" | "disable" | "dispose") {
    setBusy(true);
    try {
      await controller.current![operation]();
      const state = controller.current!.state();
      setMode(state.mode);
      setDiagnostic(state.reason);
      if (operation === "dispose") { retired.current = true; setDisposed(true); }
    } catch (error) {
      setDiagnostic(`Action rejected: ${String(error)}`);
      console.error("Showcase action rejected", error);
    } finally { setBusy(false); }
  }
  const filtered = searchExamples(query, category);
  return <>
    <a className="skip-link" href="#studio">Skip to live example</a>
    <header className="site-header"><a className="brand" href="#/layers"><span className="brand-mark" aria-hidden="true">C</span>CanvasSPA<span className="tag">EXPERIMENTAL</span></a>
      <a href="#about">About the experiment <span aria-hidden="true">&#8599;</span></a></header>
    <main>
      <section className="hero" aria-labelledby="hero-title"><p className="eyebrow">REACT AT HEART. CANVAS IN VIEW.</p>
        <h1 id="hero-title">Ordinary controls.<br /><span>Extraordinary possibilities.</span></h1>
        <p className="hero-copy">A small collection of live experiments in native interaction, shared GPU layers and expressive motion. Pick an example. Make it yours.</p>
        <div className="hero-notes"><span>Original React state</span><span>Native inputs</span><span>One shared compositor</span></div>
        <div className="hero-art" aria-hidden="true"><div className="orbit" /><div className="tile tile-coral" /><div className="tile tile-blue" /><div className="tile tile-yellow" /></div>
      </section>
      <section className="catalog" aria-labelledby="catalog-title">
        <div className="section-heading"><div><p className="eyebrow">THE COLLECTION</p><h2 id="catalog-title">Choose your starting point</h2></div><span>{examples.length} live examples</span></div>
        <div className="filters"><label>Find an example<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Try motion or native controls" /></label>
          <label>Category<select aria-label="Category" value={category} onChange={event => setCategory(event.target.value)}>
            {["All", ...new Set(examples.map(example => example.category))].map(value => <option key={value}>{value}</option>)}
          </select></label></div>
        <div className="example-grid">{filtered.map(example => <a key={example.id} className={`example-card ${example.accent}`}
          href={`#/${example.id}`} aria-current={selected === example.id ? "page" : undefined} onClick={event => { if (disposed) event.preventDefault(); }}>
          <span className="card-top"><span>{example.category}</span><span>{example.number}</span></span>
          <h3>{example.title}</h3><p>{example.summary}</p><span className="card-link">Explore example <span aria-hidden="true">&#8599;</span></span>
        </a>)}</div>
        {filtered.length === 0 && <p role="status">No matching examples. Try another search or category.</p>}
      </section>
      <section className="studio" id="studio" tabIndex={-1} aria-labelledby="studio-title-heading">
        <div className="section-heading"><div><p className="eyebrow">LIVE CANVASSPA STUDIO</p><h2 id="studio-title-heading">{current.title}</h2></div>
          <span className={`mode-pill ${mode === "gpu" ? "active" : ""}`}>{mode === "gpu" ? "GPU active" : disposed ? "Disposed" : "Ordinary DOM"}</span></div>
        <p>{current.detail}</p>
        <p className="stage-note" id="gpu-requirement"><strong>GPU demos require Chrome Canary with HTML-in-Canvas enabled.</strong> Ordinary DOM mode works without experimental flags.</p>
        <div className="toolbar"><button aria-describedby="gpu-requirement" disabled={busy || disposed} onClick={() => void action("enable")}>Enable experimental GPU</button>
          <button disabled={busy || disposed} onClick={() => void action("disable")}>Use ordinary DOM</button>
          <button disabled={busy || disposed} onClick={() => void action("dispose")}>Dispose example</button></div>
        <p className="diagnostic" role="status" aria-live="polite">{diagnostic}</p>
        {disposed && <p>The example is disposed. Reload this page to start a fresh session.</p>}
        <div className="stage-scroll" role="region" aria-label="Live example canvas; scroll horizontally on small screens" tabIndex={0}>
          <div className="stage" ref={frame} /></div>
        <p className="stage-note">Same original controls in DOM and GPU. On smaller screens, scroll the studio horizontally. No data is sent or stored.</p>
      </section>
      <section className="about" id="about"><p className="eyebrow">AN HONEST EXPERIMENT</p><h2>Progressive presentation, not pretend compatibility.</h2>
        <div className="about-grid"><p>CanvasSPA layers GPU presentation over React's original controls. The examples use public Surface, Box, motion and effect APIs. Typed layout and appearance compile to browser CSS; the browser still owns layout and editing.</p>
          <p>Ordinary DOM works by default. Experimental GPU needs a compatible browser with HTML-in-Canvas and native geometry support. Missing capabilities are diagnosed, not disguised. Decorative shaders do not replace essential controls.</p>
          <p>This is a prepared showcase, not a production certification or a published library. Accessibility, physical-device and broader browser qualification remain open. Your browser's reduced-motion preferences are respected.</p></div>
      </section>
    </main>
    <footer><span>CanvasSPA / Example studio</span><span>Built with React. Still an experiment.</span></footer>
  </>;
}

declare global {
  interface Window { showcase: { state(): ReturnType<CanvasController["state"]>; controller: CanvasController; react: string; reactDOM: string } }
}
createRoot(document.getElementById("app")!).render(<App />);
