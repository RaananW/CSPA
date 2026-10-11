import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { capabilities } from "./native";
import "./style.css";

const capability = capabilities(document.createElement("canvas"));

function App() {
  const [count, setCount] = useState(0);
  const [name, setName] = useState("CanvasSPA");
  const [submitted, setSubmitted] = useState("");
  const [fault, setFault] = useState("");
  return (
    <main>
      <h1>CanvasSPA: Phase 1 feasibility</h1>
      <aside aria-label="Renderer diagnostics" role="status">
        <strong>Renderer: ordinary DOM</strong>
        <p>
          {capability.available
            ? "Native methods detected; the bounded GPU prototype uses the adopted host-owned stable-root fallback."
            : `Native HTML-in-Canvas unavailable: ${capability.missing.join(", ")}.`}
        </p>
        <p>No GPU success is inferred from method availability. React owns this single original DOM tree.</p>
        {fault && <p role="alert">{fault} The existing DOM and editing state remain usable.</p>}
      </aside>
      <section aria-label="DOM baseline">
        <h2>Native controls</h2>
        <p data-testid="greeting">Hello, {name}. Counter: {count}.</p>
        <button onClick={() => setCount((value) => value + 1)}>Increment</button>
        <form onSubmit={(event) => { event.preventDefault(); setSubmitted(name); }}>
          <label htmlFor="name">Name</label>
          <input id="name" value={name} onChange={(event) => setName(event.target.value)} />
          <button type="submit">Submit</button>
        </form>
        <p>Submitted: <output>{submitted || "not yet"}</output></p>
      </section>
      <section aria-label="Failure diagnostics">
        <h2>Explicit initial fallback cases</h2>
        <p>These exercise DOM-mode diagnostics, not recovery from an active GPU application.</p>
        {["unavailable capture", "no GPU", "bad geometry", "timeout", "disposal"].map((reason) => (
          <button key={reason} onClick={() => setFault(`Requested ${reason}: DOM mode retained.`)}>
            Diagnose {reason}
          </button>
        ))}
      </section>
      <p><a href="/probe.html">Isolated native browser experiment</a> (disposable fixtures, not the app)</p>
      <p><a href="/surface.html">Native GPU / stable-root prototype</a> | <a href="/recovery.html">Recovery comparison</a></p>
    </main>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("Application root is missing");
createRoot(root).render(<StrictMode><App /></StrictMode>);
