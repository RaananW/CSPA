export const examples = [
  { id: "layers", number: "01", title: "Postcard studio", category: "Native controls",
    summary: "Design a postcard with real inputs, radio swatches and stamps. One native React form edits the GPU-presented card.",
    detail: "Type, pick a palette and a stamp, then save. Five surfaces share one compositor; the form, the card and the outbox are the original React controls in both DOM and GPU.",
    accent: "sunset", tags: ["Inputs", "Radio swatches", "Live layers"] },
  { id: "motion", number: "02", title: "Card deck", category: "Motion",
    summary: "Deal, stack, fan and shuffle four layer cards with staggered GPU motion. Like a card mid-flight: its button stays native.",
    detail: "Each arrangement is one declarative transition group, pivoted around card centres. React does not re-render to move a card; with reduced motion the cards go straight to their places.",
    accent: "ocean", tags: ["transitionGroup", "Stagger", "Pivot maths"] },
  { id: "effects", number: "03", title: "Shader lab", category: "Effects",
    summary: "Chain ripple, chromatic, dissolve and a custom WGSL aurora on decorative artwork, with native sliders for every parameter.",
    detail: "Effects touch only the inert, aria-hidden artwork layer. Ordinary DOM keeps the static original artwork and every control; GPU mode runs the chain in the shared compositor.",
    accent: "aurora", tags: ["setEffects", "defineEffect", "WGSL"] },
  { id: "presence", number: "04", title: "Notification stack", category: "Presence",
    summary: "Send notifications that slide in and out with Presence while their Dismiss buttons remain ordinary React buttons.",
    detail: "Each slot is a stable surface whose React subtree is retained through its exit motion, then removed. Completion results land in the log. Nothing is cloned to fake an exit.",
    accent: "violet", tags: ["Presence", "Enter / exit", "Callbacks"] },
  { id: "tasks", number: "05", title: "Small tasks, real controls", category: "Applications",
    summary: "Try the maintained task app: create, search and edit local tasks with native inputs and a detail view.",
    detail: "This is the existing task component, not a duplicate. Tasks live in memory only; switching examples resets their local state.",
    accent: "meadow", tags: ["Forms", "Dialog", "Scrolling"] },
] as const;

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
