import { useCallback, useEffect, useRef, useState } from "react";
import { Surface, defineEffect, type EffectDescriptor } from "@canvas-spa/react";
import { Panel, describe, useReducedMotion } from "./shared";
import { policy, residentChain, useScene, useSceneArt } from "./scene";

/** The pond occupies the decorative art layer; everything inside it is refracted together. */
const POND = { x: 378, y: 28, width: 642, height: 644 };
/** The lily pad floats over the pond as its own native layer. */
const PAD = { x: 742, y: 438, width: 196, height: 118 };
const padCentre = { x: PAD.x - POND.x + PAD.width / 2, y: PAD.y - POND.y + PAD.height / 2 };

/**
 * Trusted local WGSL colour function for the water: caustic light, depth tint and
 * moving glints over whatever the pond layer rendered (floor, text, fish and the
 * mirrored camera image). Every term scales with a parameter, so zeros are identity.
 */
export const pondWater = defineEffect({
  name: "showcase-pond",
  parameters: { depth: { min: 0, max: 1 }, caustics: { min: 0, max: 1 }, speed: { min: 0, max: 3 }, glint: { min: 0, max: 1 } },
  geometry: "color", bounds: "layer", capabilities: ["webgpu"],
  wgsl: `
    let uv = local / max(extent, vec2f(1.0));
    let t = seconds * parameters.z;
    let p = local * 0.032;
    let wave = (sin(p.x * 1.7 + t * 1.3 + sin(p.y * 1.1 - t))
      + sin(p.y * 1.9 - t * 1.1 + sin(p.x * 0.9 + t * 0.7))
      + sin((p.x + p.y) * 1.3 + t * 0.8)) / 3.0;
    let caustic = pow(1.0 - abs(wave), 6.0) * parameters.y;
    let deep = vec3f(0.02, 0.2, 0.24);
    let depth = parameters.x * (0.3 + 0.45 * uv.y);
    let tinted = mix(color.rgb, color.rgb * vec3f(0.55, 0.86, 0.9) + deep * 0.5, depth);
    let rim = smoothstep(0.0, 0.22, min(min(uv.x, uv.y), min(1.0 - uv.x, 1.0 - uv.y)));
    let sparkle = max(0.0, sin(p.x * 2.3 + t * 1.7) * sin(p.y * 2.9 - t * 1.2) * wave);
    let glint = parameters.w * pow(sparkle, 8.0) * 0.9;
    return vec4f(tinted + vec3f(0.78, 0.96, 1.0) * (caustic * 0.5 + glint) * (0.35 + 0.65 * rim), color.a);`,
});

interface Fish { id: number; x: number; y: number; angle: number; hue: number; size: number }
const fishHues = [18, 32, 0, 42, 24, 8];
const degrees = (y: number, x: number) => Math.atan2(y, x) * 180 / Math.PI;
function wander(fish: Fish, fed: boolean): Fish {
  if (!fed) {
    const target = { x: 70 + Math.random() * (POND.width - 140), y: 90 + Math.random() * (POND.height - 200) };
    return { ...fish, ...target, angle: degrees(target.y - fish.y, target.x - fish.x) };
  }
  // Fed fish gather in a slowly turning ring just outside the lily pad, so they stay
  // visible beside it instead of hiding underneath; once there they face the pad.
  const around = fish.id / fishHues.length * Math.PI * 2 + Date.now() / 6000;
  const target = { x: padCentre.x + Math.cos(around) * (PAD.width / 2 + 40), y: padCentre.y + Math.sin(around) * (PAD.height / 2 + 32) };
  const far = Math.hypot(target.x - fish.x, target.y - fish.y) > 120;
  const angle = far ? degrees(target.y - fish.y, target.x - fish.x) : degrees(padCentre.y - target.y, padCentre.x - target.x);
  return { ...fish, ...target, angle };
}

type CameraState = "off" | "starting" | "on" | "error";

