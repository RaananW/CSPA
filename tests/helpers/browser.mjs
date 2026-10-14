/**
 * Launch options shared by every browser harness. Used by the Playwright config and by scripts that
 * start Chrome Canary directly, so the HTML-in-Canvas flags are defined in one place.
 */
// Single source of truth for how the harness launches Chrome Canary.
// CANVAS_BROWSER_EXECUTABLE wins; otherwise Playwright's installed "chrome-canary" channel is used.
// Flags that turn on the HTML-in-Canvas draw API and the ElementCanvasTransform extension.
export const nativeFlags = Object.freeze([
  "--enable-blink-features=CanvasDrawElement,ElementCanvasTransform",
  "--enable-experimental-web-platform-features",
]);
// Explicitly switches the same features off, for tests that need the unsupported-browser path.
export const disabledNativeFlags = Object.freeze(["--disable-blink-features=CanvasDrawElement,ElementCanvasTransform"]);

// native: true -> enable HTML-in-Canvas flags; false -> explicitly disable them; "none" -> pass neither.
// CANVAS_BROWSER_EXTRA_ARGS adds space-separated flags, e.g. software WebGPU on GPU-less CI runners.
const extraFlags = (process.env.CANVAS_BROWSER_EXTRA_ARGS ?? "").split(/\s+/).filter(Boolean);
/**
 * Builds Playwright launch options for Chrome Canary, or for `CANVAS_BROWSER_EXECUTABLE` when set. `native` selects the flag set (see above),
 * `args` are appended after it and any other options (headless, etc.) pass through unchanged.
 */
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
