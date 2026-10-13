import { symlink } from "node:fs/promises";

// Creating symlinks on Windows needs Developer Mode or elevation. When that privilege is missing the
// symlink-specific assertions cannot run; mark the test skipped with the reason (never silently pass).
export async function symlinkOrSkip(t, target, path, type) {
  try {
    await symlink(target, path, type);
    return true;
  } catch (error) {
    if (process.platform === "win32" && (error.code === "EPERM" || error.code === "EACCES")) {
      t.skip(`symlink creation not permitted on Windows without Developer Mode/elevation (${error.code})`);
      return false;
    }
    throw error;
  }
}
