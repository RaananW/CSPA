import { useEffect, useReducer, useRef } from "react";
import { Box, Surface } from "../../canvas-spa";
import { initialTodos, reduceTodos, visibleTasks, TASK_LIMIT, type Filter, type TaskEvent } from "./model";

export const TODO_SURFACE = "todo-controls";
export const TODO_DECORATION = "todo-decoration";
export function TodoApp({ onTransition }: { onTransition(event: TaskEvent): void }) {
  const [state, dispatch] = useReducer(reduceTodos, undefined, initialTodos);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { if (state.event) onTransition(state.event); }, [state.event, onTransition]);
  const tasks = visibleTasks(state);
  return <>
    <Surface id={TODO_SURFACE} aria-label="Task application"
      layout={{ x: 20, y: 20, width: 420, height: 660, padding: 16, direction: "column", gap: 8 }}
      appearance={{ background: "rgb(245,248,252)", color: "rgb(24,36,54)", radius: 12, fontSize: 14 }}>
      <Box layout={{ height: 26 }} appearance={{ fontSize: 20 }}><strong role="heading" aria-level={2}>Small tasks, real native controls</strong></Box>
      <Box layout={{ height: 26 }}>Titles edit live; Enter confirms. Up to {TASK_LIMIT} tasks.</Box>
      <Box layout={{ height: 48, direction: "column", gap: 4 }}>
        <label htmlFor="new-task">New task</label>
        <form onSubmit={event => { event.preventDefault(); dispatch({ type: "add" }); input.current?.focus(); }}>
          <input ref={input} id="new-task" size={26} maxLength={32} value={state.draft}
            onChange={event => dispatch({ type: "draft", title: event.target.value })} autoComplete="off" />
          {" "}<button type="submit">Add task</button>
        </form>
      </Box>
      <Box layout={{ height: 28, direction: "row", gap: 6 }} role="group" aria-label="Task filters">
        {(["all", "active", "completed"] as Filter[]).map(filter => <button key={filter} type="button"
          aria-pressed={state.filter === filter} onClick={() => dispatch({ type: "filter", filter })}>
          {filter === "all" ? "All" : filter === "active" ? "Active" : "Completed"}
        </button>)}
      </Box>
      <Box layout={{ height: 318, direction: "column", gap: 6 }} role="list" aria-label="Tasks">
        {tasks.length === 0 && <p>No tasks in this filter.</p>}
        {tasks.map(task => <Box key={task.id} role="listitem" data-task-id={task.id}
          layout={{ height: 48, padding: 6 }} appearance={{ background: task.completed ? "rgb(224,244,232)" : "white", radius: 6 }}>
          <form onSubmit={event => { event.preventDefault(); dispatch({ type: "confirm", id: task.id }); }}>
            <input type="checkbox" checked={task.completed} aria-label={`Complete task ${task.id}`}
              onChange={() => dispatch({ type: "toggle", id: task.id })} />
            {" "}<input size={23} maxLength={32} aria-label={`Task ${task.id} title`} value={task.title}
              onChange={event => dispatch({ type: "edit", id: task.id, title: event.target.value })} />
            {" "}<button type="button" aria-label={`Delete task ${task.id}`}
              onClick={() => dispatch({ type: "remove", id: task.id })}>Delete</button>
          </form>
        </Box>)}
      </Box>
      <Box layout={{ height: 38 }}><output id="task-message" role="status" aria-live="polite">{state.message}</output></Box>
      <Box>{state.tasks.filter(task => !task.completed).length} active / {state.tasks.length} total</Box>
    </Surface>
    <Surface id={TODO_DECORATION} decorative layout={{ x: 460, y: 90, width: 280, height: 360, direction: "column" }}>
      <svg width="280" height="360" viewBox="0 0 280 360" aria-hidden="true">
        {Array.from({ length: 28 }, (_, index) => <rect key={index} x={index * 10} width="10" height="360"
          fill={index % 2 ? "rgb(38,104,215)" : "rgb(245,196,41)"} />)}
        <circle cx="140" cy="180" r="80" fill="none" stroke="white" strokeWidth="8" />
        <path d="M100 180 L130 210 L185 145" fill="none" stroke="white" strokeWidth="10" />
      </svg>
    </Surface>
  </>;
}
