export function showcaseBase(value = "/CSPA/") {
  if (!/^\/(?:[A-Za-z0-9_-]+\/)*$/.test(value)) {
    throw new Error("CANVAS_SHOWCASE_BASE must be / or an absolute directory path ending in /");
  }
  return value;
}
