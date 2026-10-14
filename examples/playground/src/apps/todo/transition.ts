/**
 * Drives the TODO page's decorative ripple from task events. `demo/todo-demo.tsx` creates one per controller and
 * feeds it `TaskEvent`s from `TodoApp`. It uses the public controller `setRipple` on the decorative layer and only
 * acts while the controller is in GPU mode and the page is visible, so the DOM fallback is never affected.
 */
import type { CanvasController } from "@underglass/react";
import type { TaskEvent } from "./model";
import { TODO_DECORATION } from "./TodoApp";

/**
 * Returns `pulse` (start a ripple for an event; repeats of the same `sequence` are ignored), `stop` (cancel the
 * timer and, by default, clear the ripple if the controller is in GPU mode) and `state` (timer count and last
 * event, for probes).
 */
export function taskTransitions(controller: CanvasController) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastEvent: TaskEvent | undefined;
  const stop = (clearEffect = true) => {
    if (timer !== undefined) { clearTimeout(timer); timer = undefined; }
    if (clearEffect && controller.state().mode === "gpu") controller.setRipple(TODO_DECORATION, null);
  };
  return {
    stop,
    state: () => ({ timers: timer === undefined ? 0 : 1, lastEvent }),
    // Starts a ripple sized by the kind of change (removed 12, completed 10, otherwise 7), then clears it after 900 ms.
    pulse(event: TaskEvent) {
      if (lastEvent?.sequence === event.sequence) return;
      lastEvent = { ...event };
      stop();
      if (controller.state().mode !== "gpu" || !controller.state().environment.visible) return;
      controller.setRipple(TODO_DECORATION, { amplitude: event.kind === "removed" ? 12 : event.kind === "completed" ? 10 : 7,
        seconds: 0, playing: true });
      timer = setTimeout(() => {
        timer = undefined;
        if (controller.state().mode === "gpu") controller.setRipple(TODO_DECORATION, null);
      }, 900);
    },
  };
}
