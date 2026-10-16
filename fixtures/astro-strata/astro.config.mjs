// Astro fixture for the Strata Astro components (`@underglass/ui/astro`): a static page the browser test builds and
// checks. Built into a temporary directory by `tests/browser/ui-astro.test.mjs`; nothing here is published.
export default {
  output: "static",
  // No telemetry or update checks from a test build.
  devToolbar: { enabled: false },
};
