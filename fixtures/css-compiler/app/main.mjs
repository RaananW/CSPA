import { createElement, useLayoutEffect, useRef } from "react";
import { Card } from "@canvas-spa/fixture-card";
import styles from "@canvas-spa/fixture-card/styles.scss";
import { mountCanvasApp, useSurfaceRef } from "@canvas-spa/react";
import compiled from "virtual:canvas-spa/compiled";

if (Array.isArray(styles)) {
  const sheet = document.createElement("style");
  sheet.textContent = styles.toString();
  document.head.append(sheet);
}
const className = styles.locals?.card ?? styles.card;
let commits = 0, controller, playback, originalInput, originalRoot;
function App() {
  const ref = useSurfaceRef({ id: "card" });
  const captured = useRef(false);
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
controller = mountCanvasApp({
  ordinaryHost: document.querySelector("#ordinary"), captureHost: document.querySelector("#capture"),
  outputCanvas: document.querySelector("#gpu"), compiled,
  admissionPolicy: "explicit",
  budgets: { layers: 2, pixels: 1_000_000 }, onStatus: message => { status.textContent = message; window.compilerMessages.push(message); },
}, createElement(App));
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
