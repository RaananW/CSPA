// Shim so probes import the library's device-loss helpers from a stable local path, not package internals.
export { observeConfiguredDevice, waitForTeardown, type IdleOutcome } from "../../../packages/core/src/device-lifecycle";
