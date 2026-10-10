import { test } from "node:test";
import assert from "node:assert/strict";
import { initialTodos, reduceTodos, visibleTasks, TASK_LIMIT } from "../src/apps/todo/model.ts";

test("TODO reducer supports actual add/edit/complete/filter/remove with bounded event state", () => {
  let state = reduceTodos(initialTodos(), { type: "draft", title: "  Native task  " });
  state = reduceTodos(state, { type: "add" });
  assert.equal(state.tasks[2].title, "Native task");
  assert.equal(state.draft, "");
  state = reduceTodos(state, { type: "edit", id: 3, title: "Edited task" });
  assert.equal(state.event.kind, "added");
  state = reduceTodos(state, { type: "confirm", id: 3 });
  assert.equal(state.event.kind, "edited");
  state = reduceTodos(state, { type: "toggle", id: 3 });
  state = reduceTodos(state, { type: "filter", filter: "completed" });
  assert.deepEqual(visibleTasks(state).map(task => task.id), [3]);
  state = reduceTodos(state, { type: "remove", id: 3 });
  assert.equal(state.tasks.length, 2);
  assert.equal(state.event.sequence, 4);
});
test("TODO invalid titles, stale tasks and capacity report explicit usable state", () => {
  let state = initialTodos();
  assert.match(reduceTodos(state, { type: "add" }).message, /Enter/);
  assert.match(reduceTodos(state, { type: "remove", id: 99 }).message, /no longer/);
  while (state.tasks.length < TASK_LIMIT) {
    state = reduceTodos(reduceTodos(state, { type: "draft", title: "Task" }), { type: "add" });
  }
  const rejected = reduceTodos(state, { type: "add" });
  assert.equal(rejected.tasks, state.tasks);
  assert.match(reduceTodos(reduceTodos(state, { type: "draft", title: "Another" }), { type: "add" }).message, /six/);
  const blank = reduceTodos(state, { type: "edit", id: 1, title: " " });
  assert.match(reduceTodos(blank, { type: "confirm", id: 1 }).message, /cannot be empty/);
});
