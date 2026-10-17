/**
 * The CSS side of the Phase I1 prototype page: the custom properties every presentation's stylesheet reads
 * (`ui-proto-instrument.html`), resolved from the same tokens as the meshes. Colours are `r g b` triples. Shadows use
 * Strata's one formula (design language section 7): offset `−light.xy / light.z · h`, blur `1.9 · h + 1`, strength
 * `shadow.strength`, plus a contact line where a part meets its surface. Throwaway prototype code.
 */
import { contrast } from "@underglass/ui/tokens";
import { materials, type ResolvedTokens } from "./instrument-tokens.ts";

type Rgb = readonly [number, number, number];
const triple = (colour: Rgb) => colour.map(Math.round).join(" ");
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** Direction towards the key light in panel axes (x right, y down, z towards the viewer). */
export function lightVector(azimuth: number, elevation: number): [number, number, number] {
  const a = (azimuth * Math.PI) / 180, e = (elevation * Math.PI) / 180;
  return [Math.sin(a) * Math.cos(e), -Math.cos(a) * Math.cos(e), Math.sin(e)];
}

/** The CSS custom properties for `tokens`, on the root of the page. */
export function cssVariables(tokens: ResolvedTokens, stage: Rgb, pageText: Rgb): Record<string, string> {
  const [lx, ly, lz] = lightVector(tokens.light.azimuth, tokens.light.elevation);
  const strength = tokens.shadow.strength;
  /** A part `h` px above the surface it stands on: its cast shadow and its contact line. */
  const shadow = (h: number, extra = 1) => h <= 0 ? "none"
    : `${(-lx / lz * h).toFixed(2)}px ${(-ly / lz * h).toFixed(2)}px ${(1.9 * h + 1).toFixed(2)}px rgb(0 0 0 / ${(strength * extra).toFixed(3)}), 0 0 0.6px rgb(0 0 0 / ${(0.5 * strength + 0.12).toFixed(3)})`;
  const cap = materials[tokens.materials.cap], skirt = materials[tokens.materials.skirt], plate = materials[tokens.materials.plate];
  const { knob, fader, slide, rocker, bat, wall, button } = tokens;
  // Spun (circular brushed) tops show a bow-tie highlight along the light axis; smooth ones a soft gloss spot.
  const capTop = cap.brush > 0
    ? `repeating-radial-gradient(circle, rgb(255 255 255 / 0.05) 0 0.6px, rgb(0 0 0 / 0.05) 0.6px 1.4px), conic-gradient(from 323deg, rgb(${triple(mix(cap.css.base, cap.css.light, 0.55))}), rgb(${triple(cap.css.base)}) 45deg, rgb(${triple(mix(cap.css.base, cap.css.shade, 0.35))}) 90deg, rgb(${triple(cap.css.base)}) 135deg, rgb(${triple(mix(cap.css.base, cap.css.light, 0.45))}) 180deg, rgb(${triple(cap.css.base)}) 225deg, rgb(${triple(mix(cap.css.base, cap.css.shade, 0.35))}) 270deg, rgb(${triple(cap.css.base)}) 315deg, rgb(${triple(mix(cap.css.base, cap.css.light, 0.55))}))`
    : `radial-gradient(circle at 34% 26%, rgb(255 255 255 / ${(0.32 * cap.css.gloss).toFixed(3)}), rgb(255 255 255 / 0) 46%), linear-gradient(160deg, rgb(${triple(mix(cap.css.base, cap.css.light, 0.25))}), rgb(${triple(cap.css.base)}) 50%, rgb(${triple(mix(cap.css.base, cap.css.shade, 0.4))}))`;
  const capSide = `repeating-linear-gradient(90deg, rgb(255 255 255 / ${(0.05 * cap.brush).toFixed(3)}) 0 1px, rgb(0 0 0 / ${(0.04 * cap.brush).toFixed(3)}) 1px 2.5px), linear-gradient(180deg, rgb(${triple(mix(cap.css.base, cap.css.light, 0.6))}), rgb(${triple(cap.css.base)}) 35%, rgb(${triple(cap.css.base)}) 70%, rgb(${triple(mix(cap.css.base, cap.css.shade, 0.6))}))`;
  // The faceplate: brushed hairlines in three periods (so they never read as stripes) and a soft sheen.
  const g = plate.plate.grain;
  const grain = g > 0
    ? `repeating-linear-gradient(0deg, rgb(255 255 255 / ${(g * 0.9).toFixed(3)}) 0 1px, rgb(255 255 255 / 0) 1px 3px), repeating-linear-gradient(0deg, rgb(0 0 0 / ${(g * 0.7).toFixed(3)}) 0 1px, rgb(0 0 0 / 0) 1px 7px), repeating-linear-gradient(0deg, rgb(255 255 255 / ${(g * 0.6).toFixed(3)}) 0 2px, rgb(255 255 255 / 0) 2px 13px)`
    : "linear-gradient(transparent, transparent)";
  const dark = contrast([...plate.plate.base] as [number, number, number], [0, 0, 0]) < contrast([...plate.plate.base] as [number, number, number], [255, 255, 255]);
  const leverLength = (bat.length - bat.pivot) * Math.sin(bat.throw) + bat.ball;
  return {
    "--ip-stage": `rgb(${triple(stage)})`, "--ip-page-text": `rgb(${triple(pageText)})`, "--ip-page-muted": `rgb(${triple(mix(pageText, stage, 0.35))})`,
    "--ip-plate": triple(plate.plate.base), "--ip-plate-light": triple(mix(plate.plate.base, [255, 255, 255], 0.35)), "--ip-plate-shade": triple(mix(plate.plate.base, [0, 0, 0], 0.25)),
    "--ip-plate-grain": grain, "--ip-plate-sheen": dark ? "0.05" : "0.07", "--ip-cut-light": dark ? "0.08" : "0.5",
    "--ip-ink": triple(plate.plate.ink), "--ip-muted": triple(plate.plate.muted), "--ip-slot": dark ? "4 4 6" : "18 19 22",
    "--ip-accent": triple(tokens.accent), "--ip-ring-off": "0.35",
    "--ip-cap": triple(cap.css.base), "--ip-cap-light": triple(cap.css.light), "--ip-cap-shade": triple(cap.css.shade), "--ip-cap-ink": triple(cap.ink),
    "--ip-cap-top": capTop, "--ip-cap-side": capSide,
    "--ip-skirt": triple(skirt.css.base), "--ip-skirt-light": triple(skirt.css.light), "--ip-skirt-shade": triple(skirt.css.shade),
    "--ip-chamfer": `${knob.chamfer}px`,
    "--ip-sh-panel": shadow(8 * tokens.depthScale), "--ip-sh-skirt": shadow(knob.skirtHeight + knob.capHeight * 0.4),
    "--ip-sh-cap": shadow(knob.capHeight, 0.8), "--ip-sh-carriage": shadow(fader.height), "--ip-sh-block": shadow(slide.height),
    "--ip-sh-bezel": shadow(rocker.bezelHeight), "--ip-sh-paddle": shadow(rocker.end, 0.7), "--ip-sh-nut": shadow(bat.bushingHeight),
    "--ip-sh-lever": shadow(bat.length * 0.6, 0.8), "--ip-sh-wallplate": shadow(wall.plateHeight), "--ip-sh-wallpaddle": shadow(wall.paddleHeight, 0.7),
    "--ip-sh-button": shadow(button.height), "--ip-sh-button-pressed": shadow(button.height - button.travel),
    "--ip-rocker-on": `${(-Math.atan((rocker.end - rocker.centre) / (rocker.paddle[1] / 2)) * 180 / Math.PI).toFixed(2)}deg`,
    "--ip-rocker-off": `${(Math.atan((rocker.end - rocker.centre) / (rocker.paddle[1] / 2)) * 180 / Math.PI).toFixed(2)}deg`,
    "--ip-wall-on": `${(-wall.throw * 180 / Math.PI * 2).toFixed(2)}deg`, "--ip-wall-off": `${(wall.throw * 180 / Math.PI * 2).toFixed(2)}deg`,
    "--ip-lever": `${leverLength.toFixed(2)}px`,
  };
}
