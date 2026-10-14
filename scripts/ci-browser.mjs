// Fetches a Chrome for Testing build (default: Canary) for CI and prints its path.
// Chrome Canary itself is not shipped for Linux; Chrome for Testing publishes the same channel.
//
// Not wired to an npm script or workflow; run it by hand to test against a newer build than the installed
// one (see docs/ci-gpu-runner.md):
//   CANVAS_BROWSER_EXECUTABLE="$(node scripts/ci-browser.mjs)" npm run test:browser
// Input: `CANVAS_CFT_CHANNEL` selects the Chrome for Testing channel (`Stable`, `Beta`, `Dev`, `Canary`).
// Needs network access and `curl`, plus `unzip` (or PowerShell on Windows).
// Output: the build is cached under `.cache/chrome-for-testing/<version>/` and reused when present. The
// executable path is the only line on stdout; the version line goes to stderr so `$(...)` captures the path.
import { execFileSync } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

const channel = process.env.CANVAS_CFT_CHANNEL ?? "Canary";
// Chrome for Testing platform keys; other operating systems leave this undefined and fail below.
const platform = { linux: "linux64", win32: "win64", darwin: process.arch === "arm64" ? "mac-arm64" : "mac-x64" }[process.platform];
const index = await (await fetch("https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions-with-downloads.json")).json();
const build = index.channels[channel];
const download = build?.downloads.chrome.find(entry => entry.platform === platform);
if (!download) throw new Error(`No Chrome for Testing ${channel} build for ${platform}`);
const root = resolve(".cache", "chrome-for-testing", build.version);
const binary = join(root, `chrome-${platform}`, process.platform === "win32" ? "chrome.exe" : process.platform === "darwin"
  ? "Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing" : "chrome");
if (!existsSync(binary)) {
  await mkdir(root, { recursive: true });
  const archive = join(root, "chrome.zip");
  execFileSync("curl", ["-fsSL", "-o", archive, download.url], { stdio: "inherit" });
  // Windows: PowerShell unzips reliably (a Git Bash tar on PATH cannot read zip files or drive paths).
  if (process.platform === "win32") execFileSync("powershell", ["-NoProfile", "-Command", `Expand-Archive -LiteralPath '${archive}' -DestinationPath '${root}' -Force`], { stdio: "inherit" });
  else execFileSync("unzip", ["-q", archive, "-d", root], { stdio: "inherit" });
}
console.error(`Chrome for Testing ${channel} ${build.version} (${platform})`);
console.log(binary);
