/**
 * What a visitor's browser can do, judged without starting the GPU: GPU mode itself
 * is still proven by admission when they press Enable. This only decides what to
 * explain up front.
 */
export type Support = "likely" | "chrome-flags" | "unsupported";

export function detectSupport(): Support {
  const canvas = HTMLCanvasElement.prototype as unknown as Record<string, unknown>;
  const htmlInCanvas = "content" in canvas && typeof canvas.requestPaint === "function" && typeof canvas.updateElementGeometry === "function";
  if (htmlInCanvas && "gpu" in navigator) return "likely";
  const brands = (navigator as Navigator & { userAgentData?: { brands: { brand: string }[] } }).userAgentData?.brands ?? [];
  const chromium = brands.some(entry => /Chrom/.test(entry.brand)) || /Chrome\//.test(navigator.userAgent);
  return chromium ? "chrome-flags" : "unsupported";
}

export const flags = [
  { url: "chrome://flags/#canvas-draw-element" },
  { url: "chrome://flags/#enable-experimental-web-platform-features" },
] as const;

interface Explanation { title: string; hint?: string }
/** Plain-language explanations of runtime reasons; the raw reason stays available as details. */
const known: [RegExp, Explanation][] = [
  [/^Current content=drawable/, { title: "GPU mode is on.", hint: "Every control is still the original React element." }],
  [/Ordinary DOM startup/, { title: "Ordinary DOM is ready.", hint: "GPU mode is experimental and starts only when you enable it." }],
  [/Explicit disable/, { title: "Back in ordinary DOM.", hint: "Same controls, same state. Enable GPU again whenever you like." }],
  [/canvas\.content|requestPaint|updateElementGeometry|drawElementImageToTexture unavailable|getElementImageDefaultSize/, {
    title: "This browser doesn't have HTML-in-Canvas.", hint: "GPU mode needs Chrome Canary with the two flags in the steps above. The examples keep working as ordinary DOM." }],
  [/WebGPU unavailable|requestAdapter|No WebGPU/, { title: "WebGPU isn't available.", hint: "Check chrome://gpu and make sure hardware acceleration is on." }],
  [/inside the viewport|explicitly enable again when visible/, { title: "Scroll the stage into view, then enable again.", hint: "The GPU check draws and clicks a tiny probe inside the visible stage." }],
  [/probe failed|hit testing/, { title: "The GPU check couldn't confirm clicks would land correctly.", hint: "Make sure nothing covers the stage, then try again. If it keeps failing, please report your browser build." }],
  [/device lost/i, { title: "The GPU reset.", hint: "This is usually temporary: enable GPU again." }],
  [/paint timed out/, { title: "The browser stopped drawing the stage for a moment.", hint: "Enable GPU again." }],
  [/compilation failed/, { title: "A shader didn't compile.", hint: "The example stays usable in ordinary DOM." }],
  [/Editable\/top-layer/, { title: "An editable region or dialog needs ordinary DOM.", hint: "Close it, then enable GPU again." }],
  [/Pending cleanup|cleanup pending/i, { title: "Finishing GPU cleanup…", hint: "Enable becomes available again in a moment." }],
  [/disposed/i, { title: "This example is disposed.", hint: "Reload the page to start a fresh session." }],
];
export function explain(reason: string): Explanation {
  return known.find(([pattern]) => pattern.test(reason))?.[1] ?? { title: reason };
}