export function WebcamPond() {
  const scene = useScene();
  const reduced = useReducedMotion();
  const [camera, setCamera] = useState<CameraState>("off");
  const [stream, setStream] = useState<MediaStream>();
  const [message, setMessage] = useState("Nothing here leaves your device");
  const [calm, setCalm] = useState(3);
  const [reflection, setReflection] = useState(0.55);
  const [caustics, setCaustics] = useState(0.5);
  const [fed, setFed] = useState(false);
  const [xray, setXray] = useState(false);
  const [feedback, setFeedback] = useState("Start the camera to see yourself in the water, or just watch the fish.");
  const [fish, setFish] = useState<Fish[]>(() => fishHues.map((hue, id) => wander({ id, x: POND.width / 2, y: POND.height / 2, angle: 0, hue, size: 0.8 + (id % 3) * 0.18 }, false)));
  const streamRef = useRef<MediaStream | undefined>(undefined);

  const stop = useCallback(() => {
    for (const track of streamRef.current?.getTracks() ?? []) track.stop();
    streamRef.current = undefined;
    setStream(undefined);
  }, []);
  useEffect(() => stop, [stop]);

  async function start() {
    if (!navigator.mediaDevices?.getUserMedia) { setCamera("error"); setFeedback("This browser does not offer camera access here."); return; }
    setCamera("starting");
    setFeedback("Your browser asks for permission. The image stays in this tab.");
    try {
      const media = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" }, audio: false });
      streamRef.current = media;
      setStream(media);
      setCamera("on");
      setFeedback("Camera on. Your reflection is drawn into the pond on this device only.");
    } catch (error) {
      setCamera("error");
      setFeedback(`No camera: ${describe(error)}. The pond works without it.`);
    }
  }
  function stopCamera() {
    stop();
    setCamera("off");
    setFeedback("Camera off. The stream was stopped, not paused.");
  }

  // Fish swim between targets; CSS transitions inside the decorative pond layer animate them.
  useEffect(() => {
    if (reduced) return;
    const timer = setInterval(() => setFish(list => list.map(item => Math.random() < 0.45 || fed ? wander(item, fed) : item)), 1600);
    return () => clearInterval(timer);
  }, [fed, reduced]);
  useEffect(() => { setFish(list => list.map(item => wander(item, fed))); }, [fed]);

  // Water: a continuous ripple refracts everything in the pond, then the custom water
  // shader adds caustics, depth and glints. Every update carries the same running
  // clock, so changing a setting or the splash strength never restarts the wave.
  const clock = useRef(performance.now());
  const settings = useRef({ calm, caustics, reduced });
  settings.current = { calm, caustics, reduced };
  const splash = useRef<number | undefined>(undefined);
  const water = useCallback((amplitude: number) => {
    const time = { seconds: (performance.now() - clock.current) / 1000 % 1000, playing: !settings.current.reduced };
    const chain: EffectDescriptor[] = [
      { kind: "ripple", parameters: { amplitude: Math.min(12, Math.max(0, amplitude)) }, time: { ...time }, ...policy },
      { kind: "custom", definition: pondWater, parameters: { depth: 0.75, caustics: settings.current.caustics, speed: 1, glint: 0.8 }, time: { ...time }, ...policy },
    ];
    scene.setChain(chain);
  }, [scene]);
  useEffect(() => { if (splash.current === undefined) water(calm); }, [water, calm, caustics, reduced]);
  useEffect(() => () => {
    if (splash.current !== undefined) cancelAnimationFrame(splash.current);
    splash.current = undefined;
    scene.setChain(residentChain());
  }, [scene]);
  /** A pebble: the ripple rises quickly to a splash, then eases back to the calm water. */
  function dropPebble() {
    if (settings.current.reduced) { setFeedback("Reduced motion is on, so the water stays still."); return; }
    if (splash.current !== undefined) cancelAnimationFrame(splash.current);
    const started = performance.now(), rise = 0.14, peak = 12;
    const step = () => {
      const t = (performance.now() - started) / 1000;
      const envelope = t < rise ? Math.sin(t / rise * Math.PI / 2) : Math.exp(-(t - rise) * 2.1);
      const { calm } = settings.current;
      if (t > rise && envelope < 0.01) { splash.current = undefined; water(calm); return; }
      water(calm + (peak - calm) * envelope);
      splash.current = requestAnimationFrame(step);
    };
    splash.current = requestAnimationFrame(step);
    setFeedback("Plop. The pebble's ripple bends everything under the surface, your reflection included.");
  }

  useSceneArt(() => ({ layout: { ...POND, overflow: "hidden" }, appearance: { background: "rgb(16,58,62)", radius: 44 },
    content: <PondFloor message={message} stream={stream} reflection={reflection} fish={fish} xray={xray} /> }), [message, stream, reflection, fish, xray]);

  return <>
    <Panel tone="dark" label="STUDIO 06" title="Webcam pond">
      <p className="privacy" role="note"><strong>Camera stays on your device.</strong> The video is drawn into this page only:
        nothing is recorded, uploaded or sent to any server. Stop, or leaving this example, turns it off.</p>
      <div className="inline-row">
        {camera === "on"
          ? <button type="button" onClick={stopCamera}>Stop camera</button>
          : <button type="button" className="primary" disabled={camera === "starting"} onClick={() => void start()}>Start camera</button>}
        <button type="button" onClick={dropPebble}>Drop a pebble</button>
      </div>
      <div className="field">
        <label htmlFor="pond-message">Write on the pond floor</label>
        <input id="pond-message" maxLength={40} value={message} onChange={event => setMessage(event.target.value)} autoComplete="off" />
      </div>
      <PondSlider label="Ripple" value={calm} min={0} max={6} step={0.5} unit="px" onChange={setCalm} />
      <PondSlider label="Reflection" value={reflection} min={0} max={1} step={0.05} percent onChange={setReflection} />
      <PondSlider label="Caustics" value={caustics} min={0} max={1} step={0.05} percent onChange={setCaustics} />
      <label className="check xray"><input type="checkbox" checked={xray} onChange={event => {
        setXray(event.target.checked);
        setFeedback(event.target.checked ? "X-ray on: koi are <span>s, the text a <p>, pebbles <i>s, all still refracted." : "X-ray off.");
      }} />X-ray: show the HTML under the water</label>
      <output id="studio-feedback" role="status">{feedback}</output>
      <p className="panel-note">{reduced ? "Reduced motion is on: the water and fish hold still."
        : "Every koi is a plain <span> styled with CSS: no images or canvas. The water is a shader over that HTML."}</p>
    </Panel>
    <Surface id="showcase-card" className="lily-pad" aria-label="Lily pad" origin="center"
      layout={{ ...PAD, padding: 16, direction: "column", gap: 8 }} transform={{ rotation: -7 }}
      appearance={{ background: "rgb(74,150,84)", color: "rgb(240,255,236)", radius: 60, fontSize: 13 }}>
      <span className="pad-label">Lily pad · native buttons</span>
      <button type="button" onClick={() => { setFed(value => !value); setFeedback(fed ? "The fish wander off again." : "The fish gather around the lily pad."); }}>
        {fed ? "Let them roam" : "Feed the fish"}</button>
    </Surface>
  </>;
}

