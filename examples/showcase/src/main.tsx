import { useCallback, useEffect, useRef, useState, version } from "react";
import { createRoot } from "react-dom/client";
import { version as reactDOMVersion } from "react-dom";
import { createCanvasHosts, mountCanvasApp, type CanvasController } from "@canvas-spa/react";
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
  const studio = useRef<HTMLElement>(null);
  const controller = useRef<CanvasController>(undefined);
  const change = useRef<(id: ExampleId) => void>(undefined);
  const ready = useCallback((update: (id: ExampleId) => void) => { change.current = update; }, []);
  const current = examples.find(example => example.id === selected)!;
  useEffect(() => {
    const host = frame.current!;
    // The output canvas must not be aria-hidden: GPU mode moves the original controls inside it.
    const { outputCanvas, ordinaryHost, overlayHost } = createCanvasHosts(host);
    outputCanvas.className = "output"; ordinaryHost.className = "ordinary"; overlayHost.className = "overlay";
    let app: CanvasController | undefined;
    let cancelled = false;
    const navigate = () => {
      if (retired.current) return;
      if (location.hash && !location.hash.startsWith("#/")) return;
      const id = route(location.hash); setSelected(id); change.current?.(id);
    };
    const close = () => {
      retired.current = true;
      void app?.dispose().catch(error => console.error("Showcase disposal failed", error));
    };
    const restore = (event: PageTransitionEvent) => {
      if (event.persisted) { setDisposed(true); setMode("disposed"); setBusy(false); setDiagnostic("Restored a retired page. Reload to start a fresh session."); }
    };
    // Mount outside this effect's React commit: the adapter flushes its own root synchronously.
    queueMicrotask(() => {
      if (cancelled) return;
      app = mountCanvasApp({ outputCanvas, ordinaryHost, overlayHost,
        onStatusChange(status) { setDiagnostic(status.reason); setMode(status.mode); } }, <Demo id={route(location.hash)} onReady={ready} />);
      controller.current = app;
      window.showcase = { state: () => app!.state(), controller: app, react: version, reactDOM: reactDOMVersion };
    });
    window.addEventListener("hashchange", navigate);
    window.addEventListener("pagehide", close);
    window.addEventListener("pageshow", restore);
    return () => { cancelled = true; window.removeEventListener("hashchange", navigate); window.removeEventListener("pagehide", close);
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
  const gpu = mode === "gpu";
  return <>
    <a className="skip-link" href="#studio">Skip to live example</a>
    <div className="hero-shell">
      <header className="site-header"><a className="brand" href="#/layers"><span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>CanvasSPA<span className="tag">EXPERIMENTAL</span></a>
        <nav aria-label="Site"><a href="#examples">Examples</a><a href="#about">About the experiment <span aria-hidden="true">&#8599;</span></a></nav></header>
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-text">
          <p className="hero-badge"><span className="pulse" aria-hidden="true" />HTML-in-Canvas · WebGPU · React</p>
          <h1 id="hero-title">Real React controls.<br /><span className="hero-gradient">Painted by the GPU.</span></h1>
          <p className="hero-copy">CanvasSPA draws your <em>original</em> React DOM into one shared WebGPU compositor through Chrome's
            HTML-in-Canvas API. Layers fly, spin and shimmer on the GPU, while typing, focus and clicks stay with the native controls.</p>
          <div className="hero-cta"><a className="cta primary" href="#studio">Open the live studio</a><a className="cta ghost" href="#how-it-works">How it works</a></div>
          <ul className="hero-notes" aria-label="Highlights"><li>Original React state</li><li>Native inputs and hits</li><li>One shared compositor</li><li>DOM by default</li></ul>
        </div>
        <HeroVisual />
      </section>
    </div>
    <main>
      <section className="how" id="how-it-works" aria-labelledby="how-title">
        <p className="eyebrow">HOW IT WORKS</p>
        <h2 id="how-title">Three steps, no clones.</h2>
        <ol className="how-steps">
          <li><span className="step-art step-react" aria-hidden="true"><b /><b /><b /></span><strong>React renders real DOM</strong>
            <span>Typed <code>Surface</code> layers hold ordinary inputs, buttons and text. Their state never leaves React.</span></li>
          <li><span className="step-art step-canvas" aria-hidden="true"><b /><b /></span><strong>Chrome paints it into a canvas</strong>
            <span>HTML-in-Canvas captures each surface as a texture and keeps native hit testing on the original elements.</span></li>
          <li><span className="step-art step-gpu" aria-hidden="true"><b /><b /><b /></span><strong>One GPU pass composes it</strong>
            <span>Transforms, staggered motion and decorative shaders run in a shared WebGPU compositor on top.</span></li>
        </ol>
      </section>
      <section className="catalog" id="examples" aria-labelledby="catalog-title">
        <div className="section-heading"><div><p className="eyebrow">THE COLLECTION</p><h2 id="catalog-title">Pick a playground</h2></div>
          <span className="count-pill">{examples.length} live examples</span></div>
        <div className="filters"><label>Find an example<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Try motion, WGSL or presence" /></label>
          <label>Category<select aria-label="Category" value={category} onChange={event => setCategory(event.target.value)}>
            {["All", ...new Set(examples.map(example => example.category))].map(value => <option key={value}>{value}</option>)}
          </select></label></div>
        <div className="example-grid">{filtered.map(example => <a key={example.id} className={`example-card accent-${example.accent}`}
          href={`#/${example.id}`} aria-current={selected === example.id ? "page" : undefined}
          onClick={event => { if (disposed) event.preventDefault(); else requestAnimationFrame(() => studio.current?.scrollIntoView({ block: "start" })); }}>
          <span className={`card-art art-${example.id}`} aria-hidden="true"><i /><i /><i /><i /></span>
          <span className="card-top"><span>{example.category}</span><span>{example.number}</span></span>
          <h3>{example.title}</h3><p>{example.summary}</p>
          <span className="card-tags">{example.tags.map(tag => <span key={tag}>{tag}</span>)}</span>
          <span className="card-link">{selected === example.id ? "Now in the studio" : "Open in the studio"} <span aria-hidden="true">&#8594;</span></span>
        </a>)}</div>
        {filtered.length === 0 && <p role="status" className="empty">No matching examples. Try another search or category.</p>}
      </section>
      <section className={`studio ${gpu ? "is-gpu" : ""}`} id="studio" ref={studio} tabIndex={-1} aria-labelledby="studio-title-heading">
        <div className="studio-head">
          <div><p className="eyebrow">LIVE STUDIO · {current.number}</p><h2 id="studio-title-heading">{current.title}</h2></div>
          <span className={`mode-pill ${gpu ? "active" : ""}`}><span className="dot" aria-hidden="true" />{gpu ? "GPU active" : disposed ? "Disposed" : "Ordinary DOM"}</span>
        </div>
        <p className="studio-detail">{current.detail}</p>
        <div className="control-bar">
          <p className="stage-note" id="gpu-requirement"><strong>GPU demos require Chrome Canary with HTML-in-Canvas enabled.</strong> Ordinary DOM mode works without experimental flags.</p>
          <div className="toolbar"><button aria-describedby="gpu-requirement" disabled={busy || disposed} onClick={() => void action("enable")}>Enable experimental GPU</button>
            <button disabled={busy || disposed} onClick={() => void action("disable")}>Use ordinary DOM</button>
            <button disabled={busy || disposed} onClick={() => void action("dispose")}>Dispose example</button></div>
        </div>
        <p className="diagnostic" role="status" aria-live="polite"><span className="diagnostic-label">Status</span>{diagnostic}</p>
        {disposed && <p className="disposed-note">The example is disposed. Reload this page to start a fresh session.</p>}
        <div className="stage-frame">
          <div className="stage-chrome" aria-hidden="true"><i /><i /><i /><span>{gpu ? "webgpu · shared compositor" : "ordinary dom"}</span></div>
          <div className="stage-scroll" role="region" aria-label="Live example canvas; scroll horizontally on small screens" tabIndex={0}>
            <div className="stage" ref={frame} /></div>
        </div>
        <p className="stage-note">Same original controls in DOM and GPU. On smaller screens, scroll the studio horizontally. No data is sent or stored.</p>
      </section>
      <section className="about" id="about"><p className="eyebrow">AN HONEST EXPERIMENT</p><h2>Progressive presentation, not pretend compatibility.</h2>
        <div className="about-grid">
          <div><h3>What it is</h3><p>CanvasSPA layers GPU presentation over React's original controls. The examples use the public Surface, Box, Presence, motion and effect APIs. Typed layout and appearance compile to browser CSS; the browser still owns layout and editing.</p></div>
          <div><h3>What it needs</h3><p>Ordinary DOM works by default. Experimental GPU needs a compatible browser with HTML-in-Canvas and native geometry support. Missing capabilities are diagnosed, not disguised. Decorative shaders never replace essential controls.</p></div>
          <div><h3>What it is not</h3><p>This is a prepared showcase, not a production certification or a published library. Accessibility, physical-device and broader browser qualification remain open. Your reduced-motion preference is respected.</p></div>
        </div>
      </section>
    </main>
    <footer><span><span className="brand-mark small" aria-hidden="true"><i /><i /><i /></span>CanvasSPA / Example studio</span><span>Built with React. Still an experiment.</span></footer>
  </>;
}

/** Purely decorative hero illustration: three "layers" of a UI floating above a GPU glow. */
function HeroVisual() {
  return <div className="hero-visual" aria-hidden="true">
    <div className="hv-glow" />
    <div className="hv-grid" />
    <div className="hv-layer hv-art"><i className="sun" /><i className="hill one" /><i className="hill two" /></div>
    <div className="hv-layer hv-card"><span className="hv-kicker">A NOTE FROM YOUR STUDIO</span><span className="hv-title">Greetings from the GPU</span>
      <span className="hv-line" /><span className="hv-line short" /><span className="hv-stamp" /></div>
    <div className="hv-layer hv-form"><span className="hv-label">Postcard title</span><span className="hv-input">Greetings from the GPU<i className="caret" /></span>
      <span className="hv-chips"><i /><i /><i /><i /></span><span className="hv-button">Save postcard</span></div>
    <span className="hv-tag t1">&lt;input&gt;</span><span className="hv-tag t2">transitionGroup()</span><span className="hv-tag t3">WGSL</span>
  </div>;
}

declare global {
  interface Window { showcase: { state(): ReturnType<CanvasController["state"]>; controller: CanvasController; react: string; reactDOM: string } }
}
createRoot(document.getElementById("app")!).render(<App />);
