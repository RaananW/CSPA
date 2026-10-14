/**
 * Runs the Playwright browser suite (`tests/browser/*.test.mjs`) with the repository config, then
 * redacts local paths from the evidence it wrote.
 *
 * Invoked by `npm test`, `npm run test:browser` and the Browser workflow (`.github/workflows/browser.yml`),
 * and by `react-matrix.mjs` and `compiler-validation.mjs` for subsets. Extra arguments (suite file names,
 * `--grep`, `--max-failures=1`, ...) are forwarded to `playwright test`. Browser selection and evidence
 * routing come from the shared helpers (`CANVAS_BROWSER_EXECUTABLE`, `CANVAS_BROWSER_EXTRA_ARGS`,
 * `CANVAS_EVIDENCE_ROOT`, `CANVAS_TEST_PREVIEW_URL`, `CANVAS_TEST_DEV_URL`).
 *
 * Output: Playwright results and JSON report under the evidence root (default
 * `evidence/regression/current`). Exits with Playwright's exit status; a sanitizer failure is a failure.
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

// Resolve Playwright's CLI from the installed package and run it with this Node, so no `npx` or
// platform-specific shell shim is involved.
const cli = fileURLToPath(new URL("./cli.js", import.meta.resolve("@playwright/test/package.json")));
const child = spawn(process.execPath, [cli, "test", "--config", "tests/browser/playwright.config.mjs", ...process.argv.slice(2)], { stdio: "inherit" });
const code = await new Promise(resolve => {
  child.once("error", error => { console.error("Browser test runner failed:", error); resolve(1); });
  child.once("exit", (code, signal) => {
    if (signal) console.error(`Browser test runner terminated by ${signal}`);
    resolve(code ?? 1);
  });
});
// Sanitize even when tests failed, and only then report the runner's status. Importing the module runs
// it; if it throws, the rejected import fails this script.
await import("./sanitize-evidence.mjs");
process.exitCode = code;
