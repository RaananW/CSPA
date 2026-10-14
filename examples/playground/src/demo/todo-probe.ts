/**
 * Test hook for the TODO page (`todo.html`): `window.todoProbe`, used by the browser tests. It wraps the controller
 * with combined state (controller state, React commit count, transition timer, demo listeners) and helpers to hold
 * or advance the decorative ripple deterministically.
 */
import type { CanvasController } from "@underglass/react";
import type { taskTransitions } from "../apps/todo/transition";
import { TODO_DECORATION } from "../apps/todo/TodoApp";

/**
 * Builds the probe object. `commits` is the page's Profiler commit counter, `listeners` reports how many demo
 * button listeners are still attached and `dispose` tears the page down.
 */
export function todoProbe(controller: CanvasController, transitions: ReturnType<typeof taskTransitions>,
  commits: { count: number }, listeners: () => number, dispose: () => Promise<unknown>) {
  const state = () => ({ ...controller.state(), commits: { ...commits }, transition: transitions.state(), demoListeners: listeners() });
  return {
    state, controller: () => controller, dispose,
    // Freezes the task-triggered ripple at `seconds` (not playing) so pixels can be sampled; requires a live GPU
    // ripple, i.e. a real task change must have started one.
    async holdEffect(seconds: number) {
      const effect = controller.state().decorativeEffects.find(effect => effect.id === TODO_DECORATION);
      if (controller.state().mode !== "gpu" || !effect) throw new Error("Hold requires a real task-triggered GPU transition");
      transitions.stop(false);
      controller.setRipple(TODO_DECORATION, { amplitude: effect.amplitude, seconds, playing: false });
      await controller.settle();
      return state();
    },
    // Settles, then steps the controller's bounded timeline by `frames` frames of `milliseconds` each (it requires
    // an idle GPU presenter). Returns the state before and after, each with the React commit count at that point.
    async advance(frames: number, milliseconds: number) {
      await controller.settle();
      const preparation = state();
      const interval = await controller.advance(frames, milliseconds);
      return { preparation, before: { ...interval.before, commits: preparation.commits },
        after: { ...interval.after, commits: { ...commits } } };
    },
  };
}
declare global { interface Window { todoProbe: ReturnType<typeof todoProbe> } }
