# Upstream reports

## canvasClip hit testing uses the bounding box on rotated drawable children

Reproduction: [`canvasclip-rotated-hit-test.html`](canvasclip-rotated-hit-test.html)
(self-contained; serve it from `localhost` or any https origin).

### Chromium bug (issues.chromium.org)

- **Component:** Blink>Canvas (HTML-in-Canvas / `CanvasDrawElement`, `ElementCanvasTransform`).
  Hotlist 6783002, if you can add it.
- **Title:** `canvasClip` hit testing on a rotated drawable child uses the clip's axis-aligned
  bounding box instead of the transformed clip rect.

**Steps**

1. Launch Chrome Canary with
   `--enable-blink-features=CanvasDrawElement,ElementCanvasTransform --enable-experimental-web-platform-features`.
2. Open the attached `canvasclip-rotated-hit-test.html` from `http://localhost`.
3. The page sets `canvas.content = "drawable"` with one 200×120 drawable child, and calls
   `updateElementGeometry(child, { canvasTransform: translate(120,40) rotate(20deg), canvasClip: { x: 0, y: 0, width: 100, height: 120 } })`.
   It then calls `document.elementFromPoint` at child-local points mapped through the transform.

**Expected:** points outside the clip rect (child-local x > 100) do not hit the child, as the
clip is a rectangle in the element's local space, transformed by `canvasTransform`.

**Actual:**

| Child-local point | Position | Hit |
| --- | --- | --- |
| (50, 60) | inside the clip | child (correct) |
| (104, 110) | 4 px past the clip edge, inside its canvas-space bounding box | **child** (wrong) |
| (120, 100) | 20 px past the clip edge, inside its bounding box | **child** (wrong) |
| (180, 10) | outside the clip's bounding box | canvas (correct) |

The clip is applied to hit testing, but as the axis-aligned bounding box of the transformed clip
rect, not the transformed rect. The same happens headless and in a normal window.

**Environment:** Chrome Canary 157.0.8102.0, Windows 11 (NVIDIA Ampere). Also observed in
CanvasSPA's functional admission probe, which rotates its probe by 11°.

**Impact:** pixels are clipped by the rotated rect, but clicks inside the bounding box land on
content that is not visible there: invisible, clickable regions. Apps must avoid clipping rotated
drawable children, or must place hit tests away from the clip edges.

**Workaround in CanvasSPA:** rotated layers are only presented on the GPU when the canvas content
box is their only clip. The admission probe keeps its test points clear of the bounding box. See
`docs/changes/fix-admission-probe-precision.md` in RaananW/CSPA.

### WICG html-in-canvas (optional spec clarification)

Repository: <https://github.com/WICG/html-in-canvas/issues>

- **Title:** Clarify that `canvasClip` applies in element-local space for hit testing under a
  non-axis-aligned `canvasTransform`.
- **Body:** The explainer describes `canvasClip` as a rectangle in the element's coordinate space.
  Chromium 157 clips painting by the transformed rectangle, but clips hit testing by its
  axis-aligned bounding box. Reproduction and measurements are in the Chromium bug above. Could
  the explainer state that hit testing uses the same transformed clip shape as painting?

Checked against WICG html-in-canvas at `5fb3df86` (2026-10-09).
