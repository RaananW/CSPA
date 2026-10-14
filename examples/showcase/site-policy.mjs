/**
 * Public URL policy for the showcase build. `vite.config.ts` uses it to set the Vite `base`, and
 * `tests/unit/showcase.unit.test.mjs` checks the shapes it accepts and rejects.
 */

/**
 * Returns the Vite `base` path for the showcase. With no value (`CANVAS_SHOWCASE_BASE` unset) it is
 * `/underglass/`, the GitHub Pages project path. An override must be `/` or another absolute
 * directory path ending in `/`, built from letter, digit, `_` and `-` segments. Anything else, such
 * as a full URL, a protocol-relative `//host/`, `..` segments or query and hash characters, throws
 * and fails the build.
 */
export function showcaseBase(value = "/underglass/") {
  if (!/^\/(?:[A-Za-z0-9_-]+\/)*$/.test(value)) {
    throw new Error("CANVAS_SHOWCASE_BASE must be / or an absolute directory path ending in /");
  }
  return value;
}
