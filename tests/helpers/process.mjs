// Cross-platform process helpers. On Windows `npm` is npm.cmd, which Node cannot spawn without a shell,
// so npm invocations go through the shell with arguments quoted explicitly.
import { devNull } from "node:os";

export { devNull };
const needsShell = command => process.platform === "win32" && /^(npm|npx)(\.cmd)?$/i.test(command);
const quote = value => (/^[\w@%+=:,./\-]+$/.test(value) ? value : `"${String(value).replaceAll('"', '\\"')}"`);

// withPlatform(command, args, options) -> [command, args, options] suitable for spawn/execFileSync/spawnSync.
export function withPlatform(command, args = [], options = {}) {
  if (!needsShell(command)) return [command, args, options];
  return [command, args.map(quote), { ...options, shell: true }];
}
