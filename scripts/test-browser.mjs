import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const cli = fileURLToPath(new URL("./cli.js", import.meta.resolve("@playwright/test/package.json")));
const child = spawn(process.execPath, [cli, "test", ...process.argv.slice(2)], { stdio: "inherit" });
const code = await new Promise(resolve => {
  child.once("error", error => { console.error("Browser test runner failed:", error); resolve(1); });
  child.once("exit", (code, signal) => {
    if (signal) console.error(`Browser test runner terminated by ${signal}`);
    resolve(code ?? 1);
  });
});
await import("./sanitize-evidence.mjs");
process.exitCode = code;
