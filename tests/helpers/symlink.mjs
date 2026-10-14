/**
 * Test helper for creating symlinks or junctions in a temp directory. Used by the release and showcase
 * unit tests, which assert that symlinks are refused.
 */
import { symlink } from "node:fs/promises";

// Creating symlinks on Windows needs Developer Mode or elevation. When that privilege is missing the
// symlink-specific assertions cannot run; mark the test skipped with the reason (never silently pass).
// Returns true when the link was created and false when the test was skipped; the caller should then return.
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
