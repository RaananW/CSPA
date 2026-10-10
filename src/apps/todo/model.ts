export const TASK_LIMIT = 6;
export type Filter = "all" | "active" | "completed";
export interface Task { id: number; title: string; completed: boolean }
export interface TaskEvent { sequence: number; kind: "added" | "completed" | "reopened" | "edited" | "removed" }
export interface TodoState {
  tasks: Task[];
  nextId: number;
  draft: string;
  filter: Filter;
  message: string;
  event: TaskEvent | null;
}
export type Action =
  | { type: "draft"; title: string }
  | { type: "add" }
  | { type: "toggle" | "confirm" | "remove"; id: number }
  | { type: "edit"; id: number; title: string }
  | { type: "filter"; filter: Filter };

export function initialTodos(): TodoState {
  return { tasks: [
    { id: 1, title: "Try native task editing", completed: false },
    { id: 2, title: "Complete a task with Space", completed: false },
  ], nextId: 3, draft: "", filter: "all", message: "Ready. Task changes trigger the decorative transition in GPU mode.", event: null };
}
export function visibleTasks(state: TodoState) {
  return state.tasks.filter(task => state.filter === "all" || task.completed === (state.filter === "completed"));
}
export function reduceTodos(state: TodoState, action: Action): TodoState {
  const changed = (kind: TaskEvent["kind"], message: string, tasks: Task[]) => ({
    ...state, tasks, message, event: { sequence: (state.event?.sequence ?? 0) + 1, kind },
  });
  if (action.type === "draft") return { ...state, draft: action.title };
  if (action.type === "filter") return { ...state, filter: action.filter, message: `Showing ${action.filter} tasks.` };
  if (action.type === "add") {
    const title = state.draft.trim();
    if (!title || title.length > 32) return { ...state, message: "Enter a task title of 1 to 32 characters." };
    if (state.tasks.length >= TASK_LIMIT) return { ...state, message: "This bounded pilot holds six tasks. Remove a task before adding another." };
    return { ...changed("added", `Added: ${title}`, [...state.tasks, { id: state.nextId, title, completed: false }]),
      nextId: state.nextId + 1, draft: "" };
  }
  const task = state.tasks.find(task => task.id === action.id);
  if (!task) return { ...state, message: "That task no longer exists." };
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
  if (action.type === "remove") return changed("removed", `Removed: ${task.title || "untitled task"}`, state.tasks.filter(item => item.id !== task.id));
  return changed(task.completed ? "reopened" : "completed", `${task.completed ? "Reopened" : "Completed"}: ${task.title || "untitled task"}`,
    state.tasks.map(item => item.id === task.id ? { ...item, completed: !item.completed } : item));
}
