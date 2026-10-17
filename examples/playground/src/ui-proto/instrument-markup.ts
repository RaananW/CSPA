/**
 * The chassis panel's markup for the Phase I1 prototype page (`ui-proto-instrument.html`): one function renders the
 * same native controls, printed labels and scales, and decoration for each presentation, with ids suffixed per copy.
 * - Native controls: two knobs (`<input type="range">`, one continuous, one detented), a vertical fader (a vertical
 *   range input), four switches (`<input type="checkbox" role="switch">`: slide, rocker, bat, wall) and an illuminated
 *   push button (`<button aria-pressed>`) whose label sits on its cap. Each native box covers its object's whole travel.
 * - Print (`.ip-print`): legends, scales and state marks on the faceplate, the same in every presentation.
 * - Decoration (`aria-hidden`): `.ip-deco` parts the Instrument meshes draw instead (hidden there), `.ip-css-only`
 *   parts only the CSS rendering draws, and `.ip-objects-only` parts only the Objects level draws (its domes and
 *   slots). The Objects copy carries `data-strata-face` markers for `@underglass/ui/gpu`.
 * Throwaway prototype code.
 */
import type { ResolvedTokens } from "./instrument-tokens.ts";

export type Level = "instrument" | "objects" | "css";
/** Native control states, shared by the three copies. */
export interface ControlState { volume: number; input: number; level: number; mute: boolean; power: boolean; phono: boolean; lights: boolean; rec: boolean }
export const initialState: ControlState = { volume: 62, input: 4, level: 72, mute: false, power: true, phono: false, lights: true, rec: false };

const fmt = (value: number) => Number(value.toFixed(2));
/** Ticks and numerals of a knob's printed scale: `count` major positions, `minor` ticks between neighbours. */
function scale(size: number, box: number, count: number, minor: number, numerals: string[] | undefined, sweep: number) {
  const centre = box / 2, r0 = size / 2 + 5, parts: string[] = [];
  const steps = (count - 1) * (minor + 1);
  for (let step = 0; step <= steps; step++) {
    const major = step % (minor + 1) === 0, t = step / steps, degrees = (t - 0.5) * sweep * (180 / Math.PI), length = major ? 6 : 3.5;
    parts.push(`<span class="ip-tick${major ? " ip-tick--major" : ""}" style="left:${centre}px;top:${centre}px;height:${length}px;transform:rotate(${fmt(degrees)}deg) translate(-50%, ${fmt(-(r0 + length))}px)"></span>`);
  }
  numerals?.forEach((text, index) => {
    const t = index / (numerals.length - 1), angle = (t - 0.5) * sweep, r = size / 2 + 20;
    // Whole-pixel boxes, so printed glyphs never straddle device pixels (thin strokes would lose their ink).
    parts.push(`<span class="ip-print ip-numeral" style="left:${Math.round(centre + r * Math.sin(angle)) - 11}px;top:${Math.round(centre - r * Math.cos(angle)) - 7}px">${text}</span>`);
  });
  return parts.join("");
}