/** Everything under (and reflected on) the water: one decorative, inert subtree. */
function PondFloor({ message, stream, reflection, fish, xray }: { message: string; stream?: MediaStream; reflection: number; fish: Fish[]; xray: boolean }) {
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const element = video.current;
    if (!element) return;
    element.srcObject = stream ?? null;
    if (stream) void element.play().catch(() => {});
  }, [stream]);
  return <div className={`pond ${xray ? "xray" : ""}`}>
    <div className="pond-floor"><i /><i /><i /><i /><i /><i /><i /></div>
    <p className="pond-message">{message || " "}</p>
    {fish.map(item => <span key={item.id} className="koi" style={{ left: item.x, top: item.y,
      ["--angle" as string]: `${item.angle}deg`, ["--hue" as string]: item.hue, ["--size" as string]: item.size }}><i />
      {xray && <b className="html-tag">{"<span>"}</b>}</span>)}
    {xray && stream && <b className="html-tag video-tag">{"<video> your mirrored camera"}</b>}
    <video ref={video} className="pond-reflection" muted playsInline style={{ opacity: stream ? reflection : 0 }} />
    <div className="pond-sky" style={{ opacity: stream ? 0 : reflection * 0.8 }} />
  </div>;
}

function PondSlider({ label, value, min, max, step, unit = "", percent = false, onChange }: {
  label: string; value: number; min: number; max: number; step: number; unit?: string; percent?: boolean; onChange(value: number): void;
}) {
  const id = `pond-${label.toLowerCase()}`;
  return <label className="range" htmlFor={id}>
    <span className="field-row"><span>{label}</span><span className="count">{percent ? `${Math.round(value * 100)}%` : `${value} ${unit}`}</span></span>
    <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={event => onChange(Number(event.target.value))} />
  </label>;
}
