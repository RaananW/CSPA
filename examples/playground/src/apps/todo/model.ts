/**
 * Pure state model for the TODO pilot: a reducer over a bounded task list plus the selectors the UI needs.
 * `TodoApp.tsx` renders it with `useReducer`; `transition.ts` reacts to the `TaskEvent`s it emits.
 * It has no DOM or Underglass dependency.
 */

/** Maximum number of tasks the pilot holds. */
export const TASK_LIMIT = 6;
/** Maximum notes length in characters. */
export const NOTES_LIMIT = 480;
export type Filter = "all" | "active" | "completed";
export interface Task { id: number; title: string; completed: boolean; notes: string }
/**
 * The last meaningful task change. `sequence` increases on every change so consumers can tell a new event from a
 * re-render with the same one.
 */
export interface TaskEvent { sequence: number; kind: "added" | "completed" | "reopened" | "edited" | "removed" }
/** Whole UI state: tasks, form drafts, filter/search, selection, pending delete and the last event. */
export interface TodoState {
  tasks: Task[];
  nextId: number;
  draft: string;
  filter: Filter;
  search: string;
  selectedId: number | null;
  deleteId: number | null;
  message: string;
  event: TaskEvent | null;
}
/** Everything the UI can dispatch. Actions with an `id` for a task that no longer exists are ignored with a message. */
export type Action =
  | { type: "draft"; title: string }
  | { type: "add" }
  | { type: "toggle" | "confirm" | "remove"; id: number }
  | { type: "edit"; id: number; title: string }
  | { type: "filter"; filter: Filter }
  | { type: "search"; value: string }
  | { type: "select" | "request-delete" | "notes" | "save"; id: number; value?: string }
  | { type: "back" }
  | { type: "cancel-delete" };

/** Seed state with two tasks. Used as the lazy `useReducer` initializer. */
export function initialTodos(): TodoState {
  return { tasks: [
    { id: 1, title: "Try native task editing", completed: false, notes: "" },
    { id: 2, title: "Complete a task with Space", completed: false, notes: "" },
  ], nextId: 3, draft: "", filter: "all", search: "", selectedId: null, deleteId: null,
    message: "Ready. Task changes trigger the decorative transition in GPU mode.", event: null };
}
/** Tasks matching the current filter and the case-insensitive title search. */
export function visibleTasks(state: TodoState) {
  const query = state.search.trim().toLocaleLowerCase();
  return state.tasks.filter(task => (state.filter === "all" || task.completed === (state.filter === "completed"))
    && task.title.toLocaleLowerCase().includes(query));
}
/**
 * Reducer. Only add, save, confirm, remove and toggle set `event` (through `changed`), because those are the changes
 * that trigger the decorative transition. Draft, live edit, notes, search, filter and selection actions never set it.
 */
export function reduceTodos(state: TodoState, action: Action): TodoState {
  // Builds a state with new tasks and a fresh event whose sequence is one higher than the previous.
  const changed = (kind: TaskEvent["kind"], message: string, tasks: Task[]) => ({
    ...state, tasks, message, event: { sequence: (state.event?.sequence ?? 0) + 1, kind },
  });
  if (action.type === "draft") return { ...state, draft: action.title };
  if (action.type === "search") return { ...state, search: action.value.slice(0, 32), message: "Search updated." };
  if (action.type === "back") return { ...state, selectedId: null, message: "Returned to task list." };
  if (action.type === "cancel-delete") return { ...state, deleteId: null };
  if (action.type === "filter") return { ...state, filter: action.filter, message: `Showing ${action.filter} tasks.` };
  if (action.type === "add") {
    const title = state.draft.trim();
    if (!title || title.length > 32) return { ...state, message: "Enter a task title of 1 to 32 characters." };
    if (state.tasks.length >= TASK_LIMIT) return { ...state, message: "This bounded pilot holds six tasks. Remove a task before adding another." };
    return { ...changed("added", `Added: ${title}`, [...state.tasks, { id: state.nextId, title, completed: false, notes: "" }]),
      nextId: state.nextId + 1, draft: "" };
  }
  // Every action below addresses an existing task by id.
  const task = state.tasks.find(task => task.id === action.id);
  if (!task) return { ...state, message: "That task no longer exists." };
  if (action.type === "select") return { ...state, selectedId: task.id, message: `Details: ${task.title}` };
  if (action.type === "request-delete") return { ...state, deleteId: task.id };
  if (action.type === "notes") {
    if ((action.value?.length ?? 0) > NOTES_LIMIT) return { ...state, message: `Notes are limited to ${NOTES_LIMIT} characters.` };
    return { ...state, tasks: state.tasks.map(item => item.id === task.id ? { ...item, notes: action.value ?? "" } : item),
      message: "Notes edit live. Save confirms title and notes." };
  }
  if (action.type === "save") {
    const title = task.title.trim();
    if (!title) return { ...state, message: "Task titles cannot be empty. Keep editing this task." };
    return changed("edited", `Saved: ${title}`, state.tasks.map(item => item.id === task.id ? { ...item, title } : item));
  }
  if (action.type === "edit") {
    if (action.title.length > 32) return { ...state, message: "Task titles are limited to 32 characters." };
    return { ...state, tasks: state.tasks.map(item => item.id === task.id ? { ...item, title: action.title } : item),
      message: "Editing live. Enter confirms the title." };
  }
  if (action.type === "confirm") {
    const title = task.title.trim();
    if (!title) return { ...state, message: "Task titles cannot be empty. Keep editing this task." };
    return changed("edited", `Title confirmed: ${title}`, state.tasks.map(item => item.id === task.id ? { ...item, title } : item));
  }
  if (action.type === "remove") return { ...changed("removed", `Removed: ${task.title || "untitled task"}`, state.tasks.filter(item => item.id !== task.id)),
    selectedId: state.selectedId === task.id ? null : state.selectedId, deleteId: null };
  // Fall-through: "toggle".
  return changed(task.completed ? "reopened" : "completed", `${task.completed ? "Reopened" : "Completed"}: ${task.title || "untitled task"}`,
    state.tasks.map(item => item.id === task.id ? { ...item, completed: !item.completed } : item));
}
