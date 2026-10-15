// Shim so probes import the library's mount boundary from a stable local path, not package internals.
export { createMountBoundary, type MountBoundaryOptions } from "../../../packages/core/src/mount-boundary";
