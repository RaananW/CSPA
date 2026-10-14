// Single source of truth for how the harness launches Chrome Canary.
// CANVAS_BROWSER_EXECUTABLE wins; otherwise Playwright's installed "chrome-canary" channel is used.
export const nativeFlags = Object.freeze([
  "--enable-blink-features=CanvasDrawElement,ElementCanvasTransform",
  "--enable-experimental-web-platform-features",
]);
export const disabledNativeFlags = Object.freeze(["--disable-blink-features=CanvasDrawElement,ElementCanvasTransform"]);

// native: true -> enable HTML-in-Canvas flags; false -> explicitly disable them; "none" -> pass neither.
// CANVAS_BROWSER_EXTRA_ARGS adds space-separated flags, e.g. software WebGPU on GPU-less CI runners.
const extraFlags = (process.env.CANVAS_BROWSER_EXTRA_ARGS ?? "").split(/\s+/).filter(Boolean);
export function browserLaunchOptions({ native = true, args = [], ...rest } = {}) {
  const executable = process.env.CANVAS_BROWSER_EXECUTABLE;
  const flags = native === "none" ? [] : native ? [...nativeFlags, ...extraFlags] : [...disabledNativeFlags, ...extraFlags];
  // --enable-automation is required: the identity fixture reads Browser.getBrowserCommandLine.
  return {
    ...(executable ? { executablePath: executable } : { channel: "chrome-canary" }),
    ...rest,
    args: ["--enable-automation", ...flags, ...args],
  };
}
