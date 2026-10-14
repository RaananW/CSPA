/**
 * Why each example uses the GPU, stated honestly: what the GPU path does here and
 * what CSS alone would do, including where CSS would be just as good.
 */
export interface GPUReason { headline: string; points: readonly string[]; css: string }

export const examples = [
  { id: "layers", number: "01", title: "Postcard studio", category: "Native controls",
    summary: "Design a postcard with real inputs, radio swatches and stamps. One native React form edits the GPU-presented card.",
    detail: "Type, pick a palette and a stamp, then save. Five surfaces share one compositor; the form, the card and the outbox are the original React controls in both DOM and GPU.",
    accent: "sunset", tags: ["Inputs", "Live layers", "Chromatic"],
    gpu: {
      headline: "A print effect on live artwork, while the form stays native.",
      points: [
        "Riso print shifts the red, green and blue channels of the rendered landscape apart, like a misregistered print run.",
        "Every surface, the form included, is one texture in one WebGPU frame. Typing re-uploads only the layer whose pixels changed.",
      ],
      css: "CSS filters can blur, tint or rotate hues, but none moves one colour channel independently of the others. An SVG filter chain can approximate it, but it isn't programmable per pixel and gets expensive on large areas that keep changing.",
    } },
  { id: "motion", number: "02", title: "Card deck", category: "Motion",
    summary: "Deal, stack, fan and shuffle four layer cards with staggered GPU motion. Like a card mid-flight: its button stays native.",
    detail: "Each arrangement is one declarative transition group, pivoted around card centres. React does not re-render to move a card; with reduced motion the cards go straight to their places.",
    accent: "ocean", tags: ["transitionGroup", "Stagger", "Ripple"],
    gpu: {
      headline: "Cards fly as textures, and the felt table ripples when they land.",
      points: [
        "A moving card only updates a matrix: no style recalculation, layout, repaint or React render per frame.",
        "When an arrangement settles, the table, which is real DOM with text, ripples: its rendered pixels are displaced in a radial wave.",
        "Rotated card edges are antialiased in the shader, and clicks still land on the original Like buttons mid-flight.",
      ],
      css: "Honestly, CSS moves cards just as smoothly: transform and opacity already run on the compositor. What CSS can't do is bend the table's rendered pixels. The nearest equivalent is an animated SVG displacement filter, which is slow across an area this size.",
    } },
  { id: "effects", number: "03", title: "Shader lab", category: "Effects",
    summary: "Chain ripple, chromatic, dissolve and a custom WGSL aurora on decorative artwork, with native sliders for every parameter.",
    detail: "Effects touch only the inert, aria-hidden artwork layer. Ordinary DOM keeps the static original artwork and every control; GPU mode runs the chain in the shared compositor.",
    accent: "aurora", tags: ["setEffects", "defineEffect", "WGSL"],
    gpu: {
      headline: "Per-pixel programs running on a live DOM subtree.",
      points: [
        "Ripple and chromatic move where each pixel samples from; dissolve masks pixels with animated noise.",
        "Aurora is application-written WGSL, compiled at runtime and chained after the built-in effects in one pass.",
        "Sliders change uniforms only. The artwork is captured once, not repainted per frame.",
      ],
      css: "CSS filters are a fixed menu (blur, brightness, hue-rotate…) applied to a whole element. You can't run your own per-pixel code on rendered HTML, and ripple, chromatic split and noise dissolve don't exist as CSS filters.",
    } },
  { id: "presence", number: "04", title: "Notification stack", category: "Presence",
    summary: "Send notifications that slide in and out with Presence while their Dismiss buttons remain ordinary React buttons.",
    detail: "Each slot is a stable surface whose React subtree is retained through its exit motion, then removed. Completion results land in the log. Nothing is cloned to fake an exit.",
    accent: "violet", tags: ["Presence", "Enter / exit", "Ripple"],
    gpu: {
      headline: "Each arrival sends a pulse through the phone screen.",
      points: [
        "A new notification ripples the phone's wallpaper: a displacement of its rendered pixels, timed to the arrival.",
        "The toasts enter and leave as GPU-presented layers; their Dismiss buttons are the original React buttons throughout.",
      ],
      css: "Sliding toasts in and out is easy in CSS. Presence's job here is keeping a React subtree mounted through its exit without clones. The GPU part is the pulse, which CSS can't do to rendered content.",
    } },
  { id: "tasks", number: "05", title: "Small tasks, real controls", category: "Applications",
    summary: "Try the maintained task app: create, search and edit local tasks with native inputs and a detail view.",
    detail: "This is the existing task component, not a duplicate. Tasks live in memory only; switching examples resets their local state.",
    accent: "meadow", tags: ["Forms", "Dialog", "Scrolling"],
    gpu: {
      headline: "The app is unchanged; its artwork reacts to every task.",
      points: [
        "Adding, completing or removing a task sends a ripple through the inert poster beside the app.",
        "The task app is the maintained component, unmodified, presented as GPU layers with native inputs, focus, scrolling and dialog.",
      ],
      css: "In ordinary DOM the app works identically, which is the point: GPU presentation is additive. The ripple has no CSS equivalent.",
    } },
  { id: "pond", number: "06", title: "Webcam pond", category: "Experimental",
    summary: "See yourself reflected in a koi pond. Write on its floor, drop pebbles and feed the fish from a native lily pad.",
    detail: "Optional camera, on your device only: nothing is recorded or sent anywhere. The pond floor, your text, the fish and the reflection are ordinary HTML in one decorative layer; ripple refraction and a custom WGSL water shader run over it on the GPU.",
    accent: "pond", tags: ["Webcam", "Refraction", "Custom WGSL"],
    gpu: {
      headline: "Live HTML and your camera image, refracted and lit as water.",
      points: [
        "A continuous ripple bends where every pixel samples from, so the text on the floor, the fish and your reflection wobble together like light through water.",
        "A custom WGSL shader adds caustic light, depth tint and glints, compiled while the GPU keeps presenting.",
        "Each camera frame is captured from the original <video> element straight into a GPU texture; the lily pad's buttons stay native while it floats rotated above.",
      ],
      css: "CSS can show a mirrored, semi-transparent video. It can't refract it: there is no way to displace the rendered pixels of video, text and animated elements together in a wave, or to light them with caustics. backdrop-filter offers blur and colour, not distortion.",
    } },
] as const satisfies readonly { id: string; gpu: GPUReason; [key: string]: unknown }[];

export type ExampleId = typeof examples[number]["id"];
export function route(hash: string): ExampleId {
  const id = hash.replace(/^#\/?/, "");
  return examples.find(example => example.id === id)?.id ?? "layers";
}
export function searchExamples(query: string, category: string) {
  const text = query.trim().toLowerCase();
  return examples.filter(example => (category === "All" || example.category === category)
    && `${example.title} ${example.summary} ${example.category} ${example.tags.join(" ")}`.toLowerCase().includes(text));
}
