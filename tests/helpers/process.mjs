// Cross-platform process helpers. On Windows `npm` is npm.cmd, which Node cannot spawn without a shell,
// so npm invocations go through the shell with arguments quoted explicitly.
import { devNull } from "node:os";
import { isAbsolute, relative, sep } from "node:path";

// Re-exported so callers can point npm's user config at the null device without importing node:os.
export { devNull };
// Only npm and npx need a shell, and only on Windows (their .cmd shims cannot be spawned directly).
const needsShell = command => process.platform === "win32" && /^(npm|npx)(\.cmd)?$/i.test(command);
// Quotes an argument for the shell unless it only contains characters that are safe unquoted.
const quote = value => (/^[\w@%+=:,./\-]+$/.test(value) ? value : `"${String(value).replaceAll('"', '\\"')}"`);

// tar arguments that work with bsdtar and with Git Bash's GNU tar on Windows: absolute paths become
// forward-slash paths relative to the working directory, because GNU tar reads "D:" as a remote host.
export function tarArgs(args, cwd = process.cwd()) {
  return args.map(arg => isAbsolute(arg) ? (relative(cwd, arg) || ".").split(sep).join("/") : arg);
}

// withPlatform(command, args, options) -> [command, args, options] suitable for spawn/execFileSync/spawnSync.
export function withPlatform(command, args = [], options = {}) {
  if (!needsShell(command)) return [command, args, options];
  return [command, args.map(quote), { ...options, shell: true }];
}
