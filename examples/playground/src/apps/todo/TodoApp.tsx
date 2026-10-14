import { useCallback, useEffect, useReducer, useRef } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Box, Surface, Presence, NativeOverlay, NativeScroll, useNativeOverlayHost, type MotionDescriptor } from "@underglass/react";
import { initialTodos, reduceTodos, visibleTasks, TASK_LIMIT, NOTES_LIMIT, type Filter, type TaskEvent } from "./model";

export const TODO_SURFACE = "todo-controls";
export const TODO_DECORATION = "todo-decoration";
export const TODO_DETAIL = "todo-detail";
const enter: MotionDescriptor = { keyframes: [{ offset: 0, x: 12, opacity: 0 }, { offset: 1 }], timing: { duration: 180 } };
const exit: MotionDescriptor = { keyframes: [{ offset: 0 }, { offset: 1, x: 12, opacity: 0 }], timing: { duration: 180 } };
export function TodoApp({ onTransition }: { onTransition(event: TaskEvent): void }) {
  const [state, dispatch] = useReducer(reduceTodos, undefined, initialTodos);
  const input = useRef<HTMLInputElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const title = useRef<HTMLInputElement | null>(null);
  const popover = useRef<HTMLDivElement>(null);
  const previousSelection = useRef<number | null>(null);
  const returnId = useRef<number | null>(null);
  const overlay = useNativeOverlayHost();
  const selected = state.tasks.find(task => task.id === state.selectedId);
  const retained = useRef(selected);
  if (selected) retained.current = selected;
  const detail = selected ?? retained.current;
  const deletion = state.tasks.find(task => task.id === state.deleteId);
  const titleRef = useCallback((element: HTMLInputElement | null) => {
    title.current = element;
    if (element && state.selectedId !== null) element.focus();
  }, [state.selectedId]);
  function returnFocus() {
    const target = document.getElementById(`open-task-${returnId.current}`);
    if (selected && title.current) title.current.focus();
    else if (target instanceof HTMLButtonElement && !target.closest("[inert]")) target.focus();
    else search.current?.focus();
  }
  useEffect(() => {
    if (state.selectedId !== previousSelection.current) {
      popover.current?.hidePopover();
      if (selected) { returnId.current = selected.id; title.current?.focus(); }
      else if (previousSelection.current !== null) returnFocus();
      previousSelection.current = state.selectedId;
    }
  }, [state.selectedId]);
  useEffect(() => { if (state.event) onTransition(state.event); }, [state.event, onTransition]);
  const tasks = visibleTasks(state);
  return <Dialog.Root open={!!deletion} onOpenChange={open => { if (!open) dispatch({ type: "cancel-delete" }); }}>
    <Surface id={TODO_SURFACE} aria-label="Task application"
      layout={{ x: 20, y: 20, width: 420, height: 660, padding: 16, direction: "column", gap: 8 }}
      appearance={{ background: "rgb(245,248,252)", color: "rgb(24,36,54)", radius: 12, fontSize: 14 }}>
      <Box layout={{ height: 26 }} appearance={{ fontSize: 20 }}><strong role="heading" aria-level={2}>Small tasks, real native controls</strong></Box>
      <Box layout={{ height: 26 }}>List and detail. Up to {TASK_LIMIT} tasks; edits stay local.</Box>
      <Box layout={{ height: 48, direction: "column", gap: 4 }}>
        <label htmlFor="new-task">New task</label>
        <form onSubmit={event => { event.preventDefault(); dispatch({ type: "add" }); input.current?.focus(); }}>
          <input ref={input} id="new-task" size={26} maxLength={32} value={state.draft}
            onChange={event => dispatch({ type: "draft", title: event.target.value })} autoComplete="off" />
          {" "}<button type="submit">Add task</button>
        </form>
      </Box>
      <label htmlFor="task-search">Search tasks</label>
      <input ref={search} id="task-search" maxLength={32} value={state.search}
        onChange={event => dispatch({ type: "search", value: event.target.value })} />
      <Box layout={{ height: 28, direction: "row", gap: 6 }} role="group" aria-label="Task filters">
        {(["all", "active", "completed"] as Filter[]).map(filter => <button key={filter} type="button"
          aria-pressed={state.filter === filter} onClick={() => dispatch({ type: "filter", filter })}>
          {filter === "all" ? "All" : filter === "active" ? "Active" : "Completed"}
        </button>)}
      </Box>
      <NativeScroll layout={{ height: 300, width: 388 }} role="list" aria-label="Tasks">
        {tasks.length === 0 && <p>No tasks in this filter.</p>}
        {tasks.map(task => <Box key={task.id} role="listitem" data-task-id={task.id}
          layout={{ height: 90, padding: 6 }} appearance={{ background: task.completed ? "rgb(224,244,232)" : "white", radius: 6 }}>
          <form onSubmit={event => { event.preventDefault(); dispatch({ type: "confirm", id: task.id }); }}>
            <input type="checkbox" checked={task.completed} aria-label={`Complete task ${task.id}`}
              onChange={() => dispatch({ type: "toggle", id: task.id })} />
            {" "}<input size={23} maxLength={32} aria-label={`Task ${task.id} title`} value={task.title}
              onChange={event => dispatch({ type: "edit", id: task.id, title: event.target.value })} />
            {" "}<button type="button" aria-label={`Delete task ${task.id}`}
              onClick={() => { returnId.current = task.id; dispatch({ type: "request-delete", id: task.id }); }}>Delete</button>
          </form>
          <button id={`open-task-${task.id}`} type="button" aria-label={`Open task ${task.id}`}
            aria-current={selected?.id === task.id ? "page" : undefined}
            onClick={() => dispatch({ type: "select", id: task.id })}>Details</button>
        </Box>)}
      </NativeScroll>
      <Box layout={{ height: 38 }}><output id="task-message" role="status" aria-live="polite">{state.message}</output></Box>
      <Box>{state.tasks.filter(task => !task.completed).length} active / {state.tasks.length} total</Box>
    </Surface>
    <Surface id={TODO_DETAIL} inert={!selected} aria-hidden={!selected} aria-label="Task detail"
      layout={{ x: 460, y: 20, width: 280, height: 440, padding: 12, overflow: "hidden" }}
      appearance={{ background: "rgb(224,244,232)", color: "rgb(24,36,54)", radius: 12 }}>
      <Presence id={TODO_DETAIL} present={!!selected} enter={enter} exit={exit}>
        {detail && <>
          <h2>Task details</h2>
          <form onSubmit={event => { event.preventDefault(); if (selected) dispatch({ type: "save", id: selected.id }); }}>
            <label htmlFor="detail-title">Detail title</label>
            <input ref={titleRef} id="detail-title" maxLength={32} value={detail.title}
              onChange={event => { if (selected) dispatch({ type: "edit", id: selected.id, title: event.target.value }); }} />
            <label htmlFor="detail-notes">Task notes</label>
            <textarea id="detail-notes" rows={5} maxLength={NOTES_LIMIT} value={detail.notes}
              onChange={event => { if (selected) dispatch({ type: "notes", id: selected.id, value: event.target.value }); }} />
            <button type="submit">Save task</button>
          </form>
          <label><input type="checkbox" aria-label="Complete selected task" checked={detail.completed}
            onChange={() => { if (selected) dispatch({ type: "toggle", id: selected.id }); }} />Completed</label>
          <div><button type="button" onClick={() => dispatch({ type: "back" })}>Back to list</button>
            <button type="button" onClick={() => { if (selected) dispatch({ type: "request-delete", id: selected.id }); }}>Delete selected task</button></div>
          <button type="button" onClick={() => popover.current?.showPopover()}>Task information</button>
        </>}
      </Presence>
    </Surface>
    <Surface id={TODO_DECORATION} decorative layout={{ x: 460, y: 490, width: 280, height: 140, overflow: "hidden" }}>
      <svg width="280" height="140" viewBox="0 0 280 360" aria-hidden="true">
        {Array.from({ length: 28 }, (_, index) => <rect key={index} x={index * 10} width="10" height="360"
          fill={index % 2 ? "rgb(38,104,215)" : "rgb(245,196,41)"} />)}
        <circle cx="140" cy="180" r="80" fill="none" stroke="white" strokeWidth="8" />
        <path d="M100 180 L130 210 L185 145" fill="none" stroke="white" strokeWidth="10" />
      </svg>
    </Surface>
    <Dialog.Portal container={overlay}>
      <Dialog.Overlay className="todo-backdrop" />
      <Dialog.Content className="todo-dialog" aria-describedby="delete-description"
        onCloseAutoFocus={event => { event.preventDefault(); returnFocus(); }}>
        <Dialog.Title>Delete task?</Dialog.Title>
        <Dialog.Description id="delete-description">Remove {deletion?.title}. This local action cannot be undone.</Dialog.Description>
        <Dialog.Close>Keep task</Dialog.Close>
        <button type="button" onClick={() => { if (deletion) dispatch({ type: "remove", id: deletion.id }); }}>Confirm delete</button>
      </Dialog.Content>
    </Dialog.Portal>
    <NativeOverlay>
      <div ref={popover} id="task-information" {...{ popover: "auto" }} aria-label="Task information">
        <h2>Local task information</h2><p>Six tasks, 32-character titles and {NOTES_LIMIT}-character notes. No backend or persistence.</p>
        <button onClick={() => popover.current?.hidePopover()}>Close task information</button>
      </div>
    </NativeOverlay>
  </Dialog.Root>;
}
