/**
 * Integration fixture application for the CSS compiler. The bundler (Vite or webpack, driven by
 * `scripts/compiler-validation.mjs`) builds it with the compiler adapter, then the script drives the page
 * through `window.compilerDemo`. It mounts the packaged card with `mountCanvasApp`, enrolls it with the
 * compiled animation and records observations (commit count, input identity, focus, selection) that show the
 * original React controls survive GPU enable, disable and dispose.
 */
import { createElement, useLayoutEffect, useRef } from "react";
import { Card } from "@underglass/fixture-card";
import styles from "@underglass/fixture-card/styles.scss";
import { mountCanvasApp, useSurfaceRef } from "@underglass/react";
import compiled from "virtual:underglass/compiled";

// With webpack the stylesheet import is css-loader's array export, which nothing injects, so the app adds
// the `<style>` element itself (see the README).
if (Array.isArray(styles)) {
  const sheet = document.createElement("style");
  sheet.textContent = styles.toString();
  document.head.append(sheet);
}
// css-loader's array export carries the class map on `locals`; otherwise the import is the class map.
const className = styles.locals?.card ?? styles.card;
// `commits` counts renders of the card; the originals are the elements captured on first layout.
let commits = 0, controller, playback, originalInput, originalRoot;
function App() {
  const ref = useSurfaceRef({ id: "card" });
  const captured = useRef(false);
  // Remember the original input and root so the script can check React did not replace them.
  useLayoutEffect(() => {
    if (!captured.current) {
      originalInput = document.querySelector("#input");
      originalRoot = document.querySelector("#card").parentElement;
      captured.current = true;
    }
  }, []);
  return createElement(Card, { ref, className, onCommit: () => commits++ });
}
const status = document.querySelector("#status");
window.compilerMessages = [];
// `compiled` is the generated program set; the three hosts come from the fixture page.
controller = mountCanvasApp({
  ordinaryHost: document.querySelector("#ordinary"), captureHost: document.querySelector("#capture"),
  outputCanvas: document.querySelector("#gpu"), compiled,
  admissionPolicy: "explicit",
  budgets: { layers: 2, pixels: 1_000_000 }, onStatus: message => { status.textContent = message; window.compilerMessages.push(message); },
}, createElement(App));
// Takes ownership of the browser animation as a paused, rewound compiled animation before GPU is enabled,
// and records what the DOM looks like at that point.
async function enable() {
  playback = controller.ownCompiledAnimation("card", "card/float");
  playback.pause(); playback.seek(0);
  window.compilerDemo.prepared = {
    state: controller.state(),
    name: document.querySelector("#card").style.animationName,
    computed: getComputedStyle(document.querySelector("#card")).animationName,
    sources: document.querySelector("#card").getAnimations().map(value => ({ name: value.animationName, target: value.effect?.target?.id, state: value.playState })),
  };
  return controller.enable();
}
document.querySelector("#enable").onclick = () => enable().catch(error => { status.textContent = String(error); console.error(error); });
document.querySelector("#disable").onclick = () => controller.disable().catch(error => console.error(error));
document.querySelector("#dispose").onclick = () => controller.dispose().catch(error => console.error(error));
// The page script reads and drives the app through this object.
window.compilerDemo = {
  controller, compiled, enable, playback: () => playback,
  state: () => ({ ...controller.state(), commits,
    sameInput: document.querySelector("#input") === originalInput,
    sameRoot: document.querySelector("#card")?.parentElement === originalRoot,
    value: document.querySelector("#input")?.value, saved: document.querySelector("#saved")?.textContent,
    focus: document.activeElement?.id,
    selection: [originalInput.selectionStart, originalInput.selectionEnd],
  }),
};