/** The panel's inner markup for one presentation. */
export function panelMarkup(level: Level, tokens: ResolvedTokens, state: ControlState): string {
  const id = (name: string) => `${name}-${level}`;
  const face = (value: string, extra = "") => (level === "objects" ? ` data-strata-face="${value}"${extra}` : "");
  const { knob, small, fader, detents } = tokens;
  const knobMarkup = (name: string, legend: string, k: typeof knob, max: number, step: number, value: number, numerals: string[] | undefined, minor: number) => `
    <div class="ip-control ip-knob" data-control="${name}">
      <div class="ip-box ip-dial" style="width:${k.box}px;height:${k.box}px;--ip-v:${value / max}">
        <span class="ip-scale" aria-hidden="true">${scale(k.size, k.box, numerals?.length ?? max + 1, minor, numerals, k.sweep)}</span>
        <span class="ip-deco ip-skirt" aria-hidden="true" style="width:${k.size}px;height:${k.size}px"${face("raised")}><span class="ip-deco ip-cap" style="width:${k.cap}px;height:${k.cap}px"${face("raised", ' data-strata-elevation="floating"')}><span class="ip-pointer"></span></span></span>
        <input class="ip-native" type="range" id="${id(name)}" data-ip="${name === "volume" ? "knob" : "small"}" min="0" max="${max}" step="${step}" value="${value}" aria-valuetext="${name === "volume" ? `${fmt(value / 10)} of 10` : `Position ${value}`}">
      </div>
      <label class="ip-print ip-legend" for="${id(name)}">${legend}</label>
    </div>`;
  const dbMarks = ["+10", "+5", "0", "−5", "−10", "−20", "−40", "−∞"];
  const faderMarkup = `
    <div class="ip-control ip-fader" data-control="level">
      <label class="ip-print ip-legend" for="${id("level")}">Level</label>
      <div class="ip-fader-body">
        <span class="ip-fader-scale" aria-hidden="true" style="height:${fader.travel + fader.length}px">${dbMarks.map((mark, index) => {
          const y = fader.length / 2 + (index / (dbMarks.length - 1)) * fader.travel;
          return `<span class="ip-print ip-db" style="top:${Math.round(y) - 7}px">${mark}</span><span class="ip-tick ip-tick--fader" style="top:${fmt(y)}px"></span>`;
        }).join("")}</span>
        <div class="ip-box" style="width:${fader.box}px;height:${fader.travel + fader.length}px;--ip-v:${state.level / 100}">
          <span class="ip-slot" aria-hidden="true" style="height:${fader.travel + 6}px"></span>
          <span class="ip-deco ip-carriage" aria-hidden="true" style="width:${fader.width}px;height:${fader.length}px;--ip-travel:${fader.travel}px"${face("raised", ' data-strata-elevation="floating"')}><span class="ip-grip"></span></span>
          <input class="ip-native" type="range" id="${id("level")}" data-ip="fader" min="0" max="100" step="0.5" value="${state.level}" aria-orientation="vertical" aria-valuetext="${state.level}%">
        </div>
      </div>
    </div>`;
  const switchMarkup = (name: string, form: "slide" | "rocker" | "bat" | "wall", legend: string, checked: boolean, [width, height]: readonly [number, number], marks: [string, string], deco: string) => `
    <div class="ip-control ip-switch ip-switch--${form}" data-control="${name}">
      <span class="ip-print ip-mark" aria-hidden="true">${marks[0]}</span>
      <div class="ip-box" style="width:${width}px;height:${height}px">
        ${deco}
        <input class="ip-native" type="checkbox" role="switch" id="${id(name)}" data-ip="${form}"${checked ? " checked" : ""}${form === "slide" ? face("well") : ""}>
        ${form === "slide" ? `<span class="ip-objects-only ip-dome"${face("knob")}></span>` : `<span class="ip-objects-only ip-track"></span><span class="ip-objects-only ip-dome"${face("knob")}></span>`}
      </div>
      <span class="ip-print ip-mark" aria-hidden="true">${marks[1]}</span>
      <label class="ip-print ip-legend" for="${id(name)}">${legend}</label>
    </div>`;
  const wallPlate = level === "objects"
    ? `<span class="ip-deco ip-wallplate" aria-hidden="true"${face("raised")}><span class="ip-objects-only ip-track"></span><span class="ip-objects-only ip-dome"${face("knob")}></span></span>`
    : `<span class="ip-deco ip-wallplate" aria-hidden="true"><span class="ip-css-only ip-paddle"></span></span>`;
  const detentNumerals = detents <= 12 ? Array.from({ length: detents }, (_, index) => String(index)) : undefined;
  return `
  <header class="ip-head"><h2 class="ip-print ip-title">Monitor controller</h2><p class="ip-print ip-sub">Premium · Phase I1 prototype · ${level === "instrument" ? "Instrument" : level === "objects" ? "Objects" : "CSS"}</p></header>
  <div class="ip-layout">
    <div class="ip-main">
      <div class="ip-row ip-row--knobs">
        ${knobMarkup("volume", "Volume", knob, 100, 0.1, state.volume, ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10"], 3)}
        ${knobMarkup("input", "Input", small, detents - 1, 1, Math.min(state.input, detents - 1), detentNumerals, 0)}
      </div>
      <div class="ip-row ip-row--switches">
        ${switchMarkup("mute", "slide", "Mute", state.mute, tokens.slide.box, ["<span>Off</span><span>On</span>", ""], `<span class="ip-slot ip-slot--slide" aria-hidden="true"></span><span class="ip-css-only ip-slider" aria-hidden="true"></span>`)}
        ${switchMarkup("power", "rocker", "Power", state.power, tokens.rocker.box, ["On", "Off"], `<span class="ip-css-only ip-bezel" aria-hidden="true"><span class="ip-paddle"></span></span>`)}
        ${switchMarkup("phono", "bat", "Phono", state.phono, tokens.bat.box, ["On", "Off"], `<span class="ip-css-only ip-nut" aria-hidden="true"></span><span class="ip-css-only ip-lever" aria-hidden="true"></span>`)}
        ${switchMarkup("lights", "wall", "Lights", state.lights, tokens.wall.box, ["On", "Off"], wallPlate)}
      </div>
      <div class="ip-row ip-row--buttons">
        <div class="ip-control ip-push" data-control="rec">
          <div class="ip-box" style="width:${tokens.button.box}px;height:${tokens.button.box}px">
            <span class="ip-deco ip-ring" aria-hidden="true"></span>
            <button class="ip-native ip-button" type="button" id="${id("rec")}" data-ip="button" aria-pressed="${state.rec}"${face("raised")}><span class="ip-cap-face"><span class="ip-cap-label">Rec</span></span></button>
          </div>
          <span class="ip-print ip-legend">Record arm</span>
        </div>
        <p class="ip-print ip-note">Labels are printed on the faceplate; the cap carries only a pointer.</p>
      </div>
    </div>
    ${faderMarkup}
  </div>`;
}
