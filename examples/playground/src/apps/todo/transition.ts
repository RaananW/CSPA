import type { CanvasController } from "canvas-spa-phase-one";
import type { TaskEvent } from "./model";
import { TODO_DECORATION } from "./TodoApp";

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
