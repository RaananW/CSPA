export const examples = [
  { id: "layers", number: "01", title: "A little room to create", category: "Native controls",
    summary: "Edit a live postcard. React owns the input, the saved text and the original controls across DOM and GPU.",
    detail: "Two surfaces, one compositor. Change the title and save it: the same native React form updates the card.", accent: "coral" },
  { id: "motion", number: "02", title: "Move without rebuilding", category: "Motion",
    summary: "Send a layer on a short journey while its native controls and React state stay right where they belong.",
    detail: "Public typed motion runs independently of React rendering. Reduced-motion preferences retain the stationary presentation.", accent: "blue" },
  { id: "effects", number: "03", title: "Pixels with personality", category: "Effects",
    summary: "A decorative chromatic shader adds a new perspective without distorting essential native hit targets.",
    detail: "The effect touches only an inert, aria-hidden decorative layer. Ordinary DOM keeps the static artwork and all useful controls.", accent: "yellow" },
  { id: "tasks", number: "04", title: "Small tasks, real controls", category: "Applications",
    summary: "Try the maintained task app: create, search and edit local tasks with native inputs and a detail view.",
    detail: "This is the existing task component, not a duplicate. Tasks live in memory only; switching examples resets their local state.", accent: "green" },
] as const;

export type ExampleId = typeof examples[number]["id"];
export function route(hash: string): ExampleId {
  const id = hash.replace(/^#\/?/, "");
  return examples.find(example => example.id === id)?.id ?? "layers";
}
export function searchExamples(query: string, category: string) {
  const text = query.trim().toLowerCase();
  return examples.filter(example => (category === "All" || example.category === category)
    && `${example.title} ${example.summary} ${example.category}`.toLowerCase().includes(text));
}
