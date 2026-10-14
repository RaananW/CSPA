/**
 * Browser check that the generated JS sampler matches what the browser computes for the same CSS. Run by
 * `scripts/compiler-validation.mjs`. Not a unit test.
 */
import assert from "node:assert/strict";

/**
 * For each fixture (`{ label, css, source, times }`) injects the CSS into `page`, seeks the real
 * `CSSAnimation` to each time and compares the computed matrix and opacity with the generated sampler.
 * Throws on the first mismatch and returns `{ cases, comparisons }`: per-fixture results (comparison count,
 * maximum errors, clock diagnostics) and the total number of comparisons.
 */
export async function verifyNativeCSS(page, fixtures) {
  const result = await page.evaluate(async fixtures => {
    const style = document.createElement("style");
    const element = document.createElement("div");
    // `transform-origin:0 0` matches the origin the compiled samplers assume.
    element.style.cssText = "position:fixed;left:0;top:0;pointer-events:none;transform-origin:0 0";
    document.head.append(style);
    document.body.append(element);
    const results = [];
    try {
      for (const fixture of fixtures) {
        const compiled = (await import(`data:text/javascript;base64,${btoa(fixture.source)}`)).default;
        const descriptor = compiled.animations[0];
        element.className = descriptor.selector.startsWith(".") ? descriptor.selector.slice(1) : "";
        element.id = descriptor.selector.startsWith("#") ? descriptor.selector.slice(1) : "";
        style.textContent = fixture.css;
        // The CSS must have created exactly the selected animation on the element.
        const animations = element.getAnimations();
        if (animations.length !== 1 || !(animations[0] instanceof CSSAnimation) || animations[0].animationName !== descriptor.name) {
          throw new Error(`Native CSS did not create the selected animation: ${fixture.label}`);
        }
        const animation = animations[0];
        // Pause so that seeking `currentTime` sets the progress deterministically.
        animation.pause();
        await animation.ready;
        // Diagnostics only: the very small offsets show how the browser maps tiny seeks to progress. They are not
        // compared against the sampler.
        const clockDiagnostics = [];
        for (const offset of [0, 0.001, 0.01]) {
          const requestedTime = descriptor.timing.delay + offset;
          animation.currentTime = requestedTime;
          const timing = animation.effect.getComputedTiming();
          const native = getComputedStyle(element);
          clockDiagnostics.push({ requestedTime, currentTime: animation.currentTime,
            progress: timing.progress, currentIteration: timing.currentIteration,
            transform: native.transform, opacity: native.opacity });
        }
        const maxima = { matrix: 0, translation: 0, opacity: 0 };
        for (const time of fixture.times) {
          animation.currentTime = time;
          const native = getComputedStyle(element);
          const matrix = new DOMMatrix(native.transform === "none" ? undefined : native.transform);
          const opacity = Number(native.opacity);
          const sample = descriptor.sample(time);
          const angle = sample.rotation * Math.PI / 180;
          // Expected matrix and opacity of `translate() rotate() scale()` from the sampler: [a, b, c, d, e, f, opacity].
          const expected = [Math.cos(angle) * sample.scaleX, Math.sin(angle) * sample.scaleX,
            -Math.sin(angle) * sample.scaleY, Math.cos(angle) * sample.scaleY, sample.x, sample.y, sample.opacity];
          const actual = [matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f, opacity];
          for (let index = 0; index < actual.length; index++) {
            const error = Math.abs(actual[index] - expected[index]);
            const field = index < 4 ? "matrix" : index < 6 ? "translation" : "opacity";
            maxima[field] = Math.max(maxima[field], error);
            // CSSOM serializes matrices with limited precision; motion must still agree to subpixel accuracy.
            const tolerance = index < 4 || index === 6 ? 0.0005 : 0.02;
            if (!Number.isFinite(error) || error > tolerance) {
              throw new Error(`Native CSS mismatch ${fixture.label} at ${time}ms field ${index}: browser=${actual[index]} compiled=${expected[index]} error=${error} limit=${tolerance} timing=${JSON.stringify(animation.effect.getComputedTiming())}`);
            }
          }
        }
        results.push({ label: fixture.label, comparisons: fixture.times.length, maximumError: maxima, clockDiagnostics });
        // Cancel and clear the style so each fixture starts from a clean element.
        animation.cancel();
        style.textContent = "";
        if (element.getAnimations().length) throw new Error(`Native CSS reference did not release: ${fixture.label}`);
      }
      return { cases: results, comparisons: results.reduce((sum, value) => sum + value.comparisons, 0) };
    } finally {
      for (const animation of element.getAnimations()) animation.cancel();
      element.remove();
      style.remove();
    }
  }, fixtures);
  assert.equal(result.cases.length, fixtures.length);
  return result;
}
